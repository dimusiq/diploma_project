"""
Слой Policy / Prompt: system / developer / runtime для чата агента, санитизация ответа, PII.
"""

from __future__ import annotations

import re
from typing import Any

from app.core.config import settings

# SYSTEM — короткий якорь (роль и базовые правила).
SYSTEM_PROMPT_RU = """Ты ассистент оператора склада.

Отвечай строго по фактам из контекста и результатов инструментов.
Не выдумывай данные.

Если в контексте и в результатах инструментов нет фактов для ответа — скажи кратко, что данных не хватает.
Не пиши «в системе нет данных», если контекст или инструменты уже дали факты (цифры, статусы, списки).

Отвечай кратко.
Не объясняй свои действия."""

# DEVELOPER — поведение, формат, ограничения (не смешивать с system).
DEVELOPER_PROMPT_RU = """Правила работы:

- Используй инструменты, если данных в контексте недостаточно
- Не упоминай инструменты в ответе
- Не показывай внутренние рассуждения
- Не объясняй процесс

Формат ответа:
Ответ ТОЛЬКО в формате — никакого другого текста до или после тегов:

<answer>
Краткий ответ по фактам (1–2 абзаца)
</answer>

Ограничения:
- Не выдумывать числа
- Не использовать данные вне контекста
- Не генерировать мета-текст
- Запрещено добавлять информацию, отсутствующую в контексте или в результатах инструментов (включая числа и факты).
- Не пиши перед <answer> разбор контекста («первым делом…», «в контексте сказано…», «проверяю…») — только факты внутри тегов."""


def instruction_messages() -> list[dict[str, Any]]:
    """Первые сообщения чата: system [+ developer], без user/runtime."""
    use_dev = bool(getattr(settings, "AGENT_USE_DEVELOPER_ROLE", True))
    if use_dev:
        return [
            {"role": "system", "content": SYSTEM_PROMPT_RU},
            {"role": "developer", "content": DEVELOPER_PROMPT_RU},
        ]
    merged = f"{SYSTEM_PROMPT_RU}\n\n{DEVELOPER_PROMPT_RU}"
    return [{"role": "system", "content": merged}]

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


# Строка целиком — метка запуска + UUID (модель иногда копирует run_id в ответ).
_RUN_ID_LINE_RE = re.compile(
    r"(?m)^[^\S\n]*(?:Запуск|Run)(?:\s+[Ii]d)?\s*:\s*"
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    r"[^\S\n]*\n?"
)

_ANSWER_BLOCK_RE = re.compile(r"<answer\s*>\s*(.*?)\s*</answer\s*>", re.DOTALL | re.IGNORECASE)
_ANSWER_OPEN_RE = re.compile(r"<answer\s*>", re.IGNORECASE)


def extract_answer_body(text: str) -> str:
    """
    Текст для пользователя: последний блок <answer>...</answer>, иначе текст до </answer>
    (если модель забыла открывающий тег), иначе весь ответ.
    """
    t = text or ""
    matches = list(_ANSWER_BLOCK_RE.finditer(t))
    if matches:
        for m in reversed(matches):
            inner = m.group(1).strip()
            if inner:
                return inner
        return (matches[-1].group(1) or "").strip()
    low = t.lower()
    if "</answer>" in low:
        end_idx = low.rindex("</answer>")
        before = t[:end_idx]
        opens = list(_ANSWER_OPEN_RE.finditer(before))
        if opens:
            start = opens[-1].end()
            inner = before[start:].strip()
            if inner:
                return inner
        paras = [p.strip() for p in re.split(r"\n\s*\n+", before) if p.strip()]
        if paras:
            return paras[-1]
        return before.strip()
    return t.strip()


def _extract_answer_inner_or_full(text: str) -> str:
    return extract_answer_body(text)


