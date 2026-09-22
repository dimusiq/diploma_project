"""Стартовый мир симулятора: парк устройств, номенклатура, начальные остатки."""

from __future__ import annotations

import uuid

from app.warehouse_sim.layout import (
    PACKING_POINT,
    RECEIVING_STAGING,
    SHIPPING_STAGING,
    ZONE_CHARGING,
    ZONE_PACKING,
    ZONE_RECEIVING,
    ZONE_SHIPPING,
    ZONE_STORAGE,
    build_cells,
    build_topology,
    zone_center,
)
from app.warehouse_sim.rng import rand_int, rand_pick

DEFAULT_CONFIG = {
    "seed": 20260914,
    "forklifts": 5,
    "agvs": 4,
    "amrs": 3,
    "workers": 10,
    "truckArrivalsPerHour": 6.0,
    "ordersPerHour": 14.0,
    "faultRatePerHour": 0.2,
    "scanErrorRate": 0.04,
    "jamRatePerHour": 0.8,
    "batteryDrainPerMin": 0.35,
    "initialFillRatio": 0.72,
    "autoRepair": True,
}

DEMO_CONFIG = {
    **DEFAULT_CONFIG,
    "seed": 20260915,
    "truckArrivalsPerHour": 6.0,
    "ordersPerHour": 10.0,
    "faultRatePerHour": 0.0,
    "scanErrorRate": 0.0,
    "jamRatePerHour": 0.0,
    "initialFillRatio": 0.78,
    "autoRepair": True,
}

DAY_START_SEC = 8 * 3600

SKUS = [
    {"id": "sku-1", "code": "SKU-1001", "name": "Вода питьевая, 0.5 л", "cold": False, "unitsPerPallet": 1200},
    {"id": "sku-2", "code": "SKU-1002", "name": "Крупа гречневая, 1 кг", "cold": False, "unitsPerPallet": 800},
    {"id": "sku-3", "code": "SKU-1003", "name": "Молоко УВТ, 1 л", "cold": True, "unitsPerPallet": 600},
    {"id": "sku-4", "code": "SKU-1004", "name": "Кофе молотый, 250 г", "cold": False, "unitsPerPallet": 960},
    {"id": "sku-5", "code": "SKU-1005", "name": "Сыр полутвёрдый, 400 г", "cold": True, "unitsPerPallet": 540},
    {"id": "sku-6", "code": "SKU-1006", "name": "Бумага А4, 500 л.", "cold": False, "unitsPerPallet": 400},
    {"id": "sku-7", "code": "SKU-1007", "name": "Стеклоомыватель, 5 л", "cold": False, "unitsPerPallet": 320},
    {"id": "sku-8", "code": "SKU-1008", "name": "Корм для животных, 3 кг", "cold": False, "unitsPerPallet": 480},
]

WORKER_NAMES = [
    "Иванов А.",
    "Петров С.",
    "Сидорова М.",
    "Кузнецов Д.",
    "Смирнова О.",
    "Волков И.",
    "Егорова Н.",
    "Морозов П.",
    "Зайцева Л.",
    "Орлов В.",
    "Гусев Р.",
    "Лебедева Т.",
]
WORKER_ROLE_CYCLE = ["receiver", "picker", "picker", "loader", "operator", "supervisor"]

SENSOR_SPECS = [
    {"code": "T-01", "name": "Температура, хранение А", "zoneId": ZONE_STORAGE, "pos": {"x": 34, "z": 9}, "metricKind": "temperature", "unit": "°C", "value": 19, "min": 14, "max": 26},
    {"code": "T-02", "name": "Температура, холодная зона", "zoneId": ZONE_STORAGE, "pos": {"x": 60, "z": 54}, "metricKind": "temperature", "unit": "°C", "value": 4.5, "min": 1, "max": 8},
    {"code": "H-01", "name": "Влажность, хранение B", "zoneId": ZONE_STORAGE, "pos": {"x": 48, "z": 39}, "metricKind": "humidity", "unit": "%", "value": 48, "min": 30, "max": 68},
    {"code": "V-01", "name": "Вибрация, конвейер упаковки", "zoneId": ZONE_PACKING, "pos": {"x": 88, "z": 18}, "metricKind": "vibration", "unit": "мм/с", "value": 0.6, "min": 0, "max": 2.2},
    {"code": "C-01", "name": "CO₂, приёмка", "zoneId": ZONE_RECEIVING, "pos": {"x": 8, "z": 16}, "metricKind": "co2", "unit": "ppm", "value": 520, "min": 350, "max": 1100},
    {"code": "W-01", "name": "Весы паллетные, упаковка", "zoneId": ZONE_PACKING, "pos": {"x": 84, "z": 22}, "metricKind": "weight", "unit": "кг", "value": 420, "min": 0, "max": 1450},
    {"code": "P-01", "name": "Фотобарьер, буфер отгрузки", "zoneId": ZONE_SHIPPING, "pos": {"x": 84, "z": 38}, "metricKind": "photo_eye", "unit": "", "value": 0, "min": 0, "max": 1},
]


