"""Дельты motion/data: сходимость к полному состоянию, выгода по размеру."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from typing import Any, cast

from app.warehouse_sim.delta import (
    apply_data_delta,
    apply_motion_delta,
    diff_data,
    diff_motion,
    should_send_full,
)
from app.warehouse_sim.runtime import WarehouseSimRuntime
from app.warehouse_sim.simulation import advance_world
from app.warehouse_sim.snapshot import build_data, build_motion


def test_motion_delta_converges_to_full() -> None:
    rt = WarehouseSimRuntime()
    world = rt.world
    base = build_motion(world, False, 1)
    advance_world(world, 2.0)
    nxt = build_motion(world, True, 2)
    patch = diff_motion(base, nxt)
    assert patch is not None
    merged = apply_motion_delta(base, patch)
    # Сверяем ключевые поля (не object identity)
    assert merged["version"] == nxt["version"]
    assert merged["timeSec"] == nxt["timeSec"]
    assert merged["running"] == nxt["running"]
    assert {d["id"]: d for d in merged["devices"]} == {
        d["id"]: d for d in nxt["devices"]
    }
    assert {t["id"]: t for t in merged["trucks"]} == {t["id"]: t for t in nxt["trucks"]}


def test_data_delta_converges_to_full() -> None:
    rt = WarehouseSimRuntime()
    world = rt.world
    base = build_data(world, "STOPPED", 1.0, 1)
    advance_world(world, 5.0)
    nxt = build_data(world, "RUNNING", 2.0, 2)
    patch = diff_data(base, nxt)
    assert patch is not None
    merged = apply_data_delta(deepcopy(base), patch)
    assert merged["version"] == nxt["version"]
    assert merged["state"] == nxt["state"]
    assert merged["speed"] == nxt["speed"]
    assert {d["id"]: d["status"] for d in merged["devices"]} == {
        d["id"]: d["status"] for d in nxt["devices"]
    }
    assert {t["id"]: t["status"] for t in merged["tasks"]} == {
        t["id"]: t["status"] for t in nxt["tasks"]
    }


def test_delta_smaller_than_full_after_small_step() -> None:
    rt = WarehouseSimRuntime()
    world = rt.world
    # Прогрев, чтобы списки стабилизировались
    advance_world(world, 30.0)
    a = build_motion(world, True, 10)
    advance_world(world, 0.1)
    b = build_motion(world, True, 11)
    patch = diff_motion(a, b)
    assert patch is not None
    assert should_send_full(patch, b) is False
    dsz = len(json.dumps(patch, ensure_ascii=False, default=str))
    fsz = len(json.dumps(b, ensure_ascii=False, default=str))
    assert dsz < fsz


def test_broadcast_backpressure_n_subscribers() -> None:
    rt = WarehouseSimRuntime()
    queues = [rt.subscribe(want_deltas=True) for _ in range(5)]
    # Переполняем одну очередь
    slow = queues[0]
    for i in range(40):
        rt._broadcast({"n": i})
    # Соединение живо: очередь не пуста и не бросила исключение
    assert slow.qsize() == slow.maxsize
    for q in queues:
        rt.unsubscribe(q)


def test_sse_stream_ready_and_full_then_delta() -> None:
    from app.warehouse_sim.runtime import sse_stream

    rt = WarehouseSimRuntime()

    async def _run() -> None:
        gen = sse_stream(rt, deltas=True)
        ready = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert ready["type"] == "ready"
        assert ready["deltas"] is True
        data_msg = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert data_msg["type"] == "data"
        assert data_msg["mode"] == "full"
        motion_msg = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert motion_msg["type"] == "motion"
        assert motion_msg["mode"] == "full"

        # Симулируем публикацию дельты
        prev = rt.motion()
        nxt = dict(prev)
        nxt["version"] = int(prev.get("version") or 0) + 1
        nxt["timeSec"] = float(prev.get("timeSec") or 0) + 1.0
        rt._broadcast_snapshot("motion", nxt, prev)
        delta_raw = await anext(gen)
        delta_msg = json.loads(delta_raw.decode().split("data: ", 1)[1])
        assert delta_msg["mode"] == "delta"
        assert delta_msg["type"] == "motion"
        assert "timeSec" in delta_msg["payload"]
        await cast(Any, gen).aclose()

    asyncio.run(_run())


def test_parallel_subscribers_consistent_revision() -> None:
    rt = WarehouseSimRuntime()
    subs = [rt.subscribe(want_deltas=False) for _ in range(3)]
    prev = rt.motion()
    nxt = dict(prev)
    nxt["version"] = 42
    nxt["timeSec"] = 100.0
    rt._broadcast_snapshot("motion", nxt, prev)
    payloads = []
    for q in subs:
        msg = q.get_nowait()
        payloads.append(msg["payload"]["version"])
        rt.unsubscribe(q)
    assert payloads == [42, 42, 42]


def test_sse_reconnect_since_skips_initial_full() -> None:
    """Реконнект с since>=revision: нет повторного full data/motion (только ready → delta)."""
    from app.warehouse_sim.runtime import sse_stream

    rt = WarehouseSimRuntime()
    data = rt.data()
    motion = rt.motion()
    cur_rev = max(int(data.get("version") or 0), int(motion.get("version") or 0))
    assert cur_rev >= 0

    async def _run() -> None:
        gen = sse_stream(rt, deltas=True, since=cur_rev)
        ready = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert ready["type"] == "ready"
        assert ready["deltas"] is True
        assert int(ready["revision"]) == cur_rev

        prev = rt.motion()
        nxt = dict(prev)
        nxt["version"] = int(prev.get("version") or 0) + 1
        nxt["timeSec"] = float(prev.get("timeSec") or 0) + 0.5
        rt._broadcast_snapshot("motion", nxt, prev)

        delta_raw = await anext(gen)
        delta_msg = json.loads(delta_raw.decode().split("data: ", 1)[1])
        assert delta_msg["type"] == "motion"
        assert delta_msg["mode"] == "delta"
        assert delta_msg.get("mode") != "full"
        await cast(Any, gen).aclose()

    asyncio.run(_run())


def test_sse_stale_since_sends_full_snapshot() -> None:
    """Устаревший since снова отдаёт full кадры — клиент не остаётся на дырявом состоянии."""
    from app.warehouse_sim.runtime import sse_stream

    rt = WarehouseSimRuntime()
    data = rt.data()
    motion = rt.motion()
    cur_rev = max(int(data.get("version") or 0), int(motion.get("version") or 0))

    async def _run() -> None:
        gen = sse_stream(rt, deltas=True, since=max(0, cur_rev - 1) if cur_rev else -1)
        ready = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert ready["type"] == "ready"
        data_msg = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        motion_msg = json.loads((await anext(gen)).decode().split("data: ", 1)[1])
        assert data_msg["type"] == "data" and data_msg["mode"] == "full"
        assert motion_msg["type"] == "motion" and motion_msg["mode"] == "full"
        await cast(Any, gen).aclose()

    asyncio.run(_run())
