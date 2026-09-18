"""
Хаб real-time для товаров (склад / 3D): SSE и WebSocket делят одну рассылку.
Все подключённые клиенты получают событие — после refetch права доступа
применяются на API как при обычном запросе списка.
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator

_hub_loop: asyncio.AbstractEventLoop | None = None
_sub_lock = threading.Lock()
_subscribers: list[asyncio.Queue[dict]] = []


def _ensure_hub_loop() -> None:
    global _hub_loop
    if _hub_loop is None:
        try:
            _hub_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass


def subscribe_items_queue() -> asyncio.Queue[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=32)
    with _sub_lock:
        _subscribers.append(q)
    return q


def unsubscribe_items_queue(q: asyncio.Queue[dict]) -> None:
    with _sub_lock:
        if q in _subscribers:
            _subscribers.remove(q)


def publish_items_changed() -> None:
    """Вызов из любого потока после успешного commit изменений товаров."""
    loop = _hub_loop
    if loop is None:
        return

    def _broadcast() -> None:
        with _sub_lock:
            queues = list(_subscribers)
        payload = {"type": "items_updated"}
        for q in queues:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    pass

    try:
        loop.call_soon_threadsafe(_broadcast)
    except RuntimeError:
        pass


def _format_sse(data: dict | None = None, *, comment: str | None = None) -> bytes:
    lines: list[str] = []
    if comment is not None:
        lines.append(f": {comment}")
    if data is not None:
        lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


async def items_sse_stream() -> AsyncIterator[bytes]:
    _ensure_hub_loop()
    q = subscribe_items_queue()
    try:
        yield _format_sse(comment="ok")
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield _format_sse(msg)
            except asyncio.TimeoutError:
                yield _format_sse(comment="ping")
    finally:
        unsubscribe_items_queue(q)
