"""Команды управления симулятором и устройствами."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.failures import inject_fault, repair_device
from app.warehouse_sim.movement import request_charge
from app.warehouse_sim.orders import spawn_inbound_truck, spawn_outbound_order
from app.warehouse_sim.sim_common import _plan_path, emit, is_mobile_kind
from app.warehouse_sim.tasks import abort_task


def apply_command(world: dict[str, Any], command: dict[str, Any]) -> None:
    ctype = command.get("type")
    if ctype == "spawnInboundTruck":
        spawn_inbound_truck(world)
    elif ctype == "spawnOutboundOrder":
        spawn_outbound_order(world, bool(command.get("urgent")))
    elif ctype == "injectFault":
        device = world["deviceById"].get(command.get("deviceId"))
        if device:
            inject_fault(world, device, "ручная инъекция отказа")
    elif ctype == "repairDevice":
        device = world["deviceById"].get(command.get("deviceId"))
        if not device:
            return
        if device["status"] == "jam":
            device["status"] = "running"
            device["repairTimer"] = 0
            emit(
                world,
                ev.CONVEYOR_STARTED,
                "success",
                f"{device['name']}: замятие устранено оператором",
                device_id=device["id"],
            )
        elif device["status"] in ("fault", "maintenance"):
            repair_device(world, device, False)
    elif ctype == "toggleDeviceOnline":
        device = world["deviceById"].get(command.get("deviceId"))
        if not device:
            return
        if device["online"]:
            if device.get("taskId"):
                abort_task(world, device, "устройство отключено")
            device["online"] = False
            device["status"] = "offline"
            emit(
                world,
                ev.DEVICE_OFFLINE,
                "warning",
                f"{device['name']} отключён оператором",
                device_id=device["id"],
            )
        else:
            device["online"] = True
            device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
            emit(
                world,
                ev.DEVICE_ONLINE,
                "success",
                f"{device['name']} включён оператором",
                device_id=device["id"],
            )
    elif ctype == "recallToCharge":
        device = world["deviceById"].get(command.get("deviceId"))
        if not device or device["battery"] is None:
            return
        if device.get("taskId"):
            abort_task(world, device, "отозван на зарядку")
        device["status"] = "idle"
        request_charge(world, device, True)
    elif ctype == "clearAllAlarms":
        cleared = 0
        for device in world["devices"]:
            if device["alarm"]:
                device["alarm"] = False
                cleared += 1
            if device["status"] == "jam":
                device["status"] = "running"
                device["repairTimer"] = 0
                cleared += 1
        emit(world, ev.ZONE_CLEARED, "info", f"Сброшено аварий: {cleared}")
    elif ctype == "emergencyStop":
        emergency_stop(world)
    elif ctype == "resumeAll":
        resume_all(world)


def emergency_stop(world: dict[str, Any]) -> None:
    for device in world["devices"]:
        if is_mobile_kind(device["kind"]):
            if device.get("taskId"):
                abort_task(world, device, "аварийный останов")
            device["online"] = False
            device["status"] = "offline"
        elif device["kind"] == "conveyor":
            device["status"] = "idle"
            emit(
                world,
                ev.CONVEYOR_STOPPED,
                "warning",
                f"{device['name']} остановлен",
                device_id=device["id"],
            )
    emit(
        world,
        ev.EMERGENCY_STOP,
        "error",
        "Аварийный останов: техника и конвейеры остановлены",
    )


def resume_all(world: dict[str, Any]) -> None:
    for device in world["devices"]:
        if is_mobile_kind(device["kind"]):
            device["online"] = True
            if device["status"] == "offline":
                device["status"] = "idle"
            emit(
                world,
                ev.DEVICE_ONLINE,
                "success",
                f"{device['name']} возобновлён",
                device_id=device["id"],
            )
        elif device["kind"] == "conveyor" and device["status"] == "idle":
            device["status"] = "running"
            emit(
                world,
                ev.CONVEYOR_STARTED,
                "success",
                f"{device['name']} запущен",
                device_id=device["id"],
            )
    emit(world, ev.SYSTEM_STARTED, "success", "Работа возобновлена")


def device_command(
    world: dict[str, Any],
    device_id: str,
    command: str,
    payload: dict[str, Any] | None = None,
) -> None:
    device = world["deviceById"].get(device_id)
    if not device:
        raise KeyError(device_id)
    cmd = command.upper()
    payload = payload or {}
    if cmd == "START":
        device["online"] = True
        if device["status"] in ("offline", "idle"):
            device["status"] = "running" if device["kind"] == "conveyor" else "idle"
        emit(
            world,
            ev.DEVICE_STARTED,
            "info",
            f"{device['name']}: START",
            device_id=device["id"],
        )
    elif cmd == "STOP":
        if device.get("taskId"):
            abort_task(world, device, "STOP")
        device["online"] = False
        device["status"] = "offline"
        emit(
            world,
            ev.DEVICE_STOPPED,
            "warning",
            f"{device['name']}: STOP",
            device_id=device["id"],
        )
    elif cmd == "RESET":
        device["online"] = True
        device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
        device["alarm"] = False
        device["repairTimer"] = 0
        if device["battery"] is not None:
            device["battery"] = 100.0
        device["path"] = []
        emit(
            world,
            ev.DEVICE_RECOVERED,
            "success",
            f"{device['name']}: RESET",
            device_id=device["id"],
        )
    elif cmd == "CHARGE":
        if device["battery"] is None:
            return
        if device.get("taskId"):
            abort_task(world, device, "CHARGE")
        request_charge(world, device, True)
    elif cmd == "FAIL":
        inject_fault(world, device, payload.get("cause") or "команда FAIL")
    elif cmd == "RECOVER":
        if device["status"] == "jam":
            device["status"] = "running"
            emit(
                world,
                ev.CONVEYOR_STARTED,
                "success",
                f"{device['name']} восстановлен",
                device_id=device["id"],
            )
        else:
            repair_device(world, device, False)
    elif cmd == "MOVE":
        target = payload.get("to") or payload.get("pos") or device.get("homePos")
        if isinstance(target, dict) and "x" in target:
            z = target.get("z", target.get("y", device["pos"]["z"]))
            device["online"] = True
            device["status"] = "moving"
            device["phase"] = None
            device["path"] = _plan_path(
                world, device["pos"], {"x": float(target["x"]), "z": float(z)}
            )
            emit(
                world,
                ev.DEVICE_MOVING,
                "info",
                f"{device['name']}: MOVE",
                device_id=device["id"],
            )
    elif cmd == "LOAD":
        device["status"] = "loading"
        device["phaseTimer"] = 8
    elif cmd == "UNLOAD":
        device["status"] = "unloading"
        device["phaseTimer"] = 8
    else:
        raise ValueError(f"Неизвестная команда устройства: {command}")
