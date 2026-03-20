"""Вызов локальной LLM через Ollama (OpenAI-совместимый /v1/chat/completions)."""

from __future__ import annotations

import json
from typing import Any

import httpx
from sqlmodel import Session

from app.core.config import settings
from app.models import User
from app.services.agent_tools import (
    TOOL_DEFINITIONS,
    parse_tool_arguments,
    run_agent_tool,
)

SYSTEM_PROMPT_RU = """Ты ассистент оператора склада (digital twin). Правила:
- Используй ТОЛЬКО факты из блока «Контекст склада» и из результатов инструментов. Не выдумывай цифры, артикулы и состав товаров.
- Если в контексте нет ответа — скажи, что данных в системе недостаточно, и предложи открыть раздел интерфейса (Склад, 3D-модель, Техника).
- Не давай советов по обходу безопасности и учётных записей.
- Отвечай кратко по-русски.
- Инструмент search_items_in_warehouse вызывай, когда нужны конкретные позиции по SKU или названию."""

MAX_TOOL_ROUNDS = 5


def ollama_configured() -> bool:
    return bool(settings.OLLAMA_BASE_URL and str(settings.OLLAMA_BASE_URL).strip())


async def complete_with_ollama(*, context_block: str, user_message: str) -> str:
    if not ollama_configured():
        raise RuntimeError("Ollama is not configured")

    base = str(settings.OLLAMA_BASE_URL).rstrip("/")
    url = f"{base}/v1/chat/completions"
    model = settings.OLLAMA_MODEL
    user_block = (
        f"Контекст склада (только факты, read-only):\n{context_block}\n\n"
        f"Вопрос пользователя:\n{user_message}"
    )
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_RU},
            {"role": "user", "content": user_block},
        ],
        "temperature": 0.2,
    }
    timeout = httpx.Timeout(120.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    return _extract_assistant_text(data)


def _extract_assistant_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Empty choices from Ollama")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if not content or not isinstance(content, str):
        raise RuntimeError("Invalid message content from Ollama")
    return content.strip()


async def complete_with_ollama_tools(
    *,
    session: Session,
    user: User,
    context_block: str,
    user_message: str,
) -> str:
    """Один или несколько раундов chat completions с tool_calls (если модель поддерживает)."""
    if not ollama_configured():
        raise RuntimeError("Ollama is not configured")

    base = str(settings.OLLAMA_BASE_URL).rstrip("/")
    url = f"{base}/v1/chat/completions"
    model = settings.OLLAMA_MODEL
    user_block = (
        f"Контекст склада (только факты, read-only):\n{context_block}\n\n"
        f"Вопрос пользователя:\n{user_message}"
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT_RU},
        {"role": "user", "content": user_block},
    ]
    timeout = httpx.Timeout(120.0, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for _ in range(MAX_TOOL_ROUNDS):
            payload: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "tools": TOOL_DEFINITIONS,
                "temperature": 0.2,
            }
            r = await client.post(url, json=payload)
            if r.status_code == 400:
                return await complete_with_ollama(
                    context_block=context_block, user_message=user_message
                )
            r.raise_for_status()
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                break
            msg = choices[0].get("message") or {}
            tool_calls = msg.get("tool_calls")

            if tool_calls and isinstance(tool_calls, list):
                messages.append(msg)
                for tc in tool_calls:
                    if not isinstance(tc, dict):
                        continue
                    fn = tc.get("function")
                    if not isinstance(fn, dict):
                        continue
                    name = str(fn.get("name") or "")
                    raw_args = fn.get("arguments")
                    if isinstance(raw_args, dict):
                        raw_s = json.dumps(raw_args, ensure_ascii=False)
                    else:
                        raw_s = str(raw_args or "{}")
                    args = parse_tool_arguments(raw_s)
                    result = run_agent_tool(session, user, name, args)
                    tid = str(tc.get("id") or "call_0")
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tid,
                            "content": result,
                        }
                    )
                continue

            content = msg.get("content")
            if content and isinstance(content, str) and content.strip():
                return content.strip()
            break

    return await complete_with_ollama(
        context_block=context_block, user_message=user_message
    )
