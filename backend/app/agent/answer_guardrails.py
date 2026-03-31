"""
Anti-hallucination: проверка, что числовые утверждения в ответе встречаются в grounding
(контекст пользователя + результаты tool). Иначе — жёсткий fallback.
"""

from __future__ import annotations

import re
from typing import Any

from app.core.config import settings

GUARDRAIL_FALLBACK_REPLY = "В системе нет данных"

_UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\b",
)
# Диапазоны вида «1–2» / «1-2» из шаблона ответа — не считаем их фактами из склада.
_RANGE_RE = re.compile(r"\b\d+\s*[–-]\s*\d+\b")
_ANSWER_INNER_RE = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.DOTALL | re.IGNORECASE)
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")


def collect_grounding_text(messages: list[dict[str, Any]]) -> str:
    """Факты: runtime user + все tool; без system/developer/assistant."""
    parts: list[str] = []
    for m in messages:
        role = m.get("role")
        if role == "user":
            parts.append(str(m.get("content") or ""))
        elif role == "tool":
            parts.append(str(m.get("content") or ""))
    base = "\n".join(parts)
    # Текущий год — допустим в ответах без явного упоминания в контексте.
    from datetime import datetime

    base += f"\n{datetime.now().year}\n"
    return base


def _text_for_numeric_check(answer: str) -> str:
    m = _ANSWER_INNER_RE.search(answer)
    inner = m.group(1).strip() if m else answer.strip()
    s = _UUID_RE.sub(" ", inner)
    s = _RANGE_RE.sub(" ", s)
    return s


def _numeric_variants(token: str) -> list[str]:
    v = {token.strip()}
    if "," in token:
        v.add(token.replace(",", "."))
    if "." in token:
        v.add(token.replace(".", ","))
    return [x for x in v if x]


def _number_grounded(token: str, grounding: str) -> bool:
    gl = grounding
    for variant in _numeric_variants(token):
        escaped = re.escape(variant)
        if re.search(rf"(?<![0-9.,]){escaped}(?![0-9])", gl):
            return True
    return False


def numbers_grounded_in_text(answer_slice: str, grounding: str) -> bool:
    """Все числовые токены из ответа должны встречаться в grounding как отдельные числа."""
    if not answer_slice.strip():
        return True
    tokens = _NUMBER_RE.findall(answer_slice)
    if not tokens:
        return True
    g = grounding
    for t in tokens:
        if not _number_grounded(t, g):
            return False
    return True


def apply_numeric_grounding_guardrail(answer: str, messages: list[dict[str, Any]]) -> str:
    if not bool(getattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", True)):
        return answer
    slice_ = _text_for_numeric_check(answer)
    grounding = collect_grounding_text(messages)
    if numbers_grounded_in_text(slice_, grounding):
        return answer
    return GUARDRAIL_FALLBACK_REPLY
