"""Геометрия склада и маршруты по проездам (ось z — сверху вниз, как на 2D-плане)."""

from __future__ import annotations

from dataclasses import dataclass

WAREHOUSE_WIDTH = 104.0
WAREHOUSE_DEPTH = 64.0
WEST_CORRIDOR_X = 22.0
EAST_CORRIDOR_X = 78.0
STORAGE_MIN_X = 24.0
STORAGE_MAX_X = 76.0
RACK_WIDTH = 48.0
RACK_DEPTH = 3.0
RACK_BAYS = 12
RACK_LEVELS = 3
RACK_Z = (4.0, 11.0, 19.0, 26.0, 34.0, 41.0, 49.0, 56.0)
AISLE_Z = (9.0, 24.0, 39.0, 54.0)

ZONE_RECEIVING = "zone-recv"
ZONE_CHARGING = "zone-chrg"
ZONE_STORAGE = "zone-stor"
ZONE_PICKING = "zone-pick"
ZONE_PACKING = "zone-pack"
ZONE_SHIPPING = "zone-ship"

RECEIVING_STAGING = {"x": 14.0, "z": 24.0}
PACKING_POINT = {"x": 84.0, "z": 14.0}
SHIPPING_STAGING = {"x": 86.0, "z": 44.0}


@dataclass
class Vec2:
    x: float
    z: float

    def as_dict(self) -> dict[str, float]:
        return {"x": self.x, "z": self.z}


def distance(a: Vec2 | dict, b: Vec2 | dict) -> float:
    ax, az = _xz(a)
    bx, bz = _xz(b)
    return ((ax - bx) ** 2 + (az - bz) ** 2) ** 0.5


def _xz(p: Vec2 | dict) -> tuple[float, float]:
    if isinstance(p, Vec2):
        return p.x, p.z
    return float(p["x"]), float(p["z"])


def zone_center(zone_id: str, zones: list[dict]) -> Vec2:
    for zone in zones:
        if zone["id"] == zone_id:
            return Vec2(zone["x"] + zone["w"] / 2, zone["z"] + zone["d"] / 2)
    return Vec2(WAREHOUSE_WIDTH / 2, WAREHOUSE_DEPTH / 2)


def nearest_aisle_z(z: float) -> float:
    best = AISLE_Z[0]
    for aisle in AISLE_Z:
        if abs(aisle - z) < abs(best - z):
            best = aisle
    return best


def _in_storage_span(x: float) -> bool:
    return STORAGE_MIN_X - 1 < x < STORAGE_MAX_X + 1


def _corridor_nearest(x: float) -> float:
    mid = (WEST_CORRIDOR_X + EAST_CORRIDOR_X) / 2
    return WEST_CORRIDOR_X if x < mid else EAST_CORRIDOR_X


def _same_point(a: Vec2, b: Vec2) -> bool:
    return abs(a.x - b.x) < 0.05 and abs(a.z - b.z) < 0.05


def route_between(from_p: Vec2 | dict, to_p: Vec2 | dict) -> list[dict[str, float]]:
    """Ортогональный маршрут по проездам; техника не едет сквозь стеллажи."""
    start = Vec2(*_xz(from_p))
    goal = Vec2(*_xz(to_p))
    points: list[Vec2] = []
    from_in = _in_storage_span(start.x)
    to_in = _in_storage_span(goal.x)

    if from_in:
        points.append(Vec2(start.x, nearest_aisle_z(start.z)))

    if from_in and to_in:
        aisle_from = nearest_aisle_z(start.z)
        aisle_to = nearest_aisle_z(goal.z)
        if aisle_from != aisle_to:
            corridor = _corridor_nearest((start.x + goal.x) / 2)
            points.append(Vec2(corridor, aisle_from))
            points.append(Vec2(corridor, aisle_to))
        points.append(Vec2(goal.x, aisle_to))
    elif from_in and not to_in:
        corridor = _corridor_nearest(goal.x)
        points.append(Vec2(corridor, nearest_aisle_z(start.z)))
        points.append(Vec2(corridor, goal.z))
    elif not from_in and to_in:
        corridor = _corridor_nearest(start.x)
        points.append(Vec2(corridor, start.z))
        points.append(Vec2(corridor, nearest_aisle_z(goal.z)))
        points.append(Vec2(goal.x, nearest_aisle_z(goal.z)))
    elif _corridor_nearest(start.x) != _corridor_nearest(goal.x):
        aisle = nearest_aisle_z((start.z + goal.z) / 2)
        points.append(Vec2(_corridor_nearest(start.x), start.z))
        points.append(Vec2(_corridor_nearest(start.x), aisle))
        points.append(Vec2(_corridor_nearest(goal.x), aisle))
        points.append(Vec2(_corridor_nearest(goal.x), goal.z))
    else:
        points.append(Vec2(start.x, goal.z))

    points.append(goal)
    result: list[dict[str, float]] = []
    previous = start
    for point in points:
        if _same_point(previous, point):
            continue
        result.append(point.as_dict())
        previous = point
    return result if result else [goal.as_dict()]


