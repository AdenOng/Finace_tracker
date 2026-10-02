import llama_cpp
from typing import Dict, Any
from finance_tracker.src.llm.base import LLMProvider


class LlamaCPPProvider(LLMProvider):
    """
    LLM provider using llama.cpp for running models locally
    """

    def __init__(self):
        self.model = None
        self.model_path = None
        self.context_length = 4096
        self.n_gpu_layers = 0
        self.is_model_loaded = False

    def initialize(
        self,
        model_path: str,
        context_length: int = 4096,
        n_gpu_layers: int = 35,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the llama.cpp model

        Args:
            model_path: Path to the GGUF model file
            context_length: Context window size
            n_gpu_layers: Number of layers to offload to GPU
            **kwargs: Additional parameters for LlamaCPP
        """
        self.model_path = model_path
        self.context_length = context_length
        self.n_gpu_layers = n_gpu_layers

        self.model = llama_cpp.Llama(
            model_path=model_path,
            n_ctx=context_length,
            n_gpu_layers=n_gpu_layers,
            verbose=False,
        )
        self.is_model_loaded = True

    def generate(self, prompt: str, max_tokens: int = 512, **kwargs: Any) -> str:
        """
        Generate text from prompt

        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            **kwargs: Additional generation parameters

        Returns:
            Generated text
        """
        if not self.is_model_loaded or not self.model:
            raise RuntimeError("Model not loaded")

        response = self.model(
            prompt,
            max_tokens=max_tokens,
            stop=["\n\n", "<|end_of_text|>", "<|im_end|>"],
            temperature=kwargs.get("temperature", 0.7),
            top_p=kwargs.get("top_p", 0.9),
            echo=False,
        )

        return response["choices"][0]["text"].strip()

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.is_model_loaded

    def unload(self) -> None:
        """Unload the model from memory"""
        if self.model:
            del self.model
            self.model = None
            self.is_model_loaded = False

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model"""
        return {
            "model_path": self.model_path,
            "context_length": self.context_length,
            "n_gpu_layers": self.n_gpu_layers,
            "is_loaded": self.is_model_loaded,
        }
