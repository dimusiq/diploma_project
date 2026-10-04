"""Общие константы/emit/хелперы движка симуляции (вынесено из simulation.py)."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim import events as ev
from app.warehouse_sim.events import INTEGRATION_EVENT_TYPES
from app.warehouse_sim.rng import (
    rand_chance,
    rand_int,
    rand_normal,
)
from app.warehouse_sim.routing import astar_path
from app.warehouse_sim.traffic import MOBILE

MAX_SUBSTEP_SEC = 1.0
MAX_EVENTS = 400
MAX_DONE_TASKS = 60
MAX_HISTORY = 40
SENSOR_SAMPLE_SEC = 5.0
SENSOR_SPIKE_CHANCE = 0.001
REPLENISH_CHECK_SEC = 300.0
SHIFT_SEC = 4 * 3600
TASKS_PER_TRUCK = 2
# Алиас на traffic.MOBILE — единый источник правды для мобильных видов.
MOBILE_KINDS = MOBILE

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
    return {
        "info": "info",
        "success": "success",
        "warning": "warning",
        "error": "error",
    }.get(name, "info")


def emit(
    world: dict[str, Any],
    event_type: str,
    severity: str,
    message: str,
    *,
    device_id: str | None = None,
    entity_id: str | None = None,
    zone_id: str | None = None,
    task_id: str | None = None,
    order_id: str | None = None,
) -> dict[str, Any]:
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


def _enqueue_integration(world: dict[str, Any], event: dict[str, Any]) -> None:
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


def _integration_context(world: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
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
                (
                    row
                    for row in world["inbound"]
                    if row["id"] in truck.get("orderIds", [])
                ),
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
        inbound_ent = next(
            (row for row in world["inbound"] if row["id"] == entity_id), None
        )
        if inbound_ent:
            ctx.setdefault("inbound", dict(inbound_ent))
        outbound_ent = next(
            (row for row in world["outbound"] if row["id"] == entity_id), None
        )
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
                cell = world["cellById"].get(
                    pallet.get("locationId") or ctx["task"].get("cellId")
                )
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


def sku_code(world: dict[str, Any], sku_id: str) -> str:
    for sku in world["skus"]:
        if sku["id"] == sku_id:
            return str(sku["code"])
    return sku_id


def find_free_cell(world: dict[str, Any], near: dict[str, Any], prefer_near: bool = True) -> dict[str, Any] | None:
    free = [
        c
        for c in world["cells"]
        if isinstance(c, dict) and c["palletId"] is None and not c["blocked"]
    ]
    if not free:
        return None
    if not prefer_near:
        first = free[0]
        return first if isinstance(first, dict) else None
    best = min(
        free,
        key=lambda c: (
            (c["pos"]["x"] - near["x"]) ** 2 + (c["pos"]["z"] - near["z"]) ** 2
        ),
    )
    return best if isinstance(best, dict) else None


def find_stock_cell(world: dict[str, Any], sku_id: str, reserved: set[str]) -> dict[str, Any] | None:
    for cell in world["cells"]:
        if not isinstance(cell, dict):
            continue
        pid = cell["palletId"]
        if not pid or pid in reserved:
            continue
        pallet = world["pallets"].get(pid)
        if (
            isinstance(pallet, dict)
            and pallet["skuId"] == sku_id
            and pallet.get("orderId") is None
        ):
            return cell
    return None


def dock_by_id(world: dict[str, Any], dock_id: str | None) -> dict[str, Any] | None:
    if not dock_id:
        return None
    for dock in world["topology"]["docks"]:
        if isinstance(dock, dict) and dock["id"] == dock_id:
            return dock
    return None


def _plan_path(world: dict[str, Any], start: dict[str, Any], goal: dict[str, Any]) -> list[dict[str, Any]]:
    extra: set[tuple[int, int]] = set()
    moving = [
        d
        for d in world["devices"]
        if is_mobile_kind(d["kind"]) and d["status"] in ("moving", "waiting")
    ]
    for device in moving:
        extra.add((int(round(device["pos"]["x"])), int(round(device["pos"]["z"]))))
    return astar_path(start, goal, world["topology"]["racks"], extra_blocked=extra)


def pick_worker(world: dict[str, Any], kind: str) -> dict[str, Any] | None:
    role = {"unload": "receiver", "load": "loader", "pick": "picker"}.get(
        kind, "operator"
    )
    idle = [
        w for w in world["workers"] if isinstance(w, dict) and w["status"] == "idle"
    ]
    if not idle:
        return None
    chosen = next((w for w in idle if w["role"] == role), idle[0])
    return chosen if isinstance(chosen, dict) else None


def release_worker(world: dict[str, Any], worker_id: str | None) -> None:
    if not worker_id:
        return
    for worker in world["workers"]:
        if worker["id"] == worker_id:
            worker["taskId"] = None
            worker["deviceId"] = None
            if worker["status"] == "busy":
                worker["status"] = "idle"
            return


def fire_scan(world: dict[str, Any], scanner_id: str, label: str, entity_id: str) -> bool:
    scanner = world["deviceById"].get(scanner_id)
    world["metrics"]["scans"] += 1
    if scanner and scanner["online"] and scanner["status"] != "fault":
        scanner["status"] = "scanning"
        scanner["phaseTimer"] = 1.5
    if rand_chance(world, world["config"]["scanErrorRate"]):
        world["metrics"]["scanFailures"] += 1
        emit(
            world,
            ev.SCAN_FAILED,
            "warning",
            f"Ошибка считывания: {label}",
            device_id=scanner_id,
            entity_id=entity_id,
        )
        return False
    emit(
        world,
        ev.ITEM_SCANNED,
        "info",
        f"Считано: {label}",
        device_id=scanner_id,
        entity_id=entity_id,
    )
    return True


def _plate(world: dict[str, Any]) -> str:
    letters = "АВЕКМНОРСТУХ"
    l1 = letters[rand_int(world, 0, len(letters) - 1)]
    l2 = letters[rand_int(world, 0, len(letters) - 1)]
    l3 = letters[rand_int(world, 0, len(letters) - 1)]
    return f"{l1}{rand_int(world, 100, 999)}{l2}{l3} {rand_int(world, 10, 99)}"


def handling_time(world: dict[str, Any], kind: str, at_source: bool) -> float:
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


def trim_history(world: dict[str, Any]) -> None:
    done = [t for t in world["tasks"] if t["status"] == "done"]
    if len(done) > MAX_DONE_TASKS:
        keep = {t["id"] for t in done[-MAX_DONE_TASKS:]}
        world["tasks"] = [
            t for t in world["tasks"] if t["status"] != "done" or t["id"] in keep
        ]
    if len(world["outbound"]) > 120:
        world["outbound"] = [
            o
            for o in world["outbound"]
            if o["status"] != "shipped"
            or world["timeSec"] - (o.get("shippedAt") or 0) < 3600
        ]
