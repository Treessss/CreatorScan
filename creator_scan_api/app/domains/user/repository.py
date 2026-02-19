
from sqlalchemy.orm import Session
from app.domains.user.models import User
from app.domains.user.schemas import UserCreate, UserUpdateEmail, UserUpdateProfile
from app.core.security import get_password_hash

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def get_user_by_id(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_api_key(db: Session, api_key: str):
    return db.query(User).filter(User.api_key == api_key).first()

def create_user(db: Session, user: UserCreate, is_master: bool = False, master_id: int = None):
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        hashed_password=hashed_password,
        is_master=is_master,
        master_id=master_id
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_email_config(db: Session, user_id: int, config: UserUpdateEmail):
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db_user.email_username = config.email_username
        db_user.email_password = config.email_password
        db.commit()
        db.refresh(db_user)
    return db_user

def update_user_profile(db: Session, user_id: int, profile: UserUpdateProfile):
    db_user = get_user_by_id(db, user_id)
    if db_user:
        if profile.username:
            db_user.username = profile.username
        db.commit()
        db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int) -> bool:
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
        return True
    return False

def update_password(db: Session, user_id: int, password: str):
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db_user.hashed_password = get_password_hash(password)
        db.commit()
        db.refresh(db_user)
    return db_user
