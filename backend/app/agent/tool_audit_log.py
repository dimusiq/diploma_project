"""Структурированный лог вызовов инструментов (actor, run_id, метаданные входа/выхода)."""

from __future__ import annotations

import json
import logging
import uuid

from app.agent.tool_safety import ToolSafetyClass
from app.agent.untrusted import safe_payload_meta

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
    """Пишет только длину/хеш/усечённый redact preview — без сырых payload'ов склада."""
    sval = safety.value if isinstance(safety, ToolSafetyClass) else str(safety)
    _log.info(
        json.dumps(
            {
                "run_id": run_id,
                "actor_user_id": str(actor_user_id),
                "tool": tool_name,
                "safety": sval,
                "input": safe_payload_meta(tool_input),
                "output": safe_payload_meta(tool_output),
            },
            ensure_ascii=False,
        )
    )
