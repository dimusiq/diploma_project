"""Конвейеры симулятора."""

from __future__ import annotations

from app.warehouse_sim import events as ev
from app.warehouse_sim.rng import event_occurs, rand_normal, rand_range
from app.warehouse_sim.sim_common import emit


def process_conveyors(world: dict, dt: float) -> None:
    packing_count = len([o for o in world["outbound"] if o["status"] == "packing"])
    for device in world["devices"]:
        if device["kind"] != "conveyor":
            continue
        if device["status"] == "jam":
            device["repairTimer"] -= dt
            device["metric"] = 0
            if device["repairTimer"] <= 0 and world["config"]["autoRepair"]:
                device["status"] = "running"
                emit(
                    world,
                    ev.CONVEYOR_STARTED,
                    "success",
                    f"{device['name']}: замятие устранено",
                    device_id=device["id"],
                )
            continue
        if device["status"] != "running" or not device["online"]:
            device["metric"] = 0
            continue
        load = (
            packing_count * 9
            if device["id"] == "cnv-2"
            else len([t for t in world["trucks"] if t["status"] == "docked"]) * 7
        )
        device["metric"] = round(rand_normal(world, load, 2, 0, 60))
        if event_occurs(world, world["config"]["jamRatePerHour"], dt):
            device["status"] = "jam"
            device["repairTimer"] = rand_range(world, 45, 180)
            world["metrics"]["jams"] += 1
            emit(
                world,
                ev.CONVEYOR_BLOCKED,
                "error",
                f"{device['name']}: замятие, линия остановлена",
                device_id=device["id"],
                zone_id=device.get("zoneId"),
            )
