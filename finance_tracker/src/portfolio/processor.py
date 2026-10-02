from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from finance_tracker.database.manager import DatabaseManager
from finance_tracker.src.ocr.pdf_processor import DocumentProcessor
from finance_tracker.src.portfolio.extractor import PortfolioExtractor
from finance_tracker.src.portfolio.price_service import PriceService


class PortfolioProcessor:
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.document_processor = DocumentProcessor()
        self.extractor = PortfolioExtractor()
        self.price_service = PriceService()

    def process_portfolio_file(
        self,
        user_id: int,
        file_path: str,
        broker_name: str,
        broker_account_id: int = None,
    ) -> Dict[str, Any]:
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

            broker_repo, db = self.db_manager.get_broker_account_repository()
            if not broker_account_id:
                broker = broker_repo.get_by_user_and_broker(user_id, broker_name)
                if not broker:
                    broker = broker_repo.create_broker_account(user_id, broker_name)
                broker_account_id = broker.id
            db.close()

            portfolio_doc_repo, db = self.db_manager.get_portfolio_document_repository()
            portfolio_doc = portfolio_doc_repo.create_document(
                {
                    "user_id": user_id,
                    "broker_account_id": broker_account_id,
                    "filename": filename,
                    "file_path": str(file_path),
                    "file_type": file_ext,
                    "file_size": file_size,
                }
            )
            db.close()

            holdings = self.extractor.extract_holdings(text, filename)
            stored = self._store_holdings(user_id, holdings, broker_account_id)

            portfolio_doc_repo, db = self.db_manager.get_portfolio_document_repository()
            portfolio_doc_repo.update_document_status(
                portfolio_doc.id, status="completed", holding_count=len(stored)
            )
            db.close()

            return {
                "success": True,
                "document_id": portfolio_doc.id,
                "holdings_count": len(stored),
                "holdings": stored,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _store_holdings(
        self,
        user_id: int,
        holdings: List[Dict[str, Any]],
        broker_account_id: int = None,
    ) -> List[Dict[str, Any]]:
        holding_repo, db = self.db_manager.get_holding_repository()
        stored = []

        for holding in holdings:
            holding_data = {
                "user_id": user_id,
                "broker_account_id": broker_account_id,
                "symbol": holding.get("symbol"),
                "description": holding.get("description"),
                "quantity": holding.get("quantity"),
                "cost_basis": holding.get("cost_basis"),
                "market_value": holding.get("market_value"),
                "currency": holding.get("currency", "USD"),
                "as_of_date": holding.get("as_of_date", datetime.utcnow()),
                "source_file": holding.get("source_file"),
            }

            duplicate = holding_repo.check_duplicate(holding_data)
            if duplicate:
                holding_data["is_duplicate"] = True
                holding_repo.create_holding(holding_data)
                continue

            created = holding_repo.create_holding(holding_data)
            stored.append(
                {
                    "id": created.id,
                    "symbol": created.symbol,
                    "quantity": created.quantity,
                    "market_value": created.market_value,
                    "as_of_date": created.as_of_date,
                }
            )

        db.close()
        return stored

    def get_portfolio_value(self, user_id: int) -> Dict[str, Any]:
        holding_repo, db = self.db_manager.get_holding_repository()
        try:
            holdings = holding_repo.list_by_user(user_id)
        finally:
            db.close()

        latest_per_broker = {}
        for holding in holdings:
            if holding.is_duplicate:
                continue
            key = (holding.broker_account_id, holding.symbol)
            if (
                key not in latest_per_broker
                or holding.as_of_date > latest_per_broker[key].as_of_date
            ):
                latest_per_broker[key] = holding

        aggregated = {}
        for holding in latest_per_broker.values():
            symbol = holding.symbol
            if symbol not in aggregated:
                aggregated[symbol] = {"quantity": 0.0, "value": 0.0}
            aggregated[symbol]["quantity"] += holding.quantity

        total_value = 0.0
        by_symbol = []
        for symbol, data in aggregated.items():
            price = self.price_service.get_price(symbol)
            if price is not None:
                value = data["quantity"] * price
            else:
                value = data["value"]
            total_value += value
            by_symbol.append(
                {"symbol": symbol, "quantity": data["quantity"], "value": value}
            )

        return {"total_value": total_value, "by_symbol": by_symbol}

    def get_net_worth(self, user_id: int) -> Dict[str, Any]:
        account_repo, db = self.db_manager.get_account_repository()
        try:
            accounts = account_repo.list_by_user(user_id)
        finally:
            db.close()

        assets = 0.0
        liabilities = 0.0
        for account in accounts:
            if account.account_type.lower() in {"liability", "debt"}:
                liabilities += account.balance
            else:
                assets += account.balance

        portfolio = self.get_portfolio_value(user_id)
        assets += portfolio["total_value"]

        net_worth = assets - liabilities
        return {
            "assets": assets,
            "liabilities": liabilities,
            "net_worth": net_worth,
            "portfolio_value": portfolio["total_value"],
        }

    def add_account(
        self, user_id: int, name: str, account_type: str, balance: float
    ) -> Dict[str, Any]:
        account_repo, db = self.db_manager.get_account_repository()
        try:
            account = account_repo.create_account(
                {
                    "user_id": user_id,
                    "name": name,
                    "account_type": account_type,
                    "balance": balance,
                }
            )
            return {"success": True, "account_id": account.id}
        finally:
            db.close()

    def update_account_balance(
        self, account_id: int, balance: float, user_id: int
    ) -> bool:
        account_repo, db = self.db_manager.get_account_repository()
        try:
            updated = account_repo.update_balance(account_id, balance, user_id=user_id)
            return updated is not None
        finally:
            db.close()

    def list_accounts(self, user_id: int) -> List[Dict[str, Any]]:
        account_repo, db = self.db_manager.get_account_repository()
        try:
            accounts = account_repo.list_by_user(user_id)
        finally:
            db.close()

        return [
            {
                "id": account.id,
                "name": account.name,
                "type": account.account_type,
                "balance": account.balance,
            }
            for account in accounts
        ]
