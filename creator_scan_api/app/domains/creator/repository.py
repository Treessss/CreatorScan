
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast, String
from app.domains.creator.models import Creator
from app.domains.creator import schemas
import re

def get_creator_by_platform_uid(db: Session, owner_id: int, platform: str, unique_id: str):
    return db.query(Creator).filter(
        Creator.owner_id == owner_id,
        Creator.platform == platform,
        Creator.unique_id == unique_id
    ).first()

def create_creator(db: Session, creator: schemas.CreatorCreate, owner_id: int):
    db_creator = Creator(
        platform=creator.platform,
        unique_id=creator.unique_id,
        data=creator.data,
        owner_id=owner_id
    )
    db.add(db_creator)
    db.commit()
    db.refresh(db_creator)
    return db_creator

def update_creator_data(db: Session, db_creator: Creator, data: dict):
    db_creator.data = dict(data or {})
    db.commit()
    db.refresh(db_creator)
    return db_creator

def update_creator_manual_status(db: Session, db_creator: Creator, status: str):
    # Copy JSON payload so SQLAlchemy detects the field change reliably.
    data = dict(db_creator.data or {})
    data["manual_status"] = status
    db_creator.data = data
    db.commit()
    db.refresh(db_creator)
    return db_creator

def parse_follower_count(value):
    if not value:
        return 0
    s = str(value).upper().replace(',', '').strip()
    if s == '-' or not s:
        return 0
    
    multiplier = 1
    if 'K' in s:
        multiplier = 1000
        s = s.replace('K', '')
    elif 'M' in s:
        multiplier = 1000000
        s = s.replace('M', '')
    elif 'B' in s:
        multiplier = 1000000000
        s = s.replace('B', '')
        
    try:
        return int(float(s) * multiplier)
    except:
        return 0

def _build_location_filter_terms(location: str):
    raw = str(location or "").strip()
    if not raw:
        return []

    # Frontend country dropdown sends "CODE|中文名|English Name".
    parts = [p.strip() for p in raw.split("|") if p and p.strip()]
    candidates = parts if parts else [raw]

    terms = []
    seen = set()
    for item in candidates:
        lower = item.lower()
        if lower in seen:
            continue
        seen.add(lower)
        terms.append(item)
    return terms

def _location_matches_terms(item_location, terms):
    text = str(item_location or "").strip()
    if not text:
        return False

    normalized = text.lower()
    tokens = set(re.findall(r"[a-z0-9]+", normalized))

    for term in terms:
        probe = str(term).strip().lower()
        if not probe:
            continue
        # For ISO-like short codes, use token/exact matching to avoid false positives
        # like "US" matching "Russia".
        if re.fullmatch(r"[a-z]{2,3}", probe):
            if normalized == probe or probe in tokens:
                return True
            continue
        if probe in normalized:
            return True
    return False

def get_creators_by_owner_ids(
    db: Session,
    owner_ids: list[int],
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
    query = db.query(Creator).filter(Creator.owner_id.in_(owner_ids))
    location_terms = _build_location_filter_terms(location)

    if platform:
        query = query.filter(Creator.platform == platform)

    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                Creator.unique_id.ilike(s),
                cast(Creator.data, String).ilike(s)
            )
        )
    
    if has_email is not None:
        if has_email:
            # Check for "email": " pattern to ensure it has a string value
            query = query.filter(cast(Creator.data, String).ilike('%"email": "%'))
        else:
            query = query.filter(~cast(Creator.data, String).ilike('%"email": "%'))

    # If we need python-side filtering
    needs_python_filtering = (
        (location is not None and str(location).strip() != "")
        or (has_sharelink is not None)
        or (min_followers is not None)
        or (max_followers is not None)
    )

    if not needs_python_filtering:
        total = query.count()
        items = query.order_by(Creator.id.desc()).offset(skip).limit(limit).all()
        return items, total
    
    # Python-side filtering
    # Fetch all candidates
    candidates = query.order_by(Creator.id.desc()).all()
    filtered_items = []
    
    for item in candidates:
        data = item.data or {}

        if location is not None and str(location).strip() != "":
            item_location = (
                data.get("location")
                or data.get("locationCreated")
                or data.get("region")
                or data.get("country")
                or ""
            )
            if not _location_matches_terms(item_location, location_terms):
                continue
        
        # ShareLink Filter
        if has_sharelink is not None:
            # Check various keys
            link = data.get('shareLinks') or data.get('shareLink') or data.get('ShareLinks') or data.get('ShareLink') or data.get('share_link')
            has_link = bool(link and str(link).strip() and str(link).lower() != 'none')
            if has_sharelink != has_link:
                continue
                
        # Follower Range Filter
        if min_followers is not None or max_followers is not None:
            f_val = data.get('followerCount') or data.get('followers')
            count = parse_follower_count(f_val)
            
            if min_followers is not None and count < min_followers:
                continue
            if max_followers is not None and count > max_followers:
                continue
                
        filtered_items.append(item)
        
    total = len(filtered_items)
    # Paginate
    start = skip
    end = skip + limit
    items = filtered_items[start:end]
    
    return items, total

def get_creator_by_id(db: Session, creator_id: int):
    return db.query(Creator).filter(Creator.id == creator_id).first()

def delete_creator(db: Session, creator: Creator):
    db.delete(creator)
    db.commit()
