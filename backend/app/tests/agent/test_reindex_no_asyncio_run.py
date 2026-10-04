"""reindex_knowledge не вызывает asyncio.run (sync embed path)."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import MagicMock

import pytest

from app.services import agent_tools_act as act
from app.services import agent_tools_handlers as handlers


def test_reindex_knowledge_works_inside_running_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(act, "_act_gate", lambda *a, **k: None)

    def fake_embed_all(_session: object) -> tuple[int, int]:
        return (2, 1)

    monkeypatch.setattr(act, "embed_all_chunks_sync", fake_embed_all)

    session = MagicMock()
    user = MagicMock()

    async def call_from_loop() -> str:
        return handlers.handle_reindex_knowledge(session, user, {}, MagicMock())

    out = json.loads(asyncio.run(call_from_loop()))
    assert out["ok"] is True
    assert out["chunks_embedded"] == 2
    assert out["chunks_failed"] == 1
    session.commit.assert_called()


def test_reindex_knowledge_does_not_call_asyncio_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(act, "_act_gate", lambda *a, **k: None)
    monkeypatch.setattr(act, "embed_all_chunks_sync", lambda _s: (1, 0))

    def _boom(*_a: object, **_k: object) -> object:
        raise AssertionError("asyncio.run must not be used in reindex_knowledge")

    monkeypatch.setattr(asyncio, "run", _boom)

    out = json.loads(
        handlers.handle_reindex_knowledge(MagicMock(), MagicMock(), {}, MagicMock())
    )
    assert out["ok"] is True
