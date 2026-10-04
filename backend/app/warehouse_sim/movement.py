"""Движение техники, погрузка/разгрузка, заряд, тик устройств."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.layout import (
    PACKING_POINT,
    RECEIVING_STAGING,
    ZONE_PACKING,
    ZONE_RECEIVING,
    ZONE_SHIPPING,
    ZONE_STORAGE,
)
from app.warehouse_sim.rng import rand_normal, rand_range
from app.warehouse_sim.sim_common import (
    TASK_LABELS,
    _plan_path,
    dock_by_id,
    emit,
    find_free_cell,
    fire_scan,
    handling_time,
    is_mobile_kind,
    sku_code,
)
from app.warehouse_sim.tasks import create_task, finish_task
from app.warehouse_sim.traffic import PASS_SHIFT_M, find_task, resolve_traffic
from app.warehouse_sim.world import format_sscc


# lazy import внутри process_devices избегает цикла movement ↔ failures
def _repair_device(world: dict[str, Any], device: dict[str, Any], auto: bool = False) -> None:
    from app.warehouse_sim.failures import repair_device

    repair_device(world, device, auto)


def _inject_fault(world: dict[str, Any], device: dict[str, Any], cause: str) -> None:
    from app.warehouse_sim.failures import inject_fault

    inject_fault(world, device, cause)


def advance_along_path(device: dict[str, Any], dt: float, world: dict[str, Any]) -> None:
    """Шаг position += direction * speed * dt. Ожидание решает resolve_traffic, не эта функция."""
    # cameraHold = safety stop caused by object directly in AGV path.
    if device.get("cameraHold") or device.get("status") == "waiting":
        return
    cruise = device.get("cruise")
    scale = float(1.0 if cruise is None else cruise)
    if scale <= 0:
        return
    budget = float(device["speed"]) * scale * dt
    off = float(device.get("passSide") or 0.0) * PASS_SHIFT_M
    moved = False
    while budget > 1e-6 and device["path"]:
        target = device["path"][0]
        raw_dx = float(target["x"]) - float(device["pos"]["x"])
        raw_dz = float(target["z"]) - float(device["pos"]["z"])
        if abs(raw_dx) >= abs(raw_dz):
            goal_x = float(target["x"])
            goal_z = float(target["z"]) + off
            err = goal_z - float(device["pos"]["z"])
            if abs(err) > 0.12:
                step = min(abs(err), budget)
                device["pos"]["z"] = float(device["pos"]["z"]) + (
                    step if err > 0 else -step
                )
                budget -= step
                moved = True
                if budget <= 1e-6:
                    break
        else:
            goal_x = float(target["x"]) + off
            goal_z = float(target["z"])
            err = goal_x - float(device["pos"]["x"])
            if abs(err) > 0.12:
                step = min(abs(err), budget)
                device["pos"]["x"] = float(device["pos"]["x"]) + (
                    step if err > 0 else -step
                )
                budget -= step
                moved = True
                if budget <= 1e-6:
                    break
        dx = goal_x - float(device["pos"]["x"])
        dz = goal_z - float(device["pos"]["z"])
        remaining = (dx * dx + dz * dz) ** 0.5
        if remaining <= max(budget, 0.05):
            device["pos"] = {"x": goal_x, "z": goal_z}
            device["path"].pop(0)
            budget -= min(budget, remaining)
            moved = True
        else:
            ratio = budget / remaining
            device["pos"] = {
                "x": device["pos"]["x"] + dx * ratio,
                "z": device["pos"]["z"] + dz * ratio,
            }
            budget = 0
            moved = True
    if moved and device.get("moveStartedAt") is None:
        device["moveStartedAt"] = world.get("timeSec", 0.0)
    if moved and device.get("status") == "waiting":
        device["status"] = "moving"


def pick_up_pallet(world: dict[str, Any], device: dict[str, Any], task: dict[str, Any]) -> None:
    if task["kind"] == "unload":
        truck = next(
            (t for t in world["trucks"] if t["id"] == task.get("truckId")), None
        )
        inbound = next(
            (i for i in world["inbound"] if truck and i["id"] == truck["orderIds"][0]),
            None,
        )
        sku = next(
            (s for s in world["skus"] if inbound and s["id"] == inbound["skuId"]), None
        )
        world["counters"]["pallet"] += 1
        pallet = {
            "id": f"pal-{world['counters']['pallet']}",
            "sscc": format_sscc(world["counters"]["pallet"]),
            "skuId": sku["id"] if sku else world["skus"][0]["id"],
            "qty": sku["unitsPerPallet"] if sku else 500,
            "locationKind": "device",
            "locationId": device["id"],
            "pos": dict(device["pos"]),
            "createdAt": world["timeSec"],
            "orderId": None,
            "state": "RECEIVED",
        }
        world["pallets"][pallet["id"]] = pallet
        task["palletId"] = pallet["id"]
        device["palletId"] = pallet["id"]
        dock = dock_by_id(world, truck["dockId"] if truck else None)
        if dock:
            fire_scan(
                world,
                f"scn-{dock['code']}",
                f"паллета {pallet['sscc']} ({sku_code(world, pallet['skuId'])})",
                pallet["id"],
            )
        return
    picked_raw = world["pallets"].get(task["palletId"]) if task.get("palletId") else None
    if not isinstance(picked_raw, dict):
        return
    picked: dict[str, Any] = picked_raw
    if task["kind"] == "pick" and task.get("cellId"):
        cell = world["cellById"].get(task["cellId"])
        if cell and cell["palletId"] == picked["id"]:
            cell["palletId"] = None
    picked["locationKind"] = "device"
    picked["locationId"] = device["id"]
    picked["state"] = (
        "PICKED" if task["kind"] == "pick" else picked.get("state", "STORED")
    )
    device["palletId"] = picked["id"]


def drop_off_pallet(world: dict[str, Any], device: dict[str, Any], task: dict[str, Any]) -> None:
    pallet = world["pallets"].get(task["palletId"]) if task.get("palletId") else None
    kind = task["kind"]
    if kind == "unload":
        truck = next(
            (t for t in world["trucks"] if t["id"] == task.get("truckId")), None
        )
        if truck:
            truck["palletsDone"] += 1
        inbound = next(
            (i for i in world["inbound"] if truck and i["id"] == truck["orderIds"][0]),
            None,
        )
        if inbound:
            inbound["palletsReceived"] += 1
        world["metrics"]["palletsReceived"] += 1
        if pallet:
            pallet["locationKind"] = "zone"
            pallet["locationId"] = ZONE_RECEIVING
            pallet["pos"] = dict(RECEIVING_STAGING)
            pallet["state"] = "RECEIVED"
            emit(
                world,
                ev.ITEM_RECEIVED,
                "info",
                f"Принята паллета {pallet['sscc']} ({sku_code(world, pallet['skuId'])}) в зону приёмки",
                device_id=device["id"],
                entity_id=pallet["id"],
                zone_id=ZONE_RECEIVING,
            )
            cell = find_free_cell(world, RECEIVING_STAGING, True)
            if cell:
                create_task(
                    world,
                    {
                        "kind": "putaway",
                        "from": RECEIVING_STAGING,
                        "to": cell["pos"],
                        "fromLabel": "приёмка",
                        "toLabel": f"ячейка {cell['id']}",
                        "palletId": pallet["id"],
                        "cellId": cell["id"],
                    },
                )
            else:
                emit(
                    world,
                    ev.STORAGE_FULL,
                    "error",
                    "Нет свободных ячеек для размещения",
                    zone_id=ZONE_STORAGE,
                )
    elif kind in ("putaway", "replenish"):
        cell = world["cellById"].get(task["cellId"]) if task.get("cellId") else None
        if pallet and cell and cell["palletId"] is None:
            cell["palletId"] = pallet["id"]
            pallet["locationKind"] = "cell"
            pallet["locationId"] = cell["id"]
            pallet["pos"] = dict(cell["pos"])
            pallet["state"] = "STORED"
            if kind == "putaway":
                world["metrics"]["palletsPutaway"] += 1
                inbound = next(
                    (
                        i
                        for i in world["inbound"]
                        if i["skuId"] == pallet["skuId"] and i["status"] != "closed"
                    ),
                    None,
                )
                if inbound:
                    inbound["palletsPutaway"] += 1
                emit(
                    world,
                    ev.ITEM_STORED,
                    "success",
                    f"Паллета {pallet['sscc']} размещена в ячейке {cell['id']}",
                    device_id=device["id"],
                    entity_id=pallet["id"],
                    zone_id=ZONE_STORAGE,
                )
        elif pallet:
            pallet["locationKind"] = "zone"
            pallet["locationId"] = ZONE_STORAGE
            pallet["pos"] = dict(device["pos"])
    elif kind == "pick":
        order = next(
            (o for o in world["outbound"] if o["id"] == task.get("orderId")), None
        )
        if pallet:
            pallet["locationKind"] = "zone"
            pallet["locationId"] = ZONE_PACKING
            pallet["pos"] = dict(PACKING_POINT)
            pallet["state"] = "PICKED"
            world["metrics"]["palletsPicked"] += 1
            if order:
                line = next(
                    (ln for ln in order["lines"] if ln["skuId"] == pallet["skuId"]),
                    None,
                )
                if line:
                    line["picked"] += 1
                order["palletIds"].append(pallet["id"])
                emit(
                    world,
                    ev.ITEM_PICKED,
                    "info",
                    f"Отобрана паллета {sku_code(world, pallet['skuId'])} для заказа {order['code']}",
                    device_id=device["id"],
                    entity_id=pallet["id"],
                    order_id=order["id"],
                    zone_id=ZONE_PACKING,
                )
    elif kind == "load":
        truck = next(
            (t for t in world["trucks"] if t["id"] == task.get("truckId")), None
        )
        if truck:
            truck["palletsDone"] += 1
        if pallet:
            dock = dock_by_id(world, truck["dockId"] if truck else None)
            if dock:
                fire_scan(
                    world,
                    f"scn-{dock['code']}",
                    f"отгрузка {pallet['sscc']}",
                    pallet["id"],
                )
            world["pallets"].pop(pallet["id"], None)
            world["metrics"]["palletsShipped"] += 1
            emit(
                world,
                ev.ITEM_SHIPPED,
                "info",
                f"Паллета {pallet['sscc']} загружена в {truck['plate'] if truck else 'транспорт'}",
                device_id=device["id"],
                entity_id=pallet["id"],
                zone_id=ZONE_SHIPPING,
            )


def request_charge(world: dict[str, Any], device: dict[str, Any], force: bool = False) -> None:
    if device.get("taskId") and not force:
        return
    chargers = [d for d in world["devices"] if d["kind"] == "charger"]
    if not chargers:
        return
    charger = min(
        chargers,
        key=lambda c: (
            (c["pos"]["x"] - device["pos"]["x"]) ** 2
            + (c["pos"]["z"] - device["pos"]["z"]) ** 2
        ),
    )
    emit(
        world,
        ev.AGV_BATTERY_LOW,
        "warning",
        f"{device['name']}: низкий заряд, едет на станцию",
        device_id=device["id"],
    )
    task = create_task(
        world,
        {
            "kind": "charge",
            "from": dict(device["pos"]),
            "to": dict(charger["pos"]),
            "fromLabel": device["name"],
            "toLabel": charger["name"],
            "priority": 5,
        },
    )
    task["status"] = "assigned"
    task["deviceId"] = device["id"]
    task["assignedAt"] = world["timeSec"]
    device["taskId"] = task["id"]
    device["phase"] = "to_source"
    device["status"] = "moving"
    device["path"] = _plan_path(world, device["pos"], charger["pos"])


def complete_charge(world: dict[str, Any], device: dict[str, Any]) -> None:
    task = find_task(world, device.get("taskId"))
    if device["battery"] is not None:
        device["battery"] = 100.0
    world["metrics"]["chargeCycles"] += 1
    emit(
        world,
        ev.AGV_CHARGED,
        "success",
        f"{device['name']} заряжен",
        device_id=device["id"],
    )
    if task:
        finish_task(world, device, task)
    else:
        device["status"] = "idle"
        device["phase"] = None
        device["path"] = []


def process_devices(world: dict[str, Any], dt: float) -> None:
    for item in resolve_traffic(world):
        device = item["device"]
        worker = item["worker"]
        emit(
            world,
            ev.PERSON_DETECTED_IN_PATH,
            "warning",
            f"{device['name']}: человек {worker.get('code') or worker['id']} на пути",
            device_id=device["id"],
            entity_id=worker["id"],
        )
    drain = world["config"]["batteryDrainPerMin"] / 60.0
    for device in world["devices"]:
        device["lastSeen"] = world["timeSec"]
        if device["temperature"] is not None and is_mobile_kind(device["kind"]):
            load = (
                1.0 if device["status"] in ("moving", "loading", "unloading") else 0.3
            )
            device["temperature"] = min(
                55.0,
                max(
                    18.0,
                    device["temperature"]
                    + (load - 0.4) * dt * 0.15
                    + rand_normal(world, 0, 0.05, -0.2, 0.2),
                ),
            )
        if device["status"] == "scanning":
            device["phaseTimer"] -= dt
            if device["phaseTimer"] <= 0:
                device["status"] = "idle"
            continue
        if device["status"] in ("fault", "maintenance"):
            device["repairTimer"] -= dt
            if device["repairTimer"] <= 0:
                if device["status"] == "maintenance":
                    device["health"] = 100
                    device["status"] = (
                        "idle" if is_mobile_kind(device["kind"]) else "running"
                    )
                elif world["config"]["autoRepair"]:
                    _repair_device(world, device, True)
            continue
        if not is_mobile_kind(device["kind"]):
            continue
        task = find_task(world, device.get("taskId"))
        if device["status"] in ("moving", "waiting"):
            if not device.get("cameraHold"):
                advance_along_path(device, dt, world)
            device["busySec"] += dt
            if device["battery"] is not None:
                device["battery"] = max(0.0, device["battery"] - drain * dt)
            device["health"] = max(0.0, device["health"] - dt * 0.0009)
            if device.get("palletId"):
                pallet = world["pallets"].get(device["palletId"])
                if pallet:
                    pallet["pos"] = dict(device["pos"])
            if device.get("cameraHold") or device["status"] == "waiting":
                continue
            if not device["path"] and task:
                if device["phase"] == "to_source":
                    if task["kind"] == "charge":
                        device["status"] = "charging"
                        device["phase"] = "at_source"
                        emit(
                            world,
                            ev.AGV_CHARGING,
                            "info",
                            f"{device['name']} встал на зарядную станцию",
                            device_id=device["id"],
                        )
                    else:
                        device["phase"] = "at_source"
                        device["status"] = "loading"
                        device["phaseTimer"] = handling_time(world, task["kind"], True)
                        emit(
                            world,
                            ev.TASK_STARTED,
                            "info",
                            f"{device['name']} начал {TASK_LABELS[task['kind']].lower()}",
                            device_id=device["id"],
                            task_id=task["id"],
                        )
                elif device["phase"] == "to_dest":
                    device["phase"] = "at_dest"
                    device["status"] = "unloading"
                    device["phaseTimer"] = handling_time(world, task["kind"], False)
            elif not device["path"] and not task:
                device["status"] = "idle"
            continue
        if device["status"] in ("loading", "unloading"):
            device["phaseTimer"] -= dt
            device["busySec"] += dt
            if device["battery"] is not None:
                device["battery"] = max(0.0, device["battery"] - drain * 0.6 * dt)
            if device["phaseTimer"] > 0 or not task:
                continue
            if device["phase"] == "at_source":
                pick_up_pallet(world, device, task)
                device["phase"] = "to_dest"
                device["status"] = "moving"
                device["path"] = _plan_path(world, device["pos"], task["to"])
            else:
                drop_off_pallet(world, device, task)
                finish_task(world, device, task)
            continue
        if device["status"] == "charging":
            if device["battery"] is not None:
                device["battery"] = min(100.0, device["battery"] + dt * 0.28)
                if device["battery"] >= 96:
                    complete_charge(world, device)
            else:
                complete_charge(world, device)
            continue
        if device["status"] == "idle" and device["online"]:
            if device["battery"] is not None and device["battery"] < 25:
                request_charge(world, device, device["battery"] < 12)
                continue
            if device["health"] < 12:
                device["status"] = "maintenance"
                device["repairTimer"] = rand_range(world, 180, 420)
        if device["battery"] is not None and device["battery"] <= 1:
            _inject_fault(world, device, "полный разряд батареи")
