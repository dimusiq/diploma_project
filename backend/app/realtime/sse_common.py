"""
Общий слой SSE: форматирование, heartbeat, подписка, backpressure (вытеснение старого).

Хабы каналов (items / notifications / twin / warehouse-sim) — тонкие адаптеры над этим модулем.
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator, Callable, Iterable
from typing import Any, Generic, TypeVar

T = TypeVar("T")


def format_sse(
    data: dict[str, Any] | None = None, *, comment: str | None = None
) -> bytes:
    """Один SSE-событие (data и/или comment)."""
    lines: list[str] = []
    if comment is not None:
        lines.append(f": {comment}")
    if data is not None:
        lines.append(f"data: {json.dumps(data, ensure_ascii=False, default=str)}")
    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def put_drop_oldest(queue: asyncio.Queue[Any], item: Any) -> None:
    """
    Кладёт сообщение в очередь; при переполнении вытесняет самое старое.
    Соединение не рвётся — клиент может пропустить кадр, но поток жив.
    """
    try:
        queue.put_nowait(item)
        return
    except asyncio.QueueFull:
        pass
    try:
        queue.get_nowait()
    except asyncio.QueueEmpty:
        pass
    try:
        queue.put_nowait(item)
    except asyncio.QueueFull:
        pass


class SseSubscriberHub(Generic[T]):
    """
    Реестр подписчиков без копирования списка на каждое сообщение:
    при subscribe/unsubscribe обновляется неизменяемый snapshot-tuple.
    """

    def __init__(self, *, queue_maxsize: int = 32) -> None:
        self._lock = threading.Lock()
        self._subs: list[T] = []
        self._snapshot: tuple[T, ...] = ()
        self.queue_maxsize = queue_maxsize
        self.loop: asyncio.AbstractEventLoop | None = None

    def ensure_loop(self) -> None:
        if self.loop is None:
            try:
                self.loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

    def _rebuild(self) -> None:
        self._snapshot = tuple(self._subs)

    def add(self, sub: T) -> None:
        with self._lock:
            self._subs.append(sub)
            self._rebuild()

    def remove_if(self, pred: Callable[[T], bool]) -> None:
        with self._lock:
            self._subs = [s for s in self._subs if not pred(s)]
            self._rebuild()

    def snapshot(self) -> tuple[T, ...]:
        return self._snapshot

    def new_queue(self) -> asyncio.Queue[Any]:
        return asyncio.Queue(maxsize=self.queue_maxsize)


async def iter_sse_from_queue(
    queue: asyncio.Queue[Any],
    *,
    heartbeat_sec: float = 15.0,
    heartbeat_comment: str = "ping",
    on_start: Iterable[bytes] | None = None,
) -> AsyncIterator[bytes]:
    """Читает очередь и отдаёт SSE; на таймауте — heartbeat comment."""
    if on_start:
        for chunk in on_start:
            yield chunk
    while True:
        try:
            msg = await asyncio.wait_for(queue.get(), timeout=heartbeat_sec)
            yield format_sse(msg)
        except asyncio.TimeoutError:
            yield format_sse(comment=heartbeat_comment)
