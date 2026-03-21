"""
Reasoning trace (внутренний) и публичная сводка без полного chain-of-thought.

LLM-слои: REASONING — основной цикл с tools; ROUTER — опциональная классификация intent;
CHAT — fallback; EMBEDDING — RAG (agent_rag).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.agent import llm_adapter
from app.agent.llm_adapter import LlmTaskKind, ollama_configured
from app.core.config import settings


@dataclass
class StructuredReasoningRun:
    """Накапливается в runtime; в лог уходит полный dict, клиенту — только public slice."""

    run_id: str
    memory_meta: dict[str, Any] = field(default_factory=dict)
    router: dict[str, Any] | None = None
    main_loop_task: str = "chat"
    models_used: dict[str, str] = field(default_factory=dict)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    llm_rounds: int = 0

    def to_internal_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "memory_meta": self.memory_meta,
            "router": self.router,
            "main_loop_task": self.main_loop_task,
            "models_used": self.models_used,
            "tool_calls": self.tool_calls,
            "llm_rounds": self.llm_rounds,
        }


def main_loop_task_kind() -> LlmTaskKind:
    """Если задана OLLAMA_MODEL_REASONING — основной цикл идёт через неё (instruction/reasoning)."""
    r = getattr(settings, "OLLAMA_MODEL_REASONING", None)
    if r and str(r).strip():
        return LlmTaskKind.REASONING
    return LlmTaskKind.CHAT


def _split_paragraphs(text: str) -> list[str]:
    t = (text or "").strip()
    if not t:
        return []
    parts = re.split(r"\n\s*\n+", t)
    return [p.strip() for p in parts if p.strip()]


def build_public_reasoning_view(
    *,
    final_reply: str,
    run: StructuredReasoningRun,
) -> dict[str, Any]:
    """
    То, что безопасно показывать пользователю: кратко, инструменты, источники, итог.
    Без сырого CoT и без полных JSON ответов инструментов.
    """
    paras = _split_paragraphs(final_reply)
    brief = paras[0][:600] if paras else (final_reply[:600] if final_reply else "")
    if len(paras) > 1:
        recommendation = paras[-1][:600]
    else:
        recommendation = "См. ответ ассистента выше."

    tools_used = [
        {
            "name": tc.get("name", ""),
            "args_preview": (tc.get("args_preview") or "")[:200],
        }
        for tc in run.tool_calls
    ]

    data_sources: list[str] = ["aggregates_warehouse_context"]
    mm = run.memory_meta
    if mm.get("rag_chunks", 0) > 0:
        mode = mm.get("rag_mode") or "mixed"
        data_sources.append(f"agent_knowledge_rag({mode}, n={mm['rag_chunks']})")
    for tc in run.tool_calls:
        n = tc.get("name") or ""
        if n:
            data_sources.append(f"tool:{n}")

    if run.router:
        data_sources.append("router_intent_classification")

    deduped: list[str] = []
    for x in data_sources:
        if x not in deduped:
            deduped.append(x)
    data_sources = deduped

    return {
        "brief_explanation": brief,
        "tools_used": tools_used,
        "data_sources": data_sources,
        "recommendation": recommendation,
        "models": dict(run.models_used),
        "main_loop_task": run.main_loop_task,
    }


async def run_router_intent(user_message: str) -> dict[str, Any] | None:
    """
    Дешёвая модель для intent (JSON). Если OLLAMA_MODEL_ROUTER не задан — пропуск.
    """
    if not ollama_configured():
        return None
    if not llm_adapter.resolve_ollama_model(LlmTaskKind.ROUTER):
        return None
    sys = (
        "Ты маршрутизатор запросов к складскому ассистенту. Ответь ТОЛЬКО одним JSON-объектом без markdown, "
        'поля: intent (краткая строка: question|inventory|layout|equipment|tasks|other), '
        "topics (массив строк-ключевых слов на русском или английском, до 5)."
    )
    messages = [
        {"role": "system", "content": sys},
        {"role": "user", "content": user_message[:3000]},
    ]
    try:
        data = await llm_adapter.chat_completion(
            messages=messages,
            tools=None,
            task_kind=LlmTaskKind.ROUTER,
            temperature=0.0,
            max_tokens=200,
        )
        text, _ = llm_adapter.extract_assistant_message(data)
        if not text:
            return None
        raw = text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```\w*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"intent": "other", "raw": raw[:200]}
    except (json.JSONDecodeError, Exception):
        return {"intent": "other", "parse_error": True}
