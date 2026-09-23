"""Встречный разъезд по габариту корпуса.

Живое движение больше не останавливается кругом вокруг следующей точки
маршрута. Конфликт — пересечение корпусов по ходу и поперёк проезда.
Обе машины смещаются в противоположные полосы. Полная остановка
допускается только перед стоящей техникой и не длиннее WAIT_LIMIT_SEC.
"""

from __future__ import annotations

from app.warehouse_sim.routing import astar_path
from app.warehouse_sim.vehicle_dimensions import (
    SAFETY_CLEARANCE,
    VEHICLE_PHYSICAL_DIMENSIONS,
)

WAIT_LIMIT_SEC = 1.5
PASS_SHIFT_M = 0.64
PERSON_LOOKAHEAD_M = 2.2
MOBILE = ("forklift", "agv", "amr")
ACTIVE = ("moving", "waiting", "loading", "unloading")


def body_size(kind: str) -> tuple[float, float]:
    dims = VEHICLE_PHYSICAL_DIMENSIONS.get(kind) or VEHICLE_PHYSICAL_DIMENSIONS["agv"]
    return float(dims["width"]), float(dims["length"])


def heading(device: dict) -> tuple[float, float]:
    path = device.get("path") or []
    if path:
        dx = float(path[0]["x"]) - float(device["pos"]["x"])
        dz = float(path[0]["z"]) - float(device["pos"]["z"])
        length = (dx * dx + dz * dz) ** 0.5
        if length > 1e-4:
            return dx / length, dz / length
    return 1.0, 0.0


def relative(device: dict, pos: dict) -> tuple[float, float]:
    fx, fz = heading(device)
    dx = float(pos.get("x", device["pos"]["x"])) - float(device["pos"]["x"])
    dz = float(pos.get("z", device["pos"]["z"])) - float(device["pos"]["z"])
    forward = dx * fx + dz * fz
    lateral = dx * -fz + dz * fx
    return forward, lateral


def bodies_overlap(device: dict, other: dict, lookahead: float = 0.0) -> bool:
    forward, lateral = relative(device, other["pos"])
    aw, al = body_size(device.get("kind", "agv"))
    bw, bl = body_size(other.get("kind", "agv"))
    long_limit = (al + bl) / 2 + SAFETY_CLEARANCE + lookahead
    lat_limit = (aw + bw) / 2 - 0.02
    return -0.25 < forward < long_limit and abs(lateral) < lat_limit


def _task(world: dict, device: dict) -> dict | None:
    task_id = device.get("taskId")
    if not task_id:
        return None
    return next((task for task in world.get("tasks") or [] if task["id"] == task_id), None)


def priority_key(world: dict, device: dict, other: dict | None = None) -> tuple:
    """Больше — выше приоритет. Id в ключ не входит: ничья снимается отдельно."""
    task = _task(world, device)
    inside = bool(other) and bodies_overlap(device, other, lookahead=0.0)
    in_section = 1 if device.get("passLead") or inside else 0
    has_task = 1 if task else 0
    rank = int(task["priority"]) if task else 0
    started = float(device.get("moveStartedAt") or 0.0)
    return (in_section, has_task, rank, -started)


def outranks(world: dict, device: dict, other: dict) -> bool:
    left = priority_key(world, device, other)
    right = priority_key(world, other, device)
    if left != right:
        return left > right
    return str(device["id"]) < str(other["id"])


def _clear_wait(device: dict) -> None:
    device["waitingFor"] = None
    device["waitingSince"] = None
    device["waitingDuration"] = 0.0
    if device.get("status") == "waiting":
        device["status"] = "moving"


def _hold(world: dict, device: dict, other_id: str) -> None:
    if device.get("waitingFor") != other_id or device.get("waitingSince") is None:
        device["waitingFor"] = other_id
        device["waitingSince"] = world["timeSec"]
    device["waitingDuration"] = world["timeSec"] - float(device["waitingSince"])
    device["status"] = "waiting"
    device["cruise"] = 0.0
    device["passSide"] = 0
    device["passLead"] = False


def _replan(world: dict, device: dict, blockers: list[dict]) -> None:
    if not device.get("path"):
        _clear_wait(device)
        return
    extra = {
        (int(round(item["pos"]["x"])), int(round(item["pos"]["z"])))
        for item in blockers
    }
    goal = device["path"][-1]
    device["path"] = astar_path(device["pos"], goal, world["topology"]["racks"], extra)
    device["passSide"] = 0
    device["passRival"] = None
    device["passLead"] = False
    device["replannedAt"] = world["timeSec"]
    _clear_wait(device)
    device["cruise"] = 1.0


