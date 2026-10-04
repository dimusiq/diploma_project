"""Цикл LLM → tools (раунды, 400-fallback на tool_choice/tools, invoke_tool)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
from sqlmodel import Session

from app.agent import llm_adapter
from app.agent.agent_errors import (
    AgentUpstreamBadRequestError,
    chat_completion_400_implies_tools_unsupported,
)
from app.agent.llm_adapter import (
    LlmTaskKind,
    extract_assistant_message,
    llm_inference_configured,
    tool_calls_from_message,
)
from app.agent.policy import redact_audit
from app.agent.reasoning_runtime import StructuredReasoningRun
from app.agent.structured_final import _resolve_final_text
from app.agent.tool_force_router import must_use_tool
from app.agent.tool_registry import invoke_tool
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.agent.untrusted import wrap_untrusted
from app.agent.verify_tool_llm import summarize_tool_round_for_verifier
from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)


def _verify_tool_result(tool_name: str, result_json: str) -> dict[str, Any]:
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


async def _run_structured_tool_phases(
    client: httpx.AsyncClient,
    url: str,
    *,
    session: Session,
    user: User,
    messages: list[dict[str, Any]],
    tools: list[Any],
    max_rounds: int,
    user_message: str,
    loop_kind: LlmTaskKind,
    main_model: str,
    sampling: dict[str, Any],
    tool_ctx: AgentToolContext | None,
    reasoning: StructuredReasoningRun | None,
    trace: AgentTrace | None,
) -> tuple[str | None, bool, str | None]:
    """
    Цикл LLM + tool rounds. Если первый элемент tuple — str, это уже финальный ответ
    (fallback при HTTP 400). Иначе: (None, had_any_tool, last_text из последнего text-break).
    """
    had_any_tool = False
    last_text: str | None = None

    for round_idx in range(max_rounds):
        if trace:
            trace.add_step("reason", round_index=round_idx)
        if reasoning:
            reasoning.llm_rounds = round_idx + 1

        use_required = (
            round_idx == 0
            and bool(tools)
            and must_use_tool(user_message)
            and bool(getattr(settings, "AGENT_TOOL_CHOICE_REQUIRED_ENABLED", False))
        )
        tool_choice = "required" if use_required else "auto"

        payload: dict[str, Any] = {
            "model": main_model,
            "messages": messages,
            **sampling,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        r = await client.post(url, json=payload)
        if r.status_code == 400 and use_required and tools:
            payload["tool_choice"] = "auto"
            r = await client.post(url, json=payload)
        if r.status_code == 400 and tools and "repetition_penalty" in sampling:
            payload_light: dict[str, Any] = {
                "model": main_model,
                "messages": messages,
                **{k: v for k, v in sampling.items() if k != "repetition_penalty"},
                "tools": tools,
                "tool_choice": payload.get("tool_choice", tool_choice),
            }
            r = await client.post(url, json=payload_light)
        if r.status_code == 400 and tools:
            # Минимальное тело: часть vLLM отклоняет top_p/прочие поля вместе с tools.
            payload_min: dict[str, Any] = {
                "model": main_model,
                "messages": messages,
                "temperature": float(sampling.get("temperature", 0.1)),
                "tools": tools,
                "tool_choice": "auto",
            }
            mt = sampling.get("max_tokens")
            if mt is not None:
                payload_min["max_tokens"] = int(mt)
            r = await client.post(url, json=payload_min)
        if r.status_code == 400:
            if chat_completion_400_implies_tools_unsupported(r):
                if trace:
                    trace.add_step(
                        "reflect", detail="tools_not_supported_fallback_text"
                    )
                fb = await llm_adapter.chat_completion_text_only_compat(
                    messages=messages, task_kind=loop_kind
                )
                resolved = await _resolve_final_text(fb, messages, loop_kind=loop_kind)
                return (resolved, False, None)
            try:
                if trace:
                    trace.add_step(
                        "reflect",
                        detail="upstream_400_fallback_text_compat",
                        body_prefix=(r.text or "")[:400],
                    )
                fb = await llm_adapter.chat_completion_text_only_compat(
                    messages=messages, task_kind=loop_kind
                )
                resolved = await _resolve_final_text(fb, messages, loop_kind=loop_kind)
                return (resolved, False, None)
            except Exception as e:
                logger.warning(
                    "agent_upstream_400_fallback_compat_failed: %s",
                    e,
                    exc_info=True,
                )
                raise AgentUpstreamBadRequestError(
                    "Сервис вывода отклонил запрос (HTTP 400). Проверьте модель и URL inference. "
                    "Частая причина: неподдерживаемые поля в теле запроса — в .env задайте "
                    "AGENT_LLM_SEND_REPETITION_PENALTY=false или обновите vLLM.",
                    internal_detail=(r.text or "")[:2000],
                ) from e

        r.raise_for_status()
        data = r.json()
        text, msg = extract_assistant_message(data)
        tcalls = tool_calls_from_message(msg)

        if tcalls:
            had_any_tool = True
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
                    # Sync ORM/DES вне event loop — иначе блокируются SSE и прочие запросы.
                    result = await asyncio.to_thread(
                        invoke_tool,
                        session,
                        user,
                        name,
                        raw_s,
                        ctx=tool_ctx,
                        trace=trace,
                    )
                except Exception as e:
                    if trace:
                        trace.add_step("tool_error", tool=name, error=str(e))
                    result = json.dumps(
                        {"error": f"Исключение при выполнении инструмента: {e!s}"},
                        ensure_ascii=False,
                    )
                verify_notes.append(_verify_tool_result(name, result))
                if reasoning:
                    reasoning.tool_calls.append(
                        {
                            "name": name,
                            "args_preview": redact_audit(raw_s)[:400],
                            "result_preview": redact_audit(result)[:500],
                        }
                    )
                tid = str(tc.get("id") or "call_0")
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tid,
                        "content": wrap_untrusted(
                            "tool_result", result, source=name or "tool"
                        ),
                    }
                )
            if reasoning:
                reasoning.verify_rounds.append(list(verify_notes))
            if trace:
                trace.add_step(
                    "act", detail="tool_round_complete", tool_count=len(verify_notes)
                )
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
                    trace.add_step("verify_llm", summary=(vtext or "")[:800])
                except Exception as e:
                    trace.add_step("verify_llm_error", error=str(e)[:240])
            continue

        last_text = text or ""
        break

    return (None, had_any_tool, last_text)
