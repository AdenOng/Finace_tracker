# Finance Tracker

A comprehensive finance tracking application with OCR, LLM-powered categorization, and PostgreSQL database integration.

## Features

- **Document Processing**: Accepts PDF bank statements and images, with OCR fallback for scanned PDFs
- **OCR Extraction**: Uses PaddleOCR for text extraction from documents
- **LLM Categorization**: Swapable LLM models for automatic transaction categorization
- **Duplicate Detection**: Prevents double counting of transactions
- **Local Processing**: All operations performed locally on your machine
- **Terminal Interface**: Easy-to-use CLI for managing transactions
- **User Accounts**: Local user registration and login
- **Portfolio Documents**: Import broker statements and consolidate holdings
- **Net Worth**: Equity + savings - liabilities summary
- **Price Quotes**: Optional real-time pricing via Stooq (HTTP)
- **Database Storage**: PostgreSQL for reliable data persistence

## Requirements

- Python 3.9+
- PostgreSQL 12+
- GPU (RTX 3090 recommended) for LLM inference
- 8GB+ RAM

## Installation

### 1. Clone repository

```bash
cd /path/to/Finace_tracker
```

### 2. Install dependencies

```bash
uv sync
```

Or use pip:

```bash
pip install -r requirements.txt
```

### 3. Setup PostgreSQL

```bash
# Create database and user
sudo -u postgres psql -c "CREATE DATABASE finance_db;"
sudo -u postgres psql -c "CREATE USER coding_agent;"
# Set a password interactively with psql: \password coding_agent
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE finance_db TO coding_agent;"
```

### 4. Initialize the database

```bash
python -c "from finance_tracker.database.manager import db_manager; db_manager.initialize_database(); db_manager.initialize_categories()"
```

## Usage

### Running the CLI

```bash
uv run finance-tracker
```

### Main Menu Options

1. **Process Document (PDF/Image)**: Upload and process financial documents
2. **Add Manual Transaction**: Manually enter transaction details
3. **View Transactions**: Browse all transactions with filters
4. **Manage Categories**: Add and view transaction categories
5. **Portfolio Documents**: Import holdings from broker statements
6. **Accounts & Net Worth**: Track cash, savings, liabilities
7. **LLM Model Management**: Load and manage LLM models
8. **Reports & Statistics**: View spending summaries
9. **Logout**: Switch users
0. **Exit**: Close the application

## LLM Setup

### Recommended Models for RTX 3090

The application supports GGUF format models that can run with llama-cpp-python:

1. **Qwen2.5-3B-Instruct** (Recommended)
   - Download: https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF
   - File: qwen2.5-3b-instruct-q4_k_m.gguf

2. **Llama-3.2-3B-Instruct**
   - Download: https://huggingface.co/MaziyarPanahi/Llama-3.2-3B-Instruct-GGUF
   - File: Llama-3.2-3B-Instruct.Q4_K_M.gguf

### Loading a Model

Through the CLI:
1. Select "LLM Model Management"
2. Select "Load model"
3. Enter provider: `llama_cpp`
4. Enter path to GGUF file
5. Adjust context length (default: 4096) and GPU layers (default: 35)

### Model Parameters

- **Context Length**: How much context the model can consider (4096 recommended)
- **GPU Layers**: Number of layers to offload to GPU (35 recommended for 3090)

## Project Structure

```
finance_tracker/
├── config/
│   └── config.py          # Configuration settings
├── database/
│   ├── models.py           # SQLAlchemy models
│   ├── repository.py       # Data access layer
│   └── manager.py          # Database manager
├── src/
│   ├── cli/
│   │   └── interface.py    # Terminal interface
│   ├── llm/
│   │   ├── base.py         # LLM provider base class
│   │   ├── llama_provider.py  # llama.cpp implementation
│   │   └── manager.py      # LLM manager
│   ├── ocr/
│   │   ├── processor.py    # PaddleOCR processor
│   │   └── pdf_processor.py # PDF processing
│   └── utils/
│       └── transaction_extractor.py  # Transaction extraction
├── uploads/                # Uploaded documents
├── models/                 # Downloaded LLM models
└── data/                   # Application data
```

## Default Categories

- food
- transport
- shopping
- entertainment
- utilities
- healthcare
- education
- income
- transfer
- other

## Configuration

Environment variables can be set in `.env` file or a JSON/YAML config file:

```env
DB_NAME=finance_db
DB_USER=coding_agent
DB_PASSWORD=your-local-database-password
DB_HOST=localhost
DB_PORT=5432

USE_GPU=true
LLM_MODEL_PATH=/path/to/model
LLM_CONTEXT_LENGTH=4096
LLM_MAX_TOKENS=512
N_GPU_LAYERS=35

DEDUPLICATION_TOLERANCE_DAYS=1
DEDUPLICATION_AMOUNT_TOLERANCE=0.01

PRICE_PROVIDER=stooq
PRICE_CACHE_TTL_SECONDS=900
PRICE_BASE_URL=https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcv&h&e=csv
```

To use a config file, set `CONFIG_PATH`:

```bash
export CONFIG_PATH=/path/to/config.json
```

Example `config.json`:

```json
{
  "DB_NAME": "finance_db",
  "DB_USER": "coding_agent",
  "DB_PASSWORD": "your-local-database-password",
  "DB_HOST": "localhost",
  "DB_PORT": "5432",
  "USE_GPU": "true",
  "LLM_CONTEXT_LENGTH": "4096",
  "N_GPU_LAYERS": "35"
}
```

Example `config.yaml`:

```yaml
DB_NAME: finance_db
DB_USER: coding_agent
DB_PASSWORD: your-local-database-password
DB_HOST: localhost
DB_PORT: "5432"
USE_GPU: "true"
LLM_CONTEXT_LENGTH: "4096"
N_GPU_LAYERS: "35"
```

## Processing Flow

1. **Document Upload**: User provides PDF or image
2. **OCR Extraction**: PaddleOCR extracts text from document
3. **Transaction Parsing**: Regex or LLM extracts transaction data
4. **Duplicate Check**: System checks for existing transactions
5. **Category Suggestion**: LLM suggests category if model loaded
6. **Database Storage**: Transaction stored in PostgreSQL

## Example Workflow

```bash
# 1. Run the CLI
uv run finance-tracker

# 2. Load an LLM model (optional, for better categorization)
# Select "LLM Model Management" -> "Load model"
# Enter: llama_cpp
# Enter: /path/to/qwen2.5-3b-instruct-q4_k_m.gguf

# 3. Process a document
# Select "Process document"
# Enter: /path/to/bank_statement.pdf

# 4. View transactions
# Select "View transactions"
# Choose filtering options

# 5. View reports
# Select "Reports & Statistics"
# Choose "Summary by category" or "Monthly summary"
```

## Troubleshooting

### Database Connection Error

Ensure PostgreSQL is running:
```bash
sudo systemctl status postgresql
```

### GPU Not Detected

Check CUDA installation:
```bash
nvidia-smi
```

### PaddleOCR GPU Support

Install the GPU version of PaddlePaddle:
```bash
pip install paddlepaddle-gpu==2.5.2
```

### Llama-cpp-python GPU Support

Reinstall with CUDA support:
```bash
CMAKE_ARGS="-DLLAMA_CUBLAS=on" pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit pull requests.
