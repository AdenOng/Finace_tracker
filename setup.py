#!/usr/bin/env python3

import sys
import subprocess
from finance_tracker.database.manager import db_manager


def setup_database():
    """Setup the database and create tables"""
    print("Setting up database...")

    try:
        db_manager.initialize_database()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
        print(
            "\nPlease ensure PostgreSQL is running and the database 'finance_db' exists."
        )
        print("You can create it with:")
        print('  sudo -u postgres psql -c "CREATE DATABASE finance_db;"')
        print(
            '  sudo -u postgres psql -c "CREATE USER coding_agent;"'
        )
        print("  Set a password with psql's \\password coding_agent command.")
        print("  Provide that password in the DB_PASSWORD environment variable.")
        print(
            '  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE finance_db TO coding_agent;"'
        )
        sys.exit(1)

    try:
        db_manager.initialize_categories()
        print("Default categories initialized successfully.")
    except Exception as e:
        print(f"Error initializing categories: {e}")


def install_dependencies():
    """Install Python dependencies"""
    print("Installing dependencies...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
        )
        print("Dependencies installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error installing dependencies: {e}")
        sys.exit(1)


def check_gpu():
    """Check if GPU is available"""
    print("Checking GPU availability...")
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
        if result.returncode == 0:
            print("GPU detected (nvidia-smi available).")
        else:
            print("No GPU detected or nvidia-smi not available.")
    except Exception:
        print("GPU check skipped.")


def main():
    print("=" * 60)
    print("Finance Tracker - Setup")
    print("=" * 60)
    print()

    print("This script will help you set up the Finance Tracker application.")
    print()

    answer = input("Do you want to install dependencies? (y/n): ").strip().lower()
    if answer == "y":
        install_dependencies()
    else:
        print("Skipping dependency installation.")

    print()
    check_gpu()

    print()
    answer = input("Do you want to setup the database? (y/n): ").strip().lower()
    if answer == "y":
        setup_database()
    else:
        print("Skipping database setup.")

    print()
    print("=" * 60)
    print("Setup complete!")
    print("=" * 60)
    print()
    print("You can now run the application with:")
    print("  uv run finance-tracker")
    print()
    print("Or install optional LLM models for categorization:")
    print(
        "  Download a GGUF model (e.g., Qwen2.5-3B-Instruct) and load it through the CLI"
    )


if __name__ == "__main__":
    main()
