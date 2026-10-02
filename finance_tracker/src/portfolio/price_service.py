import csv
import io
from datetime import datetime, timedelta
from typing import Optional
from urllib.request import urlopen

from finance_tracker.config.config import (
    PRICE_PROVIDER,
    PRICE_CACHE_TTL_SECONDS,
    PRICE_BASE_URL,
)
from finance_tracker.database.manager import DatabaseManager


class PriceService:
    def __init__(self):
        self.db_manager = DatabaseManager()

    def get_price(self, symbol: str) -> Optional[float]:
        symbol = symbol.lower()
        price_repo, db = self.db_manager.get_price_quote_repository()
        try:
            latest = price_repo.get_latest_price(symbol)
            if latest and self._is_fresh(latest.as_of):
                return latest.price
        finally:
            db.close()

        if PRICE_PROVIDER == "stooq":
            return self._fetch_stooq(symbol)

        return None

    def _is_fresh(self, as_of: datetime) -> bool:
        return as_of >= datetime.utcnow() - timedelta(seconds=PRICE_CACHE_TTL_SECONDS)

    def _fetch_stooq(self, symbol: str) -> Optional[float]:
        url = PRICE_BASE_URL.format(symbol=symbol)
        try:
            with urlopen(url, timeout=10) as response:
                content = response.read().decode("utf-8")

            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
            if not rows:
                return None

            row = rows[0]
            close_value = row.get("Close")
            if not close_value or close_value == "N/A":
                return None

            price = float(close_value)
            price_repo, db = self.db_manager.get_price_quote_repository()
            try:
                price_repo.create_price(
                    {
                        "symbol": symbol,
                        "price": price,
                        "currency": "USD",
                        "source": "stooq",
                        "as_of": datetime.utcnow(),
                    }
                )
            finally:
                db.close()

            return price
        except Exception:
            return None
