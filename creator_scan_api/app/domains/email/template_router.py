from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.domains.email import template_service, schemas
from app.domains.auth.service import get_current_user
from app.domains.user.models import User

router = APIRouter(prefix="/templates", tags=["email_templates"])


@router.get("/", response_model=List[schemas.EmailTemplateResponse])
def get_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的所有邮件模板"""
    return template_service.EmailTemplateService.get_templates(db, current_user.id)


@router.get("/{template_id}", response_model=schemas.EmailTemplateResponse)
def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取指定模板详情"""
    template = template_service.EmailTemplateService.get_template(db, template_id, current_user.id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/", response_model=schemas.EmailTemplateResponse)
def create_template(
    template_data: schemas.EmailTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建新模板"""
    return template_service.EmailTemplateService.create_template(db, current_user.id, template_data)


@router.put("/{template_id}", response_model=schemas.EmailTemplateResponse)
def update_template(
    template_id: int,
    template_data: schemas.EmailTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新模板"""
    template = template_service.EmailTemplateService.update_template(db, template_id, current_user.id, template_data)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除模板"""
    success = template_service.EmailTemplateService.delete_template(db, template_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success"}
