"""Отказы техники и заторы."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.layout import ZONE_STORAGE
from app.warehouse_sim.rng import event_occurs, rand_pick, rand_range
from app.warehouse_sim.sim_common import emit, is_mobile_kind
from app.warehouse_sim.tasks import abort_task


def inject_fault(world: dict[str, Any], device: dict[str, Any], cause: str) -> None:
    if device["status"] in ("fault", "offline"):
        return
    if device.get("taskId"):
        abort_task(world, device, cause)
    device["status"] = "fault"
    device["faultCount"] += 1
    device["repairTimer"] = rand_range(world, 40, 160)
    world["metrics"]["faults"] += 1
    emit(
        world,
        ev.DEVICE_ERROR,
        "error",
        f"{device['name']}: отказ ({cause})",
        device_id=device["id"],
    )


def repair_device(world: dict[str, Any], device: dict[str, Any], auto: bool) -> None:
    device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
    device["repairTimer"] = 0.0
    device["online"] = True
    emit(
        world,
        ev.DEVICE_RECOVERED,
        "success",
        f"{device['name']} восстановлен{' (автосброс)' if auto else ' вручную'}",
        device_id=device["id"],
    )


def process_faults(world: dict[str, Any], dt: float) -> None:
    for device in world["devices"]:
        if not device["online"] or device["status"] in (
            "fault",
            "maintenance",
            "offline",
        ):
            continue
        eligible = is_mobile_kind(device["kind"]) or device["kind"] in ("scanner",)
        if not eligible:
            continue
        rate = world["config"]["faultRatePerHour"]
        if not is_mobile_kind(device["kind"]):
            rate *= 0.4
        if not event_occurs(world, rate, dt):
            continue
        causes = (
            [
                "перегрев привода",
                "ошибка датчика вил",
                "потеря связи с контроллером",
                "сбой навигации",
            ]
            if is_mobile_kind(device["kind"])
            else ["ошибка прошивки", "потеря сети", "аппаратный сбой"]
        )
        inject_fault(world, device, rand_pick(world, causes))


def process_congestion(world: dict[str, Any], dt: float) -> None:
    world["accumulators"]["congestion"] += dt
    if world["accumulators"]["congestion"] < 15:
        return
    world["accumulators"]["congestion"] = 0
    waiting = [d for d in world["devices"] if d["status"] == "waiting"]
    zone = ZONE_STORAGE
    if len(waiting) >= 3 and zone not in world["congestedZones"]:
        world["congestedZones"].add(zone)
        emit(
            world,
            ev.ZONE_CONGESTED,
            "warning",
            "Пробка в зоне хранения: техника ждёт разъезда",
            zone_id=zone,
        )
    elif len(waiting) < 2 and zone in world["congestedZones"]:
        world["congestedZones"].discard(zone)
        emit(
            world,
            ev.ZONE_CLEARED,
            "success",
            "Пробка в зоне хранения рассосалась",
            zone_id=zone,
        )
