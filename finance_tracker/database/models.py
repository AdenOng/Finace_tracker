from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
    Index,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from finance_tracker.config.config import DATABASE_URL

Base = declarative_base()
_engine = None
_session_local = None


def get_engine():
    global _engine
    if _engine is None:
        try:
            _engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        except ModuleNotFoundError as exc:
            message = (
                "Database driver is not installed for the configured DATABASE_URL. "
                "Install psycopg2-binary for PostgreSQL or set DATABASE_URL to a "
                "supported SQLAlchemy database URL."
            )
            raise RuntimeError(message) from exc
    return _engine


def get_session_local():
    global _session_local
    if _session_local is None:
        _session_local = sessionmaker(
            autocommit=False, autoflush=False, bind=get_engine()
        )
    return _session_local


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="category")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    password_salt = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)

    transactions = relationship("Transaction", back_populates="user")
    documents = relationship("Document", back_populates="user")
    broker_accounts = relationship("BrokerAccount", back_populates="user")
    accounts = relationship("Account", back_populates="user")


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_date = Column(DateTime, nullable=False, index=True)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    source_file = Column(String(255), nullable=True)
    source_type = Column(String(50), nullable=True)
    is_duplicate = Column(Boolean, default=False, index=True)
    confidence_score = Column(Float, nullable=True)
    llm_suggested_category = Column(String(50), nullable=True)
    llm_confidence = Column(Float, nullable=True)
    raw_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="transactions")
    user = relationship("User", back_populates="transactions")

    __table_args__ = (
        Index("idx_transaction_date_amount", "transaction_date", "amount"),
        Index("idx_description_fulltext", "description"),
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=False)
    processed = Column(Boolean, default=False, index=True)
    processing_status = Column(String(50), default="pending")
    transaction_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="documents")


class BrokerAccount(Base):
    __tablename__ = "broker_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_name = Column(String(255), nullable=False, index=True)
    account_number = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="broker_accounts")
    portfolio_documents = relationship(
        "PortfolioDocument", back_populates="broker_account"
    )
    holdings = relationship("Holding", back_populates="broker_account")


class PortfolioDocument(Base):
    __tablename__ = "portfolio_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_account_id = Column(
        Integer, ForeignKey("broker_accounts.id"), nullable=True, index=True
    )
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=False)
    processed = Column(Boolean, default=False, index=True)
    processing_status = Column(String(50), default="pending")
    holding_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    broker_account = relationship("BrokerAccount", back_populates="portfolio_documents")


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_account_id = Column(
        Integer, ForeignKey("broker_accounts.id"), nullable=True, index=True
    )
    symbol = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=True)
    quantity = Column(Float, nullable=False)
    cost_basis = Column(Float, nullable=True)
    market_value = Column(Float, nullable=True)
    currency = Column(String(10), default="USD")
    as_of_date = Column(DateTime, nullable=False, index=True)
    source_file = Column(String(255), nullable=True)
    is_duplicate = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    broker_account = relationship("BrokerAccount", back_populates="holdings")

    __table_args__ = (
        Index("idx_holdings_symbol_date", "symbol", "as_of_date"),
        Index("idx_holdings_broker_symbol", "broker_account_id", "symbol"),
    )


class PriceQuote(Base):
    __tablename__ = "price_quotes"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    price = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    source = Column(String(50), nullable=False)
    as_of = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("idx_price_quotes_symbol_asof", "symbol", "as_of"),)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    account_type = Column(String(50), nullable=False, index=True)
    balance = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="accounts")


class LLMModel(Base):
    __tablename__ = "llm_models"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(255), unique=True, nullable=False, index=True)
    model_path = Column(String(500), nullable=True)
    model_type = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    context_length = Column(Integer, nullable=True)
    parameters = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, nullable=True)


def create_tables():
    Base.metadata.create_all(bind=get_engine())


def get_db():
    db = get_session_local()()
    try:
        yield db
    finally:
        db.close()
