"""
Слой LLM adapter: единая точка вызова OpenAI-совместимого API (Ollama / vLLM и т.п.).

Выбор модели по типу задачи; при добавлении vLLM достаточно завести второй base URL в настройках
и ветвление в chat_completion().
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


def ollama_configured() -> bool:
    return bool(settings.OLLAMA_BASE_URL and str(settings.OLLAMA_BASE_URL).strip())


def resolve_ollama_model(kind: LlmTaskKind) -> str:
    if kind == LlmTaskKind.EMBEDDING:
        # Пустая строка в настройках — отключить векторный RAG (только keyword).
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
    return (settings.OLLAMA_MODEL or "llama3.2").strip()


def _base_url() -> str:
    return str(settings.OLLAMA_BASE_URL).rstrip("/")


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
    """
    POST /v1/chat/completions. Для vLLM при том же протоколе — сменить base URL в настройках
    (например OLLAMA_BASE_URL → URL сервиса с OpenAI-совместимым API).
    """
    if not ollama_configured():
        raise RuntimeError("LLM backend is not configured (OLLAMA_BASE_URL)")

    url = f"{_base_url()}/v1/chat/completions"
    model = resolve_ollama_model(task_kind)
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
