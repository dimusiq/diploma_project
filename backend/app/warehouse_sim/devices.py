"""Device Server: реестр устройств и команды поверх in-memory мира."""

from __future__ import annotations

from typing import Any

from app.warehouse_sim.simulation import device_command, is_mobile_kind
from app.warehouse_sim.world import create_device


class DeviceServer:
    def __init__(self, world: dict) -> None:
        self._world = world

    def bind(self, world: dict) -> None:
        self._world = world

    def register_device(self, spec: dict[str, Any]) -> dict:
        did = spec["id"]
        if did in self._world["deviceById"]:
            raise ValueError(f"Устройство {did} уже зарегистрировано")
        if spec.get("pos") is not None and spec.get("homePos") is not None:
            device = spec
        else:
            device = create_device(
                did,
                spec.get("kind", "agv"),
                spec.get("name", did),
                spec.get("pos") or {"x": 10.0, "z": 10.0},
                **{k: v for k, v in spec.items() if k not in {"id", "kind", "name", "pos"}},
            )
        self._world["devices"].append(device)
        self._world["deviceById"][did] = device
        return device

    def unregister_device(self, device_id: str) -> None:
        device = self._world["deviceById"].pop(device_id, None)
        if device is None:
            raise KeyError(device_id)
        self._world["devices"] = [d for d in self._world["devices"] if d["id"] != device_id]

    def get_device(self, device_id: str) -> dict:
        device = self._world["deviceById"].get(device_id)
        if device is None:
            raise KeyError(device_id)
        return device

    def get_devices(self) -> list[dict]:
        return list(self._world["devices"])

    def update_device_state(self, device_id: str, patch: dict[str, Any]) -> dict:
        device = self.get_device(device_id)
        for key, value in patch.items():
            if key == "id":
                continue
            device[key] = value
        return device

    def send_command(self, device_id: str, command: str, payload: dict | None = None) -> dict:
        device_command(self._world, device_id, command, payload)
        return self.get_device(device_id)

    def get_device_telemetry(self, device_id: str) -> dict:
        device = self.get_device(device_id)
        return {
            "deviceId": device["id"],
            "name": device["name"],
            "kind": device["kind"],
            "status": device["status"],
            "online": device["online"],
            "battery": device["battery"],
            "x": device["pos"]["x"],
            "y": device["pos"]["z"],
            "z": device["pos"]["z"],
            "speed": device["speed"] if device["status"] in ("moving", "waiting") else 0.0,
            "currentTask": device.get("taskId"),
            "temperature": device.get("temperature"),
            "lastSeen": device.get("lastSeen"),
            "metric": device.get("metric"),
            "metricKind": device.get("metricKind"),
            "metricUnit": device.get("metricUnit"),
            "history": list(device.get("history") or []),
            "mobile": is_mobile_kind(device["kind"]),
        }
