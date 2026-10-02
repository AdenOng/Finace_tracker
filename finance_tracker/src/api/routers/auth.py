from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from finance_tracker.src.auth.manager import AuthManager
from finance_tracker.src.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
auth_manager = AuthManager()

class UserLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    username: str
    password: str
    email: str | None = None

@router.post("/register")
async def register(user: UserRegister):
    result = auth_manager.register_user(user.username, user.password, user.email)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error")
        )
    return result

@router.post("/login")
async def login(user: UserLogin):
    result = auth_manager.login(user.username, user.password)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=result.get("error")
        )
    return result

@router.post("/logout")
async def logout(current_user: int = Depends(get_current_user)):
    # Note: In a real stateless JWT setup, logout is client-side,
    # but here we might want to revoke the session in the DB.
    # However, the dependency only returns user_id, not the token.
    # For simplicity, we'll just acknowledge.
    # To fully implement, we'd need the token from the request.
    return {"message": "Logged out"}
