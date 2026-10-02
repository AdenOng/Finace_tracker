"""
Configuration for Finance Tracker
"""

import json
import os
from pathlib import Path

try:
    import yaml
except Exception:  # pragma: no cover
    yaml = None

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover
    load_dotenv = None


def _load_config_file() -> dict:
    config_path = os.getenv("CONFIG_PATH", "")
    if not config_path:
        return {}

    path = Path(config_path)
    if not path.exists() or not path.is_file():
        return {}

    try:
        if path.suffix.lower() in {".json"}:
            return json.loads(path.read_text())
        if path.suffix.lower() in {".yml", ".yaml"} and yaml:
            return yaml.safe_load(path.read_text()) or {}
    except Exception:
        return {}

    return {}


if load_dotenv:
    load_dotenv()

_CONFIG = _load_config_file()


def _env_or_config(key: str, default: str) -> str:
    return os.getenv(key, _CONFIG.get(key, default))


# Paths
BASE_DIR = Path(__file__).parent.parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

# Database
DB_NAME = _env_or_config("DB_NAME", "finance_db")
DB_USER = _env_or_config("DB_USER", "coding_agent")
DB_PASSWORD = _env_or_config("DB_PASSWORD", "")
DB_HOST = _env_or_config("DB_HOST", "localhost")
DB_PORT = int(_env_or_config("DB_PORT", "5432"))

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# OCR
OCR_MODEL_PATH = _env_or_config("OCR_MODEL_PATH", str(MODELS_DIR / "ocr"))
USE_GPU = _env_or_config("USE_GPU", "true").lower() == "true"

# LLM
LLM_MODEL_PATH = _env_or_config("LLM_MODEL_PATH", str(MODELS_DIR / "llm"))
LLM_MODEL_NAME = _env_or_config("LLM_MODEL_NAME", "Qwen/Qwen2.5-3B-Instruct")
LLM_CONTEXT_LENGTH = int(_env_or_config("LLM_CONTEXT_LENGTH", "4096"))
LLM_MAX_TOKENS = int(_env_or_config("LLM_MAX_TOKENS", "512"))
N_GPU_LAYERS = int(_env_or_config("N_GPU_LAYERS", "35"))

# Categories
DEFAULT_CATEGORIES = [
    "food",
    "transport",
    "shopping",
    "entertainment",
    "utilities",
    "healthcare",
    "education",
    "income",
    "transfer",
    "other",
]

# Prices
PRICE_PROVIDER = _env_or_config("PRICE_PROVIDER", "stooq")
PRICE_CACHE_TTL_SECONDS = int(_env_or_config("PRICE_CACHE_TTL_SECONDS", "900"))
PRICE_BASE_URL = _env_or_config(
    "PRICE_BASE_URL", "https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcv&h&e=csv"
)

# Deduplication
DEDUPLICATION_TOLERANCE_DAYS = int(_env_or_config("DEDUPLICATION_TOLERANCE_DAYS", "1"))
DEDUPLICATION_AMOUNT_TOLERANCE = float(
    _env_or_config("DEDUPLICATION_AMOUNT_TOLERANCE", "0.01")
)
