"""
Planner: code-оркестрация или финальный structured-контур (router → LLM/tools → grounded final → validators).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from sqlmodel import Session

from app.agent.llm_adapter import (
    LlmTaskKind,
    llm_inference_configured,
    resolve_llm_model,
)
from app.agent.reasoning_runtime import (
    StructuredReasoningRun,
    main_loop_task_kind,
    run_router_intent,
)
from app.agent.structured_orchestrator import (
    iter_structured_agent_stream_events,
    run_structured_agent_chat,
)
from app.agent.tool_orchestrator import run_code_orchestrated_turn
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.core.config import settings
from app.models import User


async def run_chat_with_tools(
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

    if bool(getattr(settings, "AGENT_CODE_ORCHESTRATION", False)):
        return await run_code_orchestrated_turn(
            session=session,
            user=user,
            context_block=context_block,
            user_message=user_message,
            trace=trace,
            tool_ctx=tool_ctx,
            reasoning=reasoning,
        )

    loop_kind = main_loop_task_kind()
    main_model = resolve_llm_model(loop_kind)
    if reasoning:
        reasoning.main_loop_task = loop_kind.value
        reasoning.models_used["main_loop"] = main_model
        reasoning.models_used["embedding"] = resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"

    if reasoning:
        ri = await run_router_intent(user_message)
        if ri is not None:
            reasoning.router = ri
            if trace:
                trace.add_step(
                    "router_intent",
                    intent=str(ri.get("intent", ""))[:64],
                    topics=ri.get("topics"),
                )

    return await run_structured_agent_chat(
        session=session,
        user=user,
        context_block=context_block,
        user_message=user_message,
        trace=trace,
        tool_ctx=tool_ctx,
        reasoning=reasoning,
    )


async def iter_chat_with_tools_stream(
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
    События для SSE: `token` (текст финальной генерации) и `done` с полем `reply`.
    При AGENT_CODE_ORCHESTRATION токенов нет — только одно событие `done`.
    """
    if not llm_inference_configured():
        raise RuntimeError("LLM inference is not configured")

    if bool(getattr(settings, "AGENT_CODE_ORCHESTRATION", False)):
        reply = await run_code_orchestrated_turn(
            session=session,
            user=user,
            context_block=context_block,
            user_message=user_message,
            trace=trace,
            tool_ctx=tool_ctx,
            reasoning=reasoning,
        )
        yield {"type": "done", "reply": reply}
        return

    loop_kind = main_loop_task_kind()
    main_model = resolve_llm_model(loop_kind)
    if reasoning:
        reasoning.main_loop_task = loop_kind.value
        reasoning.models_used["main_loop"] = main_model
        reasoning.models_used["embedding"] = resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"

    if reasoning:
        ri = await run_router_intent(user_message)
        if ri is not None:
            reasoning.router = ri
            if trace:
                trace.add_step(
                    "router_intent",
                    intent=str(ri.get("intent", ""))[:64],
                    topics=ri.get("topics"),
                )

    async for ev in iter_structured_agent_stream_events(
        session=session,
        user=user,
        context_block=context_block,
        user_message=user_message,
        trace=trace,
        tool_ctx=tool_ctx,
        reasoning=reasoning,
    ):
        yield ev
