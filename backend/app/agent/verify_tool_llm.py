"""Опциональная LLM-проверка согласованности результатов инструментов (verify → краткий вывод)."""

from __future__ import annotations

import json
from typing import Any

from app.agent.llm_adapter import LlmTaskKind, chat_completion_text_only


async def summarize_tool_round_for_verifier(
    *,
    user_message: str,
    verify_notes: list[dict[str, Any]],
) -> str:
    notes = json.dumps(verify_notes, ensure_ascii=False, default=str)[:6000]
    messages = [
        {
            "role": "system",
            "content": (
                "Ты контролёр качества ответов склада. По краткому вопросу пользователя и сводке "
                "результатов инструментов напиши 1–2 предложения по-русски: всё ли согласовано, "
                "есть ли явные ошибки или ожидание подтверждения. Без выдуманных данных."
            ),
        },
        {
            "role": "user",
            "content": f"Вопрос:\n{user_message[:2000]}\n\nСводка verify:\n{notes}",
        },
    ]
    return await chat_completion_text_only(messages=messages, task_kind=LlmTaskKind.CHAT)
