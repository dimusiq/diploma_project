"""Логи tools/audit не содержат сырых PII и полных payload'ов."""

from __future__ import annotations

import json
import logging
import uuid

from app.agent.tool_audit_log import log_tool_run
from app.agent.tool_safety import ToolSafetyClass
from app.agent.trace import AgentTrace, log_trace_audit


def test_log_tool_run_masks_pii_and_uses_hash(caplog) -> None:
    payload_in = json.dumps(
        {"q": "клиент ops@warehouse.test тел +7 999 111-22-33 ИНН 7707083893"},
        ensure_ascii=False,
    )
    payload_out = json.dumps(
        {"items": [{"name": "A", "owner_email": "a@b.com"}], "inn": "500100732259"},
        ensure_ascii=False,
    )
    with caplog.at_level(logging.INFO, logger="app.agent.tools"):
        log_tool_run(
            run_id="run-1",
            actor_user_id=uuid.uuid4(),
            tool_name="get_inventory_summary",
            safety=ToolSafetyClass.READ,
            tool_input=payload_in,
            tool_output=payload_out,
        )
    assert caplog.records
    text = caplog.records[-1].getMessage()
    assert "ops@warehouse.test" not in text
    assert "a@b.com" not in text
    assert "+7 999 111-22-33" not in text
    assert "7707083893" not in text
    assert "500100732259" not in text
    assert "input_preview" not in text
    assert "output_preview" not in text
    data = json.loads(text)
    assert data["input"]["chars"] == len(payload_in)
    assert data["output"]["chars"] == len(payload_out)
    assert len(data["input"]["sha256_16"]) == 16
    assert "[email]" in data["input"]["preview"] or "[inn]" in data["input"]["preview"]


def test_log_trace_audit_redacts_step_previews(caplog) -> None:
    trace = AgentTrace.new()
    trace.add_step(
        "act",
        args_preview='{"email":"leak@example.com","inn":"7707083893"}',
        result_preview="телефон +7 (495) 123-45-67",
    )
    trace.internal_reasoning = {
        "tool_calls": [
            {
                "name": "get_inventory_summary",
                "args_preview": "mail leak@example.com",
                "result_preview": "ИНН 500100732259",
            }
        ]
    }
    with caplog.at_level(logging.INFO, logger="app.agent.audit"):
        log_trace_audit(trace)
    text = caplog.records[-1].getMessage()
    assert "leak@example.com" not in text
    assert "7707083893" not in text
    assert "500100732259" not in text
    assert "+7 (495) 123-45-67" not in text
    data = json.loads(text)
    step0 = data["steps"][0]
    assert isinstance(step0["args_preview"], dict)
    assert "sha256_16" in step0["args_preview"]
