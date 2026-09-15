"""Геометрия склада и маршруты по проездам (ось z — сверху вниз, как на 2D-плане).

8 сдвоенных блоков (back-to-back): R01A спиной к R01B, …, R08A спиной к R08B.
Между A и B нет прохода — только технический зазор общей спины.
Рабочие проезды — снаружи блоков; продольные коридоры (запад/восток) связывают их.
"""

from __future__ import annotations

from dataclasses import dataclass

WAREHOUSE_WIDTH = 104.0
WAREHOUSE_DEPTH = 64.0
WEST_CORRIDOR_X = 22.0
EAST_CORRIDOR_X = 78.0
STORAGE_MIN_X = 26.0
STORAGE_MAX_X = 74.0
RACK_X = 26.0
RACK_WIDTH = 48.0
RACK_DEPTH = 2.4
RACK_BAYS = 12
RACK_LEVELS = 3
BACK_GAP = 0.2
BLOCK_COUNT = 8
BLOCK_DEPTH = 2 * RACK_DEPTH + BACK_GAP
AISLE_WIDTH = 2.5
PITCH = BLOCK_DEPTH + AISLE_WIDTH
FIRST_BLOCK_Z = 3.0
APPROACH_OFFSET = 1.2


def _block_origin_z(index: int) -> float:
    return FIRST_BLOCK_Z + index * PITCH


def _work_aisle_centers() -> tuple[float, ...]:
    """Центры рабочих проездов: север первого блока, между блоками, юг последнего."""
    centers: list[float] = [FIRST_BLOCK_Z / 2.0]
    for index in range(BLOCK_COUNT):
        south = _block_origin_z(index) + BLOCK_DEPTH
        north_next = (
            _block_origin_z(index + 1) if index + 1 < BLOCK_COUNT else WAREHOUSE_DEPTH
        )
        centers.append((south + north_next) / 2.0)
    return tuple(centers)


RACK_Z_A = tuple(_block_origin_z(i) for i in range(BLOCK_COUNT))
RACK_Z_B = tuple(z + RACK_DEPTH + BACK_GAP for z in RACK_Z_A)
AISLE_Z = _work_aisle_centers()
CORRIDOR_X = (WEST_CORRIDOR_X, EAST_CORRIDOR_X)

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
    return min(CORRIDOR_X, key=lambda corridor: abs(corridor - x))


def _same_point(a: Vec2, b: Vec2) -> bool:
    return abs(a.x - b.x) < 0.05 and abs(a.z - b.z) < 0.05


def route_between(from_p: Vec2 | dict, to_p: Vec2 | dict) -> list[dict[str, float]]:
    """Ортогональный маршрут по рабочим проездам и продольным коридорам."""
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
    racks: list[dict] = []
    for index in range(BLOCK_COUNT):
        block_id = f"B{index + 1:02d}"
        origin = _block_origin_z(index)
        id_a = f"rack-{index + 1}-A"
        id_b = f"rack-{index + 1}-B"
        for side, z, own_id, mate_id in (
            ("A", origin, id_a, id_b),
            ("B", origin + RACK_DEPTH + BACK_GAP, id_b, id_a),
        ):
            racks.append(
                {
                    "id": own_id,
                    "code": f"R{index + 1:02d}{side}",
                    "blockId": block_id,
                    "side": side,
                    "backToBackWith": mate_id,
                    "zoneId": ZONE_STORAGE,
                    "x": RACK_X,
                    "z": z,
                    "w": RACK_WIDTH,
                    "d": RACK_DEPTH,
                    "bays": RACK_BAYS,
                    "levels": RACK_LEVELS,
                }
            )
    return racks


def build_blocks(racks: list[dict] | None = None) -> list[dict]:
    if racks is None:
        racks = build_racks()
    by_block: dict[str, list[dict]] = {}
    for rack in racks:
        by_block.setdefault(str(rack["blockId"]), []).append(rack)
    blocks: list[dict] = []
    for index in range(BLOCK_COUNT):
        block_id = f"B{index + 1:02d}"
        pair = by_block[block_id]
        rack_a = next(item for item in pair if item["side"] == "A")
        rack_b = next(item for item in pair if item["side"] == "B")
        blocks.append(
            {
                "id": block_id,
                "rackAId": rack_a["id"],
                "rackBId": rack_b["id"],
                "x": rack_a["x"],
                "z": rack_a["z"],
                "w": rack_a["w"],
                "d": BLOCK_DEPTH,
            }
        )
    return blocks


def build_aisles(racks: list[dict]) -> list[dict]:
    by_id = {rack["id"]: rack for rack in racks}
    aisles: list[dict] = []
    for i, z in enumerate(AISLE_Z):
        rack_ids: list[str] = []
        if i == 0:
            rack_ids = ["rack-1-A"]
        elif i == BLOCK_COUNT:
            rack_ids = [f"rack-{BLOCK_COUNT}-B"]
        else:
            rack_ids = [f"rack-{i}-B", f"rack-{i + 1}-A"]
        aisles.append(
            {
                "id": f"A{i + 1:02d}",
                "z": z,
                "x": WEST_CORRIDOR_X,
                "rackIds": [rid for rid in rack_ids if rid in by_id],
            }
        )
    return aisles


def _cell_approach(rack: dict, bay: int) -> dict[str, float]:
    """Подъезд с внешней стороны стеллажа (не со стороны общей спины)."""
    bay_width = rack["w"] / rack["bays"]
    x = rack["x"] + (bay - 0.5) * bay_width
    if rack["side"] == "A":
        z = rack["z"] - APPROACH_OFFSET
    else:
        z = rack["z"] + rack["d"] + APPROACH_OFFSET
    return {"x": x, "z": z}


def build_cells(racks: list[dict]) -> list[dict]:
    cells: list[dict] = []
    for rack in racks:
        for bay in range(1, rack["bays"] + 1):
            pos = _cell_approach(rack, bay)
            for level in range(1, rack["levels"] + 1):
                cells.append(
                    {
                        "id": f"{rack['code']}-L{level}-C{bay:02d}",
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
        "blocks": build_blocks(racks),
        "docks": build_docks(),
        "aisles": build_aisles(racks),
        "aisleZ": list(AISLE_Z),
        "corridorX": list(CORRIDOR_X),
    }
