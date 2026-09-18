"""
Хаб SSE для уведомлений: один процесс, asyncio.Queue на подключение.
Публикация из sync-кода (после commit) через call_soon_threadsafe на loop,
зарегистрированный при первом подключении клиента.
"""

from __future__ import annotations

import asyncio
import json
import threading
import uuid
from collections.abc import AsyncIterator

_hub_loop: asyncio.AbstractEventLoop | None = None
_sub_lock = threading.Lock()
# user_id -> список очередей подписчиков
_subscribers: dict[uuid.UUID, list[asyncio.Queue[dict]]] = {}


def _ensure_hub_loop() -> None:
    global _hub_loop
    if _hub_loop is None:
        try:
            _hub_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass


def _subscribe_queue(user_id: uuid.UUID) -> asyncio.Queue[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=16)
    with _sub_lock:
        _subscribers.setdefault(user_id, []).append(q)
    return q


def _unsubscribe_queue(user_id: uuid.UUID, q: asyncio.Queue[dict]) -> None:
    with _sub_lock:
        lst = _subscribers.get(user_id)
        if not lst:
            return
        if q in lst:
            lst.remove(q)
        if not lst:
            _subscribers.pop(user_id, None)


def publish_notifications_updated(user_id: uuid.UUID) -> None:
    """Вызов из любого потока после изменений уведомлений пользователя."""
    loop = _hub_loop
    if loop is None:
        return

    def _broadcast() -> None:
        with _sub_lock:
            queues = list(_subscribers.get(user_id, ()))
        payload = {"type": "notifications_updated"}
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


async def notification_sse_stream(user_id: uuid.UUID) -> AsyncIterator[bytes]:
    _ensure_hub_loop()
    q = _subscribe_queue(user_id)
    try:
        yield _format_sse(comment="ok")
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield _format_sse(msg)
            except asyncio.TimeoutError:
                yield _format_sse(comment="ping")
    finally:
        _unsubscribe_queue(user_id, q)
