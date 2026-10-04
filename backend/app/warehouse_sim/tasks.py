"""Задания симулятора: создание, назначение, завершение."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.layout import PACKING_POINT, ZONE_STORAGE
from app.warehouse_sim.rng import rand_chance, rand_range
from app.warehouse_sim.sim_common import (
    TASK_DEVICE_KINDS,
    TASK_LABELS,
    TASK_PRIORITY,
    _plan_path,
    emit,
    pick_worker,
    release_worker,
)
from app.warehouse_sim.traffic import find_task


def create_task(world: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    world["counters"]["task"] += 1
    task = {
        "id": f"T-{world['counters']['task']:06d}",
        "kind": draft["kind"],
        "status": "pending",
        "priority": draft.get("priority", TASK_PRIORITY.get(draft["kind"], 1)),
        "deviceId": None,
        "workerId": None,
        "from": dict(draft["from"]),
        "to": dict(draft["to"]),
        "fromLabel": draft.get("fromLabel", ""),
        "toLabel": draft.get("toLabel", ""),
        "palletId": draft.get("palletId"),
        "cellId": draft.get("cellId"),
        "orderId": draft.get("orderId"),
        "truckId": draft.get("truckId"),
        "preferredDeviceId": draft.get("preferredDeviceId"),
        "createdAt": world["timeSec"],
        "assignedAt": None,
        "doneAt": None,
    }
    world["tasks"].append(task)
    world["metrics"]["tasksCreated"] += 1
    emit(
        world,
        ev.TASK_CREATED,
        "info",
        f"{TASK_LABELS[task['kind']]} {task['id']}: {task['fromLabel']} → {task['toLabel']}",
        entity_id=task["id"],
        task_id=task["id"],
        order_id=task.get("orderId"),
    )
    return task


def _device_can_take(device: dict[str, Any], kinds: list[str]) -> bool:
    if device["kind"] not in kinds:
        return False
    if not device["online"] or device["status"] != "idle" or device["taskId"]:
        return False
    if device.get("enabled") is False:
        return False
    if device.get("inMaintenance") or device.get("status") == "maintenance":
        return False
    if device.get("archived"):
        return False
    if device["battery"] is not None and device["battery"] < 20:
        return False
    return True


def assign_tasks(world: dict[str, Any]) -> None:
    pending = [t for t in world["tasks"] if t["status"] == "pending"]
    pending.sort(key=lambda t: (-t["priority"], t["createdAt"]))
    for task in pending:
        kinds = TASK_DEVICE_KINDS.get(task["kind"], [])
        if not kinds:
            continue
        chosen = None
        preferred_id = task.get("preferredDeviceId")
        if preferred_id:
            preferred = world["deviceById"].get(preferred_id)
            if preferred is not None and _device_can_take(preferred, kinds):
                chosen = preferred
        if chosen is None:
            best_d = 1e18
            for device in world["devices"]:
                if not _device_can_take(device, kinds):
                    continue
                dx = device["pos"]["x"] - task["from"]["x"]
                dz = device["pos"]["z"] - task["from"]["z"]
                dist = dx * dx + dz * dz
                if dist < best_d:
                    best_d = dist
                    chosen = device
        if not chosen:
            continue
        worker = None
        if chosen["kind"] == "forklift":
            worker = pick_worker(world, task["kind"])
            if not worker:
                continue
            worker["status"] = "busy"
            worker["taskId"] = task["id"]
            worker["deviceId"] = chosen["id"]
        task["status"] = "assigned"
        task["deviceId"] = chosen["id"]
        task["workerId"] = worker["id"] if worker else None
        task["assignedAt"] = world["timeSec"]
        chosen["taskId"] = task["id"]
        chosen["workerId"] = worker["id"] if worker else None
        chosen["phase"] = "to_source"
        chosen["status"] = "moving"
        chosen["path"] = _plan_path(world, chosen["pos"], task["from"])
        extra = f", оператор {worker['name']}" if worker else ""
        emit(
            world,
            ev.TASK_ASSIGNED,
            "info",
            f"{TASK_LABELS[task['kind']]} {task['id']} → {chosen['name']}{extra}",
            device_id=chosen["id"],
            entity_id=task["id"],
            task_id=task["id"],
        )
        emit(
            world,
            ev.DEVICE_MOVING,
            "info",
            f"{chosen['name']} выехал к {task['fromLabel']}",
            device_id=chosen["id"],
            task_id=task["id"],
        )


def seed_demo_agv_task(world: dict[str, Any]) -> dict[str, Any] | None:
    """Детерминированный отбор для AGV-01. Назначение идёт через assign_tasks."""
    agv = world["deviceById"].get("agv-1")
    if agv is None or agv.get("taskId") or not agv.get("online"):
        return None
    if agv.get("inMaintenance") or agv.get("status") in (
        "fault",
        "offline",
        "maintenance",
    ):
        return None
    # Камера и сохранённый status не оставляют AGV без задачи на старте демо.
    agv["status"] = "idle"
    agv["path"] = []
    agv["phase"] = None
    agv["cameraHold"] = False
    agv["cameraHoldReason"] = None
    cells = [
        cell
        for cell in world["cells"]
        if cell.get("palletId") and not cell.get("blocked")
    ]
    if not cells:
        return None
    cell = max(
        cells,
        key=lambda item: (float(item["pos"]["x"]), float(item["pos"]["z"]), item["id"]),
    )
    pallet = world["pallets"][cell["palletId"]]
    pallet["state"] = "RESERVED"
    return create_task(
        world,
        {
            "kind": "pick",
            "priority": TASK_PRIORITY["pick"] + 2,
            "from": cell["pos"],
            "to": PACKING_POINT,
            "fromLabel": f"ячейка {cell['id']}",
            "toLabel": "упаковка",
            "palletId": pallet["id"],
            "cellId": cell["id"],
            "preferredDeviceId": "agv-1",
        },
    )


def finish_task(world: dict[str, Any], device: dict[str, Any], task: dict[str, Any]) -> None:
    task["status"] = "done"
    task["doneAt"] = world["timeSec"]
    task["deviceId"] = device["id"]
    world["metrics"]["tasksDone"] += 1
    worker = next(
        (w for w in world["workers"] if w["id"] == task.get("workerId")), None
    )
    if worker:
        worker["tasksDone"] += 1
        worker["taskId"] = None
        worker["deviceId"] = None
        if rand_chance(world, 0.08):
            worker["status"] = "break"
            worker["breakTimer"] = rand_range(world, 90, 240)
            emit(
                world,
                ev.WORKER_BREAK,
                "info",
                f"{worker['name']} ушёл на перерыв",
                entity_id=worker["id"],
            )
        else:
            worker["status"] = "idle"
    device["taskId"] = None
    device["workerId"] = None
    device["phase"] = None
    device["phaseTimer"] = 0.0
    device["path"] = []
    device["palletId"] = None
    device["status"] = "idle"
    device["tasksDone"] += 1
    emit(
        world,
        ev.TASK_COMPLETED,
        "success",
        f"{TASK_LABELS[task['kind']]} {task['id']} завершено ({device['name']})",
        device_id=device["id"],
        task_id=task["id"],
        order_id=task.get("orderId"),
    )
    emit(
        world,
        ev.DEVICE_IDLE,
        "info",
        f"{device['name']} свободен",
        device_id=device["id"],
    )


def abort_task(world: dict[str, Any], device: dict[str, Any], reason: str) -> None:
    task = find_task(world, device.get("taskId"))
    release_worker(world, device.get("workerId"))
    device["workerId"] = None
    device["taskId"] = None
    device["phase"] = None
    device["phaseTimer"] = 0.0
    device["path"] = []
    if task:
        if device.get("palletId"):
            pallet = world["pallets"].get(device["palletId"])
            if pallet:
                pallet["locationKind"] = "zone"
                pallet["locationId"] = ZONE_STORAGE
                pallet["pos"] = dict(device["pos"])
                task["from"] = dict(device["pos"])
                task["fromLabel"] = "аварийная выгрузка"
                task["palletId"] = pallet["id"]
        if task["kind"] == "charge":
            task["status"] = "done"
            task["doneAt"] = world["timeSec"]
        else:
            task["status"] = "pending"
            task["deviceId"] = None
            task["workerId"] = None
            task["assignedAt"] = None
            emit(
                world,
                ev.TASK_BLOCKED,
                "warning",
                f"{TASK_LABELS[task['kind']]} {task['id']} снято с {device['name']}: {reason}",
                device_id=device["id"],
                entity_id=task["id"],
                task_id=task["id"],
            )
    device["palletId"] = None
