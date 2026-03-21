"""Структурированный лог вызовов инструментов (actor, run_id, вход/выход)."""

from __future__ import annotations

import json
import logging
import uuid

from app.agent.tool_safety import ToolSafetyClass

_log = logging.getLogger("app.agent.tools")


def log_tool_run(
    *,
    run_id: str,
    actor_user_id: uuid.UUID,
    tool_name: str,
    safety: ToolSafetyClass | str,
    tool_input: str,
    tool_output: str,
) -> None:
    lim = 800
    sval = safety.value if isinstance(safety, ToolSafetyClass) else str(safety)
    _log.info(
        json.dumps(
            {
                "run_id": run_id,
                "actor_user_id": str(actor_user_id),
                "tool": tool_name,
                "safety": sval,
                "input_preview": tool_input[:lim],
                "output_preview": tool_output[:lim],
            },
            ensure_ascii=False,
        )
    )