def format_sscc(sequence: int) -> str:
    return f"00375{sequence:012d}"


def empty_metrics() -> dict:
    return {
        "trucksArrived": 0,
        "trucksDeparted": 0,
        "palletsReceived": 0,
        "palletsPutaway": 0,
        "palletsPicked": 0,
        "palletsShipped": 0,
        "ordersCreated": 0,
        "ordersShipped": 0,
        "ordersLate": 0,
        "scans": 0,
        "scanFailures": 0,
        "faults": 0,
        "jams": 0,
        "alarms": 0,
        "chargeCycles": 0,
        "tasksCreated": 0,
        "tasksDone": 0,
        "eventsTotal": 0,
        "orderCycleSumSec": 0.0,
        "orderCycleCount": 0,
        "dockBusySec": 0.0,
        "dockSec": 0.0,
    }


def create_device(did: str, kind: str, name: str, pos: dict, **overrides) -> dict:
    device = {
        "id": did,
        "kind": kind,
        "name": name,
        "status": "idle",
        "pos": dict(pos),
        "homePos": dict(pos),
        "zoneId": None,
        "speed": 0.0,
        "battery": None,
        "health": 100.0,
        "online": True,
        "alarm": False,
        "taskId": None,
        "palletId": None,
        "workerId": None,
        "phase": None,
        "phaseTimer": 0.0,
        "path": [],
        "metric": None,
        "metricKind": None,
        "metricUnit": None,
        "metricMin": None,
        "metricMax": None,
        "history": [],
        "busySec": 0.0,
        "faultCount": 0,
        "tasksDone": 0,
        "repairTimer": 0.0,
        "lastEventAt": 0.0,
        "temperature": 24.0 if kind in ("agv", "amr", "forklift", "conveyor") else None,
        "lastSeen": 0.0,
        "inMaintenance": False,
    }
    device.update(overrides)
    return device


