
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
import datetime


def _utcnow_naive():
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

class SmtpConfig(Base):
    __tablename__ = "smtp_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # Configuration
    host = Column(String)
    port = Column(Integer)
    username = Column(String) # Email address
    password = Column(String) # App password or password
    sender_name = Column(String, nullable=True) # e.g. "John Doe"
    
    is_default = Column(Boolean, default=False)
    
    owner = relationship("app.domains.user.models.User", back_populates="smtp_configs")

class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    recipient_id = Column(Integer, ForeignKey("creators.id"))
    recipient_email = Column(String, nullable=True)  # Store recipient email directly
    recipient_name = Column(String, nullable=True)   # Store recipient name directly
    smtp_config_id = Column(Integer, ForeignKey("smtp_configs.id"), nullable=True)  # Track which SMTP config was used
    subject = Column(String)
    body = Column(String)
    status = Column(String) # 'sent', 'failed'
    replied = Column(Boolean, default=False)
    reply_content = Column(String, nullable=True)
    sent_at = Column(DateTime, default=_utcnow_naive)
    replied_at = Column(DateTime, nullable=True)

    sender = relationship("app.domains.user.models.User", back_populates="sent_emails")
    recipient = relationship("app.domains.creator.models.Creator", back_populates="email_logs")
