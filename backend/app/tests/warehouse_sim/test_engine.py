from app.warehouse_sim.layout import AISLE_Z, route_between
from app.warehouse_sim.routing import astar_path, blocked_cells
from app.warehouse_sim.scenarios import apply_scenario
from app.warehouse_sim.simulation import (
    advance_world,
    apply_command,
    device_command,
    spawn_inbound_truck,
    spawn_outbound_order,
)
from app.warehouse_sim.world import create_world

FAST = {
    "truckArrivalsPerHour": 8,
    "ordersPerHour": 20,
    "faultRatePerHour": 0,
    "jamRatePerHour": 0,
    "scanErrorRate": 0,
}


def test_route_between_ends_at_goal() -> None:
    path = route_between({"x": 6, "z": 24}, {"x": 50, "z": 41})
    assert len(path) > 1
    assert path[-1] == {"x": 50, "z": 41}


def test_astar_avoids_racks() -> None:
    world = create_world({"seed": 1, **FAST})
    racks = world["topology"]["racks"]
    blocked = blocked_cells(racks)
    path = astar_path({"x": 14, "z": 24}, {"x": 50, "z": AISLE_Z[1]}, racks)
    assert path
    for point in path[:-1]:
        cell = (int(round(point["x"])), int(round(point["z"])))
        assert cell not in blocked


def test_inbound_to_shipped_pipeline() -> None:
    world = create_world({"seed": 42, **FAST})
    advance_world(world, 4 * 3600)
    m = world["metrics"]
    assert m["trucksArrived"] > 0
    assert m["palletsReceived"] > 0
    assert m["palletsPutaway"] > 0
    assert m["ordersCreated"] > 0
    assert m["palletsPicked"] > 0
    assert m["ordersShipped"] > 0


def test_fail_device_blocks_and_reassigns() -> None:
    world = create_world({"seed": 7, **FAST})
    spawn_inbound_truck(world)
    advance_world(world, 180)
    mobile = next(
        (d for d in world["devices"] if d["kind"] == "forklift" and d.get("taskId")),
        None,
    )
    if mobile is None:
        mobile = next(d for d in world["devices"] if d["kind"] == "agv")
    device_command(world, mobile["id"], "FAIL")
    assert mobile["status"] == "fault"
    assert any(e["type"] == "DEVICE_ERROR" for e in world["events"])


def test_manual_order_and_truck_commands() -> None:
    world = create_world({"seed": 3, **FAST})
    apply_command(world, {"type": "spawnInboundTruck"})
    apply_command(world, {"type": "spawnOutboundOrder", "urgent": True})
    spawn_outbound_order(world)
    assert world["metrics"]["trucksArrived"] == 1
    assert world["metrics"]["ordersCreated"] >= 2


def test_equipment_failure_scenario() -> None:
    world = create_world({"seed": 11, **FAST})
    apply_scenario(world, "EQUIPMENT_FAILURE")
    assert any(d["status"] == "fault" for d in world["devices"])
    assert world["scenario"] == "EQUIPMENT_FAILURE"
