
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.domains.creator import schemas, service
from app.domains.auth.service import get_current_user, get_user_via_api_key
from app.domains.user.models import User
from app.domains.email.service import EmailService # Cross-domain import for enrichment

router = APIRouter(prefix="/creators", tags=["creators"])

@router.post("/import", response_model=List[schemas.CreatorResponse])
async def import_creators(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return await service.CreatorService.import_from_excel(db, file, current_user.id)

@router.post("/push", response_model=List[schemas.CreatorResponse])
def push_creators(
    creators: List[schemas.CreatorCreate], 
    user: User = Depends(get_user_via_api_key), 
    db: Session = Depends(get_db)
):
    return service.CreatorService.push_creators(db, creators, user.id)

@router.get("/", response_model=schemas.CreatorPaginatedResponse)
def read_creators(
    skip: int = 0, 
    limit: int = 100, 
    search: str = None,
    has_email: bool = None,
    platform: str = None,
    location: str = None,
    has_sharelink: bool = None,
    min_followers: int = None,
    max_followers: int = None,
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    result = service.CreatorService.get_creators(
        db,
        current_user,
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
    # Enrich with email status
    enriched_items = EmailService.enrich_creators_with_email_status(db, result['items'])
    return {"items": enriched_items, "total": result['total']}

@router.post("/tags/batch")
def batch_update_creator_tags(
    payload: schemas.CreatorBatchTagsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = service.CreatorService.batch_update_creator_tags(
        db,
        payload.creator_ids,
        payload.tags,
        payload.mode,
        current_user,
    )
    if result is None:
        raise HTTPException(status_code=403, detail="Creator not found or permission denied")
    return result

@router.patch("/{creator_id}/tags", response_model=schemas.CreatorResponse)
def update_creator_tags(
    creator_id: int,
    payload: schemas.CreatorTagsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    creator = service.CreatorService.update_creator_tags(db, creator_id, payload.tags, payload.mode, current_user)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found or permission denied")

    enriched = EmailService.enrich_creators_with_email_status(db, [creator])
    return enriched[0]

@router.get("/{creator_id}", response_model=schemas.CreatorResponse)
def get_creator(
    creator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    creator = service.CreatorService.get_creator_by_id(db, creator_id, current_user)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found or permission denied")
    
    # Enrich with email status
    enriched = EmailService.enrich_creators_with_email_status(db, [creator])
    return enriched[0]

@router.delete("/{creator_id}")
def delete_creator(
    creator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    success = service.CreatorService.delete_creator(db, creator_id, current_user)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Creator not found or permission denied")
    return {"status": "success"}

@router.patch("/{creator_id}/status", response_model=schemas.CreatorResponse)
def update_creator_status(
    creator_id: int,
    payload: schemas.CreatorStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    creator = service.CreatorService.update_creator_status(db, creator_id, payload.status, current_user)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found or permission denied")

    enriched = EmailService.enrich_creators_with_email_status(db, [creator])
    return enriched[0]
