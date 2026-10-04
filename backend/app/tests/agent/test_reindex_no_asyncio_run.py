"""reindex_knowledge не вызывает asyncio.run в потоке с активным loop."""

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
    # Патчим модуль реализации (act), не фасад.
    monkeypatch.setattr(act, "_act_gate", lambda *a, **k: None)

    async def fake_embed_all(_session: object) -> tuple[int, int]:
        return (2, 1)

    monkeypatch.setattr(act, "embed_all_chunks", fake_embed_all)

    class _SessCM:
        def __enter__(self) -> MagicMock:
            s = MagicMock()
            return s

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(act, "Session", lambda *_a, **_k: _SessCM())

    session = MagicMock()
    user = MagicMock()

    async def call_from_loop() -> str:
        return handlers.handle_reindex_knowledge(session, user, {}, MagicMock())

    out = json.loads(asyncio.run(call_from_loop()))
    assert out["ok"] is True
    assert out["chunks_embedded"] == 2
    assert out["chunks_failed"] == 1
