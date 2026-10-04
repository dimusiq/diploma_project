"""
Evaluation / Trace / Audit: шаги цикла агента, вызовы инструментов, запись в лог.

"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.agent.policy import redact_pii
from app.agent.untrusted import safe_payload_meta

_audit = logging.getLogger("app.agent.audit")

# Поля, которые раньше тащили сырые превью данных склада / аргументы tools.
_SENSITIVE_PREVIEW_KEYS = frozenset(
    {
        "args_preview",
        "result_preview",
        "input_preview",
        "output_preview",
        "body_prefix",
        "summary",
        "content",
        "message",
        "text",
        "error",
    }
)


@dataclass
class AgentTrace:
    """Трассировка одного запуска (observe → reason → act → verify → conclude → finish)."""

    run_id: str
    steps: list[dict[str, Any]] = field(default_factory=list)
    t0: float = field(default_factory=time.perf_counter)
    internal_reasoning: dict[str, Any] | None = None

    @classmethod
    def new(cls) -> AgentTrace:
        return cls(run_id=str(uuid.uuid4()))

    def add_step(self, phase: str, **payload: Any) -> None:
        self.steps.append(
            {
                "phase": phase,
                "elapsed_ms": round((time.perf_counter() - self.t0) * 1000, 2),
                **payload,
            }
        )


def _sanitize_for_audit(value: Any, *, depth: int = 0) -> Any:
    """Рекурсивно маскирует PII и заменяет длинные/чувствительные строки на meta."""
    if depth > 8:
        return "[truncated]"
    if isinstance(value, str):
        redacted = redact_pii(value)
        if len(redacted) > 240:
            return safe_payload_meta(redacted, preview_len=80)
        return redacted
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            key = str(k)
            if key in _SENSITIVE_PREVIEW_KEYS and isinstance(v, str):
                out[key] = safe_payload_meta(v, preview_len=80)
            else:
                out[key] = _sanitize_for_audit(v, depth=depth + 1)
        return out
    if isinstance(value, list):
        return [_sanitize_for_audit(x, depth=depth + 1) for x in value[:100]]
    return value


def log_trace_audit(trace: AgentTrace) -> None:
    """Структурированная запись для SIEM / последующего анализа (без сырого PII)."""
    payload: dict[str, Any] = {
        "run_id": trace.run_id,
        "step_count": len(trace.steps),
        "steps": _sanitize_for_audit(trace.steps),
    }
    if trace.internal_reasoning is not None:
        payload["internal_reasoning"] = _sanitize_for_audit(trace.internal_reasoning)
    _audit.info(json.dumps(payload, ensure_ascii=False, default=str))
