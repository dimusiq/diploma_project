"""Тик симуляции: сериализация снапшота не блокирует event loop."""

from __future__ import annotations

import asyncio
import json
import os
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


@pytest.mark.skipif(
    os.environ.get("RUN_SERIALIZE_BENCH") != "1",
    reason="бенчмарк сериализации вне CI (RUN_SERIALIZE_BENCH=1)",
)
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
    print(f"serialize_bench fat_ms={fat_ms:.2f} thin_ms={thin_ms:.2f}")


def test_broadcast_prepare_via_to_thread_does_not_block_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """probe завершается во время prepare — иначе sync prepare блокирует loop."""
    rt = WarehouseSimRuntime()
    order: list[str] = []
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

    async def probe() -> None:
        await slow_started.wait()
        # Должен успеть до конца 80ms prepare — только если loop свободен.
        await asyncio.sleep(0.02)
        order.append("probe")

    async def broadcast_once() -> None:
        fat = _fat_payload(400)
        await rt._broadcast_snapshot_async("motion", fat, None)
        order.append("broadcast_done")

    async def main() -> None:
        await asyncio.gather(broadcast_once(), probe())

    asyncio.run(main())
    # Sync prepare на loop дал бы ["broadcast_done", "probe"].
    assert order == ["probe", "broadcast_done"]
