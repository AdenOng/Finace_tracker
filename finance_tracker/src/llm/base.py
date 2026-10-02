from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers
    """

    @abstractmethod
    def initialize(self, model_path: str, **kwargs) -> None:
        """Initialize the model"""
        pass

    @abstractmethod
    def generate(self, prompt: str, max_tokens: Optional[int] = None, **kwargs) -> str:
        """Generate text from prompt"""
        pass

    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory"""
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model"""
        pass


class CategorySuggestionResult:
    def __init__(
        self, category: str, confidence: float, reasoning: Optional[str] = None
    ):
        self.category = category
        self.confidence = confidence
        self.reasoning = reasoning

    def to_dict(self) -> Dict:
        return {
            "category": self.category,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
        }
