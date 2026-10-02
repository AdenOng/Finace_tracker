# Agent Guidelines for Finance Tracker

This file is for coding agents working in this repository. It summarizes how to build/run,
where tests live, and the expected coding style.

## Repository Overview
- Primary language: Python 3.9+
- Package manager: `uv` (preferred) or `pip`
- Entry point: CLI via `finance-tracker` console script
- Database: PostgreSQL (`finance_db` with user `coding_agent`)
- OCR: PaddleOCR + PyMuPDF
- LLM: llama-cpp-python with GGUF models
- Auth: local user accounts with session tokens
- Portfolio: broker documents + holdings consolidation

## Build / Install Commands

### Install Dependencies
```bash
uv sync
```

Alternative (pip):
```bash
pip install -r requirements.txt
```

### Database Initialization
```bash
python -c "from finance_tracker.database.manager import db_manager; db_manager.initialize_database(); db_manager.initialize_categories()"
```

### Run the CLI
```bash
uv run finance-tracker
```

### Setup Helper Script
```bash
python setup.py
```

## Lint / Format / Test

There is no configured linter or formatter in this repo.

### Syntax Check (useful in CI or quick validation)
```bash
python -m py_compile finance_tracker/src/cli/interface.py
```

### Running Tests
No test framework is configured yet.

If tests are added later, prefer `pytest` and use:
```bash
pytest
```

### Running a Single Test (if pytest is added)
```bash
pytest tests/test_file.py::test_name
```

## Configuration

The system reads configuration in this order:
1. Environment variables
2. Config file (JSON or YAML) via `CONFIG_PATH`
3. Defaults in `finance_tracker/config/config.py`

Example:
```bash
export CONFIG_PATH=/path/to/config.yaml
```

## Code Style Guidelines

### General
- Use 4-space indentation.
- Keep lines reasonably short (around 88-100 chars); wrap long calls.
- Prefer ASCII-only content unless a file already contains Unicode.

### Imports
- Order imports as: standard library, third-party, local.
- Avoid wildcard imports.
- Group imports by blank lines between sections.

Example:
```python
import os
from pathlib import Path

import fitz
from sqlalchemy.orm import Session

from finance_tracker.database.models import Transaction
```

### Naming
- Modules: `snake_case.py`
- Classes: `PascalCase`
- Functions and variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`

### Typing
- Use type hints for public methods and non-trivial functions.
- Use `Optional[T]` where `None` is valid.
- Keep return types explicit for key methods (repositories, processors, CLI actions).

### Error Handling
- Prefer returning structured results for pipeline steps:
  `{"success": bool, "error": str, ...}`
- Avoid swallowing exceptions silently. If catching broad exceptions, log or return error info.
- Ensure DB sessions are closed in `finally` blocks or via manager helpers.

### Database Access
- Use the repository layer in `finance_tracker/database/repository.py`.
- Acquire sessions via `DatabaseManager` and always close them.
- Do not issue raw SQL unless necessary.

### OCR / Document Handling
- PDFs: try text extraction first; fall back to OCR for scanned PDFs.
- Always clean up temporary images created from PDFs.
- For OCR results, return both `text` and per-line data if available.

### LLM Integration
- Keep models swappable via `LLMManager` and provider classes.
- Only call `suggest_category` when a model is loaded.
- Do not override a user-selected category with LLM output.

### CLI Behavior
- Keep CLI input prompts simple and short.
- Use clear success/error messages.
- Avoid crashing on bad input; validate and re-prompt when possible.

## Files and Key Locations
- Config: `finance_tracker/config/config.py`
- DB models: `finance_tracker/database/models.py`
- Repositories: `finance_tracker/database/repository.py`
- CLI: `finance_tracker/src/cli/interface.py`
- OCR: `finance_tracker/src/ocr/processor.py`, `finance_tracker/src/ocr/pdf_processor.py`
- LLM: `finance_tracker/src/llm/manager.py`
- Auth: `finance_tracker/src/auth/manager.py`
- Portfolio: `finance_tracker/src/portfolio/processor.py`, `finance_tracker/src/portfolio/price_service.py`

## No Cursor/Copilot Rules Found
No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` files exist
in this repository at the time of writing.

## Notes for Agents
- Prefer `uv` for dependency management and running commands.
- Keep changes minimal and consistent with existing patterns.
- Update `README.md` when adding new user-facing commands or configuration options.
