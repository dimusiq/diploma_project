"""Заказы, грузовики, доки, упаковка/отгрузка симулятора."""

from __future__ import annotations

from app.warehouse_sim import events as ev
from app.warehouse_sim.layout import (
    PACKING_POINT,
    RECEIVING_STAGING,
    SHIPPING_STAGING,
    ZONE_PACKING,
    ZONE_RECEIVING,
    ZONE_SHIPPING,
)
from app.warehouse_sim.rng import (
    rand_chance,
    rand_int,
    rand_pick,
    rand_range,
)
from app.warehouse_sim.sim_common import (
    CARRIERS,
    CUSTOMERS,
    REPLENISH_CHECK_SEC,
    TASKS_PER_TRUCK,
    _plate,
    dock_by_id,
    emit,
    find_free_cell,
    find_stock_cell,
    fire_scan,
)
from app.warehouse_sim.tasks import create_task


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
        lines.append(
            {"skuId": sku["id"], "pallets": rand_int(world, 1, 3), "picked": 0}
        )
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
        f"Заказ {order['code']} ({order['customer']})"
        + (" — срочный" if urgent else ""),
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
            truck["pos"] = {
                "x": -14 - (inbound_i // 3) * 8,
                "z": 10 + (inbound_i % 3) * 12,
            }
            inbound_i += 1
        else:
            truck["pos"] = {
                "x": 118 + (outbound_i // 3) * 8,
                "z": 34 + (outbound_i % 3) * 10,
            }
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
            inbound = next(
                (i for i in world["inbound"] if i["id"] == truck["orderIds"][0]), None
            )
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
            [
                t
                for t in world["tasks"]
                if t.get("truckId") == truck["id"] and t["status"] != "done"
            ]
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
        if (
            truck["status"] != "docked"
            or truck["palletsDone"] < truck["palletsPlanned"]
        ):
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
            inbound = next(
                (i for i in world["inbound"] if i["id"] == truck["orderIds"][0]), None
            )
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
                world["metrics"]["orderCycleSumSec"] += (
                    world["timeSec"] - order["createdAt"]
                )
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
        if t.get("palletId")
        and t["status"] != "done"
        and t.get("truckId") == truck["id"]
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
    world["accumulators"]["truckArrival"] += (
        world["config"]["truckArrivalsPerHour"] / 3600.0 * dt
    )
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
                    and world["pallets"].get(t.get("palletId") or "", {}).get("skuId")
                    == line["skuId"]
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
    jammed = any(
        d["kind"] == "conveyor" and d["status"] == "jam" for d in world["devices"]
    )
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
    waiting_out = [
        t
        for t in world["trucks"]
        if t["direction"] == "outbound" and t["status"] != "departed"
    ]
    if waiting_out:
        return
    batch = staged[:3]
    spawn_outbound_truck(world, batch)


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
        if p["locationKind"] == "zone"
        and p["locationId"] == ZONE_RECEIVING
        and p["id"] not in pending_ids
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
