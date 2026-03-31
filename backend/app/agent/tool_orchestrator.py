"""
Оркестрация read-инструментов в коде: план по intent (router) и ключевым словам,
вызовы через registry, один проход генерации текста в vLLM без tool_calls.
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlmodel import Session

from app.agent import llm_adapter
from app.agent.answer_guardrails import apply_numeric_grounding_guardrail
from app.agent.llm_adapter import LlmTaskKind, llm_inference_configured, resolve_llm_model
from app.agent.policy import initial_messages
from app.agent.reasoning_runtime import StructuredReasoningRun, main_loop_task_kind, run_router_intent
from app.agent.tool_registry import invoke_tool
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.agent.verify_tool_llm import summarize_tool_round_for_verifier
from app.core.config import settings
from app.models import User

_READ_EQUIPMENT = "get_equipment_status"
_READ_MAINT = "get_maintenance_calendar_events"
_READ_INV = "get_inventory_summary"
_READ_LAYOUT = "get_layout_topology"
_READ_TASKS = "get_open_tasks"
_READ_EXPIRING = "get_expiring_inventory"
_READ_EVENTS = "get_recent_events"
_READ_ZONE = "list_zone_congestion"


def _msg_lower(msg: str) -> str:
    return (msg or "").lower()


def _wants_maintenance(text: str) -> bool:
    return bool(
        re.search(
            r"(то\b|т\.?\s*о\.?\b|техобслуж|моточас|просроч|календар|планов|maintenance|overdue)",
            text,
            re.I,
        )
    )


def _wants_equipment(text: str) -> bool:
    return bool(
        re.search(
            r"(техник|парк\s+тех|погрузчик|forklift|equipment|единиц.*тех)",
            text,
            re.I,
        )
    )


def _wants_inventory(text: str) -> bool:
    return bool(
        re.search(
            r"(остат|запас|инвентар|sku|товар|складск|inventory|stock)",
            text,
            re.I,
        )
    )


def _wants_layout(text: str) -> bool:
    return bool(
        re.search(
            r"(тополог|layout|ячейк|слот|ряд|карт.*склад)",
            text,
            re.I,
        )
    )


def _wants_tasks(text: str) -> bool:
    return bool(
        re.search(
            r"(задач|задани|пикинг|отбор|warehouse.?task|tasks?\b)",
            text,
            re.I,
        )
    )


def _wants_expiring(text: str) -> bool:
    return bool(
        re.search(
            r"(срок\s+годност|годност|просрочен.*товар|expir)",
            text,
            re.I,
        )
    )


def _wants_events(text: str) -> bool:
    return bool(
        re.search(
            r"(событ|аудит|журнал|domain.?event|event\s+log)",
            text,
            re.I,
        )
    )


def _wants_congestion(text: str) -> bool:
    return bool(
        re.search(
            r"(загрузк|конгест|перегруж|congestion|зон.*загруз)",
            text,
            re.I,
        )
    )


def _max_tools_cap() -> int:
    n = int(getattr(settings, "AGENT_CODE_ORCH_MAX_TOOLS", 5) or 5)
    return max(1, min(n, 10))


def _max_tool_chars() -> int:
    n = int(getattr(settings, "AGENT_CODE_ORCH_MAX_TOOL_CHARS", 14000) or 14000)
    return max(2000, min(n, 100_000))


def plan_read_tools(user_message: str, router: dict[str, Any] | None) -> list[tuple[str, dict[str, Any]]]:
    """
    Возвращает упорядоченный список (имя read-инструмента, аргументы).
    Только инструменты из каталога с пустыми/простыми аргументами — без act/propose.
    """
    msg = _msg_lower(user_message)
    intent = ""
    if router and isinstance(router.get("intent"), str):
        intent = str(router["intent"]).strip().lower()

    out: list[tuple[str, dict[str, Any]]] = []
    cap = _max_tools_cap()

    def add(name: str, args: dict[str, Any] | None = None) -> None:
        if len(out) >= cap:
            return
        args = dict(args or {})
        if any(n == name for n, _ in out):
            return
        out.append((name, args))

    def apply_keywords() -> None:
        if _wants_inventory(msg):
            add(_READ_INV)
        if _wants_tasks(msg):
            add(_READ_TASKS, {"limit": 40})
        if _wants_layout(msg):
            add(_READ_LAYOUT)
        if _wants_congestion(msg):
            add(_READ_ZONE, {"limit_rows": 15})
        if _wants_equipment(msg):
            add(_READ_EQUIPMENT, {"limit": 100})
        if _wants_maintenance(msg):
            add(_READ_MAINT, {"limit": 50})
        if _wants_expiring(msg):
            add(_READ_EXPIRING, {"days": 30, "limit": 50})
        if _wants_events(msg):
            add(_READ_EVENTS, {"limit": 30})

    if intent == "inventory":
        add(_READ_INV)
        if _wants_expiring(msg):
            add(_READ_EXPIRING, {"days": 30, "limit": 50})
        return out

    if intent == "layout":
        add(_READ_LAYOUT)
        if _wants_congestion(msg):
            add(_READ_ZONE, {"limit_rows": 15})
        return out

    if intent == "equipment":
        add(_READ_EQUIPMENT, {"limit": 100})
        if _wants_maintenance(msg):
            add(_READ_MAINT, {"limit": 50})
        return out

    if intent == "tasks":
        add(_READ_TASKS, {"limit": 40})
        return out

    if intent in ("question", "other", ""):
        apply_keywords()
        return out

    apply_keywords()
    return out


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


def _truncate_tool_json(s: str) -> str:
    lim = _max_tool_chars()
    if len(s) <= lim:
        return s
    return s[:lim] + "\n…(усечено для LLM)"


async def run_code_orchestrated_turn(
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

    router: dict[str, Any] | None = None
    if reasoning:
        ri = await run_router_intent(user_message)
        if ri is not None:
            router = ri
            reasoning.router = ri
            if trace:
                trace.add_step(
                    "router_intent",
                    intent=str(ri.get("intent", ""))[:64],
                    topics=ri.get("topics"),
                )

    plan = plan_read_tools(user_message, router)
    if trace:
        trace.add_step(
            "code_orchestration_plan",
            tools=[p[0] for p in plan],
            intent=(router or {}).get("intent"),
        )

    verify_notes: list[dict[str, Any]] = []
    tool_payload: list[dict[str, Any]] = []

    for tool_name, args in plan:
        raw_s = json.dumps(args, ensure_ascii=False)
        if trace:
            trace.add_step("code_tool_invoke", tool=tool_name, args_preview=raw_s[:300])
        try:
            result = invoke_tool(session, user, tool_name, raw_s, ctx=tool_ctx)
        except Exception as e:
            if trace:
                trace.add_step("tool_error", tool=tool_name, error=str(e))
            result = json.dumps(
                {"error": f"Исключение при выполнении инструмента: {e!s}"},
                ensure_ascii=False,
            )
        verify_notes.append(_verify_tool_result(tool_name, result))
        if reasoning:
            reasoning.tool_calls.append(
                {
                    "name": tool_name,
                    "args_preview": raw_s[:400],
                    "result_preview": result[:500],
                }
            )
        tool_payload.append(
            {
                "tool": tool_name,
                "arguments": args,
                "result_json": _truncate_tool_json(result),
            }
        )

    if reasoning:
        reasoning.verify_rounds.append(list(verify_notes))
        reasoning.llm_rounds = 1

    if trace:
        trace.add_step("verify", tool_results=verify_notes)
        if (
            verify_notes
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

    messages = initial_messages(
        context_block=context_block,
        user_message=user_message,
    )
    if tool_payload:
        blob = json.dumps({"automatic_read_tools": tool_payload}, ensure_ascii=False)
        messages[-1]["content"] += (
            "\n\nРезультаты автоматических запросов к данным (JSON). "
            "Используй только факты отсюда и из блока контекста выше; не выдумывай числа:\n"
            + blob
        )

    if trace:
        trace.add_step(
            "observe",
            detail="code_orchestration_messages_ready",
            tool_defs=0,
            main_model=main_model,
            task_kind=loop_kind.value,
        )
        trace.add_step("reason", round_index=0, detail="single_pass_no_llm_tools")

    text = await llm_adapter.chat_completion_text_only(
        messages=messages,
        task_kind=loop_kind,
    )
    text = apply_numeric_grounding_guardrail(text, messages)
    if trace:
        trace.add_step("conclude", detail="code_orchestration_response", chars=len(text or ""))
        trace.add_step("finish", detail="assistant_text", rounds=1)
    return text
