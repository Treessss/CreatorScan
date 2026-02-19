
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthError
from app.domains.user.repository import get_user_by_username, get_user_by_api_key
from app.domains.auth.schemas import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise AuthError()
        token_data = TokenData(username=username)
    except JWTError:
        raise AuthError()
    
    user = get_user_by_username(db, username=token_data.username)
    if user is None:
        raise AuthError()
    return user

def get_user_via_api_key(api_key: str = Depends(api_key_header), db: Session = Depends(get_db)):
    if not api_key:
        raise AuthError("API Key missing")
    user = get_user_by_api_key(db, api_key)
    if not user:
        raise AuthError("Invalid API Key")
    return user
