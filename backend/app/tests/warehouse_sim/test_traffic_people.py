"""Скорость, разъезд без взаимного ожидания и детерминированные пешеходы."""

from copy import deepcopy

from app.warehouse_sim.layout import AISLE_Z
from app.warehouse_sim.pedestrians import path_crosses_rack, people_snapshot
from app.warehouse_sim.simulation import advance_along_path, advance_world, process_devices, step_world
from app.warehouse_sim.traffic import WAIT_LIMIT_SEC, resolve_traffic, traffic_snapshot
from app.warehouse_sim.world import create_world

QUIET = {
    "forklifts": 0,
    "agvs": 2,
    "amrs": 0,
    "workers": 3,
    "truckArrivalsPerHour": 0.0,
    "ordersPerHour": 0.0,
    "faultRatePerHour": 0.0,
    "jamRatePerHour": 0.0,
    "scanErrorRate": 0.0,
}


def _mobile(device_id: str, kind: str, x: float, z: float, goal_x: float, speed: float = 1.5) -> dict:
    return {
        "id": device_id,
        "kind": kind,
        "name": device_id,
        "status": "moving",
        "speed": speed,
        "pos": {"x": x, "z": z},
        "path": [{"x": goal_x, "z": z}],
        "taskId": None,
        "cruise": 1.0,
        "passSide": 0,
        "waitingFor": None,
        "waitingSince": None,
        "waitingDuration": 0.0,
        "personInPath": False,
        "moveStartedAt": 0.0,
    }


def test_vehicle_moves_at_expected_speed() -> None:
    device = _mobile("agv-1", "agv", 0.0, 0.0, 100.0, speed=2.0)
    world = {"devices": [device], "workers": [], "tasks": [], "timeSec": 0.0, "topology": {"racks": []}}
    for _ in range(50):
        advance_along_path(device, 1.0, world)
    assert abs(device["pos"]["x"] - 100.0) < 0.05
    assert device["path"] == []


def test_vehicle_changes_waypoint() -> None:
    device = _mobile("agv-1", "agv", 0.0, 0.0, 10.0, speed=10.0)
    device["path"] = [{"x": 6.0, "z": 0.0}, {"x": 16.0, "z": 0.0}]
    world = {"devices": [device], "workers": [], "tasks": [], "timeSec": 0.0, "topology": {"racks": []}}
    advance_along_path(device, 1.0, world)
    assert device["path"] == [{"x": 16.0, "z": 0.0}]
    assert abs(device["pos"]["x"] - 10.0) < 0.05


def test_two_vehicles_do_not_deadlock() -> None:
    z = AISLE_Z[8]
    first = _mobile("agv-1", "agv", 28.0, z, 78.0)
    second = _mobile("agv-2", "agv", 72.0, z, 22.0)
    world = {
        "devices": [first, second],
        "workers": [],
        "tasks": [],
        "timeSec": 0.0,
        "topology": {"racks": []},
    }
    both_waiting = 0
    for step in range(40):
        world["timeSec"] = step * 0.5
        resolve_traffic(world)
        advance_along_path(first, 0.5, world)
        advance_along_path(second, 0.5, world)
        if first["status"] == "waiting" and second["status"] == "waiting":
            both_waiting += 1
    assert both_waiting == 0
    assert first["pos"]["x"] > second["pos"]["x"]
    assert max(first["waitingDuration"], second["waitingDuration"]) <= WAIT_LIMIT_SEC


def test_waiting_has_timeout() -> None:
    z = AISLE_Z[8]
    mover = _mobile("agv-1", "agv", 30.0, z, 70.0)
    blocker = _mobile("agv-2", "agv", 40.0, z, 40.0)
    blocker["status"] = "loading"
    blocker["path"] = []
    world = {
        "devices": [mover, blocker],
        "workers": [],
        "tasks": [],
        "timeSec": 0.0,
        "topology": {"racks": []},
    }
    start = mover["pos"]["x"]
    for step in range(12):
        world["timeSec"] = step * 0.5
        resolve_traffic(world)
        advance_along_path(mover, 0.5, world)
        assert float(mover.get("waitingDuration") or 0) <= WAIT_LIMIT_SEC + 0.05
    assert mover["pos"]["x"] > start + 1.0


def test_priority_resolves_conflict() -> None:
    z = AISLE_Z[8]
    lead = _mobile("agv-1", "agv", 40.0, z, 70.0)
    follow = _mobile("agv-2", "agv", 42.0, z, 20.0)
    lead["taskId"] = "task-1"
    lead["moveStartedAt"] = 5.0
    follow["moveStartedAt"] = 0.0
    world = {
        "devices": [lead, follow],
        "workers": [],
        "tasks": [{"id": "task-1", "priority": 8}],
        "timeSec": 0.0,
        "topology": {"racks": []},
    }
    resolve_traffic(world)
    assert lead["cruise"] == 1.0
    assert follow["cruise"] == 0.45
    assert follow["waitingFor"] == "agv-1"
    assert lead["status"] != "waiting"
    assert follow["status"] != "waiting"
    lead_x = lead["pos"]["x"]
    follow_x = follow["pos"]["x"]
    for step in range(6):
        world["timeSec"] = step * 0.5
        resolve_traffic(world)
        advance_along_path(lead, 0.5, world)
        advance_along_path(follow, 0.5, world)
    assert lead["pos"]["x"] - lead_x > follow_x - follow["pos"]["x"]


