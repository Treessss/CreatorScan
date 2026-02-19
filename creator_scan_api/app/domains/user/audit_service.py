from sqlalchemy.orm import Session
from app.domains.user.models import AuditLog
from typing import List, Optional

class AuditService:
    @staticmethod
    def create_log(
        db: Session,
        user_id: int,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None
    ):
        log = AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=ip_address
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_logs(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[AuditLog]:
        return db.query(AuditLog).filter(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_master_logs(db: Session, master_id: int, skip: int = 0, limit: int = 100) -> List[AuditLog]:
        """Get logs for master and all sub-accounts"""
        # This requires a join or two queries. Simplified for now to just get master's logs or sub-account logs if we had a way to query them.
        # But typically master wants to see what sub-accounts did.
        # For now, let's just return logs where user_id is the master_id OR user is a sub-account of master_id.

        # Simplified: Just return logs for the user (master) themselves for now as per requirement "Audit Log System".
        # If we need logs of sub-accounts, we'd need to query users where master_id = master_id, get their IDs, and include them.

        from app.domains.user.models import User
        sub_account_ids = db.query(User.id).filter(User.master_id == master_id).all()
        user_ids = [master_id] + [uid[0] for uid in sub_account_ids]

        return db.query(AuditLog).filter(AuditLog.user_id.in_(user_ids)).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
