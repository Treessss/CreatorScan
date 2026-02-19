
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import datetime

class CreatorBase(BaseModel):
    platform: str
    unique_id: str
    data: Dict[str, Any]

class CreatorCreate(CreatorBase):
    pass

class CreatorResponse(CreatorBase):
    id: int
    owner_id: int
    created_at: datetime.datetime
    
    # Enriched fields
    email_status: Optional[str] = "not_sent"
    has_replied: bool = False
    latest_reply_content: Optional[str] = None

    class Config:
        from_attributes = True

class CreatorPaginatedResponse(BaseModel):
    items: List[CreatorResponse]
    total: int
