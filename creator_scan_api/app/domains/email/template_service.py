from sqlalchemy.orm import Session
from app.domains.email import template_repository, schemas
from app.domains.email.models import EmailLog, SmtpConfig
from app.domains.creator.models import Creator
from typing import List, Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class EmailTemplateService:
    """邮件模板服务"""

    @staticmethod
    def get_templates(db: Session, user_id: int) -> List[schemas.EmailTemplateResponse]:
        templates = template_repository.get_templates_by_user(db, user_id)
        return templates

    @staticmethod
    def get_template(db: Session, template_id: int, user_id: int) -> Optional[schemas.EmailTemplateResponse]:
        return template_repository.get_template_by_id(db, template_id, user_id)

    @staticmethod
    def create_template(db: Session, user_id: int, template_data: schemas.EmailTemplateCreate) -> schemas.EmailTemplateResponse:
        return template_repository.create_template(
            db, user_id,
            title=template_data.title,
            subject=template_data.subject,
            body=template_data.body
        )

    @staticmethod
    def update_template(db: Session, template_id: int, user_id: int, template_data: schemas.EmailTemplateUpdate) -> Optional[schemas.EmailTemplateResponse]:
        return template_repository.update_template(
            db, template_id, user_id,
            title=template_data.title,
            subject=template_data.subject,
            body=template_data.body
        )

    @staticmethod
    def delete_template(db: Session, template_id: int, user_id: int) -> bool:
        return template_repository.delete_template(db, template_id, user_id)
