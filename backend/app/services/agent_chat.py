"""Оркестрация чата ассистента: memory → policy → planner → trace / evaluation / reasoning."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlmodel import Session

from app.agent.evaluation import note_reply_for_evaluation
from app.agent.llm_adapter import ollama_configured, resolve_ollama_model
from app.agent.memory import build_chat_context
from app.agent.policy import redact_user_message
from app.agent.reasoning_runtime import (
    StructuredReasoningRun,
    build_public_reasoning_view,
    main_loop_task_kind,
)
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace, log_trace_audit
from app.core.config import settings
from app.models import User
from app.services.agent_llm import complete_with_ollama_tools


@dataclass(slots=True)
class AgentChatOutcome:
    reply: str
    ollama_available: bool
    model: str | None = None
    public_reasoning: dict[str, Any] = field(default_factory=dict)
    reasoning_debug: dict[str, Any] | None = None
    run_id: str = ""
    trace_steps: list[dict[str, Any]] = field(default_factory=list)


async def run_agent_chat(
    session: Session,
    user: User,
    user_message: str,
    *,
    allow_mutating_tools: bool = False,
    include_reasoning_debug: bool = False,
) -> AgentChatOutcome:
    """
    Возвращает `AgentChatOutcome` с ответом и публичной сводкой reasoning (без полного CoT).

    `reasoning_debug` (полный structured trace) — только при `include_reasoning_debug=True`.
    """
    trace = AgentTrace.new()
    trace.add_step("session", detail="start", message_chars=len(user_message))

    safe_message = redact_user_message(user_message)
    context, mem_meta = await build_chat_context(session, user, safe_message)
    trace.add_step("memory", detail="context_built", context_chars=len(context))

    reasoning = StructuredReasoningRun(run_id=trace.run_id, memory_meta=dict(mem_meta))

    if ollama_configured():
        loop_kind = main_loop_task_kind()
        model_name = resolve_ollama_model(loop_kind)
        tool_ctx = AgentToolContext(
            run_id=trace.run_id,
            actor_user_id=user.id,
            sandbox=bool(getattr(settings, "AGENT_SANDBOX_MODE", True)),
            allow_mutating_tools=allow_mutating_tools,
            is_superuser=bool(user.is_superuser),
        )
        try:
            reply = await complete_with_ollama_tools(
                session=session,
                user=user,
                context_block=context,
                user_message=safe_message,
                trace=trace,
                tool_ctx=tool_ctx,
                reasoning_run=reasoning,
            )
        except Exception:
            log_trace_audit(trace)
            raise
        trace.add_step("finish", detail="llm_ok", model=model_name)
        note_reply_for_evaluation(reply, trace)
        public = build_public_reasoning_view(final_reply=reply, run=reasoning)
        trace.internal_reasoning = reasoning.to_internal_dict()
        log_trace_audit(trace)
        dbg = reasoning.to_internal_dict() if include_reasoning_debug else None
        return AgentChatOutcome(
            reply=reply,
            ollama_available=True,
            model=model_name,
            public_reasoning=public,
            reasoning_debug=dbg,
            run_id=trace.run_id,
            trace_steps=list(trace.steps),
        )

    fallback = (
        "Локальная модель (Ollama) не настроена. Задайте переменные окружения "
        "OLLAMA_BASE_URL (например http://host.docker.internal:11434) и при необходимости "
        "OLLAMA_MODEL.\n\n"
        f"Доступный контекст по вашим правам:\n\n{context}"
    )
    trace.add_step("finish", detail="fallback_no_llm")
    reasoning.tool_calls.clear()
    public = build_public_reasoning_view(final_reply=fallback, run=reasoning)
    trace.internal_reasoning = reasoning.to_internal_dict()
    log_trace_audit(trace)
    dbg = reasoning.to_internal_dict() if include_reasoning_debug else None
    return AgentChatOutcome(
        reply=fallback,
        ollama_available=False,
        model=None,
        public_reasoning=public,
        reasoning_debug=dbg,
        run_id=trace.run_id,
        trace_steps=list(trace.steps),
    )
