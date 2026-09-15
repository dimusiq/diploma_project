"""Движок склада: тик модельного времени, задания, движение, заказы, отказы."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.events import INTEGRATION_EVENT_TYPES
from app.warehouse_sim.layout import (
    PACKING_POINT,
    RECEIVING_STAGING,
    SHIPPING_STAGING,
    ZONE_CHARGING,
    ZONE_PACKING,
    ZONE_RECEIVING,
    ZONE_SHIPPING,
    ZONE_STORAGE,
    zone_center,
)
from app.warehouse_sim.rng import (
    event_occurs,
    rand_chance,
    rand_int,
    rand_normal,
    rand_pick,
    rand_range,
)
from app.warehouse_sim.routing import astar_path, path_blocked_by_device
from app.warehouse_sim.world import format_sscc

MAX_SUBSTEP_SEC = 1.0
MAX_EVENTS = 400
MAX_DONE_TASKS = 60
MAX_HISTORY = 40
SENSOR_SAMPLE_SEC = 5.0
SENSOR_SPIKE_CHANCE = 0.001
REPLENISH_CHECK_SEC = 300.0
SHIFT_SEC = 4 * 3600
TASKS_PER_TRUCK = 2
MOBILE_KINDS = ("forklift", "agv", "amr")

TASK_DEVICE_KINDS = {
    "unload": ["forklift"],
    "putaway": ["forklift", "agv"],
    "pick": ["amr", "agv"],
    "load": ["forklift"],
    "replenish": ["agv", "forklift"],
    "charge": [],
}
TASK_PRIORITY = {
    "load": 4,
    "unload": 3,
    "pick": 3,
    "putaway": 2,
    "replenish": 1,
    "charge": 5,
}
TASK_LABELS = {
    "unload": "Разгрузка",
    "putaway": "Размещение",
    "pick": "Отбор",
    "load": "Погрузка",
    "replenish": "Пополнение",
    "charge": "Заряд",
}
CARRIERS = ["ТК «Север»", "Логистик-Плюс", "АвтоТранс", "СкладСервис", "Грузовик77"]
CUSTOMERS = [
    "ООО «Магнит-Ритейл»",
    "Сеть «Перекрёсток»",
    "ИП Кузнецов",
    "ООО «ОптТорг»",
    "Маркетплейс «Заря»",
    "Аптека «Здоровье»",
]


def is_mobile_kind(kind: str) -> bool:
    return kind in MOBILE_KINDS


def task_kind_label(kind: str) -> str:
    return TASK_LABELS.get(kind, kind)


def _sev(name: str) -> str:
    return {"info": "info", "success": "success", "warning": "warning", "error": "error"}.get(
        name, "info"
    )


def emit(
    world: dict,
    event_type: str,
    severity: str,
    message: str,
    *,
    device_id: str | None = None,
    entity_id: str | None = None,
    zone_id: str | None = None,
    task_id: str | None = None,
    order_id: str | None = None,
) -> dict:
    world["counters"]["event"] += 1
    event = {
        "id": world["counters"]["event"],
        "at": world["timeSec"],
        "type": event_type,
        "severity": _sev(severity),
        "message": message,
        "deviceId": device_id,
        "entityId": entity_id,
        "zoneId": zone_id,
        "taskId": task_id,
        "orderId": order_id,
    }
    world["events"].insert(0, event)
    if len(world["events"]) > MAX_EVENTS:
        del world["events"][MAX_EVENTS:]
    world["metrics"]["eventsTotal"] += 1
    counts = world["eventCountsByType"]
    counts[event_type] = counts.get(event_type, 0) + 1
    if device_id:
        device = world["deviceById"].get(device_id)
        if device:
            device["lastEventAt"] = world["timeSec"]
            device["lastSeen"] = world["timeSec"]
    _enqueue_integration(world, event)
    return event


def _enqueue_integration(world: dict, event: dict) -> None:
    if event.get("type") not in INTEGRATION_EVENT_TYPES:
        return
    queue = world.setdefault("integration_queue", [])
    queue.append(
        {
            "type": event["type"],
            "event": event,
            "context": _integration_context(world, event),
        }
    )


def _integration_context(world: dict, event: dict) -> dict[str, Any]:
    ctx: dict[str, Any] = {}
    entity_id = event.get("entityId")
    task_id = event.get("taskId")
    order_id = event.get("orderId")
    device_id = event.get("deviceId")
    if task_id:
        task = next((t for t in world["tasks"] if t["id"] == task_id), None)
        if task:
            ctx["task"] = dict(task)
    if order_id:
        outbound = next((o for o in world["outbound"] if o["id"] == order_id), None)
        if outbound:
            ctx["outbound"] = {
                **outbound,
                "lines": [dict(line) for line in outbound.get("lines", [])],
                "palletIds": list(outbound.get("palletIds") or []),
            }
        inbound = next((row for row in world["inbound"] if row["id"] == order_id), None)
        if inbound:
            ctx["inbound"] = dict(inbound)
    if entity_id:
        pallet = world["pallets"].get(entity_id)
        if pallet:
            ctx["pallet"] = dict(pallet)
            cell = world["cellById"].get(pallet.get("locationId"))
            if cell:
                ctx["cell"] = {
                    "id": cell["id"],
                    "rackId": cell["rackId"],
                    "bay": cell["bay"],
                    "level": cell["level"],
                }
        truck = next((t for t in world["trucks"] if t["id"] == entity_id), None)
        if truck:
            ctx["truck"] = {**truck, "orderIds": list(truck.get("orderIds") or [])}
            inbound = next(
                (row for row in world["inbound"] if row["id"] in truck.get("orderIds", [])),
                None,
            )
            if inbound:
                ctx.setdefault("inbound", dict(inbound))
            outbound_ids = truck.get("orderIds") or []
            ctx["outbound_batch"] = [
                {
                    **row,
                    "lines": [dict(line) for line in row.get("lines", [])],
                    "palletIds": list(row.get("palletIds") or []),
                }
                for row in world["outbound"]
                if row["id"] in outbound_ids
            ]
        inbound_ent = next((row for row in world["inbound"] if row["id"] == entity_id), None)
        if inbound_ent:
            ctx.setdefault("inbound", dict(inbound_ent))
        outbound_ent = next((row for row in world["outbound"] if row["id"] == entity_id), None)
        if outbound_ent:
            ctx.setdefault(
                "outbound",
                {
                    **outbound_ent,
                    "lines": [dict(line) for line in outbound_ent.get("lines", [])],
                    "palletIds": list(outbound_ent.get("palletIds") or []),
                },
            )
    if ctx.get("task"):
        pallet_id = ctx["task"].get("palletId")
        if pallet_id and "pallet" not in ctx:
            pallet = world["pallets"].get(pallet_id)
            if pallet:
                ctx["pallet"] = dict(pallet)
                cell = world["cellById"].get(pallet.get("locationId") or ctx["task"].get("cellId"))
                if cell:
                    ctx["cell"] = {
                        "id": cell["id"],
                        "rackId": cell["rackId"],
                        "bay": cell["bay"],
                        "level": cell["level"],
                    }
        cell_id = ctx["task"].get("cellId")
        if cell_id and "cell" not in ctx:
            cell = world["cellById"].get(cell_id)
            if cell:
                ctx["cell"] = {
                    "id": cell["id"],
                    "rackId": cell["rackId"],
                    "bay": cell["bay"],
                    "level": cell["level"],
                }
        truck_id = ctx["task"].get("truckId")
        if truck_id and "truck" not in ctx:
            truck = next((t for t in world["trucks"] if t["id"] == truck_id), None)
            if truck:
                ctx["truck"] = {**truck, "orderIds": list(truck.get("orderIds") or [])}
        oid = ctx["task"].get("orderId")
        if oid and "outbound" not in ctx:
            outbound = next((o for o in world["outbound"] if o["id"] == oid), None)
            if outbound:
                ctx["outbound"] = {
                    **outbound,
                    "lines": [dict(line) for line in outbound.get("lines", [])],
                    "palletIds": list(outbound.get("palletIds") or []),
                }
    if device_id:
        device = world["deviceById"].get(device_id)
        if device:
            ctx["device"] = {
                "id": device["id"],
                "kind": device["kind"],
                "name": device["name"],
                "status": device["status"],
            }
    sku_id = None
    if ctx.get("pallet"):
        sku_id = ctx["pallet"].get("skuId")
    elif ctx.get("inbound"):
        sku_id = ctx["inbound"].get("skuId")
    if sku_id:
        sku = next((s for s in world["skus"] if s["id"] == sku_id), None)
        if sku:
            ctx["sku"] = dict(sku)
        if "inbound" not in ctx:
            inbound = next(
                (
                    row
                    for row in world["inbound"]
                    if row.get("skuId") == sku_id and row.get("status") != "closed"
                ),
                None,
            )
            if inbound:
                ctx["inbound"] = dict(inbound)
    return ctx


def find_task(world: dict, task_id: str | None) -> dict | None:
    if not task_id:
        return None
    for task in world["tasks"]:
        if task["id"] == task_id:
            return task
    return None


def sku_code(world: dict, sku_id: str) -> str:
    for sku in world["skus"]:
        if sku["id"] == sku_id:
            return sku["code"]
    return sku_id


def find_free_cell(world: dict, near: dict, prefer_near: bool = True) -> dict | None:
    free = [c for c in world["cells"] if c["palletId"] is None and not c["blocked"]]
    if not free:
        return None
    if not prefer_near:
        return free[0]
    best = min(
        free,
        key=lambda c: (c["pos"]["x"] - near["x"]) ** 2 + (c["pos"]["z"] - near["z"]) ** 2,
    )
    return best


def find_stock_cell(world: dict, sku_id: str, reserved: set[str]) -> dict | None:
    for cell in world["cells"]:
        pid = cell["palletId"]
        if not pid or pid in reserved:
            continue
        pallet = world["pallets"].get(pid)
        if pallet and pallet["skuId"] == sku_id and pallet.get("orderId") is None:
            return cell
    return None


def dock_by_id(world: dict, dock_id: str | None) -> dict | None:
    if not dock_id:
        return None
    for dock in world["topology"]["docks"]:
        if dock["id"] == dock_id:
            return dock
    return None


def _plan_path(world: dict, start: dict, goal: dict) -> list[dict]:
    extra: set[tuple[int, int]] = set()
    moving = [
        d
        for d in world["devices"]
        if is_mobile_kind(d["kind"]) and d["status"] in ("moving", "waiting")
    ]
    for device in moving:
        extra.add((int(round(device["pos"]["x"])), int(round(device["pos"]["z"]))))
    return astar_path(start, goal, world["topology"]["racks"], extra_blocked=extra)


def create_task(world: dict, draft: dict) -> dict:
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


def pick_worker(world: dict, kind: str) -> dict | None:
    role = {"unload": "receiver", "load": "loader", "pick": "picker"}.get(kind, "operator")
    idle = [w for w in world["workers"] if w["status"] == "idle"]
    if not idle:
        return None
    return next((w for w in idle if w["role"] == role), idle[0])


def assign_tasks(world: dict) -> None:
    pending = [t for t in world["tasks"] if t["status"] == "pending"]
    pending.sort(key=lambda t: (-t["priority"], t["createdAt"]))
    for task in pending:
        kinds = TASK_DEVICE_KINDS.get(task["kind"], [])
        if not kinds:
            continue
        chosen = None
        best_d = 1e18
        for device in world["devices"]:
            if device["kind"] not in kinds:
                continue
            if not device["online"] or device["status"] != "idle" or device["taskId"]:
                continue
            if device["battery"] is not None and device["battery"] < 20:
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


def release_worker(world: dict, worker_id: str | None) -> None:
    if not worker_id:
        return
    for worker in world["workers"]:
        if worker["id"] == worker_id:
            worker["taskId"] = None
            worker["deviceId"] = None
            if worker["status"] == "busy":
                worker["status"] = "idle"
            return


def finish_task(world: dict, device: dict, task: dict) -> None:
    task["status"] = "done"
    task["doneAt"] = world["timeSec"]
    task["deviceId"] = device["id"]
    world["metrics"]["tasksDone"] += 1
    worker = next((w for w in world["workers"] if w["id"] == task.get("workerId")), None)
    if worker:
        worker["tasksDone"] += 1
        worker["taskId"] = None
        worker["deviceId"] = None
        if rand_chance(world, 0.08):
            worker["status"] = "break"
            worker["breakTimer"] = rand_range(world, 90, 240)
            emit(world, ev.WORKER_BREAK, "info", f"{worker['name']} ушёл на перерыв", entity_id=worker["id"])
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
    emit(world, ev.DEVICE_IDLE, "info", f"{device['name']} свободен", device_id=device["id"])


def abort_task(world: dict, device: dict, reason: str) -> None:
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


def fire_scan(world: dict, scanner_id: str, label: str, entity_id: str) -> bool:
    scanner = world["deviceById"].get(scanner_id)
    world["metrics"]["scans"] += 1
    if scanner and scanner["online"] and scanner["status"] != "fault":
        scanner["status"] = "scanning"
        scanner["phaseTimer"] = 1.5
    if rand_chance(world, world["config"]["scanErrorRate"]):
        world["metrics"]["scanFailures"] += 1
        emit(world, ev.SCAN_FAILED, "warning", f"Ошибка считывания: {label}", device_id=scanner_id, entity_id=entity_id)
        return False
    emit(world, ev.ITEM_SCANNED, "info", f"Считано: {label}", device_id=scanner_id, entity_id=entity_id)
    return True


def _plate(world: dict) -> str:
    letters = "АВЕКМНОРСТУХ"
    l1 = letters[rand_int(world, 0, len(letters) - 1)]
    l2 = letters[rand_int(world, 0, len(letters) - 1)]
    l3 = letters[rand_int(world, 0, len(letters) - 1)]
    return f"{l1}{rand_int(world, 100, 999)}{l2}{l3} {rand_int(world, 10, 99)}"


def spawn_inbound_truck(world: dict) -> dict:
    world["counters"]["truck"] += 1
    world["counters"]["inbound"] += 1
    sku = rand_pick(world, world["skus"])
    pallets_planned = rand_int(world, 4, 10)
    inbound_id = f"inb-{world['counters']['inbound']}"
    truck_id = f"trk-{world['counters']['truck']}"
    world["inbound"].append(
        {
            "id": inbound_id,
            "code": f"IN-{2600 + world['counters']['inbound']}",
            "skuId": sku["id"],
            "palletsPlanned": pallets_planned,
            "palletsReceived": 0,
            "palletsPutaway": 0,
            "status": "awaiting",
            "truckId": truck_id,
            "createdAt": world["timeSec"],
        }
    )
    truck = {
        "id": truck_id,
        "plate": _plate(world),
        "carrier": rand_pick(world, CARRIERS),
        "direction": "inbound",
        "status": "queued",
        "dockId": None,
        "arrivedAt": world["timeSec"],
        "dockedAt": None,
        "palletsPlanned": pallets_planned,
        "palletsDone": 0,
        "orderIds": [inbound_id],
        "pos": {"x": -14.0, "z": 22.0},
        "departTimer": 0.0,
    }
    world["trucks"].append(truck)
    world["metrics"]["trucksArrived"] += 1
    emit(
        world,
        ev.TRUCK_ARRIVED,
        "info",
        f"Прибыл транспорт {truck['plate']} ({truck['carrier']}): {pallets_planned} пал. {sku['code']}",
        entity_id=truck["id"],
        zone_id=ZONE_RECEIVING,
    )
    return truck


def spawn_outbound_truck(world: dict, orders: list[dict]) -> None:
    world["counters"]["truck"] += 1
    planned = sum(sum(line["pallets"] for line in order["lines"]) for order in orders)
    truck = {
        "id": f"trk-{world['counters']['truck']}",
        "plate": _plate(world),
        "carrier": rand_pick(world, CARRIERS),
        "direction": "outbound",
        "status": "queued",
        "dockId": None,
        "arrivedAt": world["timeSec"],
        "dockedAt": None,
        "palletsPlanned": planned,
        "palletsDone": 0,
        "orderIds": [o["id"] for o in orders],
        "pos": {"x": 118.0, "z": 44.0},
        "departTimer": 0.0,
    }
    world["trucks"].append(truck)
    world["metrics"]["trucksArrived"] += 1
    for order in orders:
        order["status"] = "loading"
    codes = ", ".join(o["code"] for o in orders)
    emit(
        world,
        ev.TRUCK_ARRIVED,
        "info",
        f"Подан транспорт под отгрузку {truck['plate']}: заказы {codes}",
        entity_id=truck["id"],
        zone_id=ZONE_SHIPPING,
    )


def spawn_outbound_order(world: dict, urgent: bool = False) -> dict:
    world["counters"]["outbound"] += 1
    n_lines = rand_int(world, 1, 3)
    used: set[str] = set()
    lines = []
    for _ in range(n_lines):
        sku = rand_pick(world, world["skus"])
        if sku["id"] in used:
            continue
        used.add(sku["id"])
        lines.append({"skuId": sku["id"], "pallets": rand_int(world, 1, 3), "picked": 0})
    if not lines:
        sku = world["skus"][0]
        lines = [{"skuId": sku["id"], "pallets": 1, "picked": 0}]
    order = {
        "id": f"out-{world['counters']['outbound']}",
        "code": f"SO-{4100 + world['counters']['outbound']}",
        "customer": rand_pick(world, CUSTOMERS),
        "lines": lines,
        "status": "new",
        "priority": "urgent" if urgent else "normal",
        "createdAt": world["timeSec"],
        "dueAt": world["timeSec"] + rand_range(world, 1800, 7200),
        "shippedAt": None,
        "packTimer": 0.0,
        "palletIds": [],
    }
    world["outbound"].append(order)
    world["metrics"]["ordersCreated"] += 1
    emit(
        world,
        ev.ORDER_CREATED,
        "info" if not urgent else "warning",
        f"Заказ {order['code']} ({order['customer']})" + (" — срочный" if urgent else ""),
        entity_id=order["id"],
        order_id=order["id"],
    )
    return order


def _reposition_queued_trucks(world: dict) -> None:
    inbound_i = outbound_i = 0
    for truck in world["trucks"]:
        if truck["status"] != "queued":
            continue
        if truck["direction"] == "inbound":
            truck["pos"] = {"x": -14 - (inbound_i // 3) * 8, "z": 10 + (inbound_i % 3) * 12}
            inbound_i += 1
        else:
            truck["pos"] = {"x": 118 + (outbound_i // 3) * 8, "z": 34 + (outbound_i % 3) * 10}
            outbound_i += 1


def process_docks(world: dict, dt: float) -> None:
    docks = world["topology"]["docks"]
    occupied = 0
    for dock in docks:
        door = world["deviceById"].get(dock["id"])
        if door and door["status"] == "occupied":
            occupied += 1
    world["metrics"]["dockSec"] += dt * len(docks)
    world["metrics"]["dockBusySec"] += dt * occupied

    for truck in world["trucks"]:
        if truck["status"] != "queued":
            continue
        dock = next(
            (
                item
                for item in docks
                if item["direction"] == truck["direction"]
                and (door := world["deviceById"].get(item["id"]))
                and door["online"]
                and door["status"] == "idle"
            ),
            None,
        )
        if not dock:
            continue
        door = world["deviceById"][dock["id"]]
        door["status"] = "occupied"
        truck["status"] = "docked"
        truck["dockId"] = dock["id"]
        truck["dockedAt"] = world["timeSec"]
        truck["pos"] = dict(dock["yardPos"])
        if truck["direction"] == "inbound":
            inbound = next((i for i in world["inbound"] if i["id"] == truck["orderIds"][0]), None)
            if inbound:
                inbound["status"] = "unloading"
            emit(
                world,
                ev.RECEIVING_STARTED,
                "info",
                f"{truck['plate']} подан к воротам {dock['code']}, начата приёмка",
                device_id=dock["id"],
                entity_id=truck["id"],
                zone_id=ZONE_RECEIVING,
            )
        else:
            emit(
                world,
                ev.TASK_STARTED,
                "info",
                f"{truck['plate']} подан к воротам {dock['code']}",
                device_id=dock["id"],
                entity_id=truck["id"],
            )

    for truck in world["trucks"]:
        if truck["status"] != "docked":
            continue
        dock = dock_by_id(world, truck["dockId"])
        if not dock:
            continue
        active = len(
            [t for t in world["tasks"] if t.get("truckId") == truck["id"] and t["status"] != "done"]
        )
        remaining = truck["palletsPlanned"] - truck["palletsDone"] - active
        if remaining <= 0:
            continue
        slots = min(TASKS_PER_TRUCK - active, remaining)
        for _ in range(max(0, slots)):
            if truck["direction"] == "inbound":
                create_task(
                    world,
                    {
                        "kind": "unload",
                        "from": dock["pos"],
                        "to": RECEIVING_STAGING,
                        "fromLabel": f"ворота {dock['code']}",
                        "toLabel": "приёмка",
                        "truckId": truck["id"],
                    },
                )
            else:
                pallet = _find_staged_pallet(world, truck)
                if not pallet:
                    break
                create_task(
                    world,
                    {
                        "kind": "load",
                        "from": SHIPPING_STAGING,
                        "to": dock["pos"],
                        "fromLabel": "буфер отгрузки",
                        "toLabel": f"ворота {dock['code']}",
                        "truckId": truck["id"],
                        "palletId": pallet["id"],
                        "orderId": pallet.get("orderId"),
                    },
                )

    departed: list[dict] = []
    for truck in world["trucks"]:
        if truck["status"] != "docked" or truck["palletsDone"] < truck["palletsPlanned"]:
            continue
        truck["departTimer"] += dt
        if truck["departTimer"] < 45:
            continue
        dock = dock_by_id(world, truck["dockId"])
        door = world["deviceById"].get(dock["id"]) if dock else None
        if door:
            door["status"] = "idle"
        truck["status"] = "departed"
        world["metrics"]["trucksDeparted"] += 1
        if truck["direction"] == "inbound":
            inbound = next((i for i in world["inbound"] if i["id"] == truck["orderIds"][0]), None)
            if inbound:
                inbound["status"] = "received"
            emit(
                world,
                ev.TRUCK_DEPARTED,
                "success",
                f"Разгрузка завершена, {truck['plate']} покинул склад ({truck['palletsDone']} пал.)",
                entity_id=truck["id"],
                zone_id=ZONE_RECEIVING,
            )
        else:
            for oid in truck["orderIds"]:
                order = next((o for o in world["outbound"] if o["id"] == oid), None)
                if not order:
                    continue
                order["status"] = "shipped"
                order["shippedAt"] = world["timeSec"]
                world["metrics"]["ordersShipped"] += 1
                world["metrics"]["orderCycleSumSec"] += world["timeSec"] - order["createdAt"]
                world["metrics"]["orderCycleCount"] += 1
                late = world["timeSec"] > order["dueAt"]
                if late:
                    world["metrics"]["ordersLate"] += 1
                emit(
                    world,
                    ev.ITEM_SHIPPED,
                    "warning" if late else "success",
                    f"Заказ {order['code']} отгружен{' с опозданием' if late else ' в срок'} ({order['customer']})",
                    entity_id=order["id"],
                    order_id=order["id"],
                    zone_id=ZONE_SHIPPING,
                )
            emit(
                world,
                ev.TRUCK_DEPARTED,
                "success",
                f"Транспорт {truck['plate']} ушёл с {truck['palletsDone']} пал.",
                entity_id=truck["id"],
                zone_id=ZONE_SHIPPING,
            )
        departed.append(truck)
    world["trucks"] = [t for t in world["trucks"] if t["status"] != "departed"]
    _reposition_queued_trucks(world)


def _find_staged_pallet(world: dict, truck: dict) -> dict | None:
    reserved = {
        t["palletId"]
        for t in world["tasks"]
        if t.get("palletId") and t["status"] != "done" and t.get("truckId") == truck["id"]
    }
    for pid in (
        pid
        for order in world["outbound"]
        if order["id"] in truck["orderIds"]
        for pid in order["palletIds"]
    ):
        pallet = world["pallets"].get(pid)
        if not pallet or pid in reserved:
            continue
        if pallet["locationKind"] == "zone" and pallet["locationId"] == ZONE_SHIPPING:
            return pallet
        if pallet["locationKind"] == "zone" and pallet["locationId"] == ZONE_PACKING:
            pallet["locationId"] = ZONE_SHIPPING
            pallet["pos"] = dict(SHIPPING_STAGING)
            pallet["state"] = "PACKED"
            return pallet
    return None


def process_order_generation(world: dict, dt: float) -> None:
    world["accumulators"]["order"] += world["config"]["ordersPerHour"] / 3600.0 * dt
    while world["accumulators"]["order"] >= 1:
        world["accumulators"]["order"] -= 1
        spawn_outbound_order(world, urgent=rand_chance(world, 0.12))


def process_truck_arrivals(world: dict, dt: float) -> None:
    world["accumulators"]["truckArrival"] += world["config"]["truckArrivalsPerHour"] / 3600.0 * dt
    while world["accumulators"]["truckArrival"] >= 1:
        world["accumulators"]["truckArrival"] -= 1
        spawn_inbound_truck(world)


def process_order_allocation(world: dict) -> None:
    reserved: set[str] = set()
    for task in world["tasks"]:
        if task.get("cellId") and task["status"] != "done":
            reserved.add(task["cellId"])
    for order in world["outbound"]:
        if order["status"] not in ("new", "backorder"):
            continue
        missing = False
        created = False
        for line in order["lines"]:
            need = line["pallets"] - line["picked"]
            open_picks = len(
                [
                    t
                    for t in world["tasks"]
                    if t.get("orderId") == order["id"]
                    and t["kind"] == "pick"
                    and t["status"] != "done"
                    and world["pallets"].get(t.get("palletId") or "", {}).get("skuId") == line["skuId"]
                ]
            )
            need -= open_picks
            for _ in range(max(0, need)):
                cell = find_stock_cell(world, line["skuId"], reserved)
                if not cell:
                    missing = True
                    break
                reserved.add(cell["id"])
                pallet = world["pallets"][cell["palletId"]]
                pallet["orderId"] = order["id"]
                pallet["state"] = "RESERVED"
                create_task(
                    world,
                    {
                        "kind": "pick",
                        "from": cell["pos"],
                        "to": PACKING_POINT,
                        "fromLabel": f"ячейка {cell['id']}",
                        "toLabel": "упаковка",
                        "palletId": pallet["id"],
                        "cellId": cell["id"],
                        "orderId": order["id"],
                    },
                )
                created = True
        if created and order["status"] == "new":
            order["status"] = "picking"
            emit(
                world,
                ev.ORDER_RELEASED,
                "info",
                f"Заказ {order['code']} выпущен в отбор",
                entity_id=order["id"],
                order_id=order["id"],
            )
            emit(
                world,
                ev.PICKING_STARTED,
                "info",
                f"Начат отбор заказа {order['code']}",
                entity_id=order["id"],
                order_id=order["id"],
            )
        elif missing and order["status"] == "new":
            order["status"] = "backorder"


def process_packing(world: dict, dt: float) -> None:
    jammed = any(d["kind"] == "conveyor" and d["status"] == "jam" for d in world["devices"])
    for order in world["outbound"]:
        if order["status"] != "picking":
            continue
        if all(line["picked"] >= line["pallets"] for line in order["lines"]):
            order["status"] = "packing"
            order["packTimer"] = rand_range(world, 40, 90)
            emit(
                world,
                ev.PICKING_COMPLETED,
                "success",
                f"Отбор заказа {order['code']} завершён, упаковка",
                entity_id=order["id"],
                order_id=order["id"],
            )
        elif order["status"] == "backorder":
            process_order_allocation(world)
    for order in world["outbound"]:
        if order["status"] != "packing":
            continue
        if jammed:
            continue
        order["packTimer"] -= dt
        if order["packTimer"] > 0:
            continue
        fire_scan(world, "scn-PACK", f"заказ {order['code']}", order["id"])
        order["status"] = "staged"
        for pid in order["palletIds"]:
            pallet = world["pallets"].get(pid)
            if pallet:
                pallet["locationKind"] = "zone"
                pallet["locationId"] = ZONE_SHIPPING
                pallet["pos"] = dict(SHIPPING_STAGING)
                pallet["state"] = "PACKED"
        emit(
            world,
            ev.ITEM_PACKED,
            "success",
            f"Заказ {order['code']} упакован и стоит в буфере отгрузки",
            entity_id=order["id"],
            order_id=order["id"],
            zone_id=ZONE_SHIPPING,
        )


def process_shipping(world: dict) -> None:
    staged = [o for o in world["outbound"] if o["status"] == "staged"]
    if not staged:
        return
    waiting_out = [t for t in world["trucks"] if t["direction"] == "outbound" and t["status"] != "departed"]
    if waiting_out:
        return
    batch = staged[:3]
    spawn_outbound_truck(world, batch)


def handling_time(world: dict, kind: str, at_source: bool) -> float:
    if kind == "unload":
        return rand_normal(world, 24 if at_source else 14, 5, 8, 50)
    if kind == "putaway":
        return rand_normal(world, 12 if at_source else 18, 4, 6, 40)
    if kind == "pick":
        return rand_normal(world, 20 if at_source else 12, 5, 7, 45)
    if kind == "load":
        return rand_normal(world, 14 if at_source else 22, 5, 8, 50)
    if kind == "replenish":
        return rand_normal(world, 16, 4, 8, 40)
    if kind == "charge":
        return 4
    return 12


def advance_along_path(device: dict, dt: float, world: dict) -> None:
    others = [
        d["pos"]
        for d in world["devices"]
        if is_mobile_kind(d["kind"]) and d["id"] != device["id"] and d["status"] in ("moving", "waiting", "loading", "unloading")
    ]
    budget = device["speed"] * dt
    while budget > 0 and device["path"]:
        target = device["path"][0]
        if path_blocked_by_device(target, others):
            device["status"] = "waiting"
            return
        if device["status"] == "waiting":
            device["status"] = "moving"
        dx = target["x"] - device["pos"]["x"]
        dz = target["z"] - device["pos"]["z"]
        remaining = (dx * dx + dz * dz) ** 0.5
        if remaining <= budget:
            device["pos"] = dict(target)
            device["path"].pop(0)
            budget -= remaining
        else:
            ratio = budget / remaining
            device["pos"] = {
                "x": device["pos"]["x"] + dx * ratio,
                "z": device["pos"]["z"] + dz * ratio,
            }
            budget = 0


def pick_up_pallet(world: dict, device: dict, task: dict) -> None:
    if task["kind"] == "unload":
        truck = next((t for t in world["trucks"] if t["id"] == task.get("truckId")), None)
        inbound = next((i for i in world["inbound"] if truck and i["id"] == truck["orderIds"][0]), None)
        sku = next((s for s in world["skus"] if inbound and s["id"] == inbound["skuId"]), None)
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
            fire_scan(world, f"scn-{dock['code']}", f"паллета {pallet['sscc']} ({sku_code(world, pallet['skuId'])})", pallet["id"])
        return
    pallet = world["pallets"].get(task["palletId"]) if task.get("palletId") else None
    if not pallet:
        return
    if task["kind"] == "pick" and task.get("cellId"):
        cell = world["cellById"].get(task["cellId"])
        if cell and cell["palletId"] == pallet["id"]:
            cell["palletId"] = None
    pallet["locationKind"] = "device"
    pallet["locationId"] = device["id"]
    pallet["state"] = "PICKED" if task["kind"] == "pick" else pallet.get("state", "STORED")
    device["palletId"] = pallet["id"]


def drop_off_pallet(world: dict, device: dict, task: dict) -> None:
    pallet = world["pallets"].get(task["palletId"]) if task.get("palletId") else None
    kind = task["kind"]
    if kind == "unload":
        truck = next((t for t in world["trucks"] if t["id"] == task.get("truckId")), None)
        if truck:
            truck["palletsDone"] += 1
        inbound = next((i for i in world["inbound"] if truck and i["id"] == truck["orderIds"][0]), None)
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
                emit(world, ev.STORAGE_FULL, "error", "Нет свободных ячеек для размещения", zone_id=ZONE_STORAGE)
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
                    (i for i in world["inbound"] if i["skuId"] == pallet["skuId"] and i["status"] != "closed"),
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
        order = next((o for o in world["outbound"] if o["id"] == task.get("orderId")), None)
        if pallet:
            pallet["locationKind"] = "zone"
            pallet["locationId"] = ZONE_PACKING
            pallet["pos"] = dict(PACKING_POINT)
            pallet["state"] = "PICKED"
            world["metrics"]["palletsPicked"] += 1
            if order:
                line = next((ln for ln in order["lines"] if ln["skuId"] == pallet["skuId"]), None)
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
        truck = next((t for t in world["trucks"] if t["id"] == task.get("truckId")), None)
        if truck:
            truck["palletsDone"] += 1
        if pallet:
            dock = dock_by_id(world, truck["dockId"] if truck else None)
            if dock:
                fire_scan(world, f"scn-{dock['code']}", f"отгрузка {pallet['sscc']}", pallet["id"])
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


def request_charge(world: dict, device: dict, force: bool = False) -> None:
    if device.get("taskId") and not force:
        return
    chargers = [d for d in world["devices"] if d["kind"] == "charger"]
    if not chargers:
        return
    charger = min(
        chargers,
        key=lambda c: (c["pos"]["x"] - device["pos"]["x"]) ** 2 + (c["pos"]["z"] - device["pos"]["z"]) ** 2,
    )
    emit(world, ev.AGV_BATTERY_LOW, "warning", f"{device['name']}: низкий заряд, едет на станцию", device_id=device["id"])
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


def complete_charge(world: dict, device: dict) -> None:
    task = find_task(world, device.get("taskId"))
    if device["battery"] is not None:
        device["battery"] = 100.0
    world["metrics"]["chargeCycles"] += 1
    emit(world, ev.AGV_CHARGED, "success", f"{device['name']} заряжен", device_id=device["id"])
    if task:
        finish_task(world, device, task)
    else:
        device["status"] = "idle"
        device["phase"] = None
        device["path"] = []


def inject_fault(world: dict, device: dict, cause: str) -> None:
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


def repair_device(world: dict, device: dict, auto: bool) -> None:
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


def process_devices(world: dict, dt: float) -> None:
    drain = world["config"]["batteryDrainPerMin"] / 60.0
    for device in world["devices"]:
        device["lastSeen"] = world["timeSec"]
        if device["temperature"] is not None and is_mobile_kind(device["kind"]):
            load = 1.0 if device["status"] in ("moving", "loading", "unloading") else 0.3
            device["temperature"] = min(55.0, max(18.0, device["temperature"] + (load - 0.4) * dt * 0.15 + rand_normal(world, 0, 0.05, -0.2, 0.2)))
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
                    device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
                elif world["config"]["autoRepair"]:
                    repair_device(world, device, True)
            continue
        if not is_mobile_kind(device["kind"]):
            continue
        task = find_task(world, device.get("taskId"))
        if device["status"] in ("moving", "waiting"):
            advance_along_path(device, dt, world)
            device["busySec"] += dt
            if device["battery"] is not None:
                device["battery"] = max(0.0, device["battery"] - drain * dt)
            device["health"] = max(0.0, device["health"] - dt * 0.0009)
            if device.get("palletId"):
                pallet = world["pallets"].get(device["palletId"])
                if pallet:
                    pallet["pos"] = dict(device["pos"])
            if device["status"] == "waiting":
                continue
            if not device["path"] and task:
                if device["phase"] == "to_source":
                    if task["kind"] == "charge":
                        device["status"] = "charging"
                        device["phase"] = "at_source"
                        emit(world, ev.AGV_CHARGING, "info", f"{device['name']} встал на зарядную станцию", device_id=device["id"])
                    else:
                        device["phase"] = "at_source"
                        device["status"] = "loading"
                        device["phaseTimer"] = handling_time(world, task["kind"], True)
                        emit(world, ev.TASK_STARTED, "info", f"{device['name']} начал {TASK_LABELS[task['kind']].lower()}", device_id=device["id"], task_id=task["id"])
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
            inject_fault(world, device, "полный разряд батареи")


def process_faults(world: dict, dt: float) -> None:
    for device in world["devices"]:
        if not device["online"] or device["status"] in ("fault", "maintenance", "offline"):
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
            ["перегрев привода", "ошибка датчика вил", "потеря связи с контроллером", "сбой навигации"]
            if is_mobile_kind(device["kind"])
            else ["ошибка прошивки", "потеря сети", "аппаратный сбой"]
        )
        inject_fault(world, device, rand_pick(world, causes))


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
                emit(world, ev.CONVEYOR_STARTED, "success", f"{device['name']}: замятие устранено", device_id=device["id"])
            continue
        if device["status"] != "running" or not device["online"]:
            device["metric"] = 0
            continue
        load = packing_count * 9 if device["id"] == "cnv-2" else len([t for t in world["trucks"] if t["status"] == "docked"]) * 7
        device["metric"] = round(rand_normal(world, load, 2, 0, 60))
        if event_occurs(world, world["config"]["jamRatePerHour"], dt):
            device["status"] = "jam"
            device["repairTimer"] = rand_range(world, 45, 180)
            world["metrics"]["jams"] += 1
            emit(world, ev.CONVEYOR_BLOCKED, "error", f"{device['name']}: замятие, линия остановлена", device_id=device["id"], zone_id=device.get("zoneId"))


def process_sensors(world: dict, dt: float) -> None:
    world["accumulators"]["sensorSample"] += dt
    if world["accumulators"]["sensorSample"] < SENSOR_SAMPLE_SEC:
        return
    world["accumulators"]["sensorSample"] = 0
    for device in world["devices"]:
        if device["kind"] != "sensor" or not device["online"] or device["status"] == "fault":
            continue
        current = device["metric"] or 0
        if device["metricKind"] == "weight":
            value = max(0.0, rand_normal(world, 480, 220, 0, 1600))
        elif device["metricKind"] == "photo_eye":
            value = 1 if rand_chance(world, 0.35) else 0
        else:
            mn = device["metricMin"] or 0
            mx = device["metricMax"] or 1
            span = max(1e-6, mx - mn)
            setpoint = (mn + mx) / 2
            pull = (setpoint - current) * 0.12
            noise = rand_normal(world, 0, span * 0.02, -span * 0.08, span * 0.08)
            spike = rand_range(world, -span * 0.95, span * 0.95) if rand_chance(world, SENSOR_SPIKE_CHANCE) else 0
            value = current + pull + noise + spike
            if device["metricKind"] in ("vibration", "co2"):
                value = max(0.0, value)
        device["metric"] = round(value * 100) / 100
        device["history"].append(device["metric"])
        if len(device["history"]) > MAX_HISTORY:
            device["history"] = device["history"][-MAX_HISTORY:]
        below = device["metricMin"] is not None and device["metric"] < device["metricMin"]
        above = device["metricMax"] is not None and device["metric"] > device["metricMax"]
        if (below or above) and not device["alarm"]:
            device["alarm"] = True
            world["metrics"]["alarms"] += 1
            emit(
                world,
                ev.SENSOR_ALARM,
                "error" if device["metricKind"] == "temperature" else "warning",
                f"{device['name']}: выход за границы — {device['metric']}{device.get('metricUnit') or ''}",
                device_id=device["id"],
                zone_id=device.get("zoneId"),
            )
        elif not (below or above) and device["alarm"]:
            device["alarm"] = False
        if rand_chance(world, 0.08):
            emit(
                world,
                ev.SENSOR_READING,
                "info",
                f"{device['name']}: {device['metric']}{device.get('metricUnit') or ''}",
                device_id=device["id"],
            )


def process_replenishment(world: dict, dt: float) -> None:
    world["accumulators"]["replenish"] += dt
    if world["accumulators"]["replenish"] < REPLENISH_CHECK_SEC:
        return
    world["accumulators"]["replenish"] = 0
    # лёгкий хук: если в приёмке скопились паллеты без задания — putaway
    pending_ids = {t.get("palletId") for t in world["tasks"] if t["status"] != "done"}
    staged = [
        p
        for p in world["pallets"].values()
        if p["locationKind"] == "zone" and p["locationId"] == ZONE_RECEIVING and p["id"] not in pending_ids
    ]
    for pallet in staged[:4]:
        cell = find_free_cell(world, RECEIVING_STAGING, True)
        if not cell:
            break
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


def process_workers(world: dict, dt: float) -> None:
    world["accumulators"]["shift"] += dt
    for worker in world["workers"]:
        if worker["status"] == "break":
            worker["breakTimer"] -= dt
            if worker["breakTimer"] <= 0:
                worker["status"] = "idle"


def process_congestion(world: dict, dt: float) -> None:
    world["accumulators"]["congestion"] += dt
    if world["accumulators"]["congestion"] < 15:
        return
    world["accumulators"]["congestion"] = 0
    waiting = [d for d in world["devices"] if d["status"] == "waiting"]
    zone = ZONE_STORAGE
    if len(waiting) >= 3 and zone not in world["congestedZones"]:
        world["congestedZones"].add(zone)
        emit(world, ev.ZONE_CONGESTED, "warning", "Пробка в зоне хранения: техника ждёт разъезда", zone_id=zone)
    elif len(waiting) < 2 and zone in world["congestedZones"]:
        world["congestedZones"].discard(zone)
        emit(world, ev.ZONE_CLEARED, "success", "Пробка в зоне хранения рассосалась", zone_id=zone)


def trim_history(world: dict) -> None:
    done = [t for t in world["tasks"] if t["status"] == "done"]
    if len(done) > MAX_DONE_TASKS:
        keep = {t["id"] for t in done[-MAX_DONE_TASKS:]}
        world["tasks"] = [t for t in world["tasks"] if t["status"] != "done" or t["id"] in keep]
    if len(world["outbound"]) > 120:
        world["outbound"] = [
            o
            for o in world["outbound"]
            if o["status"] != "shipped" or world["timeSec"] - (o.get("shippedAt") or 0) < 3600
        ]


def step_world(world: dict, dt: float) -> None:
    world["timeSec"] += dt
    process_truck_arrivals(world, dt)
    process_docks(world, dt)
    process_order_generation(world, dt)
    process_order_allocation(world)
    process_packing(world, dt)
    process_shipping(world)
    process_replenishment(world, dt)
    assign_tasks(world)
    process_devices(world, dt)
    process_faults(world, dt)
    process_conveyors(world, dt)
    process_sensors(world, dt)
    process_workers(world, dt)
    process_congestion(world, dt)
    trim_history(world)


def advance_world(world: dict, seconds: float) -> None:
    left = seconds
    while left > 0:
        step = min(MAX_SUBSTEP_SEC, left)
        step_world(world, step)
        left -= step


def apply_command(world: dict, command: dict) -> None:
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
            emit(world, ev.CONVEYOR_STARTED, "success", f"{device['name']}: замятие устранено оператором", device_id=device["id"])
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
            emit(world, ev.DEVICE_OFFLINE, "warning", f"{device['name']} отключён оператором", device_id=device["id"])
        else:
            device["online"] = True
            device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
            emit(world, ev.DEVICE_ONLINE, "success", f"{device['name']} включён оператором", device_id=device["id"])
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


def emergency_stop(world: dict) -> None:
    for device in world["devices"]:
        if is_mobile_kind(device["kind"]):
            if device.get("taskId"):
                abort_task(world, device, "аварийный останов")
            device["online"] = False
            device["status"] = "offline"
        elif device["kind"] == "conveyor":
            device["status"] = "idle"
            emit(world, ev.CONVEYOR_STOPPED, "warning", f"{device['name']} остановлен", device_id=device["id"])
    emit(world, ev.EMERGENCY_STOP, "error", "Аварийный останов: техника и конвейеры остановлены")


def resume_all(world: dict) -> None:
    for device in world["devices"]:
        if is_mobile_kind(device["kind"]):
            device["online"] = True
            if device["status"] == "offline":
                device["status"] = "idle"
            emit(world, ev.DEVICE_ONLINE, "success", f"{device['name']} возобновлён", device_id=device["id"])
        elif device["kind"] == "conveyor" and device["status"] == "idle":
            device["status"] = "running"
            emit(world, ev.CONVEYOR_STARTED, "success", f"{device['name']} запущен", device_id=device["id"])
    emit(world, ev.SYSTEM_STARTED, "success", "Работа возобновлена")


def device_command(world: dict, device_id: str, command: str, payload: dict | None = None) -> None:
    device = world["deviceById"].get(device_id)
    if not device:
        raise KeyError(device_id)
    cmd = command.upper()
    payload = payload or {}
    if cmd == "START":
        device["online"] = True
        if device["status"] in ("offline", "idle"):
            device["status"] = "running" if device["kind"] == "conveyor" else "idle"
        emit(world, ev.DEVICE_STARTED, "info", f"{device['name']}: START", device_id=device["id"])
    elif cmd == "STOP":
        if device.get("taskId"):
            abort_task(world, device, "STOP")
        device["online"] = False
        device["status"] = "offline"
        emit(world, ev.DEVICE_STOPPED, "warning", f"{device['name']}: STOP", device_id=device["id"])
    elif cmd == "RESET":
        device["online"] = True
        device["status"] = "idle" if is_mobile_kind(device["kind"]) else "running"
        device["alarm"] = False
        device["repairTimer"] = 0
        if device["battery"] is not None:
            device["battery"] = 100.0
        device["path"] = []
        emit(world, ev.DEVICE_RECOVERED, "success", f"{device['name']}: RESET", device_id=device["id"])
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
            emit(world, ev.CONVEYOR_STARTED, "success", f"{device['name']} восстановлен", device_id=device["id"])
        else:
            repair_device(world, device, False)
    elif cmd == "MOVE":
        target = payload.get("to") or payload.get("pos") or device.get("homePos")
        if isinstance(target, dict) and "x" in target:
            z = target.get("z", target.get("y", device["pos"]["z"]))
            device["online"] = True
            device["status"] = "moving"
            device["phase"] = None
            device["path"] = _plan_path(world, device["pos"], {"x": float(target["x"]), "z": float(z)})
            emit(world, ev.DEVICE_MOVING, "info", f"{device['name']}: MOVE", device_id=device["id"])
    elif cmd == "LOAD":
        device["status"] = "loading"
        device["phaseTimer"] = 8
    elif cmd == "UNLOAD":
        device["status"] = "unloading"
        device["phaseTimer"] = 8
    else:
        raise ValueError(f"Неизвестная команда устройства: {command}")
