from sqlalchemy.orm import Session
from app.domains.email.template_models import EmailTemplate
from typing import List, Optional


def get_templates_by_user(db: Session, user_id: int) -> List[EmailTemplate]:
    """获取用户的所有模板"""
    return db.query(EmailTemplate).filter(EmailTemplate.user_id == user_id).order_by(EmailTemplate.created_at.desc()).all()


def get_template_by_id(db: Session, template_id: int, user_id: int) -> Optional[EmailTemplate]:
    """根据 ID 获取模板（确保属于指定用户）"""
    return db.query(EmailTemplate).filter(
        EmailTemplate.id == template_id,
        EmailTemplate.user_id == user_id
    ).first()


def create_template(db: Session, user_id: int, title: str, subject: str, body: str) -> EmailTemplate:
    """创建新模板"""
    template = EmailTemplate(
        user_id=user_id,
        title=title,
        subject=subject,
        body=body
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(db: Session, template_id: int, user_id: int, title: Optional[str] = None, subject: Optional[str] = None, body: Optional[str] = None) -> Optional[EmailTemplate]:
    """更新模板"""
    template = get_template_by_id(db, template_id, user_id)
    if not template:
        return None

    if title is not None:
        template.title = title
    if subject is not None:
        template.subject = subject
    if body is not None:
        template.body = body

    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template_id: int, user_id: int) -> bool:
    """删除模板"""
    template = get_template_by_id(db, template_id, user_id)
    if not template:
        return False

    db.delete(template)
    db.commit()
    return True
