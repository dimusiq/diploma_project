"""Общий SSE-слой: format, backpressure, heartbeat."""

from __future__ import annotations

import asyncio

from app.realtime.sse_common import (
    SseSubscriberHub,
    format_sse,
    iter_sse_from_queue,
    put_drop_oldest,
)


def test_format_sse_data_and_comment() -> None:
    raw = format_sse({"type": "x"}, comment="ping").decode()
    assert ": ping" in raw
    assert 'data: {"type": "x"}' in raw or 'data: {"type":"x"}' in raw.replace(" ", "")


def test_put_drop_oldest_keeps_connection() -> None:
    q: asyncio.Queue[int] = asyncio.Queue(maxsize=2)
    put_drop_oldest(q, 1)
    put_drop_oldest(q, 2)
    put_drop_oldest(q, 3)  # вытесняет 1
    assert q.get_nowait() == 2
    assert q.get_nowait() == 3


def test_hub_snapshot_no_copy_on_broadcast_path() -> None:
    hub: SseSubscriberHub[str] = SseSubscriberHub()
    hub.add("a")
    snap1 = hub.snapshot()
    hub.add("b")
    snap2 = hub.snapshot()
    assert snap1 == ("a",)
    assert snap2 == ("a", "b")
    assert snap1 is not snap2


def test_iter_sse_heartbeat() -> None:
    async def immediate_timeout(aw: object, **_k: object) -> object:
        if hasattr(aw, "close"):
            aw.close()  # type: ignore[attr-defined]
        raise asyncio.TimeoutError()

    async def _run() -> None:
        q: asyncio.Queue[dict] = asyncio.Queue()
        # monkeypatch wait_for locally via wrapping
        import app.realtime.sse_common as mod

        orig = mod.asyncio.wait_for
        mod.asyncio.wait_for = immediate_timeout  # type: ignore[assignment]
        try:
            gen = iter_sse_from_queue(q, on_start=(format_sse(comment="ok"),))
            first = await anext(gen)
            assert b"ok" in first
            ping = await anext(gen)
            assert b"ping" in ping
            await gen.aclose()
        finally:
            mod.asyncio.wait_for = orig

    asyncio.run(_run())
