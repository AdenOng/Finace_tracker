from typing import Dict, List, Optional, Any
from finance_tracker.src.llm.base import LLMProvider, CategorySuggestionResult
from finance_tracker.config.config import DEFAULT_CATEGORIES

try:
    from finance_tracker.src.llm.llama_provider import LlamaCPPProvider
except Exception:
    LlamaCPPProvider = None


class LLMManager:
    """
    Manager for swapable LLM models
    """

    def __init__(self):
        self.providers = {}
        if LlamaCPPProvider is not None:
            self.providers["llama_cpp"] = LlamaCPPProvider
        self.active_provider = None
        self.active_provider_name = None
        self.categories = DEFAULT_CATEGORIES

    def load_model(self, provider_name: str, model_path: str, **kwargs: Any) -> bool:
        """
        Load a model from a specific provider

        Args:
            provider_name: Name of the provider (e.g., 'llama_cpp')
            model_path: Path to the model file
            **kwargs: Additional parameters for model initialization

        Returns:
            True if successful, False otherwise
        """
        if provider_name not in self.providers:
            raise ValueError(
                f"Unknown or unavailable provider: {provider_name}. "
                "Ensure optional dependencies are installed."
            )

        if self.active_provider:
            self.unload_model()

        provider_class = self.providers[provider_name]
        self.active_provider = provider_class()
        self.active_provider.initialize(model_path, **kwargs)
        self.active_provider_name = provider_name

        return True

    def unload_model(self) -> None:
        """Unload the current model"""
        if self.active_provider:
            self.active_provider.unload()
            self.active_provider = None
            self.active_provider_name = None

    def is_model_loaded(self) -> bool:
        """Check if a model is loaded"""
        return self.active_provider is not None and self.active_provider.is_loaded()

    def generate(self, prompt: str, max_tokens: int = 512, **kwargs: Any) -> str:
        """Generate text using the active model"""
        if not self.is_model_loaded():
            raise RuntimeError("No model loaded")

        return self.active_provider.generate(prompt, max_tokens, **kwargs)

    def suggest_category(
        self, description: str, amount: Optional[float] = None
    ) -> CategorySuggestionResult:
        """
        Suggest a category for a transaction

        Args:
            description: Transaction description
            amount: Transaction amount (optional)

        Returns:
            CategorySuggestionResult with category, confidence, and reasoning
        """
        if not self.is_model_loaded():
            raise RuntimeError("No model loaded")

        categories_str = ", ".join(self.categories)

        prompt = f"""You are a financial transaction categorization assistant.

Available categories: {categories_str}

Transaction: {description}"""

        if amount is not None:
            prompt += f"\nAmount: ${amount:.2f}"

        prompt += f"""

Task: Suggest the most appropriate category for this transaction.

Respond in the following format:
Category: [category name]
Confidence: [0.0 to 1.0]
Reasoning: [brief explanation]"""

        try:
            response = self.generate(prompt, max_tokens=256, temperature=0.3)

            category = self._extract_field(response, "Category")
            confidence = self._extract_confidence(response)
            reasoning = self._extract_field(response, "Reasoning")

            if category and category.lower() in [c.lower() for c in self.categories]:
                return CategorySuggestionResult(category, confidence, reasoning)
            else:
                return CategorySuggestionResult(
                    "other", 0.1, "Could not confidently categorize"
                )

        except Exception as e:
            print(f"Error during categorization: {e}")
            return CategorySuggestionResult("other", 0.0, "Error during categorization")

    def _extract_field(self, response: str, field: str) -> Optional[str]:
        """Extract a field value from the LLM response"""
        lines = response.split("\n")
        for line in lines:
            if line.strip().startswith(f"{field}:"):
                return line.split(":", 1)[1].strip()
        return None

    def _extract_confidence(self, response: str) -> float:
        """Extract confidence score from the LLM response"""
        confidence_str = self._extract_field(response, "Confidence")
        if confidence_str:
            try:
                return float(confidence_str)
            except ValueError:
                pass
        return 0.5

    def set_categories(self, categories: List[str]) -> None:
        """Update the available categories"""
        self.categories = categories

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model"""
        if self.active_provider:
            info = self.active_provider.get_model_info()
            info["provider"] = self.active_provider_name
            return info
        return {"provider": None, "is_loaded": False}

    def list_providers(self) -> List[str]:
        """List available providers"""
        return list(self.providers.keys())


llm_manager = LLMManager()
