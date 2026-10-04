"""Twin SSE/WS hub: каналы, replay, backpressure, coalesce, конкурентность."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

import pytest

import app.realtime.twin_stream_hub as hub
from app.realtime.twin_stream_hub import (
    ALL_CHANNELS,
    CHANNEL_ALERTS,
    CHANNEL_ITEM_MOVEMENT,
    CHANNEL_OCCUPANCY,
    CHANNEL_TASK_UPDATES,
    history_messages_for_replay,
    parse_channels_param,
    publish_occupancy_changed,
    publish_task_update,
    subscribe_twin,
    twin_sse_stream,
    unsubscribe_twin,
)


@pytest.fixture(autouse=True)
def _reset_twin_hub() -> Any:
    """Изолируем модульные глобали хаба между тестами."""
    with hub._sub_lock:
        hub._subscribers.clear()
        hub._rebuild_subs_snapshot()
    with hub._history_lock:
        hub._history.clear()
    hub._hub_loop = None
    hub._occupancy_dirty = False
    hub._occupancy_timer = None
    hub._item_movement_dirty = False
    hub._item_movement_timer = None
    hub._item_movement_ids.clear()
    hub._equipment_batch.clear()
    hub._equipment_timer = None
    yield
    with hub._sub_lock:
        hub._subscribers.clear()
        hub._rebuild_subs_snapshot()
    with hub._history_lock:
        hub._history.clear()
    hub._hub_loop = None


def test_parse_channels_param() -> None:
    assert parse_channels_param(None) == ALL_CHANNELS
    assert parse_channels_param("*") == ALL_CHANNELS
    assert parse_channels_param("  ") == ALL_CHANNELS
    subset = parse_channels_param("occupancy,alerts,unknown_ch")
    assert subset == frozenset({CHANNEL_OCCUPANCY, CHANNEL_ALERTS})
    # Только неизвестные → fallback на все
    assert parse_channels_param("nope") == ALL_CHANNELS


def test_broadcast_filters_by_channel_and_backpressure() -> None:
    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        q_occ = subscribe_twin(channels=frozenset({CHANNEL_OCCUPANCY}))
        q_all = subscribe_twin(channels=ALL_CHANNELS)
        # maxsize=64; переполняем только occupancy-подписчика
        for i in range(80):
            hub._broadcast(
                {
                    "v": 1,
                    "channel": CHANNEL_OCCUPANCY,
                    "type": "occupancy_changed",
                    "ts": "t",
                    "payload": {"n": i},
                }
            )
        assert q_occ.qsize() == q_occ.maxsize
        # task_updates не должен попасть в occupancy-only
        hub._broadcast(
            {
                "v": 1,
                "channel": CHANNEL_TASK_UPDATES,
                "type": "task",
                "ts": "t",
                "payload": {"x": 1},
            }
        )
        # В переполненной очереди старые occupancy вытеснены; task не подписан
        drained = []
        while not q_occ.empty():
            drained.append(q_occ.get_nowait())
        assert all(m["channel"] == CHANNEL_OCCUPANCY for m in drained)
        # all-каналы получили и occupancy, и task
        found_task = False
        while not q_all.empty():
            if q_all.get_nowait().get("channel") == CHANNEL_TASK_UPDATES:
                found_task = True
        assert found_task
        unsubscribe_twin(q_occ)
        unsubscribe_twin(q_all)

    asyncio.run(_run())


def test_history_replay_filters_channel_and_window() -> None:
    now = time.monotonic()
    with hub._history_lock:
        hub._history.append(
            (
                now - 10,
                {
                    "v": 1,
                    "channel": CHANNEL_OCCUPANCY,
                    "type": "occupancy_changed",
                    "ts": "a",
                    "payload": {},
                },
            )
        )
        hub._history.append(
            (
                now - 1,
                {
                    "v": 1,
                    "channel": CHANNEL_ALERTS,
                    "type": "alert_created",
                    "ts": "b",
                    "payload": {},
                },
            )
        )
        hub._history.append(
            (
                now - 0.5,
                {
                    "v": 1,
                    "channel": CHANNEL_OCCUPANCY,
                    "type": "occupancy_changed",
                    "ts": "c",
                    "payload": {},
                },
            )
        )

    assert history_messages_for_replay(channels=frozenset(), replay_seconds=60) == []
    assert history_messages_for_replay(
        channels=frozenset({CHANNEL_OCCUPANCY}), replay_seconds=0
    ) == []

    occ = history_messages_for_replay(
        channels=frozenset({CHANNEL_OCCUPANCY}), replay_seconds=5
    )
    assert [m["ts"] for m in occ] == ["c"]

    both = history_messages_for_replay(
        channels=frozenset({CHANNEL_OCCUPANCY, CHANNEL_ALERTS}),
        replay_seconds=30,
    )
    assert [m["ts"] for m in both] == ["a", "b", "c"]


def test_parallel_subscribers_same_envelope() -> None:
    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        qs = [subscribe_twin(channels=ALL_CHANNELS) for _ in range(4)]
        msg = {
            "v": 1,
            "channel": CHANNEL_TASK_UPDATES,
            "type": "task_updated",
            "ts": "x",
            "payload": {"warehouse_task_id": "1"},
        }
        hub._broadcast(msg)
        got = [q.get_nowait()["payload"]["warehouse_task_id"] for q in qs]
        assert got == ["1", "1", "1", "1"]
        for q in qs:
            unsubscribe_twin(q)
        assert hub._subscribers_snapshot == ()

    asyncio.run(_run())


def test_publish_task_update_via_loop_threadsafe() -> None:
    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        q = subscribe_twin(channels=frozenset({CHANNEL_TASK_UPDATES}))
        tid = uuid.uuid4()
        publish_task_update(task_id=tid, event_type="status", payload={"s": "done"})
        # call_soon_threadsafe — дать циклу обработать
        await asyncio.sleep(0)
        msg = q.get_nowait()
        assert msg["channel"] == CHANNEL_TASK_UPDATES
        assert msg["v"] == 1
        assert msg["payload"]["warehouse_task_id"] == str(tid)
        assert msg["payload"]["s"] == "done"
        unsubscribe_twin(q)

    asyncio.run(_run())


def test_occupancy_coalesce_one_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hub, "_OCCUPANCY_DEBOUNCE_SEC", 0.02)

    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        q = subscribe_twin(channels=frozenset({CHANNEL_OCCUPANCY}))
        for _ in range(5):
            publish_occupancy_changed()
        await asyncio.sleep(0.08)
        msgs = []
        while not q.empty():
            msgs.append(q.get_nowait())
        assert len(msgs) == 1
        assert msgs[0]["type"] == "occupancy_changed"
        unsubscribe_twin(q)

    asyncio.run(_run())


def test_item_movement_coalesce_collects_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hub, "_ITEM_MOVEMENT_DEBOUNCE_SEC", 0.02)

    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        q = subscribe_twin(channels=frozenset({CHANNEL_ITEM_MOVEMENT}))
        a, b = uuid.uuid4(), uuid.uuid4()
        hub.publish_item_movement(item_id=a, reason="move")
        hub.publish_item_movement(item_id=b, reason="move")
        await asyncio.sleep(0.08)
        msg = q.get_nowait()
        assert msg["type"] == "items_changed"
        ids = set(msg["payload"]["item_ids"])
        assert ids == {str(a), str(b)}
        unsubscribe_twin(q)

    asyncio.run(_run())


def test_twin_sse_stream_replay_then_live() -> None:
    async def _run() -> None:
        hub._hub_loop = asyncio.get_running_loop()
        with hub._history_lock:
            hub._history.append(
                (
                    time.monotonic(),
                    {
                        "v": 1,
                        "channel": CHANNEL_ALERTS,
                        "type": "alert_created",
                        "ts": "replay",
                        "payload": {"n": 1},
                    },
                )
            )
        gen = twin_sse_stream(
            channels=frozenset({CHANNEL_ALERTS}),
            replay_seconds=60,
        )
        comment = await anext(gen)
        assert b"twin ok" in comment
        replay = (await anext(gen)).decode()
        assert "alert_created" in replay
        done = (await anext(gen)).decode()
        assert "twin_replay_done" in done
        # live
        hub._broadcast(
            {
                "v": 1,
                "channel": CHANNEL_ALERTS,
                "type": "alert_created",
                "ts": "live",
                "payload": {"n": 2},
            }
        )
        live = (await anext(gen)).decode()
        assert "live" in live
        await gen.aclose()
        assert hub._subscribers_snapshot == ()

    asyncio.run(_run())
