import hashlib
from io import BytesIO
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse
import datetime
from html import unescape

import pandas as pd
import requests
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.domains.creator import repository, schemas


class CreatorService:
    _AVATAR_MAX_BYTES = 8 * 1024 * 1024
    _AVATAR_TIMEOUT = (5, 10)
    _AVATAR_EXT_BY_CONTENT_TYPE = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/avif": ".avif",
        "image/svg+xml": ".svg",
    }
    _AVATAR_CANDIDATE_KEYS = (
        "avatar",
        "avatar_url",
        "avatarurl",
        "avatarThumb",
        "avatar_thumb",
        "avatarMedium",
        "avatar_medium",
        "avatarLarger",
        "avatar_larger",
        "avatarLarge",
        "avatar_large",
        "profile_pic_url",
        "profile_pic_url_hd",
    )

    @staticmethod
    def _normalize_tags(value):
        if value is None:
            return []

        if isinstance(value, str):
            raw_items = re.split(r"[\n,，;；]+", value)
        elif isinstance(value, (list, tuple, set)):
            raw_items = list(value)
        else:
            raw_items = [value]

        tags = []
        seen = set()
        for item in raw_items:
            text = str(item).strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            tags.append(text)
        return tags

    @staticmethod
    def _normalize_creator_data_for_storage(data: dict | None) -> dict:
        normalized = dict(data or {})

        # Extension TikTok task hydration stores location in `locationCreated`;
        # frontend CRM historically reads `location`.
        if not normalized.get("location"):
            normalized["location"] = (
                normalized.get("locationCreated")
                or normalized.get("region")
                or normalized.get("country")
                or None
            )

        tag_keys = ("tags", "Tags", "labels", "Labels", "tag", "Tag")
        if "tags" not in normalized:
            for key in ("Tags", "labels", "Labels", "tag", "Tag"):
                if normalized.get(key):
                    normalized["tags"] = normalized.get(key)
                    break

        if any(key in normalized for key in tag_keys):
            normalized["tags"] = CreatorService._normalize_tags(normalized.get("tags"))

        return normalized

    @staticmethod
    def _allowed_owner_ids(user):
        allowed_ids = [user.id]
        if user.is_master:
            allowed_ids.extend([sub.id for sub in user.sub_accounts])
        return allowed_ids

    @staticmethod
    def _extract_existing_tags(data: dict | None):
        payload = dict(data or {})
        for key in ("tags", "Tags", "labels", "Labels", "tag", "Tag", "label", "Label"):
            if key in payload and payload.get(key) is not None:
                return CreatorService._normalize_tags(payload.get(key))
        return []

    @staticmethod
    def _apply_tags_to_creator_data(data: dict | None, incoming_tags, mode: str = "merge") -> dict:
        payload = dict(data or {})
        normalized_incoming = CreatorService._normalize_tags(incoming_tags)
        if mode == "replace":
            payload["tags"] = normalized_incoming
        else:
            existing = CreatorService._extract_existing_tags(payload)
            payload["tags"] = CreatorService._normalize_tags([*existing, *normalized_incoming])
        return CreatorService._normalize_creator_data_for_storage(payload)

    @staticmethod
    def _slugify_path_part(value, fallback: str = "unknown"):
        text = str(value or "").strip()
        if not text:
            return fallback
        text = re.sub(r"[^A-Za-z0-9._-]+", "_", text)
        text = text.strip("._-")
        return text or fallback

    @staticmethod
    def _is_remote_http_url(value: str | None) -> bool:
        if not isinstance(value, str):
            return False
        parsed = urlparse(value.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)

    @staticmethod
    def _guess_avatar_extension(content_type: str | None, source_url: str) -> str:
        content_type = (content_type or "").split(";")[0].strip().lower()
        if content_type in CreatorService._AVATAR_EXT_BY_CONTENT_TYPE:
            return CreatorService._AVATAR_EXT_BY_CONTENT_TYPE[content_type]

        path_ext = Path(urlparse(source_url).path).suffix.lower()
        if re.fullmatch(r"\.[a-z0-9]{1,5}", path_ext or ""):
            return path_ext
        return ".jpg"

    @staticmethod
    def _download_remote_avatar(url: str):
        response = None
        try:
            parsed = urlparse(url)
            host = (parsed.netloc or "").lower()
            referer = ""
            if "instagram.com" in host:
                referer = "https://www.instagram.com/"
            elif "tiktokcdn" in host or "tiktok.com" in host:
                referer = "https://www.tiktok.com/"

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            if referer:
                headers["Referer"] = referer

            response = requests.get(
                url,
                timeout=CreatorService._AVATAR_TIMEOUT,
                stream=True,
                headers=headers,
            )
            if response.status_code != 200:
                return None

            content_type = (response.headers.get("Content-Type") or "").strip()
            if not content_type.lower().startswith("image/"):
                return None

            chunks = bytearray()
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                chunks.extend(chunk)
                if len(chunks) > CreatorService._AVATAR_MAX_BYTES:
                    return None

            if not chunks:
                return None

            ext = CreatorService._guess_avatar_extension(content_type, url)
            return bytes(chunks), ext
        except Exception as exc:
            print(f"Avatar cache download failed for {url}: {exc}")
            return None
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass

    @staticmethod
    def _cache_avatar_url(url: str, owner_id: int, platform: str, unique_id: str):
        if not isinstance(url, str):
            return None
        url = url.strip()
        if not url:
            return None

        media_prefix = (settings.MEDIA_URL_PREFIX or "/media").rstrip("/")
        if url.startswith(f"{media_prefix}/"):
            return url

        if not CreatorService._is_remote_http_url(url):
            return None

        parsed = urlparse(url)
        if parsed.path.startswith(f"{media_prefix}/"):
            return parsed.path or url

        downloaded = CreatorService._download_remote_avatar(url)
        if not downloaded:
            return None

        content, ext = downloaded
        owner_segment = CreatorService._slugify_path_part(owner_id, "0")
        platform_segment = CreatorService._slugify_path_part(platform, "platform")
        uid_segment = CreatorService._slugify_path_part(unique_id, "user")
        digest = hashlib.sha256(content).hexdigest()[:16]
        filename = f"{uid_segment}_{digest}{ext}"

        avatar_dir = Path(settings.MEDIA_ROOT) / "avatars" / owner_segment / platform_segment
        avatar_dir.mkdir(parents=True, exist_ok=True)

        # Keep only the latest cached avatar for the same creator handle in this folder.
        stale_glob = f"{uid_segment}_*"
        for old_file in avatar_dir.glob(stale_glob):
            if old_file.name == filename:
                continue
            if old_file.is_file():
                try:
                    old_file.unlink()
                except OSError:
                    pass

        target = avatar_dir / filename
        if not target.exists():
            target.write_bytes(content)

        return f"{media_prefix}/avatars/{owner_segment}/{platform_segment}/{filename}"

    @staticmethod
    def _collect_avatar_candidates(data: dict | None) -> list[str]:
        payload = dict(data or {})
        candidates: list[str] = []
        seen = set()

        def _push(value):
            if not isinstance(value, str):
                return
            text = value.strip()
            if not text:
                return
            key = text.lower()
            if key in seen:
                return
            seen.add(key)
            candidates.append(text)

        for key in CreatorService._AVATAR_CANDIDATE_KEYS:
            _push(payload.get(key))

        # Some payloads carry alternative avatar URLs as list values.
        for key in ("avatarList", "avatar_list", "avatars"):
            value = payload.get(key)
            if isinstance(value, (list, tuple)):
                for item in value:
                    _push(item)

        return candidates

    @staticmethod
    def _is_instagram_avatar_expired(url: str) -> bool:
        if not CreatorService._is_remote_http_url(url):
            return False
        parsed = urlparse(url)
        if "cdninstagram.com" not in (parsed.netloc or "").lower():
            return False

        oe = parse_qs(parsed.query).get("oe", [None])[0]
        if not oe:
            return False

        try:
            expiry_ts = int(oe, 16)
        except Exception:
            return False
        now_ts = int(datetime.datetime.now(datetime.UTC).timestamp())
        return expiry_ts <= now_ts

    @staticmethod
    def _extract_profile_avatar_url(platform: str, html_text: str) -> str | None:
        if not html_text:
            return None

        if (platform or "").strip().lower() == "instagram":
            patterns = [
                r'"profile_pic_url_hd":"([^"]+)"',
                r'"profile_pic_url":"([^"]+)"',
                r'\\"profile_pic_url_hd\\":\\"([^"]+)\\"',
                r'\\"profile_pic_url\\":\\"([^"]+)\\"',
            ]
        elif (platform or "").strip().lower() == "tiktok":
            patterns = [
                r'"avatarLarger":"([^"]+)"',
                r'"avatarMedium":"([^"]+)"',
                r'"avatarThumb":"([^"]+)"',
                r'\\"avatarLarger\\":\\"([^"]+)\\"',
                r'\\"avatarMedium\\":\\"([^"]+)\\"',
                r'\\"avatarThumb\\":\\"([^"]+)\\"',
            ]
        else:
            return None

        for pattern in patterns:
            match = re.search(pattern, html_text)
            if not match:
                continue
            value = match.group(1).strip()
            if not value:
                continue
            value = (
                value.replace("\\/", "/")
                .replace("\\u002F", "/")
                .replace("\\u0026", "&")
            )
            value = unescape(value)
            if CreatorService._is_remote_http_url(value):
                return value
        return None

    @staticmethod
    def _fetch_instagram_avatar_via_profile_api(unique_id: str) -> str | None:
        uid = str(unique_id or "").strip().lstrip("@")
        if not uid:
            return None

        url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={uid}"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "X-IG-App-ID": "936619743392459",
            "Referer": f"https://www.instagram.com/{uid}/",
        }

        try:
            response = requests.get(url, headers=headers, timeout=CreatorService._AVATAR_TIMEOUT)
            if response.status_code != 200:
                return None

            data = response.json() or {}
            user_obj = (data.get("data") or {}).get("user") or {}
            for key in ("profile_pic_url_hd", "profile_pic_url"):
                value = user_obj.get(key)
                if CreatorService._is_remote_http_url(value):
                    return value
        except Exception:
            return None
        return None

    @staticmethod
    def _fetch_profile_avatar_url(platform: str, unique_id: str) -> str | None:
        platform_name = (platform or "").strip().lower()
        uid = str(unique_id or "").strip().lstrip("@")
        if not uid:
            return None

        profile_url = None
        if platform_name == "instagram":
            api_avatar = CreatorService._fetch_instagram_avatar_via_profile_api(uid)
            if api_avatar:
                return api_avatar
            profile_url = f"https://www.instagram.com/{uid}/"
        elif platform_name == "tiktok":
            profile_url = f"https://www.tiktok.com/@{uid}"
        else:
            return None

        try:
            response = requests.get(
                profile_url,
                timeout=CreatorService._AVATAR_TIMEOUT,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            if response.status_code != 200:
                return None
            return CreatorService._extract_profile_avatar_url(platform_name, response.text or "")
        except Exception as exc:
            print(f"Avatar profile fetch failed for {platform_name}:{uid}: {exc}")
            return None

    @staticmethod
    def _persist_avatar_in_creator_data(data: dict | None, owner_id: int, platform: str, unique_id: str) -> dict:
        normalized = dict(data or {})

        candidates = CreatorService._collect_avatar_candidates(normalized)
        if not candidates:
            return normalized

        cached_path = None
        source_url = None
        for candidate in candidates:
            cached_path = CreatorService._cache_avatar_url(candidate, owner_id, platform, unique_id)
            if cached_path:
                source_url = candidate
                break

        if not cached_path:
            platform_name = (platform or "").strip().lower()
            need_refresh = platform_name in {"instagram", "tiktok"}
            if need_refresh and platform_name == "instagram":
                remote_candidates = [c for c in candidates if CreatorService._is_remote_http_url(c)]
                if remote_candidates and not any(CreatorService._is_instagram_avatar_expired(c) for c in remote_candidates):
                    need_refresh = False

            if need_refresh:
                refreshed = CreatorService._fetch_profile_avatar_url(platform, unique_id)
                if refreshed:
                    cached_path = CreatorService._cache_avatar_url(refreshed, owner_id, platform, unique_id)
                    if cached_path:
                        source_url = refreshed

        if not cached_path:
            return normalized

        if source_url and cached_path != source_url and not normalized.get("avatar_source_url"):
            normalized["avatar_source_url"] = source_url

        normalized["avatar"] = cached_path
        if normalized.get("avatar_url"):
            normalized["avatar_url"] = cached_path
        if normalized.get("avatarurl"):
            normalized["avatarurl"] = cached_path
        return normalized

    @staticmethod
    def push_creators(db: Session, creators: list[schemas.CreatorCreate], user_id: int):
        saved_creators = []
        for creator in creators:
            creator.data = CreatorService._normalize_creator_data_for_storage(creator.data)
            creator.data = CreatorService._persist_avatar_in_creator_data(
                creator.data,
                owner_id=user_id,
                platform=creator.platform,
                unique_id=creator.unique_id,
            )
            existing = repository.get_creator_by_platform_uid(db, user_id, creator.platform, creator.unique_id)
            if existing:
                # Update data for existing
                updated = repository.update_creator_data(db, existing, creator.data)
                saved_creators.append(updated)
            else:
                # Create new
                new_creator = repository.create_creator(db, creator, user_id)
                saved_creators.append(new_creator)
        return saved_creators

    @staticmethod
    async def import_from_excel(db: Session, file: UploadFile, user_id: int):
        content = await file.read()
        try:
            df = pd.read_excel(BytesIO(content))
        except Exception:
            # Try reading as csv if excel fails
            try:
                df = pd.read_csv(BytesIO(content))
            except Exception as e:
                print(f"Failed to read file: {e}")
                return []
        
        # Replace NaN with None for valid JSON serialization
        df = df.astype(object).where(pd.notnull(df), None)
        
        creators_to_create = []
        
        print(f"Total rows in excel: {len(df)}")
        print(f"Columns in excel: {df.columns.tolist()}")

        # Helper to find value case-insensitively
        def get_col_value(row, keys):
            # keys should be a list of lowercase strings
            # We iterate through the row's index (column names)
            # and check if any matches the keys case-insensitively
            row_keys = row.keys()
            for k in row_keys:
                if str(k).strip().lower() in keys:
                    val = row[k]
                    if pd.notna(val):
                        return val
            return None

        # Common column variations (all lowercase for matching)
        platform_keys = ['platform', 'social media', 'source', '平台', '来源']
        unique_id_keys = ['username', 'unique_id', 'uniqueid', 'id', 'user_id', 'handle', 'account', '用户名', '账号', 'id']
        profile_url_keys = ['profile_url', 'profileurl', 'profile url', 'url', 'link', 'homepage', '主页', '链接', '主页链接']
        email_keys = ['email', 'contact', 'mail', '邮箱', '联系方式']
        name_keys = ['name', 'nickname', 'display name', 'fullname', '名称', '昵称']
        avatar_keys = ['avatar', 'avatar_url', 'avatarurl', 'headshot', 'image', 'photo', '头像', '头像链接']
        follower_keys = ['follower_count', 'followercount', 'followers', 'fans', '粉丝', '粉丝数']
        signature_keys = ['signature', 'bio', 'description', '简介', '签名']
        timestamp_keys = ['timestamp', 'created_at', 'date', '时间', '时间戳']
        share_links_keys = ['sharelinks', 'share_links', 'links', '分享链接', 'sharelink', 'share_link', 'link']
        tags_keys = ['tags', 'tag', 'labels', 'label', '标签']
        
        skipped_count = 0
        for idx, row in df.iterrows():
            # 1. Identify Platform
            platform = get_col_value(row, platform_keys)
            
            # 2. Identify Unique ID and Profile URL
            unique_id = get_col_value(row, unique_id_keys)
            profile_url = get_col_value(row, profile_url_keys)
            
            # Smart extraction from URL if Platform or Unique ID is missing
            detected_platform = None
            extracted_id = None
            
            if profile_url:
                profile_url = str(profile_url).strip()
                lower_url = profile_url.lower()
                
                if 'youtube.com' in lower_url or 'youtu.be' in lower_url:
                    detected_platform = 'YouTube'
                    # Extract handle/channel id
                    if '@' in profile_url:
                        extracted_id = profile_url.split('@')[-1].split('/')[0]
                    elif 'channel/' in profile_url:
                        extracted_id = profile_url.split('channel/')[-1].split('/')[0]
                        
                elif 'tiktok.com' in lower_url:
                    detected_platform = 'TikTok'
                    # https://www.tiktok.com/@username
                    if '@' in profile_url:
                        extracted_id = profile_url.split('@')[-1].split('?')[0].split('/')[0]
                        
                elif 'instagram.com' in lower_url:
                    detected_platform = 'Instagram'
                    # https://www.instagram.com/username/
                    parts = profile_url.rstrip('/').split('/')
                    if parts:
                        extracted_id = parts[-1]

            # Apply defaults/fallbacks
            if not platform:
                platform = detected_platform or 'Unknown'
            
            if not unique_id:
                unique_id = extracted_id
            
            # If still no unique_id, we can't create a valid creator record
            if not unique_id:
                skipped_count += 1
                if skipped_count <= 5: # Only log first 5 skips to avoid spam
                     print(f"Skipping row {idx}: Missing unique_id. Row data: {row.to_dict()}")
                continue 
            
            # Clean up unique_id (remove @ if present)
            unique_id = str(unique_id).strip().lstrip('@')
            
            # Construct data payload from all columns
            # This preserves original column names (e.g. CamelCase)
            data = row.to_dict()
            
            # Explicitly sanitize data dictionary to remove any lingering NaNs
            for k, v in list(data.items()):
                if pd.isna(v):
                    data[k] = None
            
            # Ensure critical fields and user-requested fields are in data with standard keys
            # We map recognized values to standard keys expected by frontend/logic
            # while keeping the original keys in 'data' as well.
            
            # Standard mappings
            if not data.get('email'): data['email'] = get_col_value(row, email_keys)
            if not data.get('nickname'): data['nickname'] = get_col_value(row, name_keys)
            if not data.get('avatar'): data['avatar'] = get_col_value(row, avatar_keys)
            if not data.get('profile_url'): data['profile_url'] = profile_url
            
            # Additional requested fields mapping
            if not data.get('followerCount'): data['followerCount'] = get_col_value(row, follower_keys)
            if not data.get('signature'): data['signature'] = get_col_value(row, signature_keys)
            if not data.get('timestamp'): data['timestamp'] = get_col_value(row, timestamp_keys)
            if not data.get('shareLinks'): data['shareLinks'] = get_col_value(row, share_links_keys)
            if not data.get('tags'): data['tags'] = get_col_value(row, tags_keys)
            if not data.get('location'):
                for key in ['location', 'Location', 'country', 'Country', 'region', 'Region', 'locationCreated', 'LocationCreated']:
                    if data.get(key):
                        data['location'] = data.get(key)
                        break

            data = CreatorService._normalize_creator_data_for_storage(data)
            
            creator_create = schemas.CreatorCreate(
                platform=str(platform),
                unique_id=str(unique_id),
                data=data
            )
            creators_to_create.append(creator_create)
        
        print(f"Prepared {len(creators_to_create)} creators for creation/update. Skipped {skipped_count} rows.")
        result = CreatorService.push_creators(db, creators_to_create, user_id)
        print(f"Successfully processed {len(result)} creators.")
        return result

    @staticmethod
    def get_creators(
        db: Session,
        user,
        skip: int = 0,
        limit: int = 100,
        search: str = None,
        has_email: bool = None,
        platform: str = None,
        location: str = None,
        has_sharelink: bool = None,
        min_followers: int = None,
        max_followers: int = None,
    ):
        # Determine owner_ids based on master/sub status
        if user.is_master:
            sub_ids = [sub.id for sub in user.sub_accounts]
            sub_ids.append(user.id)
            creators, total = repository.get_creators_by_owner_ids(
                db,
                sub_ids,
                skip,
                limit,
                search,
                has_email,
                platform,
                location,
                has_sharelink,
                min_followers,
                max_followers,
            )
        else:
            creators, total = repository.get_creators_by_owner_ids(
                db,
                [user.id],
                skip,
                limit,
                search,
                has_email,
                platform,
                location,
                has_sharelink,
                min_followers,
                max_followers,
            )
        
        return {"items": creators, "total": total}

    @staticmethod
    def get_creator_by_id(db: Session, creator_id: int, user):
        creator = repository.get_creator_by_id(db, creator_id)
        if not creator:
            return None
            
        # Check permissions
        allowed_ids = CreatorService._allowed_owner_ids(user)
            
        if creator.owner_id not in allowed_ids:
            return None
            
        return creator

    @staticmethod
    def delete_creator(db: Session, creator_id: int, user):
        creator = repository.get_creator_by_id(db, creator_id)
        if not creator:
            return False
            
        # Check permissions
        # User can delete if they own it, or if they are master and it belongs to a sub-account
        allowed_ids = CreatorService._allowed_owner_ids(user)
            
        if creator.owner_id not in allowed_ids:
            # In a real app, maybe raise specific exception
            return False
            
        repository.delete_creator(db, creator)
        return True

    @staticmethod
    def update_creator_status(db: Session, creator_id: int, status: str, user):
        creator = repository.get_creator_by_id(db, creator_id)
        if not creator:
            return None

        allowed_ids = CreatorService._allowed_owner_ids(user)
        if creator.owner_id not in allowed_ids:
            return None

        return repository.update_creator_manual_status(db, creator, status)

    @staticmethod
    def update_creator_tags(db: Session, creator_id: int, tags, mode: str, user):
        creator = repository.get_creator_by_id(db, creator_id)
        if not creator:
            return None

        allowed_ids = CreatorService._allowed_owner_ids(user)
        if creator.owner_id not in allowed_ids:
            return None

        next_data = CreatorService._apply_tags_to_creator_data(creator.data, tags, mode)
        return repository.update_creator_data(db, creator, next_data)

    @staticmethod
    def batch_update_creator_tags(db: Session, creator_ids: list[int], tags, mode: str, user):
        ids = []
        seen = set()
        for cid in creator_ids or []:
            try:
                num = int(cid)
            except Exception:
                continue
            if num in seen:
                continue
            seen.add(num)
            ids.append(num)

        if not ids:
            return {"updated": 0, "total": 0}

        creators = db.query(repository.Creator).filter(repository.Creator.id.in_(ids)).all()
        if len(creators) != len(ids):
            return None

        allowed_ids = set(CreatorService._allowed_owner_ids(user))
        if any(c.owner_id not in allowed_ids for c in creators):
            return None

        for creator in creators:
            creator.data = CreatorService._apply_tags_to_creator_data(creator.data, tags, mode)

        db.commit()
        for creator in creators:
            db.refresh(creator)
        return {"updated": len(creators), "total": len(ids)}
