"""Общий SSE-слой: format, backpressure, heartbeat."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any, cast
from unittest.mock import patch

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
    assert list(snap1) == ["a"]
    assert list(snap2) == ["a", "b"]
    assert id(snap1) != id(snap2)


def test_iter_sse_heartbeat() -> None:
    async def immediate_timeout(aw: object, **_k: object) -> object:
        if hasattr(aw, "close"):
            aw.close()
        raise asyncio.TimeoutError()

    async def _run() -> None:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        with patch(
            "app.realtime.sse_common.asyncio.wait_for",
            new=immediate_timeout,
        ):
            gen: AsyncIterator[bytes] = iter_sse_from_queue(
                q, on_start=(format_sse(comment="ok"),)
            )
            first = await anext(gen)
            assert b"ok" in first
            ping = await anext(gen)
            assert b"ping" in ping
            await cast(Any, gen).aclose()

    asyncio.run(_run())
