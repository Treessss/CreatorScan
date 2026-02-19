from typing import List, Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.domains.email import schemas, service, template_service
from app.domains.auth.service import get_current_user
from app.domains.user.models import User
from app.core.exceptions import AuthError
from app.domains.creator.models import Creator

router = APIRouter(prefix="/emails", tags=["emails"])


# SMTP Config Routes
@router.post("/smtp", response_model=schemas.SmtpConfigResponse)
def create_smtp_config(
    config: schemas.SmtpConfigCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.EmailService.create_smtp_config(db, current_user.id, config)


@router.get("/smtp", response_model=List[schemas.SmtpConfigResponse])
def get_smtp_configs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.EmailService.get_smtp_configs(db, current_user.id)


@router.put("/smtp/{config_id}", response_model=schemas.SmtpConfigResponse)
def update_smtp_config(
    config_id: int,
    config: schemas.SmtpConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    result = service.EmailService.update_smtp_config(db, current_user.id, config_id, config)
    if not result:
        raise HTTPException(status_code=404, detail="Config not found")
    return result


@router.delete("/smtp/{config_id}")
def delete_smtp_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    success = service.EmailService.delete_smtp_config(db, current_user.id, config_id)
    if not success:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"status": "success"}


@router.post("/smtp/test")
def test_smtp_config(
    config: schemas.SmtpConfigBase,
    current_user: User = Depends(get_current_user)
):
    success, error = service.EmailService.test_smtp_connection(config)
    return {"success": success, "error": error}


# Email Operation Routes
@router.post("/send")
def send_batch_emails(
    request: schemas.EmailSendRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if any config exists
    configs = service.EmailService.get_smtp_configs(db, current_user.id)
    if not configs:
        raise AuthError("No SMTP configuration found. Please add one in Settings.")

    if not request.creator_ids:
        raise HTTPException(status_code=400, detail="No creator IDs provided")

    background_tasks.add_task(
        service.EmailService.send_batch_emails,
        db, current_user.id, request.creator_ids, request.subject, request.body, request.smtp_config_id
    )
    return {"message": "Emails queued for sending", "count": len(request.creator_ids)}


@router.post("/sync")
def sync_email_replies(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    configs = service.EmailService.get_smtp_configs(db, current_user.id)
    if not configs:
        raise AuthError("No SMTP configuration found. Please add one in Settings.")

    background_tasks.add_task(service.EmailService.sync_replies, db, current_user.id)
    return {"message": "Sync started"}


@router.get("/logs", response_model=schemas.EmailLogListResponse)
def get_email_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    replied: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取邮件发送历史（支持分页和筛选）"""
    result = service.EmailService.get_logs_with_pagination(db, current_user.id, skip, limit, status, replied)
    # Convert items to dict format with recipient_email and recipient_name
    items = []
    for log in result["items"]:
        item_data = {
            "id": log.id,
            "sender_id": log.sender_id,
            "recipient_id": log.recipient_id,
            "recipient_email": log.recipient_email,
            "recipient_name": log.recipient_name,
            "subject": log.subject,
            "body": log.body,
            "status": log.status,
            "replied": log.replied,
            "reply_content": log.reply_content,
            "sent_at": log.sent_at,
            "replied_at": log.replied_at
        }
        items.append(item_data)
    # Return just the items list for backward compatibility
    return items


@router.get("/logs/stats")
def get_email_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取邮件统计信息"""
    stats = service.EmailService.get_email_stats(db, current_user.id)
    return stats


# Email Template Routes (for backward compatibility, also available at /templates)
@router.get("/templates", response_model=List[schemas.EmailTemplateResponse])
def get_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的所有邮件模板"""
    return template_service.EmailTemplateService.get_templates(db, current_user.id)


@router.get("/templates/{template_id}", response_model=schemas.EmailTemplateResponse)
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


@router.post("/templates", response_model=schemas.EmailTemplateResponse)
def create_template(
    template_data: schemas.EmailTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建新模板"""
    return template_service.EmailTemplateService.create_template(db, current_user.id, template_data)


@router.put("/templates/{template_id}", response_model=schemas.EmailTemplateResponse)
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


@router.delete("/templates/{template_id}")
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