def build_zones() -> list[dict]:
    return [
        {
            "id": ZONE_RECEIVING,
            "code": "RECV",
            "name": "Приёмка",
            "kind": "receiving",
            "x": 2,
            "z": 4,
            "w": 18,
            "d": 42,
        },
        {
            "id": ZONE_CHARGING,
            "code": "CHRG",
            "name": "Зарядная",
            "kind": "charging",
            "x": 2,
            "z": 50,
            "w": 18,
            "d": 12,
        },
        {
            "id": ZONE_STORAGE,
            "code": "STOR",
            "name": "Хранение",
            "kind": "storage",
            "x": 22,
            "z": 2,
            "w": 56,
            "d": 60,
        },
        {
            "id": ZONE_PICKING,
            "code": "PICK",
            "name": "Отбор",
            "kind": "picking",
            "x": 74,
            "z": 2,
            "w": 6,
            "d": 60,
        },
        {
            "id": ZONE_PACKING,
            "code": "PACK",
            "name": "Упаковка",
            "kind": "packing",
            "x": 80,
            "z": 2,
            "w": 12,
            "d": 24,
        },
        {
            "id": ZONE_SHIPPING,
            "code": "SHIP",
            "name": "Отгрузка",
            "kind": "shipping",
            "x": 80,
            "z": 30,
            "w": 20,
            "d": 32,
        },
    ]


def build_racks() -> list[dict]:
    racks = []
    for index, z in enumerate(RACK_Z):
        racks.append(
            {
                "id": f"rack-{index + 1}",
                "code": f"R{index + 1:02d}",
                "zoneId": ZONE_STORAGE,
                "x": 26,
                "z": z,
                "w": RACK_WIDTH,
                "d": RACK_DEPTH,
                "bays": RACK_BAYS,
                "levels": RACK_LEVELS,
            }
        )
    return racks


def _cell_approach(rack: dict, bay: int) -> dict[str, float]:
    bay_width = rack["w"] / rack["bays"]
    x = rack["x"] + (bay - 0.5) * bay_width
    aisle = nearest_aisle_z(rack["z"] + rack["d"] / 2)
    z = rack["z"] + rack["d"] + 0.8 if aisle > rack["z"] else rack["z"] - 0.8
    return {"x": x, "z": z}


def build_cells(racks: list[dict]) -> list[dict]:
    cells: list[dict] = []
    for rack in racks:
        for bay in range(1, rack["bays"] + 1):
            pos = _cell_approach(rack, bay)
            for level in range(1, rack["levels"] + 1):
                cells.append(
                    {
                        "id": f"{rack['code']}-{bay:02d}-{level}",
                        "rackId": rack["id"],
                        "bay": bay,
                        "level": level,
                        "pos": dict(pos),
                        "palletId": None,
                        "blocked": False,
                    }
                )
    return cells


def build_docks() -> list[dict]:
    inbound = [
        {
            "id": f"dock-in-{i + 1}",
            "code": f"IN-{i + 1}",
            "direction": "inbound",
            "pos": {"x": 3.0, "z": z},
            "yardPos": {"x": -12.0, "z": z},
        }
        for i, z in enumerate((10.0, 22.0, 34.0))
    ]
    outbound = [
        {
            "id": f"dock-out-{i + 1}",
            "code": f"OUT-{i + 1}",
            "direction": "outbound",
            "pos": {"x": 98.0, "z": z},
            "yardPos": {"x": 116.0, "z": z},
        }
        for i, z in enumerate((34.0, 44.0, 54.0))
    ]
    return inbound + outbound


def build_topology() -> dict:
    racks = build_racks()
    return {
        "width": WAREHOUSE_WIDTH,
        "depth": WAREHOUSE_DEPTH,
        "zones": build_zones(),
        "racks": racks,
        "docks": build_docks(),
        "aisleZ": list(AISLE_Z),
        "corridorX": [WEST_CORRIDOR_X, EAST_CORRIDOR_X],
    }
