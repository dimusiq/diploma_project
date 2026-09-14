"""
Единый real-time поток для цифрового двойника: каналы, coalesce/debounce, ring-buffer replay.

Сообщение (SSE data / WS JSON):
  {"v":1,"channel":"<name>","type":"<event_type>","ts":"<iso8601>","payload":{...}}

Канал telemetry — поток фактов из WMS/ERP/PLC/датчиков (near real-time), без debounce.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from collections import deque
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone

# Каналы (подписка клиента — подмножество)
CHANNEL_OCCUPANCY = "occupancy"
CHANNEL_ITEM_MOVEMENT = "item_movement"
CHANNEL_TASK_UPDATES = "task_updates"
CHANNEL_EQUIPMENT_POSITIONS = "equipment_positions"
CHANNEL_ALERTS = "alerts"
CHANNEL_AGENT_RUNS = "agent_runs"
CHANNEL_TELEMETRY = "telemetry"

ALL_CHANNELS: frozenset[str] = frozenset(
    {
        CHANNEL_OCCUPANCY,
        CHANNEL_ITEM_MOVEMENT,
        CHANNEL_TASK_UPDATES,
        CHANNEL_EQUIPMENT_POSITIONS,
        CHANNEL_ALERTS,
        CHANNEL_AGENT_RUNS,
        CHANNEL_TELEMETRY,
    }
)

# История для replay
_MAX_HISTORY_LEN = 2000
_MAX_REPLAY_SECONDS_CAP = 600
_DEFAULT_REPLAY_SECONDS = 120

# Debounce (сек): высокочастотные каналы
_OCCUPANCY_DEBOUNCE_SEC = 0.28
_ITEM_MOVEMENT_DEBOUNCE_SEC = 0.12
_EQUIPMENT_DEBOUNCE_SEC = 0.16

_hub_loop: asyncio.AbstractEventLoop | None = None
_sub_lock = threading.Lock()

_history_lock = threading.Lock()
_history: deque[tuple[float, dict]] = deque(maxlen=_MAX_HISTORY_LEN)


@dataclass
class _TwinSubscriber:
    queue: asyncio.Queue[dict]
    channels: frozenset[str]


_subscribers: list[_TwinSubscriber] = []

# --- coalesce state (loop thread only for timers; flags from any thread via call_soon) ---
_occupancy_dirty = False
_occupancy_timer: asyncio.TimerHandle | None = None

_item_movement_dirty = False
_item_movement_timer: asyncio.TimerHandle | None = None
_item_movement_ids: set[str] = set()
_last_item_movement_reason: str = "mutation"

_equipment_batch: dict[str, dict] = {}
_equipment_timer: asyncio.TimerHandle | None = None


def _ensure_hub_loop() -> None:
    global _hub_loop
    if _hub_loop is None:
        try:
            _hub_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _envelope(channel: str, event_type: str, payload: dict) -> dict:
    return {
        "v": 1,
        "channel": channel,
        "type": event_type,
        "ts": _now_iso(),
        "payload": payload,
    }


def _record_history(msg: dict) -> None:
    with _history_lock:
        _history.append((time.monotonic(), msg))


def history_messages_for_replay(
    *,
    channels: frozenset[str],
    replay_seconds: int,
) -> list[dict]:
    cap = min(max(0, replay_seconds), _MAX_REPLAY_SECONDS_CAP)
    if cap == 0 or not channels:
        return []
    cutoff = time.monotonic() - cap
    out: list[dict] = []
    with _history_lock:
        for mono, msg in _history:
            if mono < cutoff:
                continue
            ch = msg.get("channel")
            if ch in channels:
                out.append(msg)
    return out


def parse_channels_param(raw: str | None) -> frozenset[str]:
    """Пусто или '*' — все каналы; иначе список через запятую."""
    if raw is None or not raw.strip() or raw.strip() == "*":
        return ALL_CHANNELS
    parts = {p.strip() for p in raw.split(",") if p.strip()}
    valid = parts & ALL_CHANNELS
    return frozenset(valid) if valid else ALL_CHANNELS


def subscribe_twin(*, channels: frozenset[str]) -> asyncio.Queue[dict]:
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=64)
    with _sub_lock:
        _subscribers.append(_TwinSubscriber(queue=q, channels=channels))
    return q


def unsubscribe_twin(q: asyncio.Queue[dict]) -> None:
    with _sub_lock:
        _subscribers[:] = [s for s in _subscribers if s.queue is not q]


def _broadcast(msg: dict) -> None:
    _record_history(msg)
    with _sub_lock:
        subs = list(_subscribers)
    ch = msg.get("channel")
    for s in subs:
        if ch not in s.channels:
            continue
        try:
            s.queue.put_nowait(msg)
        except asyncio.QueueFull:
            try:
                s.queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                s.queue.put_nowait(msg)
            except asyncio.QueueFull:
                pass


def _broadcast_on_loop(msg: dict) -> None:
    _broadcast(msg)


def _call_broadcast(msg: dict) -> None:
    loop = _hub_loop
    if loop is None:
        return

    def _run() -> None:
        _broadcast_on_loop(msg)

    try:
        loop.call_soon_threadsafe(_run)
    except RuntimeError:
        pass


# --- immediate publishes (низкая частота) ---


def publish_task_update(
    *,
    task_id: uuid.UUID,
    event_type: str,
    payload: dict | None = None,
) -> None:
    pl = dict(payload or {})
    pl.setdefault("warehouse_task_id", str(task_id))
    _call_broadcast(_envelope(CHANNEL_TASK_UPDATES, event_type, pl))


def publish_alert_event(
    *,
    user_id: uuid.UUID,
    notification_id: uuid.UUID,
    notification_type: str,
    severity: str,
) -> None:
    _call_broadcast(
        _envelope(
            CHANNEL_ALERTS,
            "alert_created",
            {
                "user_id": str(user_id),
                "notification_id": str(notification_id),
                "notification_type": notification_type,
                "severity": severity,
            },
        )
    )


def publish_telemetry_fact(*, event_type: str, payload: dict) -> None:
    """Немедленная публикация факта телеметрии / внешней системы (канал telemetry)."""
    _call_broadcast(_envelope(CHANNEL_TELEMETRY, event_type, dict(payload)))


def publish_external_vehicle_pose(*, payload: dict) -> None:
    """Позиция ТС без привязки к equipment.id (AGV по внешнему id) — канал equipment_positions."""
    _call_broadcast(
        _envelope(CHANNEL_EQUIPMENT_POSITIONS, "external_vehicle_pose", dict(payload))
    )


def publish_agent_run_finished(
    *,
    user_id: uuid.UUID,
    log_id: uuid.UUID,
    message_preview: str | None,
    llm_available: bool,
) -> None:
    _call_broadcast(
        _envelope(
            CHANNEL_AGENT_RUNS,
            "agent_run_finished",
            {
                "user_id": str(user_id),
                "log_id": str(log_id),
                "message_preview": (message_preview or "")[:200],
                "llm_available": llm_available,
            },
        )
    )


# --- debounced ---


def _cancel_timer(h: asyncio.TimerHandle | None) -> None:
    if h is not None and not h.cancelled():
        h.cancel()


def publish_occupancy_changed() -> None:
    """После изменения warehouse_slot_occupancy / полного пересчёта."""
    global _occupancy_dirty, _occupancy_timer
    loop = _hub_loop
    if loop is None:
        return
    _occupancy_dirty = True

    def _schedule() -> None:
        global _occupancy_timer
        _cancel_timer(_occupancy_timer)

        def _flush() -> None:
            global _occupancy_timer, _occupancy_dirty
            _occupancy_timer = None
            if not _occupancy_dirty:
                return
            _occupancy_dirty = False
            _broadcast(
                _envelope(CHANNEL_OCCUPANCY, "occupancy_changed", {"reason": "projection"})
            )

        _occupancy_timer = loop.call_later(_OCCUPANCY_DEBOUNCE_SEC, _flush)

    try:
        loop.call_soon_threadsafe(_schedule)
    except RuntimeError:
        pass


def publish_item_movement(
    *,
    item_id: uuid.UUID | None = None,
    reason: str = "mutation",
) -> None:
    """Движение / изменение товара на складе (coalesce в окне)."""
    loop = _hub_loop
    if loop is None:
        return

    _id_str = str(item_id) if item_id is not None else None
    _reason = reason

    def _schedule() -> None:
        global _item_movement_dirty, _item_movement_timer, _item_movement_ids, _last_item_movement_reason
        _item_movement_dirty = True
        _last_item_movement_reason = _reason
        if _id_str is not None:
            _item_movement_ids.add(_id_str)
        global _item_movement_timer
        _cancel_timer(_item_movement_timer)

        def _flush() -> None:
            global _item_movement_timer, _item_movement_dirty, _item_movement_ids, _last_item_movement_reason
            _item_movement_timer = None
            if not _item_movement_dirty:
                return
            _item_movement_dirty = False
            ids = sorted(_item_movement_ids)[:80]
            _item_movement_ids.clear()
            pl: dict = {"reason": _last_item_movement_reason}
            if ids:
                pl["item_ids"] = ids
            _broadcast(_envelope(CHANNEL_ITEM_MOVEMENT, "items_changed", pl))

        _item_movement_timer = loop.call_later(_ITEM_MOVEMENT_DEBOUNCE_SEC, _flush)

    try:
        loop.call_soon_threadsafe(_schedule)
    except RuntimeError:
        pass


def publish_equipment_position_sample(
    *,
    equipment_id: uuid.UUID,
    payload: dict,
) -> None:
    """Позиция техники: coalesce по equipment_id, один flush на окно."""
    loop = _hub_loop
    if loop is None:
        return

    key = str(equipment_id)
    merged = dict(payload)
    merged["equipment_id"] = key

    def _merge() -> None:
        global _equipment_batch, _equipment_timer
        _equipment_batch[key] = merged

        def _flush() -> None:
            global _equipment_timer, _equipment_batch
            _equipment_timer = None
            if not _equipment_batch:
                return
            batch = dict(_equipment_batch)
            _equipment_batch.clear()
            _broadcast(
                _envelope(
                    CHANNEL_EQUIPMENT_POSITIONS,
                    "positions_batch",
                    {"positions": batch},
                )
            )

        _cancel_timer(_equipment_timer)
        _equipment_timer = loop.call_later(_EQUIPMENT_DEBOUNCE_SEC, _flush)

    try:
        loop.call_soon_threadsafe(_merge)
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


async def twin_sse_stream(
    *,
    channels: frozenset[str],
    replay_seconds: int,
) -> AsyncIterator[bytes]:
    _ensure_hub_loop()
    q = subscribe_twin(channels=channels)
    try:
        yield _format_sse(comment="twin ok")
        for msg in history_messages_for_replay(
            channels=channels, replay_seconds=replay_seconds
        ):
            yield _format_sse(msg)
        yield _format_sse({"type": "twin_replay_done", "channels": sorted(channels)})
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield _format_sse(msg)
            except TimeoutError:
                yield _format_sse(comment="ping")
    finally:
        unsubscribe_twin(q)