def _paragraph_is_internal_tool_meta_leak(p: str) -> bool:
    """Абзац похож на утечку внутренних рассуждений (имена get_*, инструкции модели)."""
    pl = p.lower()
    if "`get_" in pl:
        return True
    if "необходимо использовать" in pl and "инструмент" in pl:
        return True
    if "доступна только через" in pl and "инструмент" in pl:
        return True
    if "в текущем контексте" in pl and "прямые цифры" in pl:
        return True
    if "для определения" in pl and "количества техники" in pl and "инструмент" in pl:
        return True
    if re.search(r"\bтеперь\s+формирую\s+ответ\b", pl):
        return True
    if "используя факты из инструмент" in pl:
        return True
    if "в списке tools" in pl:
        return True
    if "нужно убедиться, что инструмент" in pl:
        return True
    if "в ответе нужно упомянуть" in pl:
        return True
    if "после вызова get_" in pl or "затем, чтобы проверить" in pl and "get_" in pl:
        return True
    if "важно не смешивать данные из этих инструмент" in pl:
        return True
    n_get = len(re.findall(r"\bget_[a-z][a-z0-9_]*\b", p, re.I))
    if n_get >= 2:
        return True
    if n_get >= 1 and any(
        x in pl
        for x in (
            "инструмент",
            "tools",
            "total_units",
            "breakdown",
            " json",
            "формирую ответ",
            "для деталей нужно вызвать",
        )
    ):
        return True
    if n_get >= 1 and "в разделе" in pl and "складская техника" in pl and "указано" in pl:
        return True
    return False


def _paragraph_is_cot_reasoning_leak(p: str) -> bool:
    """Рассуждения вслух про контекст (не для оператора)."""
    pl = p.lower()
    needles = (
        "первым делом обращаюсь",
        "проверяю наличие",
        "в контексте сказано",
        "в контексте упоминается",
        "контекст склада\" упоминается",
        "контекст склада» упоминается",
        "таким образом, в предоставленном контексте",
        "в предоставленном контексте нет",
        "без вызова read",
        "нужно либо обратиться к инструментам",
        "это указывает, что информация",
        "далее, в разделе",
        "в справочных фрагментах",
        "в истории событий и метриках",
        "в снимке twin",
        "в разделе \"товары",
        "в разделе «товары",
    )
    return any(n in pl for n in needles)


def _strip_internal_tool_meta_paragraphs(text: str) -> str:
    parts = re.split(r"\n\s*\n+", text.strip())
    kept = [
        p.strip()
        for p in parts
        if p.strip()
        and not _paragraph_is_internal_tool_meta_leak(p)
        and not _paragraph_is_cot_reasoning_leak(p)
    ]
    joined = "\n\n".join(kept).strip()
    if not joined:
        # Иначе пользователь снова увидит целиком мета-утечку (раньше возвращали text).
        if re.search(r"get_", text, re.I):
            return (
                "Точные сведения по технике смотрите в разделе «Техника». "
                "Плановое ТО по моточасам (включая просрочку) — в графике/календаре ТО, отдельно от статуса эксплуатации в карточке."
            )
        return text.strip()
    return joined


def sanitize_agent_reply_visible_text(text: str) -> str:
    """Удаляет служебные строки с UUID запуска и утечки внутренних рассуждений из ответа пользователю."""
    if not (text or "").strip():
        return text
    core = _extract_answer_inner_or_full(text)
    cleaned = _RUN_ID_LINE_RE.sub("", core)
    cleaned = _strip_internal_tool_meta_paragraphs(cleaned)
    cleaned = re.sub(r"`\s*get_[a-z][a-z0-9_]*\s*`", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def build_user_content_block(*, context_block: str, user_message: str) -> str:
    """RUNTIME: снимок контекста и вопрос (после redaction на границе вызова)."""
    return (
        f"Контекст склада:\n{context_block}\n\n"
        f"Вопрос:\n{user_message}\n\n"
        f"Отвечай строго по контексту выше."
    )


def initial_messages(*, context_block: str, user_message: str) -> list[dict[str, Any]]:
    user_content = build_user_content_block(
        context_block=context_block, user_message=user_message
    )
    return [*instruction_messages(), {"role": "user", "content": user_content}]


def append_router_intent_hint(messages: list[dict[str, Any]], hint: str) -> None:
    """Подсказка LLM-router (intent/topics) — в developer, иначе в system."""
    for m in messages:
        if m.get("role") == "developer":
            m["content"] = f"{m['content']}\n\nПодсказка маршрутизатора (intent/topics): {hint}"
            return
    if messages and messages[0].get("role") == "system":
        messages[0]["content"] = f"{messages[0]['content']}\n\nПодсказка маршрутизатора (intent/topics): {hint}"
