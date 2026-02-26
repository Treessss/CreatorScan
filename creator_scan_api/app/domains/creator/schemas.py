
from typing import Dict, Any, Optional, List, Literal
from pydantic import BaseModel, ConfigDict
import datetime

class CreatorBase(BaseModel):
    platform: str
    unique_id: str
    data: Dict[str, Any]

class CreatorCreate(CreatorBase):
    pass

class CreatorStatusUpdate(BaseModel):
    status: Literal["none", "pending"]

class CreatorTagsUpdate(BaseModel):
    tags: List[str] | str
    mode: Literal["merge", "replace"] = "merge"

class CreatorBatchTagsUpdate(BaseModel):
    creator_ids: List[int]
    tags: List[str] | str
    mode: Literal["merge", "replace"] = "merge"

class CreatorResponse(CreatorBase):
    id: int
    owner_id: int
    created_at: datetime.datetime
    
    # Enriched fields
    email_status: Optional[str] = "not_sent"
    has_replied: bool = False
    latest_reply_content: Optional[str] = None
    manual_status: Optional[Literal["none", "pending"]] = "none"

    model_config = ConfigDict(from_attributes=True)

class CreatorPaginatedResponse(BaseModel):
    items: List[CreatorResponse]
    total: int
