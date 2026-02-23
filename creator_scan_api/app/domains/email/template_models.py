from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
import datetime


def _utcnow_naive():
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)  # 模板名称
    subject = Column(String, nullable=False)  # 邮件主题
    body = Column(Text, nullable=False)  # 邮件正文
    created_at = Column(DateTime, default=_utcnow_naive)
    updated_at = Column(DateTime, default=_utcnow_naive, onupdate=_utcnow_naive)

    # Relationship
    owner = relationship("app.domains.user.models.User", back_populates="email_templates")
