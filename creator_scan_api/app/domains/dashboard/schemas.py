from pydantic import BaseModel
from typing import List, Optional

class StatCard(BaseModel):
    label: str
    value: str
    trend: str
    isUp: bool
    icon: str
    bgClass: str
    iconColor: str

class PlatformStat(BaseModel):
    name: str
    value: int
    color: str

class ActivityStat(BaseModel):
    name: str
    count: int

class RecentActivity(BaseModel):
    id: int
    name: str
    description: str
    time: str
    avatar: Optional[str] = None

class DashboardStats(BaseModel):
    stats: List[StatCard]
    platform_distribution: List[PlatformStat]
    leads_trend: List[ActivityStat]
    recent_activity: List[RecentActivity]
