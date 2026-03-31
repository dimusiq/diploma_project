"""
Финальный контур: router (must_use_tool) → LLM+tools → при необходимости финальный LLM с grounding
→ валидация формата и чисел → retry при ошибке формата.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx
from sqlmodel import Session

from app.agent import llm_adapter
from app.agent.agent_errors import (
    AgentUpstreamBadRequestError,
    chat_completion_400_implies_tools_unsupported,
)
from app.agent.answer_guardrails import GUARDRAIL_FALLBACK_REPLY, collect_grounding_text
from app.agent.generation_config import generation_config_openai
from app.agent.llm_adapter import (
    LlmTaskKind,
    extract_assistant_message,
    llm_inference_configured,
    resolve_llm_chat_base_url,
    resolve_llm_model,
    tool_calls_from_message,
)
from app.agent.reasoning_runtime import StructuredReasoningRun, main_loop_task_kind
from app.agent.policy import append_router_intent_hint, initial_messages
from app.agent.response_validation import (
    FORMAT_ERROR_REPLY,
    validate_structured_reply,
    wrap_answer_block,
)
from app.agent.tool_force_router import must_use_tool
from app.agent.tool_registry import invoke_tool, llm_tools_payload
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.agent.verify_tool_llm import summarize_tool_round_for_verifier
from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)

GROUNDING_AFTER_TOOLS_SYSTEM = (
    "Используй только данные из контекста склада и из последних сообщений с результатами инструментов. "
    "Не выдумывай числа и факты, которых там нет."
)

STRICT_FORMAT_RETRY_SYSTEM = (
    "Повтори ответ. Обязательно одна пара тегов <answer>...</answer>, внутри только факты. "
    "Без текста до <answer> и после </answer>."
)


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


def _stop_sequences() -> list[str]:
    raw = getattr(settings, "AGENT_LLM_STOP_SEQUENCES_STR", "</answer>") or "</answer>"
    return [x.strip() for x in str(raw).split(",") if x.strip()]


async def _post_chat_completion_after_tools(
    client: httpx.AsyncClient,
    url: str,
    *,
    main_model: str,
    messages: list[dict[str, Any]],
    sampling: dict[str, Any],
    stop: list[str],
    loop_kind: LlmTaskKind,
) -> str | None:
    """
    Финальный non-streaming вызов после tool-rounds.
    Раньше при HTTP 400 ответ терялся; vLLM часто принимает тот же запрос без stop или без repetition_penalty.
    """
    bodies: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(body: dict[str, Any]) -> None:
        key = json.dumps(body, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            seen.add(key)
            bodies.append(body)

    add({"model": main_model, "messages": messages, **sampling, "stop": stop})
    if "repetition_penalty" in sampling:
        light = {k: v for k, v in sampling.items() if k != "repetition_penalty"}
        add({"model": main_model, "messages": messages, **light, "stop": stop})
        add({"model": main_model, "messages": messages, **light})
    else:
        add({"model": main_model, "messages": messages, **sampling})

    for body in bodies:
        r2 = await client.post(url, json=body)
        if r2.status_code != 200:
            continue
        data2 = r2.json()
        t2, _ = extract_assistant_message(data2)
        if t2 and t2.strip():
            return t2
    try:
        return await llm_adapter.chat_completion_text_only_compat(
            messages=messages, task_kind=loop_kind
        )
    except Exception:
        return None


async def _resolve_final_text(
    raw: str,
    messages: list[dict[str, Any]],
    *,
    loop_kind: LlmTaskKind,
) -> str:
    grounding = collect_grounding_text(messages)
    ok, payload = validate_structured_reply(raw, grounding)
    if ok:
        return wrap_answer_block(payload)
    if payload != "format":
        return GUARDRAIL_FALLBACK_REPLY
    messages.append({"role": "system", "content": STRICT_FORMAT_RETRY_SYSTEM})
    try:
        text2 = await llm_adapter.chat_completion_text_only(
            messages=messages,
            task_kind=loop_kind,
            stop=_stop_sequences(),
        )
    except Exception:
        return FORMAT_ERROR_REPLY
    ok2, payload2 = validate_structured_reply(text2, collect_grounding_text(messages))
    if ok2:
        return wrap_answer_block(payload2)
    if payload2 == "format":
        return FORMAT_ERROR_REPLY
    return GUARDRAIL_FALLBACK_REPLY


async def _run_structured_tool_phases(
    client: httpx.AsyncClient,
    url: str,
    *,
    session: Session,
    user: User,
    messages: list[dict[str, Any]],
    tools: list,
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

        use_required = round_idx == 0 and bool(tools) and must_use_tool(user_message)
        tc = "required" if use_required else "auto"

        payload: dict[str, Any] = {
            "model": main_model,
            "messages": messages,
            **sampling,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tc

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
                "tool_choice": payload.get("tool_choice", tc),
            }
            r = await client.post(url, json=payload_light)
        if r.status_code == 400:
            if chat_completion_400_implies_tools_unsupported(r):
                if trace:
                    trace.add_step("reflect", detail="tools_not_supported_fallback_text")
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
                    result = invoke_tool(session, user, name, raw_s, ctx=tool_ctx)
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
                    trace.add_step("verify_llm", summary=(vtext or "")[:800])
                except Exception as e:
                    trace.add_step("verify_llm_error", error=str(e)[:240])
            continue

        last_text = text or ""
        break

    return (None, had_any_tool, last_text)


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
        reasoning.models_used["embedding"] = resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"

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
        trace.add_step("conclude", detail="structured_orchestrator_done", chars=len(out))
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
        reasoning.models_used["embedding"] = resolve_llm_model(LlmTaskKind.EMBEDDING) or "(off)"

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
            trace.add_step("conclude", detail="structured_orchestrator_done", chars=len(out))
            trace.add_step(
                "finish",
                detail="assistant_text",
                rounds=(reasoning.llm_rounds if reasoning else 0),
            )
        yield {"type": "done", "reply": out}
