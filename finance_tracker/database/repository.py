from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from finance_tracker.database.models import (
    Transaction,
    Category,
    Document,
    LLMModel,
    User,
    SessionToken,
    BrokerAccount,
    PortfolioDocument,
    Holding,
    PriceQuote,
    Account,
)
from finance_tracker.config.config import (
    DEDUPLICATION_TOLERANCE_DAYS,
    DEDUPLICATION_AMOUNT_TOLERANCE,
)


class TransactionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_transaction(self, transaction_data: Dict) -> Transaction:
        transaction = Transaction(**transaction_data)
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)
        return transaction

    def check_duplicate(self, transaction_data: Dict) -> Optional[Transaction]:
        amount = transaction_data.get("amount")
        transaction_date = transaction_data.get("transaction_date")
        description = transaction_data.get("description", "").lower()
        user_id = transaction_data.get("user_id")

        if not amount or not transaction_date:
            return None

        tolerance_days = DEDUPLICATION_TOLERANCE_DAYS
        tolerance_amount = DEDUPLICATION_AMOUNT_TOLERANCE

        date_lower = transaction_date - timedelta(days=tolerance_days)
        date_upper = transaction_date + timedelta(days=tolerance_days)
        amount_lower = amount - tolerance_amount
        amount_upper = amount + tolerance_amount

        query = self.db.query(Transaction).filter(
            and_(
                Transaction.transaction_date >= date_lower,
                Transaction.transaction_date <= date_upper,
                Transaction.amount >= amount_lower,
                Transaction.amount <= amount_upper,
                Transaction.is_duplicate == False,
            )
        )
        if user_id:
            query = query.filter(Transaction.user_id == user_id)

        duplicate = query.first()

        if duplicate:
            similarity = self._calculate_similarity(
                description, duplicate.description.lower()
            )
            if similarity > 0.7:
                return duplicate

        return None

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        words1 = set(text1.split())
        words2 = set(text2.split())

        if not words1 or not words2:
            return 0.0

        intersection = len(words1 & words2)
        union = len(words1 | words2)

        return intersection / union if union > 0 else 0.0

    def get_transaction_by_id(
        self, transaction_id: int, user_id: Optional[int] = None
    ) -> Optional[Transaction]:
        query = self.db.query(Transaction).filter(Transaction.id == transaction_id)
        if user_id is not None:
            query = query.filter(Transaction.user_id == user_id)
        return query.first()

    def get_transactions_by_date_range(
        self, start_date: datetime, end_date: datetime, user_id: int = None
    ) -> List[Transaction]:
        query = self.db.query(Transaction).filter(
            and_(
                Transaction.transaction_date >= start_date,
                Transaction.transaction_date <= end_date,
            )
        )
        if user_id:
            query = query.filter(Transaction.user_id == user_id)
        return query.order_by(Transaction.transaction_date.desc()).all()

    def get_transactions_by_category(
        self, category_id: int, user_id: int = None
    ) -> List[Transaction]:
        query = self.db.query(Transaction).filter(
            Transaction.category_id == category_id
        )
        if user_id:
            query = query.filter(Transaction.user_id == user_id)
        return query.all()

    def update_transaction_category(
        self, transaction_id: int, category_id: int, user_id: Optional[int] = None
    ) -> Optional[Transaction]:
        transaction = self.get_transaction_by_id(transaction_id, user_id=user_id)
        if transaction:
            transaction.category_id = category_id
            self.db.commit()
            self.db.refresh(transaction)
        return transaction

    def update_transaction(
        self, transaction_id: int, updates: Dict, user_id: Optional[int] = None
    ) -> Optional[Transaction]:
        transaction = self.get_transaction_by_id(transaction_id, user_id=user_id)
        if not transaction:
            return None

        for field, value in updates.items():
            if hasattr(transaction, field):
                setattr(transaction, field, value)

        self.db.commit()
        self.db.refresh(transaction)
        return transaction

    def delete_transaction(
        self, transaction_id: int, user_id: Optional[int] = None
    ) -> bool:
        transaction = self.get_transaction_by_id(transaction_id, user_id=user_id)
        if not transaction:
            return False

        self.db.delete(transaction)
        self.db.commit()
        return True

    def search_transactions(self, query: str, user_id: int = None) -> List[Transaction]:
        db_query = self.db.query(Transaction).filter(
            Transaction.description.ilike(f"%{query}%")
        )
        if user_id:
            db_query = db_query.filter(Transaction.user_id == user_id)
        return db_query.order_by(Transaction.transaction_date.desc()).all()

    def get_uncategorized_transactions(self, user_id: int = None) -> List[Transaction]:
        query = self.db.query(Transaction).filter(Transaction.category_id.is_(None))
        if user_id:
            query = query.filter(Transaction.user_id == user_id)
        return query.order_by(Transaction.transaction_date.desc()).all()

    def get_all_transactions(self, user_id: int = None) -> List[Transaction]:
        query = self.db.query(Transaction)
        if user_id:
            query = query.filter(Transaction.user_id == user_id)
        return query.order_by(Transaction.transaction_date.desc()).all()

    def mark_as_duplicate(self, transaction_id: int, original_id: int) -> bool:
        transaction = self.get_transaction_by_id(transaction_id)
        if transaction:
            transaction.is_duplicate = True
            self.db.commit()
            return True
        return False


class CategoryRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_category(self, name: str, description: str = None) -> Category:
        category = Category(name=name, description=description)
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category

    def get_category_by_name(self, name: str) -> Optional[Category]:
        return self.db.query(Category).filter(Category.name == name).first()

    def get_all_categories(self) -> List[Category]:
        return self.db.query(Category).all()

    def initialize_default_categories(self, categories: List[str]) -> List[Category]:
        initialized_categories = []
        for category_name in categories:
            category = self.get_category_by_name(category_name)
            if not category:
                category = self.create_category(category_name)
            initialized_categories.append(category)
        return initialized_categories


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_document(
        self,
        filename: str,
        file_path: str,
        file_type: str,
        file_size: int,
        user_id: int = None,
    ) -> Document:
        document = Document(
            filename=filename,
            file_path=file_path,
            file_type=file_type,
            file_size=file_size,
            user_id=user_id,
        )
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def update_document_status(
        self,
        document_id: int,
        status: str,
        transaction_count: int = None,
        error_message: str = None,
    ) -> Document:
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.processing_status = status
            document.processed = status == "completed"
            if transaction_count is not None:
                document.transaction_count = transaction_count
            if error_message:
                document.error_message = error_message
            document.processed_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(document)
        return document

    def get_document_by_id(self, document_id: int) -> Optional[Document]:
        return self.db.query(Document).filter(Document.id == document_id).first()


class LLMModelRepository:
    def __init__(self, db: Session):
        self.db = db

    def register_model(
        self,
        model_name: str,
        model_path: str,
        model_type: str,
        context_length: int = None,
        parameters: Dict = None,
    ) -> LLMModel:
        import json

        llm_model = LLMModel(
            model_name=model_name,
            model_path=model_path,
            model_type=model_type,
            context_length=context_length,
            parameters=json.dumps(parameters) if parameters else None,
        )
        self.db.add(llm_model)
        self.db.commit()
        self.db.refresh(llm_model)
        return llm_model

    def get_active_model(self) -> Optional[LLMModel]:
        return self.db.query(LLMModel).filter(LLMModel.is_active == True).first()

    def get_model_by_name(self, model_name: str) -> Optional[LLMModel]:
        return self.db.query(LLMModel).filter(LLMModel.model_name == model_name).first()

    def set_active_model(self, model_name: str) -> Optional[LLMModel]:
        self.db.query(LLMModel).update({LLMModel.is_active: False})
        model = self.get_model_by_name(model_name)
        if model:
            model.is_active = True
            model.last_used = datetime.utcnow()
            self.db.commit()
            self.db.refresh(model)
        return model

    def list_models(self) -> List[LLMModel]:
        return self.db.query(LLMModel).order_by(LLMModel.last_used.desc()).all()

    def update_last_used(self, model_name: str):
        model = self.get_model_by_name(model_name)
        if model:
            model.last_used = datetime.utcnow()
            self.db.commit()


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_user(self, user_data: Dict) -> User:
        user = User(**user_data)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_by_username(self, username: str) -> Optional[User]:
        return self.db.query(User).filter(User.username == username).first()

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def update_last_login(self, user_id: int):
        user = self.db.query(User).filter(User.id == user_id).first()
        if user:
            user.last_login_at = datetime.utcnow()
            self.db.commit()


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_session(
        self, user_id: int, token: str, expires_at: datetime = None
    ) -> SessionToken:
        session = SessionToken(user_id=user_id, token=token, expires_at=expires_at)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_session(self, token: str) -> Optional[SessionToken]:
        return self.db.query(SessionToken).filter(SessionToken.token == token).first()

    def revoke_session(self, token: str) -> bool:
        session = self.get_session(token)
        if session and not session.revoked_at:
            session.revoked_at = datetime.utcnow()
            self.db.commit()
            return True
        return False


class BrokerAccountRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_broker_account(
        self,
        user_id: int,
        broker_name: str,
        account_number: str = None,
        display_name: str = None,
    ) -> BrokerAccount:
        account = BrokerAccount(
            user_id=user_id,
            broker_name=broker_name,
            account_number=account_number,
            display_name=display_name,
        )
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def get_by_id(self, broker_account_id: int) -> Optional[BrokerAccount]:
        return (
            self.db.query(BrokerAccount)
            .filter(BrokerAccount.id == broker_account_id)
            .first()
        )

    def list_by_user(self, user_id: int) -> List[BrokerAccount]:
        return (
            self.db.query(BrokerAccount).filter(BrokerAccount.user_id == user_id).all()
        )

    def get_by_user_and_broker(
        self, user_id: int, broker_name: str
    ) -> Optional[BrokerAccount]:
        return (
            self.db.query(BrokerAccount)
            .filter(
                BrokerAccount.user_id == user_id,
                BrokerAccount.broker_name == broker_name,
            )
            .first()
        )


class PortfolioDocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_document(self, doc_data: Dict) -> PortfolioDocument:
        document = PortfolioDocument(**doc_data)
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def update_document_status(
        self,
        document_id: int,
        status: str,
        holding_count: int = None,
        error_message: str = None,
    ) -> Optional[PortfolioDocument]:
        document = (
            self.db.query(PortfolioDocument)
            .filter(PortfolioDocument.id == document_id)
            .first()
        )
        if document:
            document.processing_status = status
            document.processed = status == "completed"
            if holding_count is not None:
                document.holding_count = holding_count
            if error_message:
                document.error_message = error_message
            document.processed_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(document)
        return document


class HoldingRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_holding(self, holding_data: Dict) -> Holding:
        holding = Holding(**holding_data)
        self.db.add(holding)
        self.db.commit()
        self.db.refresh(holding)
        return holding

    def check_duplicate(self, holding_data: Dict) -> Optional[Holding]:
        symbol = holding_data.get("symbol")
        user_id = holding_data.get("user_id")
        broker_account_id = holding_data.get("broker_account_id")
        as_of_date = holding_data.get("as_of_date")
        quantity = holding_data.get("quantity")

        if not symbol or not user_id or not as_of_date or quantity is None:
            return None

        query = self.db.query(Holding).filter(
            Holding.user_id == user_id,
            Holding.symbol == symbol,
            Holding.as_of_date == as_of_date,
            Holding.is_duplicate == False,
        )
        if broker_account_id:
            query = query.filter(Holding.broker_account_id == broker_account_id)

        candidate = query.first()
        if candidate and abs(candidate.quantity - float(quantity)) < 1e-6:
            return candidate
        return None

    def list_by_user(self, user_id: int) -> List[Holding]:
        return self.db.query(Holding).filter(Holding.user_id == user_id).all()

    def list_latest_by_user(self, user_id: int) -> List[Holding]:
        subquery = (
            self.db.query(
                Holding.symbol,
                func.max(Holding.as_of_date).label("max_date"),
            )
            .filter(Holding.user_id == user_id, Holding.is_duplicate == False)
            .group_by(Holding.symbol)
            .subquery()
        )
        return (
            self.db.query(Holding)
            .join(
                subquery,
                and_(
                    Holding.symbol == subquery.c.symbol,
                    Holding.as_of_date == subquery.c.max_date,
                ),
            )
            .filter(Holding.user_id == user_id)
            .all()
        )


class PriceQuoteRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_price(self, price_data: Dict) -> PriceQuote:
        price = PriceQuote(**price_data)
        self.db.add(price)
        self.db.commit()
        self.db.refresh(price)
        return price

    def get_latest_price(self, symbol: str) -> Optional[PriceQuote]:
        return (
            self.db.query(PriceQuote)
            .filter(PriceQuote.symbol == symbol)
            .order_by(PriceQuote.as_of.desc())
            .first()
        )


class AccountRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_account(self, account_data: Dict) -> Account:
        account = Account(**account_data)
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def list_by_user(self, user_id: int) -> List[Account]:
        return self.db.query(Account).filter(Account.user_id == user_id).all()

    def update_balance(
        self, account_id: int, balance: float, user_id: Optional[int] = None
    ) -> Optional[Account]:
        query = self.db.query(Account).filter(Account.id == account_id)
        if user_id is not None:
            query = query.filter(Account.user_id == user_id)

        account = query.first()
        if account:
            account.balance = balance
            self.db.commit()
            self.db.refresh(account)
        return account
