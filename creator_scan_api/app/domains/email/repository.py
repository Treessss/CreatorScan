from sqlalchemy.orm import Session
from app.domains.email.models import EmailLog
from app.domains.creator.models import Creator
from typing import List, Optional
from sqlalchemy import desc


def create_email_log(db: Session, sender_id: int, recipient_id: int, subject: str, body: str, status: str, recipient_email: str = None, recipient_name: str = None, smtp_config_id: int = None):
    db_email = EmailLog(
        sender_id=sender_id,
        recipient_id=recipient_id,
        subject=subject,
        body=body,
        status=status,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        smtp_config_id=smtp_config_id
    )
    db.add(db_email)
    db.commit()
    db.refresh(db_email)
    return db_email


def update_email_reply(db: Session, email_id: int, content: str, replied_at):
    email = db.query(EmailLog).filter(EmailLog.id == email_id).first()
    if email:
        email.replied = True
        email.reply_content = content
        email.replied_at = replied_at
    db.commit()
    db.refresh(email)
    return email


def get_logs_by_sender(db: Session, sender_id: int) -> List[EmailLog]:
    return db.query(EmailLog).filter(EmailLog.sender_id == sender_id).order_by(desc(EmailLog.sent_at)).all()


def get_logs_by_sender_with_pagination(
    db: Session,
    sender_id: int,
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    replied: Optional[bool] = None
) -> dict:
    """获取邮件日志（支持分页和筛选）"""
    query = db.query(EmailLog).filter(EmailLog.sender_id == sender_id)

    if status is not None:
        query = query.filter(EmailLog.status == status)
    if replied is not None:
        query = query.filter(EmailLog.replied == replied)

    total = query.count()
    logs = query.order_by(desc(EmailLog.sent_at)).offset(skip).limit(limit).all()

    return {"items": logs, "total": total}


def get_unreplied_sent_logs(db: Session, sender_id: int):
    return db.query(EmailLog).filter(
        EmailLog.sender_id == sender_id,
        EmailLog.status == 'sent',
        EmailLog.replied == False
    ).all()


def get_latest_log_for_recipient(db: Session, recipient_id: int):
    return db.query(EmailLog).filter(EmailLog.recipient_id == recipient_id).order_by(desc(EmailLog.sent_at)).first()


def get_log_with_recipient_info(db: Session, log_id: int, user_id: int) -> Optional[EmailLog]:
    """获取邮件日志详情（带收件人信息）"""
    return db.query(EmailLog).filter(
        EmailLog.id == log_id,
        EmailLog.sender_id == user_id
    ).first()
