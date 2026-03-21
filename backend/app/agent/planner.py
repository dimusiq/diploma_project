"""
Planner / Executor: цикл observe → think → tool → reflect → finish с лимитами и ошибками инструментов.
Поддержка reasoning-модели для основного цикла и структурированного trace.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from sqlmodel import Session

from app.agent import llm_adapter
from app.agent.llm_adapter import (
    LlmTaskKind,
    extract_assistant_message,
    ollama_configured,
    tool_calls_from_message,
)
from app.agent.policy import initial_messages
from app.agent.reasoning_runtime import (
    StructuredReasoningRun,
    main_loop_task_kind,
    run_router_intent,
)
from app.agent.tool_registry import invoke_tool, ollama_tools_payload
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.core.config import settings
from app.models import User


def _max_tool_steps() -> int:
    n = int(getattr(settings, "AGENT_MAX_TOOL_STEPS", 5) or 5)
    return max(1, min(n, 20))


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
    """
    Многошаговый chat + tools. При 400 от API (модель без tools) — откат на текстовый completion.
    """
    if not ollama_configured():
        raise RuntimeError("LLM not configured")

    loop_kind = main_loop_task_kind()
    main_model = llm_adapter.resolve_ollama_model(loop_kind)
    if reasoning:
        reasoning.main_loop_task = loop_kind.value
        reasoning.models_used["main_loop"] = main_model
        reasoning.models_used["embedding"] = llm_adapter.resolve_ollama_model(LlmTaskKind.EMBEDDING) or "(off)"

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

    messages: list[dict[str, Any]] = initial_messages(
        context_block=context_block, user_message=user_message
    )
    if reasoning and reasoning.router:
        hint = json.dumps(reasoning.router, ensure_ascii=False)[:800]
        messages[0]["content"] = (
            f"{messages[0]['content']}\n\nПодсказка маршрутизатора (intent/topics): {hint}"
        )

    tools = ollama_tools_payload(session, user)
    max_steps = _max_tool_steps()
    base = str(settings.OLLAMA_BASE_URL).rstrip("/")
    url = f"{base}/v1/chat/completions"

    if trace:
        trace.add_step(
            "observe",
            detail="messages_ready",
            tool_defs=len(tools),
            main_model=main_model,
            task_kind=loop_kind.value,
        )

    timeout_sec = float(getattr(settings, "AGENT_LLM_TIMEOUT_SEC", 120.0) or 120.0)
    timeout = httpx.Timeout(timeout_sec, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for step_idx in range(max_steps):
            if trace:
                trace.add_step("think", round_index=step_idx)
            if reasoning:
                reasoning.llm_rounds = step_idx + 1

            payload: dict[str, Any] = {
                "model": main_model,
                "messages": messages,
                "tools": tools,
                "temperature": 0.2,
            }
            r = await client.post(url, json=payload)
            if r.status_code == 400:
                if trace:
                    trace.add_step("reflect", detail="tools_not_supported_fallback_text")
                return await llm_adapter.chat_completion_text_only(
                    messages=messages,
                    task_kind=loop_kind,
                )
            r.raise_for_status()
            data = r.json()
            text, msg = extract_assistant_message(data)
            tcalls = tool_calls_from_message(msg)

            if tcalls:
                if trace:
                    trace.add_step(
                        "choose_tool",
                        count=len(tcalls),
                        names=[
                            str(tc.get("function", {}).get("name"))
                            for tc in tcalls
                            if isinstance(tc, dict)
                        ],
                    )
                if msg:
                    messages.append(msg)
                for tc in tcalls:
                    if not isinstance(tc, dict):
                        continue
                    fn = tc.get("function")
                    if not isinstance(fn, dict):
                        continue
                    name = str(fn.get("name") or "")
                    raw_args = fn.get("arguments")
                    if isinstance(raw_args, dict):
                        raw_s = json.dumps(raw_args, ensure_ascii=False)
                    else:
                        raw_s = str(raw_args or "{}")
                    try:
                        result = invoke_tool(session, user, name, raw_s, ctx=tool_ctx)
                    except Exception as e:
                        if trace:
                            trace.add_step(
                                "tool_error",
                                tool=name,
                                error=str(e),
                            )
                        result = json.dumps(
                            {"error": f"Исключение при выполнении инструмента: {e!s}"},
                            ensure_ascii=False,
                        )
                    if reasoning:
                        reasoning.tool_calls.append(
                            {
                                "name": name,
                                "args_preview": raw_s[:400],
                                "result_preview": result[:500],
                            }
                        )
                    tid = str(tc.get("id") or "call_0")
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tid,
                            "content": result,
                        }
                    )
                if trace:
                    trace.add_step("execute", detail="tool_round_complete")
                continue

            if text:
                if trace:
                    trace.add_step("finish", detail="assistant_text", rounds=step_idx + 1)
                return text
            if trace:
                trace.add_step("reflect", detail="empty_choice_break")
            break

        if trace:
            trace.add_step("finish", detail="max_steps_or_empty_fallback_text")
        return await llm_adapter.chat_completion_text_only(
            messages=messages,
            task_kind=loop_kind,
        )
