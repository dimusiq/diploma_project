"""Валидация финального ответа: формат <answer> и числа относительно grounding."""

from __future__ import annotations

from app.agent.answer_guardrails import numbers_grounded_in_text
from app.agent.policy import extract_answer_body
from app.core.config import settings

FORMAT_ERROR_REPLY = "Ошибка формата ответа"


def extract_answer_inner(text: str) -> str | None:
    """Тело ответа — та же логика, что и для показа (последний <answer> / fallback)."""
    body = extract_answer_body(text or "")
    return body if body.strip() else None


def validate_numbers_subset(answer_inner: str, context: str) -> bool:
    """
    Устаревшее имя: раньше сравнивались множества «целых» групп цифр (слишком грубо).
    Используйте ту же семантику, что и structured-контур: `numbers_grounded_in_text`.
    """
    return numbers_grounded_in_text(answer_inner, context)


def validate_structured_reply(raw_text: str, grounding: str) -> tuple[bool, str]:
    """
    (True, inner) — ок.
    (False, "format") | (False, "numbers") — ошибка.
    """
    inner = extract_answer_inner(raw_text)
    if inner is None:
        return False, "format"  # только пустой вывод
    if not bool(getattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", True)):
        return True, inner
    if not numbers_grounded_in_text(inner, grounding):
        return False, "numbers"
    return True, inner


def wrap_answer_block(inner: str) -> str:
    return f"<answer>\n{inner}\n</answer>"
