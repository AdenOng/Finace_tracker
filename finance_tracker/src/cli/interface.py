from typing import List
from datetime import datetime
from finance_tracker.src.transaction_processor import TransactionProcessor
from finance_tracker.src.auth.manager import AuthManager
from finance_tracker.src.portfolio.processor import PortfolioProcessor


class FinanceCLI:
    """
    Command-line interface for the Finance Tracker
    """

    def __init__(self):
        self.processor = TransactionProcessor()
        self.portfolio_processor = PortfolioProcessor()
        self.auth_manager = AuthManager()
        self.running = True
        self.current_user_id = None
        self.session_token = None

    def run(self):
        """Run the CLI interface"""
        print("=" * 60)
        print("Finance Tracker - Terminal Interface")
        print("=" * 60)
        print()

        if not self.authenticate():
            print("Authentication required.")
            return

        while self.running:
            self.show_main_menu()
            choice = input("Enter your choice: ").strip()
            self.handle_main_menu_choice(choice)

    def show_main_menu(self):
        """Display main menu"""
        print("\nMain Menu:")
        print("1. Process document (PDF/Image)")
        print("2. Add manual transaction")
        print("3. View transactions")
        print("4. Manage categories")
        print("5. Portfolio documents")
        print("6. Accounts & Net Worth")
        print("7. LLM model management")
        print("8. Reports & Statistics")
        print("9. Logout")
        print("0. Exit")
        print()

    def handle_main_menu_choice(self, choice: str):
        """Handle main menu choice"""
        if choice == "1":
            self.process_document_menu()
        elif choice == "2":
            self.add_manual_transaction_menu()
        elif choice == "3":
            self.view_transactions_menu()
        elif choice == "4":
            self.manage_categories_menu()
        elif choice == "5":
            self.portfolio_menu()
        elif choice == "6":
            self.accounts_menu()
        elif choice == "7":
            self.llm_model_menu()
        elif choice == "8":
            self.reports_menu()
        elif choice == "9":
            self.logout()
        elif choice == "0":
            self.running = False
            print("\nGoodbye!")
        else:
            print("\nInvalid choice. Please try again.")

    def authenticate(self) -> bool:
        print("\nAuthentication")
        print("1. Login")
        print("2. Register")
        print("3. Exit")

        choice = input("Enter your choice: ").strip()
        if choice == "1":
            username = input("Username: ").strip()
            password = input("Password: ").strip()
            result = self.auth_manager.login(username, password)
            if result.get("success"):
                self.current_user_id = result.get("user_id")
                self.session_token = result.get("token")
                return True
            print(f"Login failed: {result.get('error', 'Unknown error')}")
            return False
        if choice == "2":
            username = input("Username: ").strip()
            email = input("Email (optional): ").strip() or None
            password = input("Password: ").strip()
            result = self.auth_manager.register_user(username, password, email)
            if result.get("success"):
                print("Registration successful. Please log in.")
                return self.authenticate()
            print(f"Registration failed: {result.get('error', 'Unknown error')}")
            return False
        return False

    def logout(self):
        if self.session_token:
            self.auth_manager.logout(self.session_token)
        self.current_user_id = None
        self.session_token = None
        print("\nLogged out.")
        self.authenticate()

    def _require_login(self) -> bool:
        if not self.current_user_id:
            print("\nPlease login first.")
            return False
        return True

    def portfolio_menu(self):
        if not self._require_login():
            return
        print("\n--- Portfolio Documents ---")
        print("1. Import portfolio document")
        print("2. View portfolio value")
        print("3. Back")

        choice = input("Enter your choice: ").strip()
        if choice == "1":
            broker_name = input("Broker name: ").strip()
            file_path = input("Path to portfolio document: ").strip()
            result = self.portfolio_processor.process_portfolio_file(
                self.current_user_id, file_path, broker_name
            )
            if result.get("success"):
                print(f"Imported {result['holdings_count']} holdings.")
            else:
                print(f"Error: {result.get('error')}")
        elif choice == "2":
            summary = self.portfolio_processor.get_portfolio_value(self.current_user_id)
            print(f"\nTotal portfolio value: ${summary['total_value']:.2f}")
            for item in summary["by_symbol"]:
                print(
                    f"  {item['symbol']}: {item['quantity']} shares, value ${item['value']:.2f}"
                )

        input("\nPress Enter to continue...")

    def accounts_menu(self):
        if not self._require_login():
            return
        print("\n--- Accounts & Net Worth ---")
        print("1. Add account")
        print("2. List accounts")
        print("3. Update account balance")
        print("4. View net worth")
        print("5. Back")

        choice = input("Enter your choice: ").strip()
        if choice == "1":
            name = input("Account name: ").strip()
            account_type = input("Account type (cash/savings/liability): ").strip()
            balance = float(input("Balance: ").strip())
            result = self.portfolio_processor.add_account(
                self.current_user_id, name, account_type, balance
            )
            if result.get("success"):
                print("Account added.")
        elif choice == "2":
            accounts = self.portfolio_processor.list_accounts(self.current_user_id)
            for account in accounts:
                print(
                    f"  {account['id']}: {account['name']} ({account['type']}) - ${account['balance']:.2f}"
                )
        elif choice == "3":
            account_id = int(input("Account ID: ").strip())
            balance = float(input("New balance: ").strip())
            if self.portfolio_processor.update_account_balance(
                account_id, balance, self.current_user_id
            ):
                print("Account updated.")
            else:
                print("Account not found.")
        elif choice == "4":
            net = self.portfolio_processor.get_net_worth(self.current_user_id)
            print(f"Assets: ${net['assets']:.2f}")
            print(f"Liabilities: ${net['liabilities']:.2f}")
            print(f"Portfolio: ${net['portfolio_value']:.2f}")
            print(f"Net worth: ${net['net_worth']:.2f}")

        input("\nPress Enter to continue...")

    def process_document_menu(self):
        """Process a document"""
        if not self._require_login():
            return
        print("\n--- Process Document ---")
        file_path = input("Enter path to document (PDF or image): ").strip()

        if not file_path:
            print("No file path provided.")
            return

        print("\nProcessing document...")
        result = self.processor.process_file(self.current_user_id, file_path)

        if result["success"]:
            print(f"\nDocument processed successfully!")
            print(f"Document ID: {result['document_id']}")
            print(f"Transactions extracted: {result['transactions_count']}")

            if result["transactions_count"] > 0:
                print("\nTransactions:")
                for trans in result["transactions"][:5]:
                    print(
                        f"  - {trans['date'].strftime('%Y-%m-%d')}: ${trans['amount']:.2f} - {trans['description']} ({trans['category'] or 'Uncategorized'})"
                    )

                if result["transactions_count"] > 5:
                    print(f"  ... and {result['transactions_count'] - 5} more")
        else:
            print(f"\nError: {result['error']}")

        input("\nPress Enter to continue...")

    def add_manual_transaction_menu(self):
        """Add a manual transaction"""
        if not self._require_login():
            return
        print("\n--- Add Manual Transaction ---")

        try:
            description = input("Description: ").strip()
            amount = float(input("Amount: ").strip())
            date_str = input("Date (YYYY-MM-DD, leave blank for today): ").strip()

            transaction_date = None
            if date_str:
                transaction_date = datetime.strptime(date_str, "%Y-%m-%d")

            categories = self.processor.get_categories()
            print(f"\nAvailable categories: {', '.join(categories)}")
            category = input("Category (leave blank for LLM suggestion): ").strip()

            transaction_data = {
                "description": description,
                "amount": amount,
                "transaction_date": transaction_date,
                "is_duplicate": False,
            }

            if category:
                category_repo, db = self.processor.db_manager.get_category_repository()
                cat = category_repo.get_category_by_name(category)
                if cat:
                    transaction_data["category_id"] = cat.id
                db.close()

            print("\nAdding transaction...")
            result = self.processor.add_manual_transaction(
                self.current_user_id, transaction_data
            )

            if result and result["success"]:
                print(f"\nTransaction added successfully!")
                print(f"ID: {result['id']}")
                print(f"Description: {result['description']}")
                print(f"Amount: ${result['amount']:.2f}")
                print(f"Date: {result['date'].strftime('%Y-%m-%d')}")
                print(f"Category: {result['category'] or 'Uncategorized'}")
            else:
                error_message = "Failed to add transaction"
                if result and isinstance(result, dict):
                    error_message = result.get("error", error_message)
                print(f"\nError: {error_message}")

        except ValueError as e:
            print(f"\nInvalid input: {e}")
        except Exception as e:
            print(f"\nError: {e}")

        input("\nPress Enter to continue...")

    def view_transactions_menu(self):
        """View transactions"""
        if not self._require_login():
            return
        print("\n--- View Transactions ---")
        print("1. All transactions")
        print("2. By date range")
        print("3. By category")
        print("4. Search")
        print("5. Uncategorized transactions")
        print("6. Back")

        choice = input("Enter your choice: ").strip()

        if choice == "6":
            return

        transactions = []

        if choice == "1":
            transactions = self.processor.get_transactions(self.current_user_id)
        elif choice == "2":
            try:
                start_date = datetime.strptime(
                    input("Start date (YYYY-MM-DD): ").strip(), "%Y-%m-%d"
                )
                end_date = datetime.strptime(
                    input("End date (YYYY-MM-DD): ").strip(), "%Y-%m-%d"
                )
                transactions = self.processor.get_transactions(
                    self.current_user_id, start_date=start_date, end_date=end_date
                )
            except ValueError:
                print("Invalid date format.")
                input("\nPress Enter to continue...")
                return
        elif choice == "3":
            categories = self.processor.get_categories()
            print(f"\nAvailable categories: {', '.join(categories)}")
            category_name = input("Enter category: ").strip()
            category_repo, db = self.processor.db_manager.get_category_repository()
            cat = category_repo.get_category_by_name(category_name)
            db.close()
            if cat:
                transactions = self.processor.get_transactions(
                    self.current_user_id, category_id=cat.id
                )
            else:
                print("Category not found.")
                input("\nPress Enter to continue...")
                return
        elif choice == "4":
            search_term = input("Enter search term: ").strip()
            transactions = self.processor.get_transactions(
                self.current_user_id, search=search_term
            )
        elif choice == "5":
            transactions = self.processor.get_transactions(
                self.current_user_id, uncategorized=True
            )

        if transactions:
            print(f"\nFound {len(transactions)} transactions:")
            for trans in transactions:
                dup_flag = " [DUPLICATE]" if trans["is_duplicate"] else ""
                print(
                    f"  {trans['id']}: {trans['date'].strftime('%Y-%m-%d')} - ${trans['amount']:.2f} - {trans['description']} ({trans['category'] or 'Uncategorized'}){dup_flag}"
                )
        else:
            print("\nNo transactions found.")

        input("\nPress Enter to continue...")

    def manage_categories_menu(self):
        """Manage categories"""
        print("\n--- Manage Categories ---")
        print("1. View all categories")
        print("2. Add new category")
        print("3. Back")

        choice = input("Enter your choice: ").strip()

        if choice == "1":
            categories = self.processor.get_categories()
            print(f"\nCategories: {', '.join(categories)}")
        elif choice == "2":
            category_name = input("Enter new category name: ").strip()
            if category_name:
                category_repo, db = self.processor.db_manager.get_category_repository()
                category_repo.create_category(category_name)
                db.close()
                print(f"\nCategory '{category_name}' added successfully!")

        input("\nPress Enter to continue...")

    def llm_model_menu(self):
        """Manage LLM models"""
        print("\n--- LLM Model Management ---")

        from finance_tracker.src.llm.manager import llm_manager

        is_loaded = llm_manager.is_model_loaded()
        print(f"Current status: {'Model loaded' if is_loaded else 'No model loaded'}")

        print("\n1. Load model")
        print("2. Unload model")
        print("3. View model info")
        print("4. Back")

        choice = input("Enter your choice: ").strip()

        if choice == "1":
            print("\nAvailable providers: llama_cpp")
            provider = (
                input("Enter provider (default: llama_cpp): ").strip() or "llama_cpp"
            )
            model_path = input("Enter path to GGUF model file: ").strip()

            if model_path:
                context_length = input("Context length (default: 4096): ").strip()
                n_gpu_layers = input("GPU layers (default: 35): ").strip()

                kwargs = {
                    "context_length": int(context_length) if context_length else 4096,
                    "n_gpu_layers": int(n_gpu_layers) if n_gpu_layers else 35,
                }

                print("\nLoading model... (this may take a while)")
                success = self.processor.load_llm_model(provider, model_path, **kwargs)

                if success:
                    print("Model loaded successfully!")
                else:
                    print("Failed to load model.")
        elif choice == "2":
            llm_manager.unload_model()
            print("Model unloaded.")
        elif choice == "3":
            info = llm_manager.get_model_info()
            print(f"\nModel Info:")
            print(f"Provider: {info.get('provider', 'None')}")
            print(f"Loaded: {info.get('is_loaded', False)}")

        input("\nPress Enter to continue...")

    def reports_menu(self):
        """Show reports and statistics"""
        if not self._require_login():
            return
        print("\n--- Reports & Statistics ---")
        print("1. Summary by category")
        print("2. Monthly summary")
        print("3. Back")

        choice = input("Enter your choice: ").strip()

        if choice == "1":
            transactions = self.processor.get_transactions(self.current_user_id)
            summary = {}

            for trans in transactions:
                if not trans["is_duplicate"]:
                    category = trans["category"] or "Uncategorized"
                    if category not in summary:
                        summary[category] = 0
                    summary[category] += trans["amount"]

            print("\nSummary by category:")
            for category, total in sorted(
                summary.items(), key=lambda x: x[1], reverse=True
            ):
                print(f"  {category}: ${total:.2f}")

        elif choice == "2":
            transactions = self.processor.get_transactions(self.current_user_id)
            monthly = {}

            for trans in transactions:
                if not trans["is_duplicate"]:
                    month = trans["date"].strftime("%Y-%m")
                    if month not in monthly:
                        monthly[month] = 0
                    monthly[month] += trans["amount"]

            print("\nMonthly summary:")
            for month, total in sorted(monthly.items()):
                print(f"  {month}: ${total:.2f}")

        input("\nPress Enter to continue...")


def main():
    """Main entry point"""
    cli = FinanceCLI()
    cli.run()


if __name__ == "__main__":
    main()
