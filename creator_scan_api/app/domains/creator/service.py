
from sqlalchemy.orm import Session
from app.domains.creator import repository, schemas
import pandas as pd
from io import BytesIO
from fastapi import UploadFile

class CreatorService:
    @staticmethod
    def _allowed_owner_ids(user):
        allowed_ids = [user.id]
        if user.is_master:
            allowed_ids.extend([sub.id for sub in user.sub_accounts])
        return allowed_ids

    @staticmethod
    def push_creators(db: Session, creators: list[schemas.CreatorCreate], user_id: int):
        saved_creators = []
        for creator in creators:
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
    def get_creators(db: Session, user, skip: int = 0, limit: int = 100, search: str = None, has_email: bool = None, platform: str = None, has_sharelink: bool = None, min_followers: int = None, max_followers: int = None):
        # Determine owner_ids based on master/sub status
        if user.is_master:
            sub_ids = [sub.id for sub in user.sub_accounts]
            sub_ids.append(user.id)
            creators, total = repository.get_creators_by_owner_ids(db, sub_ids, skip, limit, search, has_email, platform, has_sharelink, min_followers, max_followers)
        else:
            creators, total = repository.get_creators_by_owner_ids(db, [user.id], skip, limit, search, has_email, platform, has_sharelink, min_followers, max_followers)
        
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
