from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import shutil
import os
from pathlib import Path
from uuid import uuid4

from finance_tracker.src.portfolio.processor import PortfolioProcessor
from finance_tracker.src.api.dependencies import get_current_user

router = APIRouter(prefix="/portfolio", tags=["portfolio"])
processor = PortfolioProcessor()

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


class AccountCreate(BaseModel):
    name: str
    account_type: str
    balance: float


class AccountUpdate(BaseModel):
    balance: float


@router.post("/upload")
async def upload_portfolio(
    broker_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: int = Depends(get_current_user),
):
    file_path = None
    try:
        safe_name = Path(file.filename or "upload.bin").name
        if safe_name in {"", ".", ".."}:
            safe_name = "upload.bin"

        file_path = UPLOAD_DIR / f"{uuid4().hex}_{safe_name}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = processor.process_portfolio_file(
            current_user, str(file_path), broker_name
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path and file_path.exists():
            os.remove(file_path)


@router.get("/value")
async def get_portfolio_value(current_user: int = Depends(get_current_user)):
    return processor.get_portfolio_value(current_user)


@router.get("/net-worth")
async def get_net_worth(current_user: int = Depends(get_current_user)):
    return processor.get_net_worth(current_user)


@router.post("/accounts")
async def add_account(
    account: AccountCreate, current_user: int = Depends(get_current_user)
):
    result = processor.add_account(
        current_user, account.name, account.account_type, account.balance
    )
    return result


@router.get("/accounts")
async def list_accounts(current_user: int = Depends(get_current_user)):
    return processor.list_accounts(current_user)


@router.patch("/accounts/{account_id}/balance")
async def update_account_balance(
    account_id: int,
    update: AccountUpdate,
    current_user: int = Depends(get_current_user),
):
    success = processor.update_account_balance(account_id, update.balance, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True}
