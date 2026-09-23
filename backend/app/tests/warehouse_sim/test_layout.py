from app.warehouse_sim.layout import (
    AISLE_WIDTH,
    AISLE_Z,
    APPROACH_OFFSET,
    BACK_GAP,
    BLOCK_COUNT,
    BLOCK_DEPTH,
    WEST_CORRIDOR_X,
    build_blocks,
    build_cells,
    build_racks,
    build_topology,
    clearance_report,
    route_between,
    work_aisle_gaps,
)
from app.warehouse_sim.routing import astar_path, blocked_cells
from app.warehouse_sim.vehicle_dimensions import REQUIRED_AISLE_WIDTH
from app.warehouse_sim.world import create_world

AGV_START = {"x": WEST_CORRIDOR_X, "z": AISLE_Z[1]}


def _cell_pos(cells: list[dict], cell_id: str) -> dict[str, float]:
    cell = next(item for item in cells if item["id"] == cell_id)
    return dict(cell["pos"])


def _grid(point: dict) -> tuple[int, int]:
    return int(round(point["x"])), int(round(point["z"]))


def test_layout_has_eight_blocks_and_sixteen_racks() -> None:
    topology = build_topology()
    racks = topology["racks"]
    blocks = topology["blocks"]
    assert len(racks) == 16
    assert len(blocks) == BLOCK_COUNT == 8
    assert len(topology["aisleZ"]) == 9
    assert len(topology["corridorX"]) == 2
    assert {rack["id"] for rack in racks} == {
        f"rack-{i}-{side}" for i in range(1, 9) for side in ("A", "B")
    }


def test_each_block_is_back_to_back() -> None:
    racks = build_racks()
    by_id = {rack["id"]: rack for rack in racks}
    blocks = build_blocks(racks)
    assert len(blocks) == 8
    for block in blocks:
        rack_a = by_id[block["rackAId"]]
        rack_b = by_id[block["rackBId"]]
        assert rack_a["backToBackWith"] == rack_b["id"]
        assert rack_b["backToBackWith"] == rack_a["id"]
        assert rack_a["x"] == rack_b["x"]
        assert rack_a["w"] == rack_b["w"]
        assert abs(rack_b["z"] - (rack_a["z"] + rack_a["d"]) - BACK_GAP) < 1e-6
        assert 0 < BACK_GAP < 0.5
        assert rack_a["x"] == rack_b["x"]


def test_spine_is_not_navigable_but_work_aisles_are() -> None:
    racks = build_racks()
    blocked = blocked_cells(racks)
    by_id = {rack["id"]: rack for rack in racks}
    for block in build_blocks(racks):
        rack_a = by_id[block["rackAId"]]
        rack_b = by_id[block["rackBId"]]
        mid_x = rack_a["x"] + rack_a["w"] / 2
        mid_z = rack_a["z"] + rack_a["d"] + BACK_GAP / 2
        assert _grid({"x": mid_x, "z": mid_z}) in blocked
        north = {"x": mid_x, "z": rack_a["z"] - APPROACH_OFFSET}
        south = {"x": mid_x, "z": rack_b["z"] + rack_b["d"] + APPROACH_OFFSET}
        assert _grid(north) not in blocked, block["id"]
        assert _grid(south) not in blocked, block["id"]
    for i, block in enumerate(build_blocks(racks)[:-1]):
        this_b = by_id[block["rackBId"]]
        nxt_a = by_id[build_blocks(racks)[i + 1]["rackAId"]]
        gap = nxt_a["z"] - (this_b["z"] + this_b["d"])
        assert gap >= AISLE_WIDTH - 1e-6
        aisle_z = (this_b["z"] + this_b["d"] + nxt_a["z"]) / 2
        assert _grid({"x": this_b["x"] + this_b["w"] / 2, "z": aisle_z}) not in blocked


def test_agv_reaches_both_faces_of_each_block() -> None:
    racks = build_racks()
    cells = build_cells(racks)
    blocked = blocked_cells(racks)
    targets = (
        "R01A-L1-C01",
        "R01B-L1-C01",
        "R04A-L1-C01",
        "R04B-L1-C01",
        "R08A-L1-C01",
        "R08B-L1-C01",
    )
    for cell_id in targets:
        goal = _cell_pos(cells, cell_id)
        ortho = route_between(AGV_START, goal)
        assert ortho, cell_id
        astar = astar_path(AGV_START, goal, racks)
        assert astar, cell_id
        assert _grid(goal) not in blocked
        for point in astar[:-1]:
            assert _grid(point) not in blocked, (cell_id, point)


def test_astar_does_not_cross_racks_or_spine() -> None:
    racks = build_racks()
    cells = build_cells(racks)
    blocked = blocked_cells(racks)
    start = _cell_pos(cells, "R01A-L1-C06")
    goal = _cell_pos(cells, "R08B-L1-C06")
    path = astar_path(start, goal, racks)
    assert path
    for point in path[:-1]:
        assert _grid(point) not in blocked
    rack_a = next(r for r in racks if r["id"] == "rack-1-A")
    spine = {
        "x": rack_a["x"] + rack_a["w"] / 2,
        "z": rack_a["z"] + rack_a["d"] + BACK_GAP / 2,
    }
    assert _grid(spine) in blocked
    through = astar_path(
        {"x": spine["x"], "z": rack_a["z"] - APPROACH_OFFSET},
        {"x": spine["x"], "z": rack_a["z"] + BLOCK_DEPTH + APPROACH_OFFSET},
        racks,
    )
    for point in through[:-1]:
        assert _grid(point) not in blocked
        assert abs(point["z"] - spine["z"]) > 0.4 or abs(point["x"] - spine["x"]) > 10


def test_cross_aisles_connect_all_work_aisles() -> None:
    racks = build_racks()
    topology = build_topology()
    west, east = topology["corridorX"]
    for z in topology["aisleZ"]:
        path = astar_path({"x": west, "z": z}, {"x": east, "z": z}, racks)
        assert path, z
        start = {"x": west, "z": topology["aisleZ"][0]}
        path2 = astar_path(start, {"x": west, "z": z}, racks)
        assert path2, z


def test_aisle_width_lets_two_max_vehicles_pass() -> None:
    gaps = work_aisle_gaps()
    assert len(gaps) == 9
    assert AISLE_WIDTH == REQUIRED_AISLE_WIDTH
    report = clearance_report()
    assert all(line.startswith("PASS") for line in report), report
    for gap in gaps:
        assert gap["width"] + 1e-6 >= REQUIRED_AISLE_WIDTH, gap
        assert abs(gap["center"] - AISLE_Z[int(gap["id"][1:]) - 1]) < 1e-6


def test_world_cells_follow_sixteen_racks() -> None:
    world = create_world({"seed": 1})
    assert len(world["topology"]["racks"]) == 16
    assert len(world["topology"]["blocks"]) == 8
    assert len(world["cells"]) == 16 * 12 * 3
    assert world["cells"][0]["id"].startswith("R01A-L")
