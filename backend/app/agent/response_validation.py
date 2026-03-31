"""Валидация финального ответа: формат <answer> и числа относительно grounding."""

from __future__ import annotations

import re

from app.agent.policy import extract_answer_body
from app.core.config import settings

FORMAT_ERROR_REPLY = "Ошибка формата ответа"

_DIGITS = re.compile(r"\d+")


def extract_answer_inner(text: str) -> str | None:
    """Тело ответа — та же логика, что и для показа (последний <answer> / fallback)."""
    body = extract_answer_body(text or "")
    return body if body.strip() else None


def extract_digit_groups(text: str) -> set[str]:
    return set(_DIGITS.findall(text or ""))


def validate_numbers_subset(answer_inner: str, context: str) -> bool:
    """Все группы цифр из ответа должны встречаться как группы в grounding (как в спецификации subset)."""
    a = extract_digit_groups(answer_inner)
    if not a:
        return True
    c = extract_digit_groups(context)
    return a.issubset(c)


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
    if not validate_numbers_subset(inner, grounding):
        return False, "numbers"
    return True, inner


def wrap_answer_block(inner: str) -> str:
    return f"<answer>\n{inner}\n</answer>"
