"""Пешеходы склада: те же проезды, что у техники, без второго A*.

Маршруты фиксированы. Случайного блуждания нет. Стеллаж, стена дока
и зазор спина-к-спине остаются непроходимыми клетками существующей сетки.
"""

from __future__ import annotations

import math

from app.warehouse_sim.layout import (
    AISLE_Z,
    EAST_CORRIDOR_X,
    PACKING_POINT,
    RECEIVING_STAGING,
    SHIPPING_STAGING,
    WEST_CORRIDOR_X,
)
from app.warehouse_sim.routing import astar_path, blocked_cells

WALK_SPEED = (1.40, 1.30, 1.25)
DEMO_SHIFT = "day"

DEMO_STAFF = (
    {
        "worker_id": "11111111-1111-4111-8111-111111111001",
        "employee_code": "EMP-001",
        "person_code": "PERSON-001",
        "display_name": "Иванов Иван Иванович",
        "position": "Кладовщик",
        "department": "Склад №1",
        "shift": "day",
        "status": "active",
        "speed": WALK_SPEED[0],
    },
    {
        "worker_id": "11111111-1111-4111-8111-111111111002",
        "employee_code": "EMP-002",
        "person_code": "PERSON-002",
        "display_name": "Петров Алексей Сергеевич",
        "position": "Комплектовщик",
        "department": "Склад №1",
        "shift": "day",
        "status": "active",
        "speed": WALK_SPEED[1],
    },
    {
        "worker_id": "11111111-1111-4111-8111-111111111003",
        "employee_code": "EMP-003",
        "person_code": "PERSON-003",
        "display_name": "Сидорова Анна Викторовна",
        "position": "Контролёр",
        "department": "Склад №1",
        "shift": "day",
        "status": "active",
        "speed": WALK_SPEED[2],
    },
)


def on_demo_shift(row: dict) -> bool:
    return row.get("status", "active") == "active" and row.get("shift", DEMO_SHIFT) == DEMO_SHIFT


def match_camera_person(entity_id: str | None, workers: list[dict]) -> dict:
    """Сопоставление detection → SimPerson по id трека. Имени по лицу нет."""
    if entity_id:
        for worker in workers:
            if worker.get("id") == entity_id or worker.get("code") == entity_id:
                name = worker.get("displayName")
                if name and worker.get("spawned", True):
                    return {
                        "matched": True,
                        "label": name,
                        "employee_code": worker.get("employeeCode"),
                    }
                break
    return {"matched": False, "label": "Неизвестный человек", "employee_code": None}


def _stop(x: float, z: float, label: str) -> dict:
    return {"x": x, "z": z, "label": label}


def demo_routes() -> list[list[dict]]:
    aisle2 = AISLE_Z[1]
    return [
        [
            _stop(8.0, AISLE_Z[0], "staff-entrance"),
            _stop(RECEIVING_STAGING["x"], RECEIVING_STAGING["z"], "receiving"),
            _stop(40.0, aisle2, "aisle-2"),
            _stop(PACKING_POINT["x"], PACKING_POINT["z"], "packing"),
            _stop(8.0, AISLE_Z[0], "break-exit"),
        ],
        [
            _stop(WEST_CORRIDOR_X, AISLE_Z[3], "warehouse"),
            _stop(48.0, AISLE_Z[4], "rack-area"),
            _stop(EAST_CORRIDOR_X, AISLE_Z[2], "workstation"),
            _stop(SHIPPING_STAGING["x"], SHIPPING_STAGING["z"], "outbound"),
        ],
        [
            _stop(RECEIVING_STAGING["x"], RECEIVING_STAGING["z"], "receiving"),
            _stop(16.0, 28.0, "inspection"),
            _stop(EAST_CORRIDOR_X, AISLE_Z[5], "warehouse"),
        ],
    ]


def pedestrian_path(start: dict, goal: dict, racks) -> list[dict]:
    return astar_path(start, goal, racks)


def _bind_staff(worker: dict, spec: dict, row: dict) -> None:
    worker["code"] = spec["person_code"]
    worker["workerId"] = row.get("worker_id", spec["worker_id"])
    worker["employeeCode"] = spec["employee_code"]
    worker["displayName"] = spec["display_name"]
    worker["positionTitle"] = spec["position"]
    worker["department"] = spec["department"]
    worker["shift"] = row.get("shift", spec["shift"])
    worker["name"] = spec["display_name"]


