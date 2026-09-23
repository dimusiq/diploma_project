from app.warehouse_sim.pedestrians import (
    DEMO_STAFF,
    advance_workers,
    match_camera_person,
    seed_workers,
)
from app.warehouse_sim.simulation import advance_world
from app.warehouse_sim.world import create_world

QUIET = {
    "forklifts": 0,
    "agvs": 0,
    "amrs": 0,
    "workers": 3,
    "truckArrivalsPerHour": 0.0,
    "ordersPerHour": 0.0,
    "faultRatePerHour": 0.0,
    "jamRatePerHour": 0.0,
    "scanErrorRate": 0.0,
}


def test_demo_staff_links_worker_to_person() -> None:
    world = create_world({**QUIET})
    by_code = {worker["code"]: worker for worker in world["workers"]}
    person = by_code["PERSON-001"]
    assert person["employeeCode"] == "EMP-001"
    assert person["workerId"] == DEMO_STAFF[0]["worker_id"]
    assert person["displayName"] == "Иванов Иван Иванович"
    assert person["positionTitle"] == "Кладовщик"
    assert person["status"] == "walking"
    assert person["spawned"] is True
    assert by_code["PERSON-002"]["employeeCode"] == "EMP-002"
    assert by_code["PERSON-003"]["displayName"] == "Сидорова Анна Викторовна"


def test_inactive_worker_is_not_spawned() -> None:
    world = create_world({**QUIET})
    roster = [dict(row) for row in DEMO_STAFF]
    roster[1] = {**roster[1], "status": "inactive"}
    seed_workers(world["workers"], world["topology"]["racks"], roster)
    present = {worker.get("employeeCode") for worker in world["workers"] if worker.get("pos")}
    assert "EMP-001" in present
    assert "EMP-003" in present
    assert "EMP-002" not in present
    absent = next(worker for worker in world["workers"] if worker.get("employeeCode") == "EMP-002")
    assert absent["status"] == "off_shift"
    assert absent["spawned"] is False


def test_active_worker_position_updates() -> None:
    world = create_world({**QUIET})
    person = next(worker for worker in world["workers"] if worker["code"] == "PERSON-001")
    start = (person["pos"]["x"], person["pos"]["z"])
    advance_workers(world, 3.0)
    moved = next(worker for worker in world["workers"] if worker["code"] == "PERSON-001")
    assert (moved["pos"]["x"], moved["pos"]["z"]) != start
    assert moved["employeeCode"] == "EMP-001"
    assert moved["status"] == "walking"


def test_simulation_step_moves_linked_person() -> None:
    world = create_world({**QUIET})
    person = next(worker for worker in world["workers"] if worker["employeeCode"] == "EMP-002")
    start = person["pos"]["x"]
    advance_world(world, 2.0)
    again = next(worker for worker in world["workers"] if worker["employeeCode"] == "EMP-002")
    assert again["pos"]["x"] != start


def test_camera_match_uses_track_id_not_face() -> None:
    world = create_world({**QUIET})
    known = match_camera_person("wrk-1", world["workers"])
    assert known["matched"] is True
    assert known["label"] == "Иванов Иван Иванович"
    assert known["employee_code"] == "EMP-001"
    unknown = match_camera_person("stranger", world["workers"])
    assert unknown["matched"] is False
    assert unknown["label"] == "Неизвестный человек"
