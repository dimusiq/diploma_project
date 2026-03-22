"""
Evaluation / Trace / Audit: шаги цикла агента, вызовы инструментов, запись в лог.

Полноценная оценка качества и offline benchmark — в `evaluation.py`.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

_audit = logging.getLogger("app.agent.audit")


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


def log_trace_audit(trace: AgentTrace) -> None:
    """Структурированная запись для SIEM / последующего анализа (без полного текста PII)."""
    payload: dict[str, Any] = {
        "run_id": trace.run_id,
        "step_count": len(trace.steps),
        "steps": trace.steps,
    }
    if trace.internal_reasoning is not None:
        payload["internal_reasoning"] = trace.internal_reasoning
    _audit.info(json.dumps(payload, ensure_ascii=False))
