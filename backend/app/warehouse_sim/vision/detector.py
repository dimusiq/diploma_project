"""Detector contract. DemoDetector is deterministic and does not require a GPU."""

from __future__ import annotations

from typing import Any, Protocol

from app.warehouse_sim.vision.demo_source import raw_detections


class Detector(Protocol):
    def detect(self, elapsed: float) -> list[dict[str, Any]]:
        """Return detections for a camera clock. Implementations must be deterministic."""


class DemoDetector:
    """Scripted stream. A later YOLO detector can replace this without changing the API."""

    model = "yolo-demo"

    def detect(self, elapsed: float) -> list[dict[str, Any]]:
        return raw_detections(elapsed)
