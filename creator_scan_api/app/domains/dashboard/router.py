from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.domains.dashboard import schemas, service
from app.domains.auth.service import get_current_user
from app.domains.user.models import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    return service.DashboardService.get_stats(db, current_user.id)
