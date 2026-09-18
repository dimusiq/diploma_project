import asyncio
import uuid

import pytest

from app.realtime.item_sse_hub import items_sse_stream
from app.realtime.notification_sse_hub import notification_sse_stream


def test_items_sse_heartbeat_on_asyncio_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def immediate_timeout(aw: object, **_k: object) -> object:
        if hasattr(aw, "close"):
            aw.close()  # type: ignore[attr-defined]
        raise asyncio.TimeoutError()

    monkeypatch.setattr(
        "app.realtime.item_sse_hub.asyncio.wait_for",
        immediate_timeout,
    )

    async def _run() -> None:
        gen = items_sse_stream()
        first = await anext(gen)
        assert b"ok" in first
        ping = await anext(gen)
        assert b"ping" in ping
        await gen.aclose()

    asyncio.run(_run())


def test_notification_sse_heartbeat_on_asyncio_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def immediate_timeout(aw: object, **_k: object) -> object:
        if hasattr(aw, "close"):
            aw.close()  # type: ignore[attr-defined]
        raise asyncio.TimeoutError()

    monkeypatch.setattr(
        "app.realtime.notification_sse_hub.asyncio.wait_for",
        immediate_timeout,
    )

    async def _run() -> None:
        gen = notification_sse_stream(uuid.uuid4())
        first = await anext(gen)
        assert b"ok" in first
        ping = await anext(gen)
        assert b"ping" in ping
        await gen.aclose()

    asyncio.run(_run())
