from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
from finance_tracker.database.manager import DatabaseManager
from finance_tracker.database.repository import (
    TransactionRepository,
    CategoryRepository,
)
from finance_tracker.src.ocr.pdf_processor import DocumentProcessor
from finance_tracker.src.llm.manager import llm_manager
from finance_tracker.src.utils.transaction_extractor import TransactionExtractor


class TransactionProcessor:
    """
    Main processor for handling financial documents and transactions
    """

    def __init__(self, use_llm_for_categorization: bool = True):
        self.db_manager = DatabaseManager()
        self.document_processor = DocumentProcessor()
        self.transaction_extractor = TransactionExtractor()
        self.use_llm_for_categorization = use_llm_for_categorization

    def _serialize_transaction(self, transaction: Any) -> Dict[str, Any]:
        return {
            "id": transaction.id,
            "description": transaction.description,
            "amount": transaction.amount,
            "date": transaction.transaction_date,
            "category": transaction.category.name if transaction.category else None,
            "is_duplicate": transaction.is_duplicate,
            "llm_suggested_category": transaction.llm_suggested_category,
        }

    def process_file(self, user_id: int, file_path: str) -> Dict[str, Any]:
        """
        Process a file (PDF or image) and extract transactions

        Args:
            file_path: Path to the file

        Returns:
            Dictionary with processing results
        """
        file_path = Path(file_path)

        if not file_path.exists():
            return {"success": False, "error": f"File not found: {file_path}"}

        try:
            document_result = self.document_processor.process_document(str(file_path))

            if not document_result.get("success"):
                return {
                    "success": False,
                    "error": f"Document processing failed: {document_result.get('error')}",
                }

            text = document_result.get("text", "")
            filename = file_path.name
            file_size = file_path.stat().st_size
            file_ext = file_path.suffix.lower().replace(".", "")

            doc_repo, db = self.db_manager.get_document_repository()
            document = doc_repo.create_document(
                filename=filename,
                file_path=str(file_path),
                file_type=file_ext,
                file_size=file_size,
                user_id=user_id,
            )
            db.close()

            transactions = self.extract_and_store_transactions(user_id, text, filename)

            doc_repo, db = self.db_manager.get_document_repository()
            doc_repo.update_document_status(
                document.id, status="completed", transaction_count=len(transactions)
            )
            db.close()

            return {
                "success": True,
                "document_id": document.id,
                "transactions_count": len(transactions),
                "transactions": transactions,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def extract_and_store_transactions(
        self, user_id: int, text: str, source_file: str = None
    ) -> List[Dict[str, Any]]:
        """
        Extract transactions from text and store in database

        Args:
            text: OCR text
            source_file: Source filename

        Returns:
            List of stored transactions
        """
        use_llm_extraction = llm_manager.is_model_loaded()

        if use_llm_extraction:
            extracted_transactions = self.transaction_extractor.parse_with_llm(
                text, llm_manager, source_file
            )
        else:
            extracted_transactions = self.transaction_extractor.extract_transactions(
                text, source_file
            )

        stored_transactions = []

        trans_repo, db = self.db_manager.get_transaction_repository()

        category_repo = CategoryRepository(db)

        for trans_data in extracted_transactions:
            trans_data["user_id"] = user_id
            duplicate = trans_repo.check_duplicate(trans_data)

            if duplicate:
                trans_data["is_duplicate"] = True
                trans_repo.create_transaction(trans_data)
                continue

            if self.use_llm_for_categorization and llm_manager.is_model_loaded():
                category_suggestion = llm_manager.suggest_category(
                    trans_data.get("description", ""), trans_data.get("amount")
                )

                category = category_repo.get_category_by_name(
                    category_suggestion.category
                )

                trans_data["category_id"] = category.id if category else None
                trans_data["llm_suggested_category"] = category_suggestion.category
                trans_data["llm_confidence"] = category_suggestion.confidence

            transaction = trans_repo.create_transaction(trans_data)
            stored_transactions.append(self._serialize_transaction(transaction))

        db.close()

        return stored_transactions

    def add_manual_transaction(
        self, user_id: int, transaction_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Add a transaction manually

        Args:
            transaction_data: Transaction data

        Returns:
            Stored transaction data or None if duplicate
        """
        trans_repo, db = self.db_manager.get_transaction_repository()

        transaction_data["user_id"] = user_id
        if not transaction_data.get("transaction_date"):
            transaction_data["transaction_date"] = datetime.now()

        duplicate = trans_repo.check_duplicate(transaction_data)

        if duplicate:
            db.close()
            return {
                "success": False,
                "error": "Duplicate transaction detected",
                "duplicate_id": duplicate.id,
            }

        if (
            self.use_llm_for_categorization
            and llm_manager.is_model_loaded()
            and not transaction_data.get("category_id")
        ):
            category_suggestion = llm_manager.suggest_category(
                transaction_data.get("description", ""), transaction_data.get("amount")
            )

            category_repo = CategoryRepository(db)
            category = category_repo.get_category_by_name(category_suggestion.category)

            transaction_data["category_id"] = category.id if category else None
            transaction_data["llm_suggested_category"] = category_suggestion.category
            transaction_data["llm_confidence"] = category_suggestion.confidence

        transaction = trans_repo.create_transaction(transaction_data)
        db.close()

        return {
            "success": True,
            **self._serialize_transaction(transaction),
        }

    def get_transactions(self, user_id: int, **filters) -> List[Dict[str, Any]]:
        """
        Get transactions with optional filters

        Args:
            **filters: Optional filters (start_date, end_date, category, etc.)

        Returns:
            List of transactions
        """
        trans_repo, db = self.db_manager.get_transaction_repository()

        if "start_date" in filters and "end_date" in filters:
            transactions = trans_repo.get_transactions_by_date_range(
                filters["start_date"], filters["end_date"], user_id=user_id
            )
        elif "category_id" in filters:
            transactions = trans_repo.get_transactions_by_category(
                filters["category_id"], user_id=user_id
            )
        elif "search" in filters:
            transactions = trans_repo.search_transactions(
                filters["search"], user_id=user_id
            )
        elif filters.get("uncategorized"):
            transactions = trans_repo.get_uncategorized_transactions(user_id=user_id)
        else:
            transactions = trans_repo.get_all_transactions(user_id=user_id)

        result = []
        for trans in transactions:
            result.append(self._serialize_transaction(trans))

        db.close()

        return result

    def update_transaction_category(
        self, transaction_id: int, category_name: str, user_id: int
    ) -> bool:
        """
        Update transaction category

        Args:
            transaction_id: Transaction ID
            category_name: Category name

        Returns:
            True if successful
        """
        category_repo, db = self.db_manager.get_category_repository()
        category = category_repo.get_category_by_name(category_name)
        db.close()

        if not category:
            return False

        trans_repo, db = self.db_manager.get_transaction_repository()
        updated = trans_repo.update_transaction_category(
            transaction_id, category.id, user_id=user_id
        )
        db.close()

        return updated is not None

    def update_transaction(
        self, transaction_id: int, user_id: int, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        trans_repo, db = self.db_manager.get_transaction_repository()

        payload: Dict[str, Any] = {}
        if "description" in updates and updates["description"] is not None:
            payload["description"] = updates["description"]
        if "amount" in updates and updates["amount"] is not None:
            payload["amount"] = updates["amount"]
        if "date" in updates and updates["date"] is not None:
            payload["transaction_date"] = updates["date"]

        if "category" in updates:
            category_name = updates.get("category")
            if category_name in (None, ""):
                payload["category_id"] = None
            else:
                category_repo = CategoryRepository(db)
                category = category_repo.get_category_by_name(category_name)
                if not category:
                    db.close()
                    return None
                payload["category_id"] = category.id

        updated = trans_repo.update_transaction(
            transaction_id, payload, user_id=user_id
        )
        db.close()

        if not updated:
            return None

        return self._serialize_transaction(updated)

    def delete_transaction(self, transaction_id: int, user_id: int) -> bool:
        trans_repo, db = self.db_manager.get_transaction_repository()
        deleted = trans_repo.delete_transaction(transaction_id, user_id=user_id)
        db.close()
        return deleted

    def load_llm_model(self, provider: str, model_path: str, **kwargs) -> bool:
        """
        Load an LLM model

        Args:
            provider: Provider name
            model_path: Path to model
            **kwargs: Additional parameters

        Returns:
            True if successful
        """
        try:
            llm_manager.load_model(provider, model_path, **kwargs)

            llm_model_repo, db = self.db_manager.get_llm_model_repository()
            llm_model_repo.register_model(
                model_name=model_path.split("/")[-1],
                model_path=model_path,
                model_type=provider,
                context_length=kwargs.get("context_length"),
                parameters=kwargs,
            )
            llm_model_repo.set_active_model(model_path.split("/")[-1])
            db.close()

            return True
        except Exception as e:
            print(f"Error loading LLM model: {e}")
            return False

    def get_categories(self) -> List[str]:
        """
        Get all categories

        Returns:
            List of category names
        """
        category_repo, db = self.db_manager.get_category_repository()
        categories = category_repo.get_all_categories()
        db.close()

        return [cat.name for cat in categories]
