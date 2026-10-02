import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict

from finance_tracker.database.manager import DatabaseManager


class AuthManager:
    def __init__(self):
        self.db_manager = DatabaseManager()

    def _hash_password(self, password: str, salt: str) -> str:
        return hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
        ).hex()

    def register_user(
        self, username: str, password: str, email: Optional[str] = None
    ) -> Dict:
        user_repo, db = self.db_manager.get_user_repository()
        try:
            if user_repo.get_by_username(username):
                return {"success": False, "error": "Username already exists"}

            if email and user_repo.get_by_email(email):
                return {"success": False, "error": "Email already exists"}

            salt = secrets.token_hex(16)
            password_hash = self._hash_password(password, salt)

            user = user_repo.create_user(
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "password_salt": salt,
                }
            )
            return {"success": True, "user_id": user.id}
        finally:
            db.close()

    def login(self, username: str, password: str) -> Dict:
        user_repo, db = self.db_manager.get_user_repository()
        session_repo, db_session = self.db_manager.get_session_repository()
        try:
            user = user_repo.get_by_username(username)
            if not user:
                return {"success": False, "error": "Invalid credentials"}

            password_hash = self._hash_password(password, user.password_salt)
            if password_hash != user.password_hash:
                return {"success": False, "error": "Invalid credentials"}

            token = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(days=7)
            session_repo.create_session(user.id, token, expires_at=expires_at)
            user_repo.update_last_login(user.id)
            return {"success": True, "user_id": user.id, "token": token}
        finally:
            db.close()
            db_session.close()

    def verify_session(self, token: str) -> Optional[int]:
        session_repo, db = self.db_manager.get_session_repository()
        try:
            session = session_repo.get_session(token)
            if not session or session.revoked_at:
                return None
            if session.expires_at and session.expires_at < datetime.utcnow():
                return None
            return session.user_id
        finally:
            db.close()

    def logout(self, token: str) -> bool:
        session_repo, db = self.db_manager.get_session_repository()
        try:
            return session_repo.revoke_session(token)
        finally:
            db.close()
