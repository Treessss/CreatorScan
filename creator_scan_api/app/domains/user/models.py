
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship, backref
from app.core.database import Base
import uuid
import datetime


def _utcnow_naive():
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

def generate_api_key():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_master = Column(Boolean, default=False)
    master_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    api_key = Column(String, unique=True, index=True, default=generate_api_key)
    two_fa_enabled = Column(Boolean, default=False)
    two_fa_secret = Column(String, nullable=True)
    two_fa_temp_secret = Column(String, nullable=True)

    # Email config
    email_host = Column(String, default="smtp.gmail.com")
    email_port = Column(Integer, default=587)
    email_username = Column(String, nullable=True)
    email_password = Column(String, nullable=True) # App password

    # Relationships (Using string references to avoid circular imports)
    sub_accounts = relationship("User", backref=backref("master", remote_side=[id]))
    creators = relationship("Creator", back_populates="owner")
    sent_emails = relationship("EmailLog", back_populates="sender")
    smtp_configs = relationship("SmtpConfig", back_populates="owner")
    email_templates = relationship("EmailTemplate", back_populates="owner")
    audit_logs = relationship("AuditLog", back_populates="user")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String, nullable=False) # e.g. "create_sub_account"
    target_type = Column(String, nullable=True) # e.g. "user"
    target_id = Column(Integer, nullable=True)
    details = Column(String, nullable=True) # JSON or text description
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow_naive)

    user = relationship("User", back_populates="audit_logs")
