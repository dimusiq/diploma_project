"""
Reasoning trace (внутренний) и публичная сводка без полного chain-of-thought.

Операционный контур: Observe (контекст на сервере) → Reason (LLM+router) → Act (tools) →
Verify (разбор JSON; опционально AGENT_VERIFY_LLM_PASS) → Conclude (ответ + public_reasoning).

LLM-слои: REASONING — основной цикл с tools; ROUTER — intent; CHAT — fallback; EMBEDDING — RAG.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.agent import llm_adapter
from app.agent.llm_adapter import LlmTaskKind, llm_inference_configured
from app.agent.tool_catalog import CATALOG_BY_NAME
from app.agent.tool_safety import ToolSafetyClass
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
    verify_rounds: list[list[dict[str, Any]]] = field(default_factory=list)

    def to_internal_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "memory_meta": self.memory_meta,
            "router": self.router,
            "main_loop_task": self.main_loop_task,
            "models_used": self.models_used,
            "tool_calls": self.tool_calls,
            "llm_rounds": self.llm_rounds,
            "verify_rounds": self.verify_rounds,
        }


def main_loop_task_kind() -> LlmTaskKind:
    """Если задана модель reasoning (VLLM_REASONING_MODEL / …) — основной цикл через неё."""
    r = getattr(settings, "OLLAMA_MODEL_REASONING", None)
    if r and str(r).strip():
        return LlmTaskKind.REASONING
    return LlmTaskKind.CHAT


def _confidence_from_verify_rounds(
    verify_rounds: list[list[dict[str, Any]]],
) -> str:
    if not verify_rounds:
        return "средняя"
    last = verify_rounds[-1]
    for n in last:
        if n.get("ok") is False:
            return "низкая (ошибка результата инструмента)"
        if n.get("gate"):
            return "средняя (нужно подтверждение или sandbox)"
    return "средняя"


def _kpi_effect_hint(tool_calls: list[dict[str, Any]]) -> str | None:
    for tc in tool_calls:
        name = str(tc.get("name") or "")
        spec = CATALOG_BY_NAME.get(name)
        if spec is not None and spec.safety in (
            ToolSafetyClass.ACT,
            ToolSafetyClass.PROPOSE,
        ):
            return (
                "Есть propose/act — перепроверьте фактическое состояние read-инструментом или в UI."
            )
    return None


def _next_steps_from_reply(paras: list[str]) -> str:
    if len(paras) <= 2:
        return ""
    return "\n".join(paras[1:-1]).strip()[:800]


def _operational_cycle_summary(run: StructuredReasoningRun) -> dict[str, str]:
    mm = run.memory_meta
    obs: list[str] = []
    if mm.get("warehouse_context"):
        obs.append("агрегаты склада")
    if mm.get("twin_queue_projections"):
        obs.append("проекции очередей twin")
    if mm.get("historical_domain_events"):
        obs.append("метрики domain events")
    if mm.get("rag_chunks", 0) > 0:
        obs.append("RAG")
    if mm.get("operation_session_memory"):
        obs.append("память операционной сессии")
    intent = ""
    if run.router and run.router.get("intent"):
        intent = f"; intent={run.router.get('intent')!s}"
    return {
        "observe": "сервер: " + (", ".join(obs) if obs else "базовый контекст"),
        "reason": f"раундов LLM: {run.llm_rounds}{intent}",
        "act": (
            f"инструментов: {len(run.tool_calls)}"
            if run.tool_calls
            else "без вызовов"
        ),
        "verify": (
            f"проверок JSON: {len(run.verify_rounds)}"
            if run.verify_rounds
            else "нет исполнения tools"
        ),
        "conclude": "ответ пользователю",
    }


def _split_paragraphs(text: str) -> list[str]:
    t = (text or "").strip()
    if not t:
        return []
    parts = re.split(r"\n\s*\n+", t)
    return [p.strip() for p in parts if p.strip()]


def reply_without_first_paragraph_when_multi(reply: str) -> str:
    """
    Первый абзац ответа совпадает с тем, что попадает в public_reasoning.brief_explanation.
    Если сводку в ответ не отдаём (include_public_reasoning=False), убираем этот абзац,
    когда ниже есть ещё абзацы — иначе пользователь видит дублирование «Кратко» и текста.
    """
    paras = _split_paragraphs(reply)
    if len(paras) <= 1:
        return reply
    return "\n\n".join(paras[1:]).strip()


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

    data_sources: list[str] = ["operational_state_warehouse_context"]
    mm = run.memory_meta
    if mm.get("twin_queue_projections"):
        data_sources.append("twin_queue_depth_projections")
    if mm.get("historical_domain_events"):
        data_sources.append("historical_domain_events_metrics")
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

    next_steps = _next_steps_from_reply(paras)
    confidence = _confidence_from_verify_rounds(run.verify_rounds)
    kpi_effect = _kpi_effect_hint(run.tool_calls)
    run_log_ref = (
        f"{settings.API_V1_STR}/agent/runs/{run.run_id}" if run.run_id else None
    )

    return {
        "brief_explanation": brief,
        "tools_used": tools_used,
        "data_sources": data_sources,
        "recommendation": recommendation,
        "models": dict(run.models_used),
        "main_loop_task": run.main_loop_task,
        "next_steps": next_steps or "—",
        "confidence": confidence,
        "kpi_effect": kpi_effect,
        "run_log_ref": run_log_ref,
        "operational_cycle": _operational_cycle_summary(run),
    }


async def run_router_intent(user_message: str) -> dict[str, Any] | None:
    """
    Дешёвая модель для intent (JSON). Если модель router не задана — пропуск.
    """
    if not llm_inference_configured():
        return None
    if not llm_adapter.resolve_llm_model(LlmTaskKind.ROUTER):
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
