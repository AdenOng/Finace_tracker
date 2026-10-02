from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from datetime import datetime
import shutil
import os
from pathlib import Path
from uuid import uuid4

from finance_tracker.src.transaction_processor import TransactionProcessor
from finance_tracker.src.api.dependencies import get_current_user

router = APIRouter(prefix="/transactions", tags=["transactions"])
processor = TransactionProcessor()

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


class TransactionBase(BaseModel):
    description: str
    amount: float
    date: Optional[datetime] = None
    category: Optional[str] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    category: str


class TransactionEdit(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[datetime] = None
    category: Optional[str] = None


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), current_user: int = Depends(get_current_user)
):
    file_path = None
    try:
        safe_name = Path(file.filename or "upload.bin").name
        if safe_name in {"", ".", ".."}:
            safe_name = "upload.bin"

        file_path = UPLOAD_DIR / f"{uuid4().hex}_{safe_name}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = processor.process_file(current_user, str(file_path))

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


@router.get("/")
async def get_transactions(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    uncategorized: bool = False,
    current_user: int = Depends(get_current_user),
):
    filters = {}
    if start_date and end_date:
        filters["start_date"] = start_date
        filters["end_date"] = end_date
    if search:
        filters["search"] = search
    if uncategorized:
        filters["uncategorized"] = True

    return processor.get_transactions(current_user, **filters)


@router.post("/")
async def add_transaction(
    transaction: TransactionCreate, current_user: int = Depends(get_current_user)
):
    data = {
        "description": transaction.description,
        "amount": transaction.amount,
        "transaction_date": transaction.date,
        "is_duplicate": False,
    }

    # Handle category logic if needed, but processor expects category_id mainly.
    # The processor.add_manual_transaction handles text->category lookup internally
    # if category_id is missing but we might need to look it up here if passed by name.

    # Simple pass-through for now, assuming processor handles it or we improve it later.
    result = processor.add_manual_transaction(current_user, data)

    if result and not result.get("success", True):  # Handle error dict
        raise HTTPException(status_code=400, detail=result.get("error"))

    return result


@router.get("/categories")
async def get_categories(current_user: int = Depends(get_current_user)):
    return processor.get_categories()


@router.patch("/{transaction_id}/category")
async def update_category(
    transaction_id: int,
    update: TransactionUpdate,
    current_user: int = Depends(get_current_user),
):
    success = processor.update_transaction_category(
        transaction_id, update.category, current_user
    )
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found or category is invalid",
        )
    return {"success": True}


@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: int,
    update: TransactionEdit,
    current_user: int = Depends(get_current_user),
):
    updated = processor.update_transaction(
        transaction_id,
        current_user,
        {
            "description": update.description,
            "amount": update.amount,
            "date": update.date,
            "category": update.category,
        },
    )

    if not updated:
        raise HTTPException(
            status_code=404, detail="Transaction not found or invalid category"
        )

    return {"success": True, "transaction": updated}


@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    current_user: int = Depends(get_current_user),
):
    deleted = processor.delete_transaction(transaction_id, current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True}
