"""Оркестрация чата ассистента: memory (Observe) → policy → planner (Reason/Act/Verify) → Conclude."""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app.agent.agent_errors import AgentContextBuildError, AgentError
from app.agent.evaluation import note_reply_for_evaluation
from app.agent.llm_adapter import llm_inference_configured, resolve_llm_model
from app.agent.memory import build_chat_context
from app.agent.planner import iter_chat_with_tools_stream
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
from app.services.agent_llm import complete_with_llm_tools
from app.services.agent_operations import (
    format_operation_memory_block,
    get_operation_session_for_user,
)

logger = logging.getLogger(__name__)


async def _safe_build_chat_context(
    session: Session,
    user: User,
    safe_message: str,
    *,
    operation_memory_block: str | None,
) -> tuple[str, dict[str, Any]]:
    try:
        return await build_chat_context(
            session,
            user,
            safe_message,
            operation_memory_block=operation_memory_block,
        )
    except AgentError:
        raise
    except httpx.HTTPError:
        raise
    except SQLAlchemyError as e:
        logger.exception("agent_context_build_sqlalchemy")
        raise AgentContextBuildError(
            "Не удалось подготовить контекст ассистента (данные склада).",
            internal_detail=str(e)[:500],
        ) from e
    except Exception as e:
        logger.exception("agent_context_build_unexpected")
        raise AgentContextBuildError(
            "Не удалось подготовить контекст ассистента.",
            internal_detail=str(e)[:500],
        ) from e


@dataclass(slots=True)
class AgentChatOutcome:
    reply: str
    llm_available: bool
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
    operation_session_id: uuid.UUID | None = None,
) -> AgentChatOutcome:
    """
    Возвращает `AgentChatOutcome` с ответом и публичной сводкой reasoning (без полного CoT).

    `reasoning_debug` (полный structured trace) — только при `include_reasoning_debug=True`.
    """
    trace = AgentTrace.new()
    trace.add_step("session", detail="start", message_chars=len(user_message))

    safe_message = redact_user_message(user_message)
    op_block: str | None = None
    if operation_session_id is not None:
        op = get_operation_session_for_user(
            session, session_id=operation_session_id, user=user
        )
        if op is not None:
            op_block = format_operation_memory_block(op)
    context, mem_meta = await _safe_build_chat_context(
        session,
        user,
        safe_message,
        operation_memory_block=op_block,
    )
    trace.add_step("memory", detail="context_built", context_chars=len(context))

    reasoning = StructuredReasoningRun(run_id=trace.run_id, memory_meta=dict(mem_meta))

    if llm_inference_configured():
        loop_kind = main_loop_task_kind()
        model_name = resolve_llm_model(loop_kind)
        tool_ctx = AgentToolContext(
            run_id=trace.run_id,
            actor_user_id=user.id,
            sandbox=bool(getattr(settings, "AGENT_SANDBOX_MODE", True)),
            allow_mutating_tools=allow_mutating_tools,
            is_superuser=bool(user.is_superuser),
        )
        try:
            reply = await complete_with_llm_tools(
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
            llm_available=True,
            model=model_name,
            public_reasoning=public,
            reasoning_debug=dbg,
            run_id=trace.run_id,
            trace_steps=list(trace.steps),
        )

    fallback = (
        "LLM (vLLM) не настроен. Задайте **VLLM_BASE_URL** (предпочтительно) или "
        "LLM_OPENAI_BASE_URL / OLLAMA_BASE_URL, например `http://host.docker.internal:8000` "
        "если vLLM на хосте. Модели: **VLLM_CHAT_MODEL** / LLM_CHAT_MODEL / OLLAMA_MODEL; "
        "для RAG: **LLM_EMBEDDING_API_STYLE** (по умолчанию openai) и **VLLM_EMBED_MODEL** "
        "(размерность вектора 768 — см. agent_vector).\n\n"
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
        llm_available=False,
        model=None,
        public_reasoning=public,
        reasoning_debug=dbg,
        run_id=trace.run_id,
        trace_steps=list(trace.steps),
    )