def seed_workers(workers: list[dict], racks, roster: list[dict] | None = None) -> None:
    routes = demo_routes()
    roster_rows = {row["employee_code"]: row for row in (roster if roster is not None else DEMO_STAFF)}
    for index, worker in enumerate(workers):
        if index < len(DEMO_STAFF):
            spec = DEMO_STAFF[index]
            row = roster_rows.get(spec["employee_code"], spec)
            _bind_staff(worker, spec, row)
            stops = routes[index]
            if not on_demo_shift(row):
                worker["spawned"] = False
                worker["stops"] = []
                worker["stopIndex"] = 0
                worker["pos"] = None
                worker["heading"] = 0.0
                worker["speed"] = 0.0
                worker["status"] = "off_shift"
                worker["target"] = None
                worker["current_zone"] = None
                worker["path"] = []
                continue
            worker["spawned"] = True
            worker["stops"] = stops
            worker["stopIndex"] = 0
            worker["pos"] = {"x": stops[0]["x"], "z": stops[0]["z"]}
            worker["heading"] = 0.0
            worker["speed"] = spec["speed"]
            worker["status"] = "walking"
            worker["target"] = stops[1]["label"]
            worker["current_zone"] = stops[0]["label"]
            worker["path"] = pedestrian_path(stops[0], stops[1], racks)
            continue
        aisle = AISLE_Z[index % len(AISLE_Z)]
        worker["code"] = None
        worker["spawned"] = True
        worker["stops"] = []
        worker["stopIndex"] = 0
        worker["pos"] = {"x": 10.0, "z": aisle}
        worker["heading"] = 0.0
        worker["speed"] = 0.0
        worker["target"] = None
        worker["current_zone"] = "station"
        worker["path"] = []


def _next_leg(worker: dict, racks) -> None:
    stops = worker.get("stops") or []
    if len(stops) < 2:
        worker["path"] = []
        return
    worker["stopIndex"] = (int(worker.get("stopIndex") or 0) + 1) % len(stops)
    start = stops[worker["stopIndex"]]
    goal = stops[(worker["stopIndex"] + 1) % len(stops)]
    worker["current_zone"] = start["label"]
    worker["target"] = goal["label"]
    worker["path"] = pedestrian_path(worker["pos"], goal, racks)


def advance_workers(world: dict, dt: float) -> None:
    racks = world["topology"]["racks"]
    for worker in world["workers"]:
        if worker.get("status") != "walking":
            continue
        budget = float(worker.get("speed") or 0.0) * dt
        while budget > 1e-6:
            if not worker.get("path"):
                _next_leg(worker, racks)
            if not worker.get("path"):
                break
            target = worker["path"][0]
            dx = float(target["x"]) - float(worker["pos"]["x"])
            dz = float(target["z"]) - float(worker["pos"]["z"])
            remaining = (dx * dx + dz * dz) ** 0.5
            if remaining <= max(budget, 0.05):
                worker["pos"] = {"x": float(target["x"]), "z": float(target["z"])}
                worker["path"].pop(0)
                budget -= min(budget, remaining)
                worker["heading"] = _heading(dx, dz)
                worker["current_zone"] = worker.get("target")
            else:
                ratio = budget / remaining
                worker["pos"] = {
                    "x": worker["pos"]["x"] + dx * ratio,
                    "z": worker["pos"]["z"] + dz * ratio,
                }
                worker["heading"] = _heading(dx, dz)
                budget = 0


def _heading(dx: float, dz: float) -> float:
    return math.atan2(dx, dz)


def path_crosses_rack(points: list[dict], racks) -> bool:
    blocked = blocked_cells(racks)
    if not points:
        return False
    samples = [points[0]]
    for point in points[1:]:
        samples.append(point)
    previous = None
    for point in samples:
        if previous is not None:
            steps = int(max(abs(point["x"] - previous["x"]), abs(point["z"] - previous["z"]))) + 1
            for step in range(steps + 1):
                t = step / steps
                cell = (
                    int(round(previous["x"] + (point["x"] - previous["x"]) * t)),
                    int(round(previous["z"] + (point["z"] - previous["z"]) * t)),
                )
                if cell in blocked:
                    return True
        else:
            cell = (int(round(point["x"])), int(round(point["z"])))
            if cell in blocked:
                return True
        previous = point
    return False


def people_snapshot(world: dict) -> list[dict]:
    rows = []
    for worker in world["workers"]:
        if not worker.get("pos"):
            continue
        rows.append(
            {
                "person_id": worker.get("code") or worker["id"],
                "position": {
                    "x": round(float(worker["pos"]["x"]), 2),
                    "z": round(float(worker["pos"]["z"]), 2),
                },
                "speed": float(worker.get("speed") or 0.0) if worker.get("status") == "walking" else 0.0,
                "status": worker.get("status"),
                "target": worker.get("target"),
            }
        )
    return rows
