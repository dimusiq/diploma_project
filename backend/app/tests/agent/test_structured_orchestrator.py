"""Structured-контур: verify tool, финальный ответ, HTTP 400 compat, tool-раунд."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest

from app.agent.answer_guardrails import GUARDRAIL_FALLBACK_REPLY
from app.agent.contracts import AgentToolContext
from app.agent.llm_adapter import LlmTaskKind
from app.agent.response_validation import FORMAT_ERROR_REPLY
from app.agent.structured_final import (
    _post_chat_completion_after_tools,
    _resolve_final_text,
    _stop_sequences,
)
from app.agent.structured_tool_loop import (
    _run_structured_tool_phases,
    _verify_tool_result,
)
from app.agent.trace import AgentTrace
from app.core.config import settings


def test_verify_tool_result_shapes() -> None:
    assert _verify_tool_result("t", "{")["parse_ok"] is False
    assert _verify_tool_result("t", "[1]")["shape"] == "non_object"
    assert _verify_tool_result("t", json.dumps({"error": "x"}))["ok"] is False
    assert (
        _verify_tool_result("t", json.dumps({"requires_confirmation": True}))["gate"]
        == "confirmation"
    )
    assert _verify_tool_result("t", json.dumps({"sandbox": True}))["gate"] == "sandbox"
    assert _verify_tool_result("t", json.dumps({"ok": True, "n": 1}))["ok"] is True


def test_stop_sequences_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AGENT_LLM_STOP_SEQUENCES_STR", "</answer>,###")
    assert _stop_sequences() == ["</answer>", "###"]


def test_resolve_final_text_accepts_grounded_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", True)
    messages = [
        {"role": "user", "content": "на складе 12 позиций"},
        {"role": "tool", "content": '{"count": 12}'},
    ]

    async def _run() -> str:
        return await _resolve_final_text(
            "<answer>На складе 12 позиций.</answer>",
            messages,
            loop_kind=LlmTaskKind.CHAT,
        )

    out = asyncio.run(_run())
    assert "<answer>" in out
    assert "12" in out


def test_resolve_final_text_numbers_guardrail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", True)
    messages = [{"role": "user", "content": "остатки без цифр"}]

    async def _run() -> str:
        return await _resolve_final_text(
            "<answer>Всего ровно 999 единиц.</answer>",
            messages,
            loop_kind=LlmTaskKind.CHAT,
        )

    out = asyncio.run(_run())
    assert out == GUARDRAIL_FALLBACK_REPLY


def test_resolve_final_text_format_retry_then_ok(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", False)

    async def fake_text_only(**_kwargs: Any) -> str:
        return "<answer>fixed-ok</answer>"

    monkeypatch.setattr(
        "app.agent.structured_final.llm_adapter.chat_completion_text_only",
        fake_text_only,
    )

    async def _run() -> str:
        # Пустой raw → format-ошибка → retry через chat_completion_text_only.
        return await _resolve_final_text(
            "",
            [{"role": "user", "content": "q"}],
            loop_kind=LlmTaskKind.CHAT,
        )

    out = asyncio.run(_run())
    assert "fixed-ok" in out


def test_resolve_final_text_format_retry_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", False)

    async def fake_text_only(**_kwargs: Any) -> str:
        raise RuntimeError("llm down")

    monkeypatch.setattr(
        "app.agent.structured_final.llm_adapter.chat_completion_text_only",
        fake_text_only,
    )

    async def _run() -> str:
        return await _resolve_final_text(
            "",
            [{"role": "user", "content": "q"}],
            loop_kind=LlmTaskKind.CHAT,
        )

    out = asyncio.run(_run())
    assert out == FORMAT_ERROR_REPLY


def test_post_chat_completion_retries_without_stop() -> None:
    """Первый POST 400 → следующий вариант тела (без stop) даёт текст."""
    calls: list[dict[str, Any]] = []

    class _Resp:
        def __init__(self, status: int, payload: dict[str, Any] | None = None) -> None:
            self.status_code = status
            self._payload = payload or {}
            self.text = json.dumps(self._payload)

        def json(self) -> dict[str, Any]:
            return self._payload

    async def fake_post(_url: str, *, json: dict[str, Any]) -> _Resp:
        calls.append(json)
        if "stop" in json:
            return _Resp(400, {"error": {"message": "stop not supported"}})
        return _Resp(
            200,
            {
                "choices": [
                    {"message": {"role": "assistant", "content": "<answer>ok</answer>"}}
                ]
            },
        )

    client = MagicMock()
    client.post = fake_post
    sampling = {"temperature": 0.1, "repetition_penalty": 1.1}

    async def _run() -> str | None:
        return await _post_chat_completion_after_tools(
            client,
            "http://llm/v1/chat/completions",
            main_model="m",
            messages=[{"role": "user", "content": "q"}],
            sampling=sampling,
            stop=["</answer>"],
            loop_kind=LlmTaskKind.CHAT,
        )

    out = asyncio.run(_run())
    assert out is not None and "ok" in out
    assert any("stop" in c for c in calls)
    assert any("stop" not in c and "repetition_penalty" not in c for c in calls)


def test_tool_phases_invokes_tool_and_wraps_untrusted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_TOOL_CHOICE_REQUIRED_ENABLED", False)
    monkeypatch.setattr(
        "app.agent.structured_tool_loop.must_use_tool", lambda _q: False
    )

    tool_msg = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "get_inventory_summary",
                    "arguments": "{}",
                },
            }
        ],
    }
    text_msg = {
        "role": "assistant",
        "content": "<answer>итог</answer>",
    }
    req = httpx.Request("POST", "http://llm/v1/chat/completions")
    responses = [
        httpx.Response(
            200,
            json={"choices": [{"message": tool_msg}]},
            request=req,
        ),
        httpx.Response(
            200,
            json={"choices": [{"message": text_msg}]},
            request=req,
        ),
    ]

    async def fake_post(_url: str, *, json: dict[str, Any]) -> httpx.Response:
        _ = json
        return responses.pop(0)

    async def fake_to_thread(_fn: Any, *_args: Any, **_kwargs: Any) -> str:
        return json.dumps({"items_status_warehouse": 7})

    monkeypatch.setattr(
        "app.agent.structured_tool_loop.asyncio.to_thread", fake_to_thread
    )

    client = MagicMock()
    client.post = fake_post
    messages: list[dict[str, Any]] = [{"role": "user", "content": "остатки"}]
    trace = AgentTrace.new()

    async def _run() -> tuple[str | None, bool, str | None]:
        return await _run_structured_tool_phases(
            client,
            "http://llm/v1/chat/completions",
            session=MagicMock(),
            user=MagicMock(),
            messages=messages,
            tools=[{"type": "function", "function": {"name": "get_inventory_summary"}}],
            max_rounds=3,
            user_message="остатки",
            loop_kind=LlmTaskKind.CHAT,
            main_model="m",
            sampling={"temperature": 0.1},
            tool_ctx=AgentToolContext(
                run_id=trace.run_id,
                actor_user_id=uuid.uuid4(),
                sandbox=True,
                allow_mutating_tools=False,
                is_superuser=False,
            ),
            reasoning=None,
            trace=trace,
        )

    early, had_tool, last = asyncio.run(_run())
    assert early is None
    assert had_tool is True
    assert last is not None and "итог" in last
    tool_roles = [m for m in messages if m.get("role") == "tool"]
    assert len(tool_roles) == 1
    assert "UNTRUSTED_" in str(tool_roles[0].get("content"))
    assert any(s.get("phase") == "act" for s in trace.steps)


def test_tool_phases_400_tools_unsupported_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_TOOL_CHOICE_REQUIRED_ENABLED", False)
    monkeypatch.setattr(settings, "AGENT_ANSWER_GUARDRAIL_ENABLED", False)

    async def fake_post(_url: str, *, json: dict[str, Any]) -> httpx.Response:
        _ = json
        return httpx.Response(
            400,
            json={"error": {"message": "tools are not supported"}},
            request=httpx.Request("POST", _url),
        )

    async def fake_compat(*, messages: list[dict[str, Any]], task_kind: Any) -> str:
        _ = messages, task_kind
        return "<answer>fallback text</answer>"

    monkeypatch.setattr(
        "app.agent.structured_tool_loop.llm_adapter.chat_completion_text_only_compat",
        fake_compat,
    )

    client = MagicMock()
    client.post = fake_post
    messages: list[dict[str, Any]] = [{"role": "user", "content": "q"}]

    async def _run() -> tuple[str | None, bool, str | None]:
        return await _run_structured_tool_phases(
            client,
            "http://llm/v1/chat/completions",
            session=MagicMock(),
            user=MagicMock(),
            messages=messages,
            tools=[{"type": "function", "function": {"name": "get_inventory_summary"}}],
            max_rounds=2,
            user_message="привет",
            loop_kind=LlmTaskKind.CHAT,
            main_model="m",
            sampling={"temperature": 0.1},
            tool_ctx=None,
            reasoning=None,
            trace=AgentTrace.new(),
        )

    early, had_tool, last = asyncio.run(_run())
    assert early is not None and "fallback text" in early
    assert had_tool is False
    assert last is None
