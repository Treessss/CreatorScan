
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.domains.user import schemas, service
from app.domains.user.audit_service import AuditService
from app.domains.auth.service import get_current_user
from app.domains.user.models import User

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.UserService.register_master(db, user)

@router.get("/me", response_model=schemas.UserWithSubs)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=schemas.UserResponse)
def update_users_me(
    profile: schemas.UserUpdateProfile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.UserService.update_profile(db, current_user.id, profile)

@router.put("/me/password", response_model=schemas.UserResponse)
def update_my_password(
    user_update: schemas.UserUpdatePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.UserService.update_password(db, current_user.id, user_update.password)

@router.post("/sub", response_model=schemas.UserResponse)
def create_sub_account(
    user: schemas.UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.UserService.create_sub_account(db, user, current_user.id)

@router.put("/sub/{sub_id}/password", response_model=schemas.UserResponse)
def update_sub_account_password(
    sub_id: int,
    user_update: schemas.UserUpdatePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updated_user = service.UserService.update_sub_account_password(db, sub_id, user_update.password, current_user.id)
    if not updated_user:
        raise HTTPException(status_code=404, detail="Sub-account not found")
    return updated_user

@router.delete("/sub/{sub_id}")
def delete_sub_account(
    sub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    success = service.UserService.delete_sub_account(db, sub_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Sub-account not found")
    return {"status": "success"}

@router.put("/config", response_model=schemas.UserResponse)
def update_email_config(
    config: schemas.UserUpdateEmail,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.UserService.update_email_config(db, current_user.id, config)

@router.get("/sub-accounts", response_model=List[schemas.UserResponse])
def read_sub_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.UserService.get_sub_accounts(db, current_user.id)

@router.get("/audit-logs", response_model=List[schemas.AuditLogResponse])
def get_audit_logs(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return AuditService.get_logs(db, current_user.id, skip, limit)
