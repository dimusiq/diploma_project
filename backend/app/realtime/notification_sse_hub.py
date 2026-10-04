"""
Хаб SSE для уведомлений: один процесс, asyncio.Queue на подключение.
Публикация из sync-кода (после commit) через call_soon_threadsafe на loop,
зарегистрированный при первом подключении клиента.
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.realtime.sse_common import format_sse, iter_sse_from_queue, put_drop_oldest


@dataclass(slots=True)
class _NotifSub:
    user_id: uuid.UUID
    queue: asyncio.Queue[dict]


_hub_loop: asyncio.AbstractEventLoop | None = None
_sub_lock = threading.Lock()
_subscribers: list[_NotifSub] = []
_snapshot: tuple[_NotifSub, ...] = ()


def _ensure_hub_loop() -> None:
    global _hub_loop
    if _hub_loop is None:
        try:
            _hub_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass


def _rebuild() -> None:
    global _snapshot
    _snapshot = tuple(_subscribers)


def _subscribe_queue(user_id: uuid.UUID) -> asyncio.Queue[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=16)
    with _sub_lock:
        _subscribers.append(_NotifSub(user_id=user_id, queue=q))
        _rebuild()
    return q


def _unsubscribe_queue(user_id: uuid.UUID, q: asyncio.Queue[dict]) -> None:
    with _sub_lock:
        _subscribers[:] = [
            s for s in _subscribers if not (s.user_id == user_id and s.queue is q)
        ]
        _rebuild()


def publish_notifications_updated(user_id: uuid.UUID) -> None:
    """Вызов из любого потока после изменений уведомлений пользователя."""
    loop = _hub_loop
    if loop is None:
        return

    def _broadcast() -> None:
        payload = {"type": "notifications_updated"}
        for s in _snapshot:
            if s.user_id != user_id:
                continue
            put_drop_oldest(s.queue, payload)

    try:
        loop.call_soon_threadsafe(_broadcast)
    except RuntimeError:
        pass


async def notification_sse_stream(user_id: uuid.UUID) -> AsyncIterator[bytes]:
    _ensure_hub_loop()
    q = _subscribe_queue(user_id)
    try:
        async for chunk in iter_sse_from_queue(
            q,
            on_start=(format_sse(comment="ok"),),
        ):
            yield chunk
    finally:
        _unsubscribe_queue(user_id, q)
