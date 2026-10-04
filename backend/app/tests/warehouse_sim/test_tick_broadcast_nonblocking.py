"""Тик симуляции: сериализация снапшота не блокирует event loop."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import pytest

from app.warehouse_sim.delta import should_send_full
from app.warehouse_sim.runtime import WarehouseSimRuntime


def _fat_payload(n: int = 800) -> dict[str, Any]:
    return {
        "version": 1,
        "devices": [
            {
                "id": f"d-{i}",
                "x": float(i),
                "y": float(i % 17),
                "meta": {"note": "x" * 40},
            }
            for i in range(n)
        ],
    }


def test_should_send_full_serialization_cost_measurable() -> None:
    """Замер стоимости json.dumps: жирный кадр заметно дороже пустого."""
    fat = _fat_payload(600)
    thin = {"version": 1, "devices": []}
    t0 = time.perf_counter()
    for _ in range(20):
        should_send_full({"devices": fat["devices"][:10]}, fat)
    fat_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    for _ in range(20):
        should_send_full(thin, thin)
    thin_ms = (time.perf_counter() - t1) * 1000
    assert fat_ms > thin_ms
    assert len(json.dumps(fat)) > len(json.dumps(thin))
    # Печать для отчёта «до/после» (вынесение dumps в thread).
    print(f"serialize_bench fat_ms={fat_ms:.2f} thin_ms={thin_ms:.2f}")


def test_broadcast_prepare_via_to_thread_does_not_block_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Пока prepare (dumps) идёт в thread, соседняя корутина тикает."""
    rt = WarehouseSimRuntime()
    hits: list[int] = []
    slow_started = asyncio.Event()
    original_prepare = WarehouseSimRuntime._prepare_snapshot_envelopes

    def slow_prepare(
        kind: str,
        payload: dict[str, Any],
        prev: dict[str, Any] | None,
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]:
        slow_started.set()
        time.sleep(0.08)
        return original_prepare(kind, payload, prev)

    monkeypatch.setattr(
        WarehouseSimRuntime, "_prepare_snapshot_envelopes", staticmethod(slow_prepare)
    )

    async def ticker() -> None:
        await slow_started.wait()
        for i in range(5):
            hits.append(i)
            await asyncio.sleep(0)

    async def broadcast_once() -> None:
        fat = _fat_payload(400)
        await rt._broadcast_snapshot_async("motion", fat, None)

    async def main() -> None:
        await asyncio.gather(broadcast_once(), ticker())

    asyncio.run(main())
    assert hits == list(range(5))
