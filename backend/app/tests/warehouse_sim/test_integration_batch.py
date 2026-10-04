"""Батч-commit интеграции и отсутствие блокировки event loop при fast-forward."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.warehouse_sim.integration import apply_integration_queue
from app.warehouse_sim.runtime import FF_CHUNK_MODEL_SEC, WarehouseSimRuntime


def test_apply_integration_queue_one_commit_per_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Было: commit на каждую запись; стало: один commit на батч."""
    commits: list[int] = []
    session = MagicMock()
    session.commit.side_effect = lambda: commits.append(1)

    ctx = MagicMock()
    monkeypatch.setattr(
        "app.warehouse_sim.integration._DomainCtx.from_session",
        lambda _s, _w: ctx,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration._apply_one",
        lambda _ctx, _rec: {},
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration._publish_integration",
        lambda **_kw: None,
    )

    n = 12
    queue = [{"type": f"evt-{i}"} for i in range(n)]
    world: dict[str, Any] = {"bridge": {}, "integration_queue": []}
    result = apply_integration_queue(session, world, queue=queue)

    assert result["applied"] == n
    assert result["errors"] == 0
    assert result["commits"] == 1
    assert len(commits) == 1  # до: было бы n


def test_apply_integration_queue_requeues_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock()
    ctx = MagicMock()
    monkeypatch.setattr(
        "app.warehouse_sim.integration._DomainCtx.from_session",
        lambda _s, _w: ctx,
    )

    def _apply(_ctx: object, rec: dict[str, Any]) -> dict[str, Any]:
        if rec.get("type") == "bad":
            raise RuntimeError("boom")
        return {}

    monkeypatch.setattr("app.warehouse_sim.integration._apply_one", _apply)
    monkeypatch.setattr(
        "app.warehouse_sim.integration._publish_integration",
        lambda **_kw: None,
    )

    # Явно переданная очередь: world не дренируется и при ошибке не дублируется.
    queue = [{"type": "ok"}, {"type": "bad"}, {"type": "later"}]
    world: dict[str, Any] = {"bridge": {}, "integration_queue": [{"type": "newer"}]}
    result = apply_integration_queue(session, world, queue=queue)

    assert result["applied"] == 0
    assert result["errors"] == 1
    assert result["requeued"] == 0
    assert result["commits"] == 0
    session.rollback.assert_called()
    session.commit.assert_not_called()
    assert world["integration_queue"] == [{"type": "newer"}]

    # drain из world (queue=None): при ошибке батч возвращается в очередь.
    world2: dict[str, Any] = {
        "bridge": {},
        "integration_queue": [{"type": "ok"}, {"type": "bad"}, {"type": "later"}],
    }
    result2 = apply_integration_queue(session, world2, queue=None)
    assert result2["requeued"] == 3
    assert world2["integration_queue"] == [
        {"type": "ok"},
        {"type": "bad"},
        {"type": "later"},
    ]


def test_fast_forward_async_yields_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    """Параллельный тикер успевает поработать во время FF — loop не заблокирован."""
    rt = WarehouseSimRuntime()
    monkeypatch.setattr(rt, "_flush_integration", lambda: None)

    hits: list[int] = []

    async def ticker() -> None:
        for i in range(8):
            hits.append(i)
            await asyncio.sleep(0)

    async def main() -> None:
        seconds = FF_CHUNK_MODEL_SEC * 3
        await asyncio.gather(rt.fast_forward_async(seconds), ticker())

    asyncio.run(main())
    assert hits == list(range(8))
