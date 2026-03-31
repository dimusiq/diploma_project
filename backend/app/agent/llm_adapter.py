"""
Слой LLM adapter: OpenAI-совместимый HTTP API (целевой backend — vLLM).

Chat: POST {base}/v1/chat/completions.
Эмбеддинги: см. resolve_llm_embeddings_base_url и LLM_EMBEDDING_API_STYLE в agent_rag.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from enum import Enum
import json
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
        return (settings.LLM_EMBED_MODEL or "").strip()
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


def agent_chat_sampling_openai_fields(task_kind: LlmTaskKind) -> dict[str, Any]:
    """Поля temperature / top_p / max_tokens / repetition_penalty для основного агента."""
    if task_kind not in (LlmTaskKind.CHAT, LlmTaskKind.REASONING):
        return {"temperature": 0.2}
    out: dict[str, Any] = {
        "temperature": float(getattr(settings, "AGENT_LLM_TEMPERATURE", 0.1)),
        "top_p": float(getattr(settings, "AGENT_LLM_TOP_P", 0.7)),
        "max_tokens": int(getattr(settings, "AGENT_LLM_MAX_TOKENS", 512)),
    }
    rp = getattr(settings, "AGENT_LLM_REPETITION_PENALTY", None)
    if (
        rp is not None
        and bool(getattr(settings, "AGENT_LLM_SEND_REPETITION_PENALTY", True))
    ):
        out["repetition_penalty"] = float(rp)
    return out


def _base_url() -> str:
    u = resolve_llm_chat_base_url()
    if not u:
        raise RuntimeError("LLM inference base URL is not configured")
    return u


def build_openai_chat_payload(
    *,
    model: str,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = None,
    stop: list[str] | None = None,
    stream: bool = False,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    repetition_penalty: float | None = None,
) -> dict[str, Any]:
    """Единое тело POST /v1/chat/completions (vLLM / OpenAI)."""
    base_sampling = agent_chat_sampling_openai_fields(task_kind)
    eff_temp = temperature if temperature is not None else base_sampling["temperature"]
    eff_top_p = top_p if top_p is not None else base_sampling.get("top_p")
    eff_max = max_tokens if max_tokens is not None else base_sampling.get("max_tokens")
    eff_rep = repetition_penalty
    if eff_rep is None and "repetition_penalty" in base_sampling:
        eff_rep = base_sampling["repetition_penalty"]

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": eff_temp,
    }
    if eff_top_p is not None:
        payload["top_p"] = eff_top_p
    if eff_max is not None:
        payload["max_tokens"] = eff_max
    if eff_rep is not None:
        payload["repetition_penalty"] = eff_rep
    if tools:
        payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
    if stop:
        payload["stop"] = stop
    if stream:
        payload["stream"] = True
    return payload


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
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    repetition_penalty: float | None = None,
    tool_choice: str | None = "auto",
    stop: list[str] | None = None,
) -> dict[str, Any]:
    """POST /v1/chat/completions (OpenAI-совместимый сервер, например vLLM)."""
    if not llm_inference_configured():
        raise RuntimeError(
            "LLM inference is not configured (set VLLM_BASE_URL, LLM_OPENAI_BASE_URL, or OLLAMA_BASE_URL)"
        )

    url = f"{_base_url()}/v1/chat/completions"
    model = resolve_llm_model(task_kind)
    payload = build_openai_chat_payload(
        model=model,
        messages=messages,
        task_kind=task_kind,
        tools=tools,
        tool_choice=tool_choice,
        stop=stop,
        stream=False,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
    )

    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()


def _stream_payload_variants(
    *,
    model: str,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind,
    stop: list[str] | None,
    temperature: float | None,
    top_p: float | None,
    max_tokens: int | None,
    repetition_penalty: float | None,
) -> list[dict[str, Any]]:
    """Несколько тел запроса: при 400 vLLM часто помогает убрать repetition_penalty или stop."""
    base = build_openai_chat_payload(
        model=model,
        messages=messages,
        task_kind=task_kind,
        tools=None,
        tool_choice=None,
        stop=stop,
        stream=False,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
    )
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(p: dict[str, Any]) -> None:
        key = json.dumps(p, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            seen.add(key)
            out.append(p)

    add(dict(base))
    if "repetition_penalty" in base:
        add({k: v for k, v in base.items() if k != "repetition_penalty"})
    if "stop" in base:
        add({k: v for k, v in base.items() if k != "stop"})
    if "repetition_penalty" in base and "stop" in base:
        add({k: v for k, v in base.items() if k not in ("repetition_penalty", "stop")})
    return out


async def iter_chat_completion_text_stream(
    *,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind = LlmTaskKind.CHAT,
    stop: list[str] | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    repetition_penalty: float | None = None,
) -> AsyncIterator[str]:
    """SSE-стрим: только текстовые дельты assistant (без tools). При 400 — повторы и fallback без стрима."""
    if not llm_inference_configured():
        raise RuntimeError("LLM inference is not configured")
    url = f"{_base_url()}/v1/chat/completions"
    model = resolve_llm_model(task_kind)
    variants = _stream_payload_variants(
        model=model,
        messages=messages,
        task_kind=task_kind,
        stop=stop,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
    )
    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for payload in variants:
            payload = dict(payload)
            payload["stream"] = True
            async with client.stream("POST", url, json=payload) as r:
                if r.status_code == 400:
                    await r.aread()
                    continue
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("data: "):
                        data = line[6:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        delta = (choices[0].get("delta") or {}) if isinstance(choices[0], dict) else {}
                        piece = delta.get("content")
                        if piece and isinstance(piece, str):
                            yield piece
                return
        text = await chat_completion_text_only_compat(messages=messages, task_kind=task_kind)
        if text:
            yield text


async def chat_completion_text_only(
    *,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind = LlmTaskKind.CHAT,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    repetition_penalty: float | None = None,
    stop: list[str] | None = None,
) -> str:
    data = await chat_completion(
        messages=messages,
        tools=None,
        task_kind=task_kind,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
        stop=stop,
    )
    text, _ = extract_assistant_message(data)
    if not text:
        raise RuntimeError("Empty assistant content from LLM")
    return text


async def chat_completion_text_only_compat(
    *,
    messages: list[dict[str, Any]],
    task_kind: LlmTaskKind = LlmTaskKind.CHAT,
) -> str:
    """
    Текстовый completion без repetition_penalty и прочих расширений vLLM —
    для fallback после HTTP 400 от строгого OpenAI-совместимого сервера.
    """
    if not llm_inference_configured():
        raise RuntimeError(
            "LLM inference is not configured (set VLLM_BASE_URL, LLM_OPENAI_BASE_URL, or OLLAMA_BASE_URL)"
        )
    url = f"{_base_url()}/v1/chat/completions"
    model = resolve_llm_model(task_kind)
    base = agent_chat_sampling_openai_fields(task_kind)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": base["temperature"],
    }
    if base.get("top_p") is not None:
        payload["top_p"] = base["top_p"]
    if base.get("max_tokens") is not None:
        payload["max_tokens"] = base["max_tokens"]

    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    text, _ = extract_assistant_message(data)
    if not text:
        raise RuntimeError("Empty assistant content from LLM")
    return text


def tool_calls_from_message(msg: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not msg or not isinstance(msg, dict):
        return []
    tc = msg.get("tool_calls")
    return tc if isinstance(tc, list) else []
