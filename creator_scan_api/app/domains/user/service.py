
from sqlalchemy.orm import Session
from app.domains.user import repository, schemas
from app.domains.user.audit_service import AuditService
from app.core.exceptions import PermissionError, AuthError

class UserService:
    @staticmethod
    def register_master(db: Session, user: schemas.UserCreate):
        if repository.get_user_by_username(db, user.username):
            raise AuthError("Username already registered")
        user = repository.create_user(db, user, is_master=True)
        AuditService.create_log(db, user.id, "register_master", target_type="user", target_id=user.id, details=f"Master user {user.username} registered")
        return user

    @staticmethod
    def create_sub_account(db: Session, user: schemas.UserCreate, master_id: int):
        master = repository.get_user_by_id(db, master_id)
        if not master or not master.is_master:
             raise PermissionError("Only master account can create sub-accounts")

        if repository.get_user_by_username(db, user.username):
            raise AuthError("Username already registered")

        sub_account = repository.create_user(db, user, is_master=False, master_id=master_id)
        AuditService.create_log(db, master_id, "create_sub_account", target_type="user", target_id=sub_account.id, details=f"Sub-account {sub_account.username} created")
        return sub_account

    @staticmethod
    def update_email_config(db: Session, user_id: int, config: schemas.UserUpdateEmail):
        return repository.update_email_config(db, user_id, config)

    @staticmethod
    def get_sub_accounts(db: Session, master_id: int):
        master = repository.get_user_by_id(db, master_id)
        if not master or not master.is_master:
             raise PermissionError("Only master account can view sub-accounts")
        return master.sub_accounts

    @staticmethod
    def delete_sub_account(db: Session, sub_account_id: int, master_id: int):
        master = repository.get_user_by_id(db, master_id)
        if not master or not master.is_master:
             raise PermissionError("Only master account can delete sub-accounts")

        sub_account = repository.get_user_by_id(db, sub_account_id)
        if not sub_account:
            return False

        if sub_account.master_id != master_id:
            raise PermissionError("This sub-account does not belong to you")

        success = repository.delete_user(db, sub_account_id)
        if success:
            AuditService.create_log(db, master_id, "delete_sub_account", target_type="user", target_id=sub_account_id, details=f"Sub-account {sub_account.username} deleted")
        return success

    @staticmethod
    def update_sub_account_password(db: Session, sub_account_id: int, password: str, master_id: int):
        master = repository.get_user_by_id(db, master_id)
        if not master or not master.is_master:
             raise PermissionError("Only master account can update sub-accounts")

        sub_account = repository.get_user_by_id(db, sub_account_id)
        if not sub_account:
            return None

        if sub_account.master_id != master_id:
            raise PermissionError("This sub-account does not belong to you")

        updated_user = repository.update_password(db, sub_account_id, password)
        AuditService.create_log(db, master_id, "update_sub_account_password", target_type="user", target_id=sub_account_id, details=f"Password updated for sub-account {sub_account.username}")
        return updated_user

    @staticmethod
    def update_profile(db: Session, user_id: int, profile: schemas.UserUpdateProfile):
        updated_user = repository.update_user_profile(db, user_id, profile)
        AuditService.create_log(db, user_id, "update_profile", target_type="user", target_id=user_id, details=f"User profile updated")
        return updated_user

    @staticmethod
    def update_password(db: Session, user_id: int, password: str):
        updated_user = repository.update_password(db, user_id, password)
        AuditService.create_log(db, user_id, "update_password", target_type="user", target_id=user_id, details=f"User password updated")
        return updated_user
