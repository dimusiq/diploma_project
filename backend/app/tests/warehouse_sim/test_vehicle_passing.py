"""Две машины разъезжаются в одном проезде, не задевая стеллажи.

Один габарит на все mobile vehicles: ширина AGV/AMR (1.28 м) больше
forklift (1.10 м), reach truck и комплектовщиков. Проезд, в который
встают два AGV, вмещает и погрузчик.
"""

from app.warehouse_sim.layout import AISLE_Z, WEST_CORRIDOR_X, work_aisle_gaps
from app.warehouse_sim.routing import path_blocked_by_device
from app.warehouse_sim.simulation import advance_along_path
from app.warehouse_sim.vehicle_dimensions import (
    REQUIRED_AISLE_WIDTH,
    SAFETY_CLEARANCE,
    VEHICLE_BLOCK_RADIUS,
    VEHICLE_PHYSICAL_DIMENSIONS,
)


def _span(center: float, size: float) -> tuple[float, float]:
    return center - size / 2, center + size / 2


def _overlaps(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def test_two_vehicles_can_pass() -> None:
    gap = next(item for item in work_aisle_gaps() if item["id"] == "A05")
    aisle_z = AISLE_Z[4]
    assert abs(gap["center"] - aisle_z) < 1e-6
    half_aisle = gap["width"] / 2
    pairs = (
        ("forklift", "forklift"),
        ("agv", "agv"),
        ("agv", "forklift"),
    )
    for kind_a, kind_b in pairs:
        width = max(
            VEHICLE_PHYSICAL_DIMENSIONS[kind_a]["width"],
            VEHICLE_PHYSICAL_DIMENSIONS[kind_b]["width"],
        )
        length = max(
            VEHICLE_PHYSICAL_DIMENSIONS[kind_a]["length"],
            VEHICLE_PHYSICAL_DIMENSIONS[kind_b]["length"],
        )
        # Почти вплотную по оси проезда: зазор между корпусами положительный,
        # до стеллажа остаётся расчётный safety clearance.
        between = 0.02
        offset = (width + between) / 2
        z_a = aisle_z - offset
        z_b = aisle_z + offset
        box_a_z = _span(z_a, width)
        box_b_z = _span(z_b, width)
        assert not _overlaps(box_a_z, box_b_z), (kind_a, kind_b)
        assert box_b_z[0] - box_a_z[1] >= between - 1e-9
        rack_clearance = half_aisle - (offset + width / 2)
        assert rack_clearance + 1e-6 >= SAFETY_CLEARANCE - between / 2
        assert gap["width"] + 1e-6 >= REQUIRED_AISLE_WIDTH

        x = WEST_CORRIDOR_X + 20
        assert not path_blocked_by_device(
            {"x": x, "z": z_a},
            [{"x": x, "z": z_b}],
        )
        assert path_blocked_by_device(
            {"x": x + 0.2, "z": aisle_z},
            [{"x": x, "z": aisle_z}],
        )

        def lane(z: float, x0: float, x1: float) -> list[dict[str, float]]:
            step = 1.0 if x1 > x0 else -1.0
            points: list[dict[str, float]] = []
            cursor = x0
            while (x1 - cursor) * step > 1e-6:
                cursor = x1 if abs(x1 - cursor) <= 1 else cursor + step
                points.append({"x": cursor, "z": z})
            return points

        device_a = {
            "id": "a",
            "kind": kind_a,
            "status": "moving",
            "speed": 1.5,
            "pos": {"x": x - length, "z": z_a},
            "path": lane(z_a, x - length, x + length * 2),
        }
        device_b = {
            "id": "b",
            "kind": kind_b,
            "status": "moving",
            "speed": 1.5,
            "pos": {"x": x + length, "z": z_b},
            "path": lane(z_b, x + length, x - length * 2),
        }
        world = {"devices": [device_a, device_b]}
        for _ in range(40):
            advance_along_path(device_a, 0.25, world)
            advance_along_path(device_b, 0.25, world)
            assert device_a["status"] != "waiting", kind_a
            assert device_b["status"] != "waiting", kind_b
            ax = _span(device_a["pos"]["x"], length)
            bx = _span(device_b["pos"]["x"], length)
            if _overlaps(ax, bx):
                assert not _overlaps(
                    _span(device_a["pos"]["z"], width),
                    _span(device_b["pos"]["z"], width),
                )
        assert device_a["pos"]["x"] > x
        assert device_b["pos"]["x"] < x
        assert VEHICLE_BLOCK_RADIUS < width