def _create_devices(config: dict, topology: dict) -> list[dict]:
    devices: list[dict] = []
    for i in range(1, int(config["forklifts"]) + 1):
        devices.append(
            create_device(
                f"fl-{i}",
                "forklift",
                f"FORKLIFT-{i:02d}",
                {"x": 6 + ((i - 1) % 4) * 3.5, "z": 40 - ((i - 1) // 4) * 4},
                speed=2.4,
                battery=72 + ((i * 7) % 25),
                zoneId=ZONE_RECEIVING,
            )
        )
    for i in range(1, int(config["agvs"]) + 1):
        devices.append(
            create_device(
                f"agv-{i}",
                "agv",
                f"AGV-{i:02d}",
                {"x": 22, "z": 9 + (i - 1) * 15},
                speed=1.5,
                battery=65 + ((i * 11) % 30),
                zoneId=ZONE_STORAGE,
            )
        )
        if i == 1:
            from app.warehouse_sim.vision.service import camera_spec

            devices[-1]["camera"] = camera_spec(installed=True)
    for i in range(1, int(config["amrs"]) + 1):
        devices.append(
            create_device(
                f"amr-{i}",
                "amr",
                f"AMR-{i:02d}",
                {"x": 78, "z": 24 + (i - 1) * 15},
                speed=1.9,
                battery=60 + ((i * 13) % 35),
                zoneId=ZONE_STORAGE,
            )
        )
    devices.extend(
        [
            create_device(
                "cnv-1",
                "conveyor",
                "CONVEYOR-01",
                {"x": 18, "z": 24},
                status="running",
                zoneId=ZONE_RECEIVING,
                metric=0,
                metricKind="weight",
                metricUnit="пал/ч",
                metricMin=0,
                metricMax=60,
            ),
            create_device(
                "cnv-2",
                "conveyor",
                "CONVEYOR-02",
                {"x": 88, "z": 14},
                status="running",
                zoneId=ZONE_PACKING,
                metric=0,
                metricKind="weight",
                metricUnit="пал/ч",
                metricMin=0,
                metricMax=60,
            ),
        ]
    )
    for dock in topology["docks"]:
        zone = ZONE_RECEIVING if dock["direction"] == "inbound" else ZONE_SHIPPING
        devices.append(
            create_device(dock["id"], "dock_door", f"DOCK {dock['code']}", dock["pos"], zoneId=zone)
        )
        ox = 2 if dock["direction"] == "inbound" else -2
        devices.append(
            create_device(
                f"scn-{dock['code']}",
                "scanner",
                f"SCANNER {dock['code']}",
                {"x": dock["pos"]["x"] + ox, "z": dock["pos"]["z"]},
                zoneId=zone,
            )
        )
    devices.append(
        create_device("scn-PACK", "scanner", "SCANNER PACK", PACKING_POINT, zoneId=ZONE_PACKING)
    )
    for spec in SENSOR_SPECS:
        devices.append(
            create_device(
                f"sns-{spec['code']}",
                "sensor",
                f"SENSOR {spec['code']}: {spec['name']}",
                spec["pos"],
                status="running",
                zoneId=spec["zoneId"],
                metric=spec["value"],
                metricKind=spec["metricKind"],
                metricUnit=spec["unit"],
                metricMin=spec["min"],
                metricMax=spec["max"],
                history=[spec["value"]],
            )
        )
    charging = zone_center(ZONE_CHARGING, topology["zones"])
    for i in range(1, 5):
        devices.append(
            create_device(
                f"chg-{i}",
                "charger",
                f"CHARGING_STATION CH-0{i}",
                {"x": charging.x - 5 + (i - 1) * 3.4, "z": charging.z},
                zoneId=ZONE_CHARGING,
            )
        )
    return devices


def create_world(
    config_input: dict | None = None,
    *,
    fleet: list[dict] | None = None,
) -> dict:
    config = {**DEFAULT_CONFIG, **(config_input or {})}
    topology = build_topology()
    cells = build_cells(topology["racks"])
    devices = fleet if fleet is not None else _create_devices(config, topology)
    workers = []
    for i in range(int(config["workers"])):
        workers.append(
            {
                "id": f"wrk-{i + 1}",
                "name": WORKER_NAMES[i % len(WORKER_NAMES)],
                "role": WORKER_ROLE_CYCLE[i % len(WORKER_ROLE_CYCLE)],
                "status": "idle",
                "deviceId": None,
                "taskId": None,
                "tasksDone": 0,
                "breakTimer": 0.0,
            }
        )
    world: dict = {
        "config": config,
        "topology": topology,
        "timeSec": 0.0,
        "dayStartSec": DAY_START_SEC,
        "skus": [dict(s) for s in SKUS],
        "cells": cells,
        "cellById": {c["id"]: c for c in cells},
        "devices": devices,
        "deviceById": {d["id"]: d for d in devices},
        "pallets": {},
        "trucks": [],
        "inbound": [],
        "outbound": [],
        "tasks": [],
        "workers": workers,
        "events": [],
        "eventCountsByType": {},
        "metrics": empty_metrics(),
        "accumulators": {
            "truckArrival": 0.0,
            "order": 0.0,
            "sensorSample": 0.0,
            "replenish": 0.0,
            "shift": 0.0,
            "congestion": 0.0,
        },
        "counters": {
            "event": 0,
            "truck": 0,
            "inbound": 0,
            "outbound": 0,
            "pallet": 0,
            "task": 0,
        },
        "rng_state": int(config["seed"]) & 0xFFFFFFFF,
        "scenario": "NORMAL_OPERATION",
        "congestedZones": set(),
        "integration_queue": [],
        "bridge": empty_bridge(),
    }
    _seed_inventory(world)
    agv = world["deviceById"].get("agv-1")
    if agv is not None and not (
        isinstance(agv.get("camera"), dict) and agv["camera"].get("installed")
    ):
        from app.warehouse_sim.vision.service import camera_spec

        agv["camera"] = camera_spec(installed=True)
    return world


def empty_bridge() -> dict:
    return {
        "run_id": str(uuid.uuid4()),
        "items": {},
        "inbound": {},
        "outbound": {},
        "tasks": {},
        "shipments": {},
        "trucks": {},
        "seeded": False,
    }


def _seed_inventory(world: dict) -> None:
    """Равномерно занимает ячейки всех стеллажей по initialFillRatio.

    Раньше при fill ≥ 0.5 шаг был 1, и паллеты укладывались подряд с начала
    списка (первые ряды полные, дальние пустые). Теперь выбирается ровно
    target ячеек случайно по всему складу — occupancy совпадает с конфигом
    и визуально распределена по 16 rack.
    """
    cells = [cell for cell in world["cells"] if not cell.get("blocked")]
    if not cells:
        return
    ratio = float(world["config"].get("initialFillRatio") or 0)
    target = max(0, min(len(cells), int(round(len(cells) * ratio))))
    order = list(range(len(cells)))
    for i in range(len(order) - 1, 0, -1):
        j = rand_int(world, 0, i)
        order[i], order[j] = order[j], order[i]
    for idx in order[:target]:
        cell = cells[idx]
        sku = rand_pick(world, world["skus"])
        world["counters"]["pallet"] += 1
        pid = f"pal-{world['counters']['pallet']}"
        pallet = {
            "id": pid,
            "sscc": format_sscc(world["counters"]["pallet"]),
            "skuId": sku["id"],
            "qty": round(sku["unitsPerPallet"] * (0.5 + rand_int(world, 5, 10) / 10)),
            "locationKind": "cell",
            "locationId": cell["id"],
            "pos": dict(cell["pos"]),
            "createdAt": 0.0,
            "orderId": None,
            "state": "STORED",
        }
        world["pallets"][pid] = pallet
        cell["palletId"] = pid
