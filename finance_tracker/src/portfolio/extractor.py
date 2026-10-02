import re
from datetime import datetime
from typing import List, Dict, Any, Optional


class PortfolioExtractor:
    def __init__(self):
        self.symbol_pattern = re.compile(r"\b[A-Z\.]{1,6}\b")
        self.number_pattern = re.compile(r"-?\d{1,3}(?:,\d{3})*(?:\.\d+)?")

    def extract_holdings(
        self, text: str, source_file: str = None
    ) -> List[Dict[str, Any]]:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        holdings = []

        for line in lines:
            if self._is_header_line(line):
                continue

            holding = self._extract_from_line(line)
            if holding:
                holding["source_file"] = source_file
                holdings.append(holding)

        return holdings

    def _is_header_line(self, line: str) -> bool:
        header_keywords = [
            "symbol",
            "ticker",
            "quantity",
            "shares",
            "price",
            "market value",
            "cost",
        ]
        line_lower = line.lower()
        return any(keyword in line_lower for keyword in header_keywords)

    def _extract_from_line(self, line: str) -> Optional[Dict[str, Any]]:
        symbol = self._extract_symbol(line)
        if not symbol:
            return None

        numbers = self.number_pattern.findall(line)
        if not numbers:
            return None

        values = [self._to_float(n) for n in numbers]
        quantity = values[0] if values else None
        price = values[1] if len(values) > 1 else None
        market_value = values[2] if len(values) > 2 else None

        if quantity is None:
            return None

        return {
            "symbol": symbol,
            "description": line,
            "quantity": quantity,
            "market_value": market_value,
            "cost_basis": None,
            "as_of_date": datetime.utcnow(),
        }

    def _extract_symbol(self, line: str) -> Optional[str]:
        match = self.symbol_pattern.search(line)
        if not match:
            return None
        return match.group(0).upper()

    def _to_float(self, value: str) -> float:
        return float(value.replace(",", ""))
