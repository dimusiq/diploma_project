"""Runtime camera state on an existing sim device. Not a second fleet."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.warehouse_sim.vision.demo_source import FRAME_HEIGHT, FRAME_WIDTH
from app.warehouse_sim.vision.detector import DemoDetector

CAMERA_CLASSES = ("person", "forklift", "agv", "truck", "pallet", "box", "obstacle", "rack")
HOLD_CLASSES = ("person", "obstacle")
SCENE_VIEW_FPS = 24
_EPOCH = datetime(2026, 1, 1, tzinfo=timezone.utc)


def camera_spec(*, installed: bool = False) -> dict[str, Any]:
    return {
        "installed": installed,
        "enabled": installed,
        "source": "demo",
        "model": DemoDetector.model,
        "inference_enabled": False,
        "confidence_threshold": 0.5,
        "target_fps": 25,
        "classes": list(CAMERA_CLASSES),
        "offset": {"x": 0.0, "y": 0.55, "z": 0.7},
        "elapsed": 0.0,
        "online": False,
        "fps": 0,
        "inference_ms": 0.0,
        "frame_index": 0,
        "last_frame_at": None,
        "detection_count": 0,
        "detections": [],
        "seen_classes": [],
        "obstacle": False,
        "description": "",
        "log": [],
    }


def ensure_camera(device: dict[str, Any]) -> dict[str, Any] | None:
    camera = device.get("camera")
    if not isinstance(camera, dict) or not camera.get("installed"):
        return None
    return camera


def public_camera(device: dict[str, Any]) -> dict[str, Any]:
    camera = device.get("camera")
    if not isinstance(camera, dict) or not camera.get("installed"):
        return {"installed": False, "equipment_id": device["id"]}
    return {
        "installed": True,
        "equipment_id": device["id"],
        "camera_id": f"{device['id']}-cam",
        "enabled": bool(camera.get("enabled")),
        "online": bool(camera.get("online")),
        "source": camera.get("source") or "demo",
        "model": camera.get("model") or DemoDetector.model,
        "inference_enabled": bool(camera.get("inference_enabled")),
        "confidence_threshold": float(camera.get("confidence_threshold") or 0.5),
        "mode": "offline" if not camera.get("online") else ("demo" if (camera.get("source") or "demo") == "demo" else "live"),
        "log": list(camera.get("log") or [])[-12:],
        "fps": camera.get("fps") or 0,
        "inference_ms": camera.get("inference_ms") or 0,
        "frame_index": int(camera.get("frame_index") or 0),
        "last_frame_at": camera.get("last_frame_at"),
        "detection_count": int(camera.get("detection_count") or 0),
        "obstacle": bool(camera.get("obstacle")),
        "description": camera.get("description") or "",
        "classes": list(camera.get("classes") or CAMERA_CLASSES),
        "offset": dict(camera.get("offset") or {}),
        "status": "online" if camera.get("online") else "offline",
    }


def _publish(world: dict[str, Any], kind: str, payload: dict[str, Any]) -> None:
    world.setdefault("vision_outbox", []).append({"type": kind, "payload": payload})


def _emit(world: dict[str, Any], event_type: str, severity: str, message: str, device: dict[str, Any]) -> None:
    from app.warehouse_sim.simulation import emit

    emit(world, event_type, severity, message, device_id=device["id"], entity_id=f"{device['id']}-cam")


def tick_cameras(world: dict[str, Any], dt: float) -> None:
    """Detections come from the Digital Twin camera, not a scripted frame."""
    del world, dt


def start_camera(world: dict[str, Any], device: dict[str, Any]) -> dict[str, Any]:
    from app.warehouse_sim import events as ev

    camera = ensure_camera(device)
    if camera is None:
        raise KeyError(device["id"])
    was_online = bool(camera.get("online"))
    camera["enabled"] = True
    camera["online"] = True
    camera["inference_enabled"] = True
    camera["source"] = "scene"
    camera["model"] = "scene-camera"
    camera["fps"] = SCENE_VIEW_FPS
    camera["elapsed"] = 0.0
    camera["seen_classes"] = []
    camera["tracks"] = {}
    camera["detections"] = []
    camera["detection_count"] = 0
    camera["obstacle"] = False
    camera["description"] = ""
    device["cameraHold"] = False
    if not was_online:
        _emit(world, ev.CAMERA_ONLINE, "success", f"{device['name']}: камера в сети", device)
        _publish(world, "camera.status", public_camera(device))
    return public_camera(device)


def stop_camera(world: dict[str, Any], device: dict[str, Any]) -> dict[str, Any]:
    from app.warehouse_sim import events as ev

    camera = ensure_camera(device)
    if camera is None:
        raise KeyError(device["id"])
    if camera.get("online"):
        _emit(world, ev.CAMERA_OFFLINE, "warning", f"{device['name']}: камера не в сети", device)
    camera["online"] = False
    camera["inference_enabled"] = False
    camera["fps"] = 0
    camera["inference_ms"] = 0
    camera["detections"] = []
    camera["detection_count"] = 0
    camera["tracks"] = {}
    camera["obstacle"] = False
    camera["description"] = ""
    camera["seen_classes"] = []
    device["cameraHold"] = False
    _publish(world, "camera.status", public_camera(device))
    _publish(world, "camera.detection_cleared", {"equipment_id": device["id"], "camera_id": f"{device['id']}-cam"})
    return public_camera(device)


def control_camera(
    world: dict[str, Any],
    device: dict[str, Any],
    action: str,
    threshold: float | None = None,
    class_name: str | None = None,
    entity_id: str | None = None,
) -> dict[str, Any]:
    camera = ensure_camera(device)
    if camera is None:
        raise KeyError(device["id"])
    cmd = action.lower()
    if cmd == "start":
        return start_camera(world, device)
    if cmd == "stop":
        return stop_camera(world, device)
    if cmd == "enable":
        camera["enabled"] = True
        _publish(world, "camera.status", public_camera(device))
        return public_camera(device)
    if cmd == "disable":
        camera["enabled"] = False
        return stop_camera(world, device)
    if cmd == "threshold":
        if threshold is None:
            raise ValueError("confidence_threshold is required")
        camera["confidence_threshold"] = float(threshold)
        _publish(world, "camera.status", public_camera(device))
        return public_camera(device)
    if cmd in {"seen", "lost"}:
        if not class_name or not entity_id:
            raise ValueError("class_name and entity_id are required")
        return note_scene_detection(
            world,
            device,
            present=cmd == "seen",
            class_name=class_name,
            entity_id=entity_id,
        )
    raise ValueError(f"Неизвестная команда камеры: {action}")


def note_scene_detection(
    world: dict[str, Any],
    device: dict[str, Any],
    *,
    present: bool,
    class_name: str,
    entity_id: str,
) -> dict[str, Any]:
    """Record one visibility transition. Repeated sightings do not emit again."""
    from app.warehouse_sim import events as ev

    camera = ensure_camera(device)
    if camera is None:
        raise KeyError(device["id"])
    if not camera.get("online"):
        return public_camera(device)
    tracks: dict[str, dict[str, str]] = camera.setdefault("tracks", {})
    key = f"{class_name}:{entity_id}"
    if present:
        if key in tracks:
            return public_camera(device)
        tracks[key] = {"class_name": class_name, "entity_id": entity_id}
        _refresh_track_view(device, camera)
        if class_name == "person":
            device["cameraHold"] = True
            camera["obstacle"] = True
            _emit(world, ev.CAMERA_PERSON_DETECTED, "warning", f"{device['name']}: обнаружен человек", device)
        elif class_name == "obstacle":
            device["cameraHold"] = True
            camera["obstacle"] = True
            _emit(world, ev.CAMERA_OBSTACLE_DETECTED, "warning", f"{device['name']}: обнаружено препятствие", device)
        else:
            _emit(world, ev.CAMERA_OBJECT_DETECTED, "info", f"{device['name']}: обнаружен {class_name}", device)
        _publish(world, "camera.detection", _transition_payload(device, camera))
        return public_camera(device)
    if key not in tracks:
        return public_camera(device)
    del tracks[key]
    _refresh_track_view(device, camera)
    _emit(world, ev.CAMERA_OBJECT_LOST, "info", f"{device['name']}: {class_name} потерян", device)
    danger = any(item["class_name"] in HOLD_CLASSES for item in tracks.values())
    if not danger and device.get("cameraHold"):
        device["cameraHold"] = False
        camera["obstacle"] = False
        cleared = ev.CAMERA_OBSTACLE_CLEARED if class_name in HOLD_CLASSES else ev.CAMERA_OBJECT_LOST
        if class_name in HOLD_CLASSES:
            _emit(world, cleared, "success", f"{device['name']}: препятствие исчезло", device)
        _publish(
            world,
            "camera.detection_cleared",
            {"equipment_id": device["id"], "camera_id": f"{device['id']}-cam", "entity_id": entity_id},
        )
    else:
        _publish(world, "camera.detection", _transition_payload(device, camera))
    return public_camera(device)


def _refresh_track_view(device: dict[str, Any], camera: dict[str, Any]) -> None:
    when = (_EPOCH + timedelta(seconds=float(device.get("lastSeen") or 0))).isoformat().replace("+00:00", "Z")
    detections = []
    for item in camera.get("tracks", {}).values():
        name = item["class_name"]
        entity_id = item["entity_id"]
        detections.append(
            {
                "id": f"{device['id']}:{name}:{entity_id}",
                "camera_id": f"{device['id']}-cam",
                "equipment_id": device["id"],
                "timestamp": when,
                "class_name": name,
                "confidence": None,
                "bbox": None,
                "track_id": entity_id,
                "severity": "warning" if name in HOLD_CLASSES else "info",
                "entity_type": "worker" if name == "person" else name,
                "entity_id": entity_id,
            }
        )
    camera["detections"] = detections
    camera["detection_count"] = len(detections)
    camera["description"] = ", ".join(item["class_name"] for item in detections)
    log = list(camera.get("log") or [])
    if detections:
        last = detections[-1]
        log.append(
            {
                "timestamp": when,
                "class_name": last["class_name"],
                "confidence": 0,
                "track_id": last["track_id"],
            }
        )
    camera["log"] = log[-12:]


def _transition_payload(device: dict[str, Any], camera: dict[str, Any]) -> dict[str, Any]:
    status = public_camera(device)
    return {
        "equipment_id": device["id"],
        "camera_id": f"{device['id']}-cam",
        "obstacle": bool(camera.get("obstacle")),
        "detections": list(camera.get("detections") or []),
        "description": camera.get("description") or "",
        "status": status,
    }


def frame_payload(device: dict[str, Any]) -> dict[str, Any]:
    camera = ensure_camera(device)
    if camera is None:
        raise KeyError(device["id"])
    return {
        "equipment_id": device["id"],
        "camera_id": f"{device['id']}-cam",
        "width": FRAME_WIDTH,
        "height": FRAME_HEIGHT,
        "frame_index": int(camera.get("frame_index") or 0),
        "mode": "scene",
        "svg": None,
        "detections": list(camera.get("detections") or []),
        "description": camera.get("description") or "Viewport is rendered from the Digital Twin.",
    }
