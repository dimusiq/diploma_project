"""
Planner / Executor: операционный цикл агента.

Observe — контекст и снимки уже собраны на сервере; Reason — раунды LLM (intent/plan);
Act — вызовы tools; Verify — разбор JSON результатов (и опционально AGENT_VERIFY_LLM_PASS);
Conclude — финальный ответ. Рефлексия: reflect / finish; лимит раундов — AGENT_MAX_TOOL_STEPS.
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
    llm_inference_configured,
    resolve_llm_chat_base_url,
    resolve_llm_model,
    tool_calls_from_message,
)
from app.agent.policy import initial_messages
from app.agent.reasoning_runtime import (
    StructuredReasoningRun,
    main_loop_task_kind,
    run_router_intent,
)
from app.agent.tool_registry import invoke_tool, llm_tools_payload
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.agent.verify_tool_llm import summarize_tool_round_for_verifier
from app.core.config import settings
from app.models import User


def _max_tool_steps() -> int:
    n = int(getattr(settings, "AGENT_MAX_TOOL_STEPS", 5) or 5)
    return max(1, min(n, 20))


def _verify_tool_result(tool_name: str, result_json: str) -> dict[str, Any]:
    """Краткая проверка результата инструмента для фазы verify (без повторного вызова LLM)."""
    try:
        d = json.loads(result_json)
    except json.JSONDecodeError:
        return {"tool": tool_name, "parse_ok": False}
    if not isinstance(d, dict):
        return {"tool": tool_name, "parse_ok": True, "shape": "non_object"}
    if d.get("error"):
        return {"tool": tool_name, "ok": False, "error": str(d.get("error"))[:160]}
    if d.get("requires_confirmation"):
        return {"tool": tool_name, "ok": True, "gate": "confirmation"}
    if d.get("sandbox"):
        return {"tool": tool_name, "ok": True, "gate": "sandbox"}
    return {"tool": tool_name, "ok": True}


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
    if not llm_inference_configured():
        raise RuntimeError("LLM inference is not configured")

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

    messages: list[dict[str, Any]] = initial_messages(
        context_block=context_block, user_message=user_message
    )
    if reasoning and reasoning.router:
        hint = json.dumps(reasoning.router, ensure_ascii=False)[:800]
        messages[0]["content"] = (
            f"{messages[0]['content']}\n\nПодсказка маршрутизатора (intent/topics): {hint}"
        )

    tools = llm_tools_payload(session, user)
    max_steps = _max_tool_steps()
    base = resolve_llm_chat_base_url() or ""
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
                trace.add_step("reason", round_index=step_idx)
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
                verify_notes: list[dict[str, Any]] = []
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
                    verify_notes.append(_verify_tool_result(name, result))
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
                if reasoning:
                    reasoning.verify_rounds.append(list(verify_notes))
                if trace:
                    trace.add_step("act", detail="tool_round_complete", tool_count=len(verify_notes))
                    trace.add_step("verify", tool_results=verify_notes)
                if (
                    trace
                    and verify_notes
                    and bool(getattr(settings, "AGENT_VERIFY_LLM_PASS", False))
                    and llm_inference_configured()
                ):
                    try:
                        vtext = await summarize_tool_round_for_verifier(
                            user_message=user_message,
                            verify_notes=verify_notes,
                        )
                        trace.add_step(
                            "verify_llm",
                            summary=(vtext or "")[:800],
                        )
                    except Exception as e:
                        trace.add_step("verify_llm_error", error=str(e)[:240])
                continue

            if text:
                if trace:
                    trace.add_step(
                        "conclude",
                        detail="response_ready",
                        rounds=step_idx + 1,
                        chars=len(text),
                    )
                    trace.add_step("finish", detail="assistant_text", rounds=step_idx + 1)
                return text
            if trace:
                trace.add_step("reflect", detail="empty_choice_break")
            break

        if trace:
            trace.add_step("conclude", detail="max_steps_or_empty_fallback")
            trace.add_step("finish", detail="max_steps_or_empty_fallback_text")
        return await llm_adapter.chat_completion_text_only(
            messages=messages,
            task_kind=loop_kind,
        )
