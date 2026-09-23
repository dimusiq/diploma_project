"""Smart camera on the live simulation runtime."""

from app.warehouse_sim.simulation import advance_world
from app.warehouse_sim.vision.detector import DemoDetector
from app.warehouse_sim.vision.service import note_scene_detection, public_camera, start_camera, tick_cameras
from app.warehouse_sim.world import create_world


def test_demo_detection_is_deterministic() -> None:
    detector = DemoDetector()
    first = detector.detect(0)
    assert detector.detect(0) == first
    assert first[0]["class_name"] == "person"
    assert first[0]["confidence"] == 0.89
    assert first[0]["track_id"] == "12"
    second = detector.detect(8)
    assert [item["class_name"] for item in second] == ["person", "pallet"]
    assert detector.detect(8) == second


def test_simulation_tick_does_not_invent_a_person() -> None:
    world = create_world({"seed": 1})
    device = world["deviceById"]["agv-1"]
    start_camera(world, device)
    tick_cameras(world, 1.0)
    advance_world(world, 16)
    assert device["camera"]["detections"] == []
    assert device["camera"]["obstacle"] is False
    assert device.get("cameraHold") is False


def test_detection_schema_and_equipment_link() -> None:
    world = create_world({"seed": 1})
    device = world["deviceById"]["agv-1"]
    bare = world["deviceById"]["agv-2"]
    assert public_camera(bare)["installed"] is False
    start_camera(world, device)
    status = public_camera(device)
    assert status["installed"] is True
    assert status["equipment_id"] == "agv-1"
    assert status["camera_id"] == "agv-1-cam"
    assert status["online"] is True
    assert status["source"] == "scene"
    assert device["camera"]["detections"] == []
    note_scene_detection(world, device, present=True, class_name="pallet", entity_id="R04A-L2-C03")
    detection = device["camera"]["detections"][0]
    assert set(detection) >= {
        "id",
        "camera_id",
        "equipment_id",
        "timestamp",
        "class_name",
        "confidence",
        "bbox",
        "track_id",
        "severity",
    }
    assert detection["equipment_id"] == "agv-1"
    assert detection["track_id"] == "R04A-L2-C03"
    assert detection["bbox"] is None
    assert detection["class_name"] == "pallet"
    before = world["eventCountsByType"].get("CAMERA_OBJECT_DETECTED", 0)
    note_scene_detection(world, device, present=True, class_name="pallet", entity_id="R04A-L2-C03")
    assert world["eventCountsByType"].get("CAMERA_OBJECT_DETECTED", 0) == before
    assert device["cameraHold"] is False


def test_obstacle_stops_agv_until_clearance() -> None:
    world = create_world({"seed": 3, "faultRatePerHour": 0, "jamRatePerHour": 0})
    device = world["deviceById"]["agv-1"]
    task_id = device.get("taskId")
    start_camera(world, device)
    note_scene_detection(world, device, present=True, class_name="person", entity_id="wrk-1")
    assert device["camera"]["obstacle"] is True
    assert device["cameraHold"] is True
    assert device.get("taskId") == task_id
    assert world["eventCountsByType"].get("CAMERA_PERSON_DETECTED", 0) == 1
    assert world["eventCountsByType"].get("CAMERA_ONLINE", 0) >= 1
    note_scene_detection(world, device, present=True, class_name="person", entity_id="wrk-1")
    assert world["eventCountsByType"].get("CAMERA_PERSON_DETECTED", 0) == 1
    device["status"] = "moving"
    device["online"] = True
    device["path"] = [{"x": device["pos"]["x"] + 12, "z": device["pos"]["z"]}]
    origin = dict(device["pos"])
    advance_world(world, 2)
    assert device["pos"] == origin
    assert device["cameraHold"] is True
    assert device.get("taskId") == task_id
    assert device["path"]
    note_scene_detection(world, device, present=False, class_name="person", entity_id="wrk-1")
    assert device["cameraHold"] is False
    assert device.get("taskId") == task_id
    assert device["path"]
    assert world["eventCountsByType"].get("CAMERA_OBJECT_LOST", 0) >= 1
    assert world["eventCountsByType"].get("CAMERA_OBSTACLE_CLEARED", 0) >= 1
