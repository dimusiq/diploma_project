"""Сценарии нагрузки: меняют генератор и/или сразу воздействуют на мир."""

from __future__ import annotations

from app.warehouse_sim import events as ev
from app.warehouse_sim.rng import rand_pick
from app.warehouse_sim.simulation import emergency_stop, emit, inject_fault, is_mobile_kind

SCENARIO_DEFS = [
    {
        "code": "NORMAL_OPERATION",
        "name": "Нормальная работа",
        "description": "Базовые потоки приёмки и отгрузки, редкие отказы.",
        "config": {
            "truckArrivalsPerHour": 6.0,
            "ordersPerHour": 14.0,
            "faultRatePerHour": 0.2,
            "jamRatePerHour": 0.8,
        },
    },
    {
        "code": "PEAK_LOAD",
        "name": "Пиковая нагрузка",
        "description": "Больше машин и заказов, растёт очередь техники.",
        "config": {
            "truckArrivalsPerHour": 18.0,
            "ordersPerHour": 36.0,
            "faultRatePerHour": 0.35,
            "jamRatePerHour": 1.4,
        },
    },
    {
        "code": "INBOUND_PEAK",
        "name": "Пик приёмки",
        "description": "Плотная волна входящего транспорта.",
        "config": {"truckArrivalsPerHour": 24.0, "ordersPerHour": 10.0},
    },
    {
        "code": "EQUIPMENT_FAILURE",
        "name": "Отказ техники",
        "description": "Случайный AGV/погрузчик переходит в ERROR, задание переназначается.",
        "config": {"faultRatePerHour": 1.5},
        "inject": "equipment_failure",
    },
    {
        "code": "CONVEYOR_FAILURE",
        "name": "Отказ конвейера",
        "description": "Конвейер упаковки блокируется, упаковка задерживается.",
        "config": {},
        "inject": "conveyor_failure",
    },
    {
        "code": "WAREHOUSE_CONGESTION",
        "name": "Пробки на складе",
        "description": "Высокий поток и больше техники в проездах.",
        "config": {
            "truckArrivalsPerHour": 16.0,
            "ordersPerHour": 28.0,
            "jamRatePerHour": 2.0,
        },
    },
    {
        "code": "EMERGENCY",
        "name": "Авария",
        "description": "Аварийный останов всего парка.",
        "config": {},
        "inject": "emergency",
    },
]


def apply_scenario(world: dict, code: str) -> dict:
    spec = next((s for s in SCENARIO_DEFS if s["code"] == code), None)
    if spec is None:
        raise KeyError(code)
    world["config"].update(spec.get("config") or {})
    world["scenario"] = code
    inject = spec.get("inject")
    if inject == "equipment_failure":
        mobiles = [
            d
            for d in world["devices"]
            if is_mobile_kind(d["kind"]) and d["online"] and d["status"] not in ("fault", "offline")
        ]
        if mobiles:
            inject_fault(world, rand_pick(world, mobiles), "сценарий EQUIPMENT_FAILURE")
    elif inject == "conveyor_failure":
        conv = world["deviceById"].get("cnv-2") or next(
            (d for d in world["devices"] if d["kind"] == "conveyor"), None
        )
        if conv:
            conv["status"] = "jam"
            conv["repairTimer"] = 180
            conv["online"] = True
            world["metrics"]["jams"] += 1
            emit(
                world,
                ev.CONVEYOR_BLOCKED,
                "error",
                f"{conv['name']}: сценарий отказа конвейера",
                device_id=conv["id"],
                zone_id=conv.get("zoneId"),
            )
    elif inject == "emergency":
        emergency_stop(world)
    else:
        emit(
            world,
            ev.SYSTEM_STARTED,
            "info",
            f"Сценарий «{spec['name']}» активирован",
        )
    return spec