async def iter_agent_chat_sse_events(
    session: Session,
    user: User,
    user_message: str,
    *,
    allow_mutating_tools: bool = False,
    include_reasoning_debug: bool = False,
    operation_session_id: uuid.UUID | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Поток событий для SSE: промежуточные `token`, финальное `done` с метаданными как у чата.
    Поле `reply` в `done` — до UI-санитизации (как сырой outcome.reply в run_agent_chat).
    """
    trace = AgentTrace.new()
    trace.add_step("session", detail="start", message_chars=len(user_message))

    safe_message = redact_user_message(user_message)
    op_block: str | None = None
    if operation_session_id is not None:
        op = get_operation_session_for_user(
            session, session_id=operation_session_id, user=user
        )
        if op is not None:
            op_block = format_operation_memory_block(op)
    context, mem_meta = await _safe_build_chat_context(
        session,
        user,
        safe_message,
        operation_memory_block=op_block,
    )
    trace.add_step("memory", detail="context_built", context_chars=len(context))

    reasoning = StructuredReasoningRun(run_id=trace.run_id, memory_meta=dict(mem_meta))

    if not llm_inference_configured():
        fallback = (
            "LLM (vLLM) не настроен. Задайте **VLLM_BASE_URL** (предпочтительно) или "
            "LLM_OPENAI_BASE_URL / OLLAMA_BASE_URL, например `http://host.docker.internal:8000` "
            "если vLLM на хосте. Модели: **VLLM_CHAT_MODEL** / LLM_CHAT_MODEL / OLLAMA_MODEL; "
            "для RAG: **LLM_EMBEDDING_API_STYLE** (по умолчанию openai) и **VLLM_EMBED_MODEL** "
            "(размерность вектора 768 — см. agent_vector).\n\n"
            f"Доступный контекст по вашим правам:\n\n{context}"
        )
        trace.add_step("finish", detail="fallback_no_llm")
        reasoning.tool_calls.clear()
        public = build_public_reasoning_view(final_reply=fallback, run=reasoning)
        trace.internal_reasoning = reasoning.to_internal_dict()
        log_trace_audit(trace)
        dbg = reasoning.to_internal_dict() if include_reasoning_debug else None
        yield {
            "type": "done",
            "reply": fallback,
            "llm_available": False,
            "model": None,
            "public_reasoning": public,
            "reasoning_debug": dbg,
            "run_id": trace.run_id,
            "trace_steps": list(trace.steps),
        }
        return

    loop_kind = main_loop_task_kind()
    model_name = resolve_llm_model(loop_kind)
    tool_ctx = AgentToolContext(
        run_id=trace.run_id,
        actor_user_id=user.id,
        sandbox=bool(getattr(settings, "AGENT_SANDBOX_MODE", True)),
        allow_mutating_tools=allow_mutating_tools,
        is_superuser=bool(user.is_superuser),
    )

    try:
        async for ev in iter_chat_with_tools_stream(
            session=session,
            user=user,
            context_block=context,
            user_message=safe_message,
            trace=trace,
            tool_ctx=tool_ctx,
            reasoning=reasoning,
        ):
            if ev.get("type") == "done":
                reply = str(ev.get("reply") or "")
                trace.add_step("finish", detail="llm_ok", model=model_name)
                note_reply_for_evaluation(reply, trace)
                public = build_public_reasoning_view(final_reply=reply, run=reasoning)
                trace.internal_reasoning = reasoning.to_internal_dict()
                log_trace_audit(trace)
                dbg = reasoning.to_internal_dict() if include_reasoning_debug else None
                yield {
                    "type": "done",
                    "reply": reply,
                    "llm_available": True,
                    "model": model_name,
                    "public_reasoning": public,
                    "reasoning_debug": dbg,
                    "run_id": trace.run_id,
                    "trace_steps": list(trace.steps),
                }
            else:
                yield ev
    except Exception:
        log_trace_audit(trace)
        raise
