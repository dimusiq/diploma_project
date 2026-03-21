"""Фасад вызова LLM: совместимость импортов + делегирование в слой `app.agent`."""

from __future__ import annotations

from sqlmodel import Session

from app.agent.llm_adapter import (
    LlmTaskKind,
    chat_completion_text_only,
    ollama_configured,
)
from app.agent.planner import run_chat_with_tools
from app.agent.policy import (
    OUTPUT_FORMAT_HINT,
    SYSTEM_PROMPT_RU,
    build_user_content_block,
)
from app.agent.reasoning_runtime import StructuredReasoningRun
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.models import User

# Обратная совместимость (раньше константа жила здесь).
__all__ = [
    "SYSTEM_PROMPT_RU",
    "complete_with_ollama",
    "complete_with_ollama_tools",
    "ollama_configured",
]


async def complete_with_ollama(*, context_block: str, user_message: str) -> str:
    if not ollama_configured():
        raise RuntimeError("Ollama is not configured")
    user_content = build_user_content_block(
        context_block=context_block, user_message=user_message
    )
    messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT_RU}\n\n{OUTPUT_FORMAT_HINT}"},
        {"role": "user", "content": user_content},
    ]
    return await chat_completion_text_only(
        messages=messages,
        task_kind=LlmTaskKind.CHAT,
    )


async def complete_with_ollama_tools(
    *,
    session: Session,
    user: User,
    context_block: str,
    user_message: str,
    trace: AgentTrace | None = None,
    tool_ctx: AgentToolContext | None = None,
    reasoning_run: StructuredReasoningRun | None = None,
) -> str:
    return await run_chat_with_tools(
        session=session,
        user=user,
        context_block=context_block,
        user_message=user_message,
        trace=trace,
        tool_ctx=tool_ctx,
        reasoning=reasoning_run,
    )
