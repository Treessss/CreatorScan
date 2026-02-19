
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
import datetime

class Creator(Base):
    __tablename__ = "creators"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True)
    unique_id = Column(String, index=True) 
    data = Column(JSON) 
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner = relationship("app.domains.user.models.User", back_populates="creators")
    email_logs = relationship("app.domains.email.models.EmailLog", back_populates="recipient")

    __table_args__ = (UniqueConstraint('platform', 'unique_id', name='_platform_uid_uc'),)
