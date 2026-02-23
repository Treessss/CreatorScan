
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
import datetime

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class UserUpdateEmail(BaseModel):
    email_username: str
    email_password: str

class UserUpdatePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class SubAccountPasswordUpdate(BaseModel):
    password: str = Field(min_length=6)

class UserUpdateProfile(BaseModel):
    username: Optional[str] = None
    # Add other fields here if User model has more profile fields like full_name, etc.
    # Currently User model only has username, api_key, etc.

class UserResponse(UserBase):
    id: int
    is_master: bool
    api_key: str
    email_username: Optional[str] = None
    two_fa_enabled: bool = False

    model_config = ConfigDict(from_attributes=True)

class UserWithSubs(UserResponse):
    sub_accounts: List[UserResponse] = []

class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    action: str
    target_type: Optional[str]
    target_id: Optional[int]
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class TwoFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class TwoFAEnableRequest(BaseModel):
    code: str


class TwoFADisableRequest(BaseModel):
    current_password: str
    code: str