def _still_passing(device: dict, other: dict | None) -> bool:
    if other is None:
        return False
    forward, lateral = relative(device, other["pos"])
    return abs(forward) < 3.2 and abs(lateral) < 2.2


def _person_ahead(device: dict, workers: list[dict]) -> dict | None:
    width, _length = body_size(device.get("kind", "agv"))
    for worker in workers:
        if worker.get("status") not in ("walking", "busy"):
            continue
        pos = worker.get("pos")
        if not pos:
            continue
        forward, lateral = relative(device, pos)
        if forward < 0 or forward > PERSON_LOOKAHEAD_M:
            continue
        if abs(lateral) < width / 2 + 0.35:
            return worker
    return None


def resolve_traffic(world: dict) -> list[dict]:
    """Назначает полосы и ограничивает ожидание. События — человек прямо перед техникой."""
    devices = [
        device
        for device in world["devices"]
        if device.get("kind") in MOBILE and device.get("status") in ACTIVE and device.get("path")
    ]
    obstacles = [
        device
        for device in world["devices"]
        if device.get("kind") in MOBILE and device.get("status") in ACTIVE
    ]
    by_id = {device["id"]: device for device in world["devices"]}
    events: list[dict] = []
    for device in devices:
        device["cruise"] = 1.0
        rivals = [
            other
            for other in obstacles
            if other["id"] != device["id"] and bodies_overlap(device, other, lookahead=1.2)
        ]
        person = _person_ahead(device, world.get("workers") or [])
        if person is not None:
            device["cruise"] = 0.0
            device["personInPath"] = person["id"]
            if device.get("personEventFor") != person["id"]:
                device["personEventFor"] = person["id"]
                events.append({"device": device, "worker": person})
            _clear_wait(device)
            continue
        if device.get("personInPath"):
            device["personInPath"] = False
            device["personEventFor"] = None
        if not rivals:
            other = by_id.get(device.get("passRival"))
            if _still_passing(device, other):
                device["cruise"] = 1.0 if device.get("passLead") else 0.45
                device["status"] = "moving"
            else:
                device["passSide"] = 0
                device["passRival"] = None
                device["passLead"] = False
                _clear_wait(device)
            continue
        rival = max(rivals, key=lambda item: (*priority_key(world, item, device), item["id"]))
        lead = outranks(world, device, rival)
        moving_pair = rival.get("status") in ("moving", "waiting") and bool(rival.get("path"))
        if moving_pair:
            device["passSide"] = 1 if device["id"] < rival["id"] else -1
            device["passRival"] = rival["id"]
            device["passLead"] = lead
            device["cruise"] = 1.0 if lead else 0.45
            device["status"] = "moving"
            if lead:
                _clear_wait(device)
            else:
                device["waitingFor"] = rival["id"]
                device["waitingSince"] = None
                device["waitingDuration"] = 0.0
            continue
        _hold(world, device, rival["id"])
        waited = float(device.get("waitingDuration") or 0.0)
        last = float(device.get("replannedAt") or -10)
        if waited >= WAIT_LIMIT_SEC and world["timeSec"] - last >= WAIT_LIMIT_SEC:
            _replan(world, device, rivals)
    return events


def current_speed(device: dict) -> float:
    if device.get("personInPath") or device.get("status") == "waiting":
        return 0.0
    if device.get("status") != "moving":
        return 0.0
    return float(device.get("speed") or 0.0) * float(device.get("cruise") or 1.0)


def traffic_snapshot(world: dict) -> list[dict]:
    rows = []
    for device in world["devices"]:
        if device.get("kind") not in MOBILE:
            continue
        path = device.get("path") or []
        nxt = path[0] if path else None
        rows.append(
            {
                "device_id": device["id"],
                "position": {"x": round(float(device["pos"]["x"]), 2), "z": round(float(device["pos"]["z"]), 2)},
                "speed": round(current_speed(device), 2),
                "target_speed": float(device.get("speed") or 0.0),
                "status": device.get("status"),
                "waiting_for": device.get("waitingFor"),
                "waiting_seconds": round(float(device.get("waitingDuration") or 0.0), 2),
                "next_waypoint": dict(nxt) if nxt else None,
            }
        )
    return rows
