"""
Хаб real-time для товаров (склад / 3D): SSE и WebSocket делят одну рассылку.
Все подключённые клиенты получают событие — после refetch права доступа
применяются на API как при обычном запросе списка.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from app.realtime.sse_common import (
    SseSubscriberHub,
    format_sse,
    iter_sse_from_queue,
    put_drop_oldest,
)

_hub: SseSubscriberHub[asyncio.Queue[dict[str, Any]]] = SseSubscriberHub(
    queue_maxsize=32
)


def subscribe_items_queue() -> asyncio.Queue[dict[str, Any]]:
    q = _hub.new_queue()
    _hub.add(q)
    return q


def unsubscribe_items_queue(q: asyncio.Queue[dict[str, Any]]) -> None:
    _hub.remove_if(lambda sub: sub is q)


def publish_items_changed() -> None:
    """Вызов из любого потока после успешного commit изменений товаров."""
    loop = _hub.loop
    if loop is None:
        return

    def _broadcast() -> None:
        payload = {"type": "items_updated"}
        for q in _hub.snapshot():
            put_drop_oldest(q, payload)

    try:
        loop.call_soon_threadsafe(_broadcast)
    except RuntimeError:
        pass


async def items_sse_stream() -> AsyncIterator[bytes]:
    _hub.ensure_loop()
    q = subscribe_items_queue()
    try:
        async for chunk in iter_sse_from_queue(
            q,
            on_start=(format_sse(comment="ok"),),
        ):
            yield chunk
    finally:
        unsubscribe_items_queue(q)
