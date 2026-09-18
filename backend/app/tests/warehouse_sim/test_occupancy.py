import re

from app.warehouse_sim.snapshot import build_data, build_motion
from app.warehouse_sim.simulation import drop_off_pallet, pick_up_pallet
from app.warehouse_sim.world import DEMO_CONFIG, create_world

CELL_ID_RE = re.compile(r"^R(0[1-8])([AB])-L([1-3])-C(0[1-9]|1[0-2])$")


def _occupied_cells(world: dict) -> list[dict]:
    return [cell for cell in world["cells"] if cell.get("palletId")]


def test_snapshot_occupied_matches_inventory_state() -> None:
    world = create_world({"seed": 11, "initialFillRatio": 0.8})
    occupied = _occupied_cells(world)
    data = build_data(world, "STOPPED", 1.0, 0)
    motion = build_motion(world, False, 0)
    assert data["cellsTotal"] == len(world["cells"]) == 16 * 12 * 3
    assert data["cellsOccupied"] == len(occupied)
    assert len(data["occupiedCellIds"]) == len(occupied)
    assert set(data["occupiedCellIds"]) == {cell["id"] for cell in occupied}
    assert data["palletsTotal"] >= len(occupied)
    fill_sum = sum(row["occupied"] for row in motion["rackFill"])
    assert fill_sum == len(occupied)


def test_each_occupied_cell_has_valid_rack_level_bay() -> None:
    world = create_world({"seed": 3, "initialFillRatio": 0.78})
    by_id = {cell["id"]: cell for cell in world["cells"]}
    for cell_id in build_data(world, "STOPPED", 1.0, 0)["occupiedCellIds"]:
        match = CELL_ID_RE.match(cell_id)
        assert match, cell_id
        cell = by_id[cell_id]
        pallet = world["pallets"][cell["palletId"]]
        assert pallet["locationKind"] == "cell"
        assert pallet["locationId"] == cell_id
        assert cell["rackId"] == f"rack-{int(match.group(1))}-{match.group(2)}"
        assert cell["level"] == int(match.group(3))
        assert cell["bay"] == int(match.group(4))


def test_demo_fill_is_high_and_spread_across_all_racks() -> None:
    world = create_world(DEMO_CONFIG)
    total = len(world["cells"])
    occupied = _occupied_cells(world)
    ratio = len(occupied) / total
    assert 0.75 <= ratio <= 0.82
    by_rack: dict[str, int] = {}
    for cell in occupied:
        by_rack[cell["rackId"]] = by_rack.get(cell["rackId"], 0) + 1
    assert len(by_rack) == 16
    for rack_id, count in by_rack.items():
        assert count >= 12, rack_id


def test_putaway_marks_empty_cell_occupied() -> None:
    world = create_world({"seed": 5, "initialFillRatio": 0.0})
    free = next(cell for cell in world["cells"] if cell["palletId"] is None)
    world["pallets"]["pal-put"] = {
        "id": "pal-put",
        "sscc": "00375000000000001",
        "skuId": world["skus"][0]["id"],
        "qty": 10,
        "locationKind": "device",
        "locationId": "fl-1",
        "pos": {"x": 0.0, "z": 0.0},
        "createdAt": 0.0,
        "orderId": None,
        "state": "RECEIVED",
    }
    drop_off_pallet(
        world,
        world["devices"][0],
        {"kind": "putaway", "palletId": "pal-put", "cellId": free["id"]},
    )
    assert free["palletId"] == "pal-put"
    data = build_data(world, "STOPPED", 1.0, 0)
    assert free["id"] in data["occupiedCellIds"]
    assert data["cellsOccupied"] == 1


def test_pick_clears_occupied_cell() -> None:
    world = create_world({"seed": 9, "initialFillRatio": 0.2})
    cell = next(item for item in world["cells"] if item["palletId"])
    pallet_id = cell["palletId"]
    cell_id = cell["id"]
    device = next(item for item in world["devices"] if item["kind"] == "agv")
    pick_up_pallet(
        world,
        device,
        {"kind": "pick", "palletId": pallet_id, "cellId": cell_id},
    )
    assert cell["palletId"] is None
    data = build_data(world, "STOPPED", 1.0, 0)
    assert cell_id not in data["occupiedCellIds"]
    assert data["cellsOccupied"] == len(_occupied_cells(world))
