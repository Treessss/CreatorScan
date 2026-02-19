from typing import List, Optional
from pydantic import BaseModel
import datetime


class SmtpConfigBase(BaseModel):
    host: str
    port: int
    username: str
    password: str
    sender_name: Optional[str] = None
    is_default: bool = False


class SmtpConfigCreate(SmtpConfigBase):
    pass


class SmtpConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    sender_name: Optional[str] = None
    is_default: Optional[bool] = None


class SmtpConfigResponse(SmtpConfigBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


class EmailSendRequest(BaseModel):
    creator_ids: List[int]
    subject: str
    body: str
    smtp_config_id: Optional[int] = None


class EmailLogResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    subject: str
    body: str
    status: str
    replied: bool
    reply_content: Optional[str]
    sent_at: datetime.datetime
    replied_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


class EmailLogListResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    recipient_email: Optional[str]
    recipient_name: Optional[str]
    subject: str
    body: str
    status: str
    replied: bool
    reply_content: Optional[str]
    sent_at: datetime.datetime
    replied_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True


# Email Template Schemas
class EmailTemplateBase(BaseModel):
    title: str
    subject: str
    body: str


class EmailTemplateCreate(EmailTemplateBase):
    pass


class EmailTemplateUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class EmailTemplateResponse(EmailTemplateBase):
    id: int
    user_id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True
