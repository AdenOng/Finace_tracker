from finance_tracker.database.models import create_tables, get_db, get_engine
from finance_tracker.database.repository import (
    TransactionRepository,
    CategoryRepository,
    DocumentRepository,
    LLMModelRepository,
    UserRepository,
    SessionRepository,
    BrokerAccountRepository,
    PortfolioDocumentRepository,
    HoldingRepository,
    PriceQuoteRepository,
    AccountRepository,
)
from finance_tracker.config.config import DEFAULT_CATEGORIES


class DatabaseManager:
    def __init__(self):
        self._engine = None

    @property
    def engine(self):
        if self._engine is None:
            self._engine = get_engine()
        return self._engine

    def initialize_database(self):
        create_tables()

    def initialize_categories(self):
        db = next(get_db())
        try:
            category_repo = CategoryRepository(db)
            category_repo.initialize_default_categories(DEFAULT_CATEGORIES)
        finally:
            db.close()

    def get_transaction_repository(self):
        db = next(get_db())
        return TransactionRepository(db), db

    def get_category_repository(self):
        db = next(get_db())
        return CategoryRepository(db), db

    def get_document_repository(self):
        db = next(get_db())
        return DocumentRepository(db), db

    def get_llm_model_repository(self):
        db = next(get_db())
        return LLMModelRepository(db), db

    def get_user_repository(self):
        db = next(get_db())
        return UserRepository(db), db

    def get_session_repository(self):
        db = next(get_db())
        return SessionRepository(db), db

    def get_broker_account_repository(self):
        db = next(get_db())
        return BrokerAccountRepository(db), db

    def get_portfolio_document_repository(self):
        db = next(get_db())
        return PortfolioDocumentRepository(db), db

    def get_holding_repository(self):
        db = next(get_db())
        return HoldingRepository(db), db

    def get_price_quote_repository(self):
        db = next(get_db())
        return PriceQuoteRepository(db), db

    def get_account_repository(self):
        db = next(get_db())
        return AccountRepository(db), db


db_manager = DatabaseManager()
