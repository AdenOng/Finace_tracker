from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from finance_tracker.src.auth.manager import AuthManager

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
auth_manager = AuthManager()

async def get_current_user(token: str = Depends(oauth2_scheme)) -> int:
    user_id = auth_manager.verify_session(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id
