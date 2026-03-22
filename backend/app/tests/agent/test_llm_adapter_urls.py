"""Разрешение base URL для chat и эмбеддингов."""

from app.agent.llm_adapter import (
    llm_inference_configured,
    ollama_configured,
    resolve_llm_chat_base_url,
    resolve_llm_embeddings_base_url,
)
from app.core.config import settings


def test_vllm_url_highest_priority(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", "http://vllm:8000/")
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", "http://other:1")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://ollama:11434")
    assert resolve_llm_chat_base_url() == "http://vllm:8000"
    assert llm_inference_configured() is True
    assert ollama_configured() is True


def test_llm_openai_url_second_priority(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", "http://openai-compat:8000/")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://ollama:11434")
    assert resolve_llm_chat_base_url() == "http://openai-compat:8000"
    assert llm_inference_configured() is True


def test_fallback_legacy_ollama_url(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", None)
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    assert resolve_llm_chat_base_url() == "http://localhost:11434"


def test_embeddings_override(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", "http://vllm:8000")
    monkeypatch.setattr(settings, "LLM_EMBEDDINGS_BASE_URL", "http://embed:11434")
    assert resolve_llm_embeddings_base_url() == "http://embed:11434"
