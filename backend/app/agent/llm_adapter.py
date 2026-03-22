"""
Слой LLM adapter: OpenAI-совместимый HTTP API (целевой backend — vLLM).

Chat: POST {base}/v1/chat/completions.
Эмбеддинги: см. resolve_llm_embeddings_base_url и LLM_EMBEDDING_API_STYLE в agent_rag.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

import httpx

from app.core.config import settings


class LlmTaskKind(str, Enum):
    """Тип задачи для маршрутизации на разные модели."""

    CHAT = "chat"
    REASONING = "reasoning"
    ROUTER = "router"
    EMBEDDING = "embedding"


def resolve_llm_chat_base_url() -> str | None:
    """Базовый URL для /v1/chat/completions (без завершающего /)."""
    for u in (
        settings.VLLM_BASE_URL,
        settings.LLM_OPENAI_BASE_URL,
        settings.OLLAMA_BASE_URL,
    ):
        if u and str(u).strip():
            return str(u).strip().rstrip("/")
    return None


def resolve_llm_embeddings_base_url() -> str | None:
    """HTTP-база для эмбеддингов; по умолчанию совпадает с chat."""
    u = settings.LLM_EMBEDDINGS_BASE_URL
    if u and str(u).strip():
        return str(u).strip().rstrip("/")
    return resolve_llm_chat_base_url()


def llm_inference_configured() -> bool:
    return resolve_llm_chat_base_url() is not None


def ollama_configured() -> bool:
    """Устаревшее имя: используйте llm_inference_configured."""
    return llm_inference_configured()


def resolve_llm_model(kind: LlmTaskKind) -> str:
    if kind == LlmTaskKind.EMBEDDING:
        return (settings.OLLAMA_EMBED_MODEL or "").strip()
    if kind == LlmTaskKind.REASONING:
        m = getattr(settings, "OLLAMA_MODEL_REASONING", None)
        if m and str(m).strip():
            return str(m).strip()
    if kind == LlmTaskKind.ROUTER:
        m = getattr(settings, "OLLAMA_MODEL_ROUTER", None)
        if m and str(m).strip():
            return str(m).strip()
        return ""
    return (settings.OLLAMA_MODEL or "").strip()


def resolve_ollama_model(kind: LlmTaskKind) -> str:
    """Устаревшее имя: используйте resolve_llm_model."""
    return resolve_llm_model(kind)


def _base_url() -> str:
    u = resolve_llm_chat_base_url()
    if not u:
        raise RuntimeError("LLM inference base URL is not configured")
    return u


def extract_assistant_message(data: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    """Текст ответа или None; второе значение — сырое message из choices[0]."""
    choices = data.get("choices") or []
    if not choices:
        return None, None
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if content and isinstance(content, str) and content.strip():
        return content.strip(), msg
    return None, msg if isinstance(msg, dict) else None


async def chat_completion(
    *,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    task_kind: LlmTaskKind = LlmTaskKind.CHAT,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """POST /v1/chat/completions (OpenAI-совместимый сервер, например vLLM)."""
    if not llm_inference_configured():
        raise RuntimeError(
            "LLM inference is not configured (set VLLM_BASE_URL, LLM_OPENAI_BASE_URL, or OLLAMA_BASE_URL)"
        )

    url = f"{_base_url()}/v1/chat/completions"
    model = resolve_llm_model(task_kind)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        payload["tools"] = tools
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()


async def chat_completion_text_only(
    *,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind = LlmTaskKind.CHAT,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    data = await chat_completion(
        messages=messages,
        tools=None,
        task_kind=task_kind,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    text, _ = extract_assistant_message(data)
    if not text:
        raise RuntimeError("Empty assistant content from LLM")
    return text


def tool_calls_from_message(msg: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not msg or not isinstance(msg, dict):
        return []
    tc = msg.get("tool_calls")
    return tc if isinstance(tc, list) else []
