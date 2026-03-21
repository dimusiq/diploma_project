"""
Слой Policy / Prompt: системные правила, формат диалога, ограничение данных, PII.
"""

from __future__ import annotations

import re
from typing import Any

# Системные правила (reasoning/output): только факты из контекста и инструментов.
SYSTEM_PROMPT_RU = """Ты ассистент оператора склада (digital twin). Правила:
- Используй ТОЛЬКО факты из блока «Контекст склада» и из результатов инструментов. Не выдумывай цифры, артикулы и состав товаров.
- Если в контексте нет ответа — скажи, что данных в системе недостаточно, и предложи открыть раздел интерфейса (Склад, 3D-модель, Техника).
- Не давай советов по обходу безопасности и учётных записей.
- Отвечай кратко по-русски.
- Инструменты бывают read-only (сразу данные), act (изменения в системе). Если инструмент вернул requires_confirmation или sandbox — объясни пользователю, что нужно подтверждение в UI или включён режим песочницы.
- Не запрашивай и не выполняй произвольный SQL или shell; используй только переданные инструменты.
- Инструмент search_items_in_warehouse вызывай, когда нужны конкретные позиции по SKU или названию."""

OUTPUT_FORMAT_HINT = (
    "Формат ответа: обычный связный текст по-русски; без выдуманных таблиц и чисел вне контекста."
)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Грубый шаблон телефона (PII policy / redaction)
_PHONE_RE = re.compile(
    r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}\b"
)


def redact_pii(text: str) -> str:
    """Маскирование типичных PII перед отправкой во внешнюю LLM."""
    if not text:
        return text
    t = _EMAIL_RE.sub("[email]", text)
    return _PHONE_RE.sub("[phone]", t)


def redact_user_message(text: str) -> str:
    return redact_pii(text.strip())


def build_user_content_block(*, context_block: str, user_message: str) -> str:
    """Единый пользовательский блок: контекст + вопрос (уже после redaction на границе вызова)."""
    return (
        f"Контекст склада (только факты, read-only):\n{context_block}\n\n"
        f"Вопрос пользователя:\n{user_message}"
    )


def initial_messages(*, context_block: str, user_message: str) -> list[dict[str, Any]]:
    user_content = build_user_content_block(
        context_block=context_block, user_message=user_message
    )
    return [
        {"role": "system", "content": f"{SYSTEM_PROMPT_RU}\n\n{OUTPUT_FORMAT_HINT}"},
        {"role": "user", "content": user_content},
    ]
