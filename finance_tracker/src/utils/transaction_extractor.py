import re
from typing import List, Dict, Optional, Any
from datetime import datetime
from decimal import Decimal


class TransactionExtractor:
    """
    Extract transactions from OCR text or other document content
    """

    def __init__(self):
        self.amount_patterns = [
            r"\$?[\d,]+\.?\d*\s*(?:USD|EUR|GBP)?",
            r"\d+\.\d{2}",
            r"(?:Total|Amount|Balance)[:\s]*\$?[\d,]+\.?\d*",
        ]

        self.date_patterns = [
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}",
            r"\d{4}[/-]\d{1,2}[/-]\d{1,2}",
            r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}",
        ]

    def extract_transactions(
        self, text: str, source_file: str = None
    ) -> List[Dict[str, Any]]:
        """
        Extract transactions from text

        Args:
            text: OCR text or document text
            source_file: Source filename

        Returns:
            List of transaction dictionaries
        """
        lines = text.split("\n")
        transactions = []

        for i, line in enumerate(lines):
            line = line.strip()
            if not line or self._is_header_line(line):
                continue

            transaction = self._extract_from_line(line, text)
            if transaction:
                transaction["source_file"] = source_file
                transaction["raw_text"] = line
                transactions.append(transaction)

        return self._post_process_transactions(transactions)

    def _is_header_line(self, line: str) -> bool:
        """Check if line is a header"""
        header_keywords = [
            "date",
            "description",
            "amount",
            "balance",
            "debit",
            "credit",
            "transaction",
        ]
        line_lower = line.lower()
        return any(keyword in line_lower for keyword in header_keywords)

    def _extract_from_line(self, line: str, context: str) -> Optional[Dict[str, Any]]:
        """Extract transaction data from a single line"""
        amount = self._extract_amount(line)
        date = self._extract_date(line)

        if not amount:
            return None

        return {
            "description": self._extract_description(line, amount),
            "amount": abs(amount),
            "transaction_date": date if date else self._default_date(),
            "is_expense": amount < 0 or self._is_expense_line(line),
        }

    def _extract_amount(self, line: str) -> Optional[float]:
        """Extract amount from line"""
        for pattern in self.amount_patterns:
            matches = re.findall(pattern, line)
            for match in matches:
                try:
                    amount_str = re.sub(r"[^\d.\-]", "", match)
                    amount = float(amount_str)
                    if amount != 0:
                        return amount
                except ValueError:
                    continue
        return None

    def _extract_date(self, line: str) -> Optional[datetime]:
        """Extract date from line"""
        for pattern in self.date_patterns:
            match = re.search(pattern, line)
            if match:
                date_str = match.group()
                try:
                    return self._parse_date(date_str)
                except ValueError:
                    continue
        return None

    def _parse_date(self, date_str: str) -> datetime:
        """Parse date string to datetime"""
        formats = [
            "%m/%d/%Y",
            "%m/%d/%y",
            "%Y-%m-%d",
            "%m-%d-%Y",
            "%m-%d-%y",
            "%B %d, %Y",
            "%b %d, %Y",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue

        raise ValueError(f"Could not parse date: {date_str}")

    def _extract_description(self, line: str, amount: float) -> str:
        """Extract description from line"""
        desc = re.sub(r"\$?[\d,]+\.?\d*", "", line)
        desc = re.sub(r"\s{2,}", " ", desc)
        desc = desc.strip()

        return desc if desc else "Transaction"

    def _is_expense_line(self, line: str) -> bool:
        """Determine if line represents an expense"""
        expense_keywords = ["debit", "withdrawal", "purchase", "payment", "expense"]
        line_lower = line.lower()
        return any(keyword in line_lower for keyword in expense_keywords)

    def _default_date(self) -> datetime:
        """Return default date (today)"""
        return datetime.now()

    def _post_process_transactions(
        self, transactions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Post-process extracted transactions"""
        for transaction in transactions:
            if (
                "transaction_date" not in transaction
                or not transaction["transaction_date"]
            ):
                transaction["transaction_date"] = self._default_date()

        return transactions

    def parse_with_llm(
        self, text: str, llm_manager, source_file: str = None
    ) -> List[Dict[str, Any]]:
        """
        Use LLM to parse transactions from text

        Args:
            text: OCR text
            llm_manager: LLMManager instance
            source_file: Source filename

        Returns:
            List of transaction dictionaries
        """
        prompt = f"""Extract financial transactions from the following text.

Text:
{text}

Task: Identify all transactions and provide them in the following format:
- Date: [YYYY-MM-DD]
- Description: [transaction description]
- Amount: [amount in dollars, e.g., 15.99]
- Type: [income/expense]

Only list actual transactions, ignore headers, totals, and summaries."""

        try:
            response = llm_manager.generate(prompt, max_tokens=1024, temperature=0.2)
            return self._parse_llm_response(response, source_file)
        except Exception as e:
            print(f"LLM parsing failed: {e}, falling back to regex extraction")
            return self.extract_transactions(text, source_file)

    def _parse_llm_response(
        self, response: str, source_file: str
    ) -> List[Dict[str, Any]]:
        """Parse LLM response into transactions"""
        transactions = []
        lines = response.split("\n")

        current_transaction = {}
        for line in lines:
            line = line.strip()
            if not line:
                if current_transaction:
                    transactions.append(current_transaction)
                    current_transaction = {}
                continue

            if line.startswith("- Date:"):
                current_transaction["transaction_date"] = self._parse_date(
                    line[8:].strip()
                )
            elif line.startswith("- Description:"):
                current_transaction["description"] = line[15:].strip()
            elif line.startswith("- Amount:"):
                try:
                    current_transaction["amount"] = float(line[10:].strip())
                except ValueError:
                    pass
            elif line.startswith("- Type:"):
                current_transaction["is_expense"] = (
                    line[8:].strip().lower() == "expense"
                )

        if current_transaction:
            transactions.append(current_transaction)

        for transaction in transactions:
            transaction["source_file"] = source_file
            if (
                "transaction_date" not in transaction
                or not transaction["transaction_date"]
            ):
                transaction["transaction_date"] = self._default_date()

        return transactions
