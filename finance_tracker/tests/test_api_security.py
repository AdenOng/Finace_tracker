"""Focused legacy API regressions; no Postgres, OCR, or model required."""

import threading
from unittest.mock import Mock

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from finance_tracker.database.models import Base
from finance_tracker.database.repository import SessionRepository
from finance_tracker.src.api import dependencies, uploads
from finance_tracker.src.api.routers import auth, portfolio, transactions


def test_logout_revokes_session(monkeypatch, tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'sessions.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    def repository():
        db = sessions()
        return SessionRepository(db), db

    for manager in (auth.auth_manager, dependencies.auth_manager):
        monkeypatch.setattr(manager.db_manager, "get_session_repository", repository)
    repo, db = repository()
    try:
        repo.create_session(1, "logout-token")
        repo.create_session(1, "other-token")
    finally:
        db.close()

    app = FastAPI()
    app.include_router(auth.router)

    @app.get("/protected")
    def protected(user=Depends(dependencies.get_current_user)):
        return {"user": user}

    with TestClient(app) as client:
        headers = {"Authorization": "Bearer logout-token"}
        assert client.get("/protected", headers=headers).status_code == 200
        assert client.post("/auth/logout", headers=headers).status_code == 200
        assert auth.auth_manager.verify_session("logout-token") is None
        assert client.get("/protected", headers=headers).status_code == 401
        assert client.post("/auth/logout", headers=headers).status_code == 401
        assert client.get(
            "/protected", headers={"Authorization": "Bearer other-token"}
        ).status_code == 200
    engine.dispose()


@pytest.mark.parametrize("route", [transactions, portfolio])
@pytest.mark.parametrize(
    "declared_length",
    [None, "oversized", "understated", "streamed", "streamed-understated"],
)
def test_oversized_upload_gets_413(monkeypatch, tmp_path, route, declared_length):
    # Small limits exercise multiple reads without allocating a large test file.
    monkeypatch.setattr(uploads, "MAX_UPLOAD_BYTES", 256)
    monkeypatch.setattr(uploads, "UPLOAD_CHUNK_BYTES", 64)
    monkeypatch.setattr(uploads, "MAX_UPLOAD_REQUEST_BYTES", 4096)
    monkeypatch.setattr(route, "UPLOAD_DIR", tmp_path)
    process = Mock(return_value={"success": True})
    method = "process_file" if route is transactions else "process_portfolio_file"
    monkeypatch.setattr(route.processor, method, process)

    app = FastAPI()
    app.add_middleware(uploads.UploadSizeMiddleware)
    app.include_router(route.router)
    app.dependency_overrides[dependencies.get_current_user] = lambda: 1
    path = f"{route.router.prefix}/upload"
    payload_size = (
        4097 if declared_length and declared_length.startswith("streamed") else 257
    )
    with TestClient(app) as client:
        request = client.build_request(
            "POST", path,
            files={"file": ("statement.csv", b"x" * payload_size)},
            data={"broker_name": "test"},
        )
        if declared_length in (None, "streamed"):
            del request.headers["content-length"]
        else:
            request.headers["content-length"] = (
                "4097" if declared_length == "oversized" else "1"
            )
        assert client.send(request).status_code == 413
        process.assert_not_called()
        assert list(tmp_path.iterdir()) == []

        def process_in_worker(*args):
            assert threading.current_thread().name == "AnyIO worker thread"
            return {"success": True}

        process.side_effect = process_in_worker
        assert client.post(
            path, files={"file": ("statement.csv", b"x" * 256)},
            data={"broker_name": "test"},
        ).status_code == 200
        process.assert_called_once()
        assert list(tmp_path.iterdir()) == []
