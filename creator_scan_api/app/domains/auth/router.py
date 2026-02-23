
from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import pyotp
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.core.exceptions import AuthError
from app.domains.user.repository import get_user_by_username
from app.domains.auth.schemas import Token

router = APIRouter(tags=["auth"])

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    otp_code: str = Form(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise AuthError("Incorrect username or password")

    if user.two_fa_enabled:
        if not otp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA_REQUIRED",
            )
        if not user.two_fa_secret or not pyotp.TOTP(user.two_fa_secret).verify(otp_code, valid_window=1):
            raise AuthError("Invalid 2FA code")
    
    access_token = create_access_token(subject=user.username)
    return {"access_token": access_token, "token_type": "bearer"}
