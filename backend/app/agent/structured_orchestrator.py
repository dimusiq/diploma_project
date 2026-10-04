"""
Финальный контур: router (must_use_tool) → LLM+tools → при необходимости финальный LLM с grounding
→ валидация формата и чисел → retry при ошибке формата.

Реализация: structured_tool_loop (цикл LLM→tools), structured_final (400-compat + финальный ответ).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
from sqlmodel import Session

from app.agent import llm_adapter
from app.agent.generation_config import generation_config_openai
from app.agent.llm_adapter import (
    LlmTaskKind,
    llm_inference_configured,
    resolve_llm_chat_base_url,
    resolve_llm_model,
)
from app.agent.policy import append_router_intent_hint, initial_messages
from app.agent.reasoning_runtime import StructuredReasoningRun, main_loop_task_kind
from app.agent.structured_final import (
    GROUNDING_AFTER_TOOLS_SYSTEM,
    _post_chat_completion_after_tools,
    _resolve_final_text,
    _stop_sequences,
)
from app.agent.structured_tool_loop import _run_structured_tool_phases
from app.agent.tool_registry import llm_tools_payload
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.core.config import settings
from app.models import User

__all__ = [
    "GROUNDING_AFTER_TOOLS_SYSTEM",
    "iter_structured_agent_stream_events",
    "run_structured_agent_chat",
]

async def run_structured_agent_chat(
    *,
    session: Session,
    user: User,
    context_block: str,
    user_message: str,
    trace: AgentTrace | None = None,
    tool_ctx: AgentToolContext | None = None,
    reasoning: StructuredReasoningRun | None = None,
) -> str:
    if not llm_inference_configured():
        raise RuntimeError("LLM inference is not configured")

    loop_kind = main_loop_task_kind()
    main_model = resolve_llm_model(loop_kind)
    if reasoning:
        reasoning.main_loop_task = loop_kind.value
        reasoning.models_used["main_loop"] = main_model
        reasoning.models_used["embedding"] = (
            resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"
        )

    messages: list[dict[str, Any]] = initial_messages(
        context_block=context_block, user_message=user_message
    )
    if reasoning and reasoning.router:
        hint = json.dumps(reasoning.router, ensure_ascii=False)[:800]
        append_router_intent_hint(messages, hint)

    tools = llm_tools_payload(session, user)
    max_rounds = int(getattr(settings, "AGENT_ORCHESTRATOR_MAX_STEPS", 3) or 3)
    max_rounds = max(1, min(max_rounds, 10))

    base = resolve_llm_chat_base_url() or ""
    url = f"{base}/v1/chat/completions"
    sampling = generation_config_openai(loop_kind)
    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)

    if trace:
        trace.add_step(
            "observe",
            detail="structured_orchestrator_ready",
            tool_defs=len(tools),
            main_model=main_model,
            task_kind=loop_kind.value,
        )

    async with httpx.AsyncClient(timeout=timeout) as client:
        early, had_any_tool, last_text = await _run_structured_tool_phases(
            client,
            url,
            session=session,
            user=user,
            messages=messages,
            tools=tools,
            max_rounds=max_rounds,
            user_message=user_message,
            loop_kind=loop_kind,
            main_model=main_model,
            sampling=sampling,
            tool_ctx=tool_ctx,
            reasoning=reasoning,
            trace=trace,
        )
        if early is not None:
            if trace:
                trace.add_step(
                    "conclude", detail="structured_orchestrator_done", chars=len(early)
                )
                trace.add_step(
                    "finish",
                    detail="assistant_text",
                    rounds=(reasoning.llm_rounds if reasoning else 0),
                )
            return early

        if had_any_tool:
            messages.append({"role": "system", "content": GROUNDING_AFTER_TOOLS_SYSTEM})
            t_final = await _post_chat_completion_after_tools(
                client,
                url,
                main_model=main_model,
                messages=messages,
                sampling=sampling,
                stop=_stop_sequences(),
                loop_kind=loop_kind,
            )
            last_text = (t_final or "").strip() or (last_text or "")

    candidate = last_text or ""
    out = await _resolve_final_text(candidate, messages, loop_kind=loop_kind)
    if trace:
        trace.add_step(
            "conclude", detail="structured_orchestrator_done", chars=len(out)
        )
        trace.add_step(
            "finish",
            detail="assistant_text",
            rounds=(reasoning.llm_rounds if reasoning else 0),
        )
    return out

async def iter_structured_agent_stream_events(
    *,
    session: Session,
    user: User,
    context_block: str,
    user_message: str,
    trace: AgentTrace | None = None,
    tool_ctx: AgentToolContext | None = None,
    reasoning: StructuredReasoningRun | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Как run_structured_agent_chat, но финальная генерация после tool-rounds — SSE-текст
    по кускам (`token`), затем один `done` с валидированным `reply`. Клиенту лучше
    для отображения брать итог из `done.reply`.
    """
    if not llm_inference_configured():
        raise RuntimeError("LLM inference is not configured")

    loop_kind = main_loop_task_kind()
    main_model = resolve_llm_model(loop_kind)
    if reasoning:
        reasoning.main_loop_task = loop_kind.value
        reasoning.models_used["main_loop"] = main_model
        reasoning.models_used["embedding"] = (
            resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"
        )

    messages: list[dict[str, Any]] = initial_messages(
        context_block=context_block, user_message=user_message
    )
    if reasoning and reasoning.router:
        hint = json.dumps(reasoning.router, ensure_ascii=False)[:800]
        append_router_intent_hint(messages, hint)

    tools = llm_tools_payload(session, user)
    max_rounds = int(getattr(settings, "AGENT_ORCHESTRATOR_MAX_STEPS", 3) or 3)
    max_rounds = max(1, min(max_rounds, 10))

    base = resolve_llm_chat_base_url() or ""
    url = f"{base}/v1/chat/completions"
    sampling = generation_config_openai(loop_kind)
    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)

    if trace:
        trace.add_step(
            "observe",
            detail="structured_orchestrator_ready",
            tool_defs=len(tools),
            main_model=main_model,
            task_kind=loop_kind.value,
        )

    async with httpx.AsyncClient(timeout=timeout) as client:
        early, had_any_tool, last_text = await _run_structured_tool_phases(
            client,
            url,
            session=session,
            user=user,
            messages=messages,
            tools=tools,
            max_rounds=max_rounds,
            user_message=user_message,
            loop_kind=loop_kind,
            main_model=main_model,
            sampling=sampling,
            tool_ctx=tool_ctx,
            reasoning=reasoning,
            trace=trace,
        )
        if early is not None:
            if trace:
                trace.add_step(
                    "conclude", detail="structured_orchestrator_done", chars=len(early)
                )
                trace.add_step(
                    "finish",
                    detail="assistant_text",
                    rounds=(reasoning.llm_rounds if reasoning else 0),
                )
            yield {"type": "done", "reply": early}
            return

        final_raw = ""
        if had_any_tool:
            messages.append({"role": "system", "content": GROUNDING_AFTER_TOOLS_SYSTEM})
            parts: list[str] = []
            async for piece in llm_adapter.iter_chat_completion_text_stream(
                messages=messages,
                task_kind=loop_kind,
                stop=_stop_sequences(),
            ):
                parts.append(piece)
                yield {"type": "token", "text": piece}
            final_raw = "".join(parts)
            if not final_raw.strip():
                final_raw = await llm_adapter.chat_completion_text_only(
                    messages=messages,
                    task_kind=loop_kind,
                    stop=_stop_sequences(),
                )
        else:
            final_raw = last_text or ""
            if final_raw:
                yield {"type": "token", "text": final_raw}

        out = await _resolve_final_text(final_raw, messages, loop_kind=loop_kind)
        if trace:
            trace.add_step(
                "conclude", detail="structured_orchestrator_done", chars=len(out)
            )
            trace.add_step(
                "finish",
                detail="assistant_text",
                rounds=(reasoning.llm_rounds if reasoning else 0),
            )
        yield {"type": "done", "reply": out}