def test_person_has_deterministic_path() -> None:
    first = create_world(QUIET)
    second = create_world(QUIET)
    left = first["workers"][0]
    right = second["workers"][0]
    assert left["code"] == "PERSON-001"
    assert left["target"] == "receiving"
    assert left["path"] == right["path"]
    assert left["pos"] == right["pos"]
    assert [worker["code"] for worker in first["workers"]] == ["PERSON-001", "PERSON-002", "PERSON-003"]


def test_person_position_changes_with_time() -> None:
    world = create_world(QUIET)
    start = dict(world["workers"][0]["pos"])
    advance_world(world, 8.0)
    moved = abs(world["workers"][0]["pos"]["x"] - start["x"]) + abs(world["workers"][0]["pos"]["z"] - start["z"])
    assert moved > 4.0
    assert world["workers"][0]["status"] == "walking"


def test_person_cannot_cross_rack() -> None:
    world = create_world(QUIET)
    racks = world["topology"]["racks"]
    for worker in world["workers"]:
        if worker["status"] != "walking":
            continue
        assert not path_crosses_rack([worker["pos"], *worker["path"]], racks)
    advance_world(world, 25.0)
    for row in people_snapshot(world):
        assert row["status"] in ("walking", "idle", "busy", "break")
    for worker in world["workers"]:
        assert not path_crosses_rack([worker["pos"]], racks)


def test_vehicle_stops_when_person_is_in_path() -> None:
    world = create_world(QUIET)
    agv = world["deviceById"]["agv-1"]
    worker = world["workers"][0]
    agv["status"] = "moving"
    agv["pos"] = {"x": 30.0, "z": AISLE_Z[8]}
    agv["path"] = [{"x": 60.0, "z": AISLE_Z[8]}]
    worker["status"] = "walking"
    worker["stops"] = []
    worker["path"] = []
    worker["pos"] = {"x": 31.2, "z": AISLE_Z[8]}
    held = dict(agv["pos"])
    process_devices(world, 1.0)
    assert agv["personInPath"] == worker["id"]
    assert agv["pos"] == held
    assert world["eventCountsByType"].get("PERSON_DETECTED_IN_PATH") == 1
    process_devices(world, 1.0)
    assert world["eventCountsByType"].get("PERSON_DETECTED_IN_PATH") == 1
    worker["pos"] = {"x": 31.2, "z": AISLE_Z[8] + 4.0}
    process_devices(world, 1.0)
    assert not agv["personInPath"]
    assert agv["pos"]["x"] > held["x"]


def test_pause_freezes_people_and_vehicles() -> None:
    world = create_world(QUIET)
    agv = world["deviceById"]["agv-1"]
    agv["status"] = "moving"
    agv["path"] = [{"x": agv["pos"]["x"] + 40.0, "z": agv["pos"]["z"]}]
    advance_world(world, 3.0)
    people = deepcopy([worker["pos"] for worker in world["workers"]])
    devices = deepcopy([device["pos"] for device in world["devices"] if device["kind"] == "agv"])
    step_world(world, 0.0)
    assert [worker["pos"] for worker in world["workers"]] == people
    assert [device["pos"] for device in world["devices"] if device["kind"] == "agv"] == devices


def test_simulation_speed_affects_people_and_vehicles_equally() -> None:
    def run(seconds: float) -> tuple[float, float]:
        world = create_world(QUIET)
        agv = world["deviceById"]["agv-1"]
        agv["status"] = "moving"
        agv["pos"] = {"x": 30.0, "z": AISLE_Z[8]}
        agv["path"] = [{"x": 90.0, "z": AISLE_Z[8]}]
        person = dict(world["workers"][0]["pos"])
        advance_world(world, seconds)
        moved_person = abs(world["workers"][0]["pos"]["x"] - person["x"]) + abs(world["workers"][0]["pos"]["z"] - person["z"])
        moved_agv = abs(agv["pos"]["x"] - 30.0)
        return moved_person, moved_agv

    person_slow, agv_slow = run(4.0)
    person_fast, agv_fast = run(8.0)
    assert person_fast > person_slow * 1.6
    assert agv_fast > agv_slow * 1.6
    assert abs(agv_slow - 1.5 * 4.0) < 1.0
    assert abs(agv_fast - 1.5 * 8.0) < 1.5


def test_reset_returns_deterministic_positions() -> None:
    original = create_world(QUIET)
    advanced = create_world(QUIET)
    advance_world(advanced, 6.0)
    restored = create_world(QUIET)
    assert [worker["pos"] for worker in restored["workers"]] == [worker["pos"] for worker in original["workers"]]
    assert [device["pos"] for device in restored["devices"]] == [device["pos"] for device in original["devices"]]
    assert [worker["pos"] for worker in advanced["workers"]] != [worker["pos"] for worker in original["workers"]]
    assert traffic_snapshot(restored)
    assert people_snapshot(restored)
