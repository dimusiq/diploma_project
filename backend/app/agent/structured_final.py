"""Формирование финального ответа и HTTP-compat после tool-rounds (в т.ч. обход 400)."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.agent import llm_adapter
from app.agent.answer_guardrails import GUARDRAIL_FALLBACK_REPLY, collect_grounding_text
from app.agent.llm_adapter import LlmTaskKind, extract_assistant_message
from app.agent.response_validation import (
    FORMAT_ERROR_REPLY,
    validate_structured_reply,
    wrap_answer_block,
)
from app.core.config import settings

GROUNDING_AFTER_TOOLS_SYSTEM = (
    "Используй только данные из контекста склада и из последних сообщений с результатами инструментов. "
    "Не выдумывай числа и факты, которых там нет."
)

STRICT_FORMAT_RETRY_SYSTEM = (
    "Повтори ответ. Обязательно одна пара тегов <answer>...</answer>, внутри только факты. "
    "Без текста до <answer> и после </answer>."
)

def _stop_sequences() -> list[str]:
    raw = getattr(settings, "AGENT_LLM_STOP_SEQUENCES_STR", "</answer>") or "</answer>"
    return [x.strip() for x in str(raw).split(",") if x.strip()]

async def _post_chat_completion_after_tools(
    client: httpx.AsyncClient,
    url: str,
    *,
    main_model: str,
    messages: list[dict[str, Any]],
    sampling: dict[str, Any],
    stop: list[str],
    loop_kind: LlmTaskKind,
) -> str | None:
    """
    Финальный non-streaming вызов после tool-rounds.
    Раньше при HTTP 400 ответ терялся; vLLM часто принимает тот же запрос без stop или без repetition_penalty.
    """
    bodies: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(body: dict[str, Any]) -> None:
        key = json.dumps(body, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            seen.add(key)
            bodies.append(body)

    add({"model": main_model, "messages": messages, **sampling, "stop": stop})
    if "repetition_penalty" in sampling:
        light = {k: v for k, v in sampling.items() if k != "repetition_penalty"}
        add({"model": main_model, "messages": messages, **light, "stop": stop})
        add({"model": main_model, "messages": messages, **light})
    else:
        add({"model": main_model, "messages": messages, **sampling})

    for body in bodies:
        r2 = await client.post(url, json=body)
        if r2.status_code != 200:
            continue
        data2 = r2.json()
        t2, _ = extract_assistant_message(data2)
        if t2 and t2.strip():
            return t2
    try:
        return await llm_adapter.chat_completion_text_only_compat(
            messages=messages, task_kind=loop_kind
        )
    except Exception:
        return None

async def _resolve_final_text(
    raw: str,
    messages: list[dict[str, Any]],
    *,
    loop_kind: LlmTaskKind,
) -> str:
    grounding = collect_grounding_text(messages)
    ok, payload = validate_structured_reply(raw, grounding)
    if ok:
        return wrap_answer_block(payload)
    if payload != "format":
        return GUARDRAIL_FALLBACK_REPLY
    messages.append({"role": "system", "content": STRICT_FORMAT_RETRY_SYSTEM})
    try:
        text2 = await llm_adapter.chat_completion_text_only(
            messages=messages,
            task_kind=loop_kind,
            stop=_stop_sequences(),
        )
    except Exception:
        return FORMAT_ERROR_REPLY
    ok2, payload2 = validate_structured_reply(text2, collect_grounding_text(messages))
    if ok2:
        return wrap_answer_block(payload2)
    if payload2 == "format":
        return FORMAT_ERROR_REPLY
    return GUARDRAIL_FALLBACK_REPLY

