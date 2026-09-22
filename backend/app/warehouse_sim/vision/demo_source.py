"""Deterministic demo frames. The same elapsed time always yields the same detections."""

from __future__ import annotations

from typing import Any

FRAME_WIDTH = 640
FRAME_HEIGHT = 360
PHASE_SEC = 8.0

# Five phases, then the script repeats. Coordinates are pixels on FRAME_WIDTH x FRAME_HEIGHT.
DEMO_PHASES: tuple[tuple[dict[str, Any], ...], ...] = (
    (
        {
            "class_name": "person",
            "confidence": 0.89,
            "track_id": "12",
            "bbox": {"x": 70, "y": 48, "width": 120, "height": 250},
            "severity": "info",
        },
    ),
    (
        {
            "class_name": "person",
            "confidence": 0.89,
            "track_id": "12",
            "bbox": {"x": 86, "y": 52, "width": 118, "height": 246},
            "severity": "info",
        },
        {
            "class_name": "pallet",
            "confidence": 0.94,
            "track_id": "4",
            "bbox": {"x": 430, "y": 168, "width": 150, "height": 120},
            "severity": "info",
        },
    ),
    (
        {
            "class_name": "person",
            "confidence": 0.91,
            "track_id": "12",
            "bbox": {"x": 96, "y": 44, "width": 114, "height": 252},
            "severity": "info",
        },
        {
            "class_name": "pallet",
            "confidence": 0.94,
            "track_id": "4",
            "bbox": {"x": 418, "y": 160, "width": 154, "height": 124},
            "severity": "info",
        },
        {
            "class_name": "obstacle",
            "confidence": 0.93,
            "track_id": "1",
            "bbox": {"x": 246, "y": 150, "width": 140, "height": 150},
            "severity": "warning",
        },
    ),
    (
        {
            "class_name": "obstacle",
            "confidence": 0.93,
            "track_id": "1",
            "bbox": {"x": 252, "y": 146, "width": 136, "height": 154},
            "severity": "warning",
        },
    ),
    (),
)

CLASS_LABELS = {
    "person": "Человек",
    "forklift": "Погрузчик",
    "agv": "AGV",
    "truck": "Машина",
    "pallet": "Паллета",
    "box": "Короб",
    "obstacle": "Препятствие",
}

COUNT_FORMS = {
    "person": ("человек", "человека", "человек"),
    "forklift": ("погрузчик", "погрузчика", "погрузчиков"),
    "agv": ("AGV", "AGV", "AGV"),
    "truck": ("машина", "машины", "машин"),
    "pallet": ("паллета", "паллеты", "паллет"),
    "box": ("короб", "короба", "коробов"),
    "obstacle": ("препятствие", "препятствия", "препятствий"),
}


def phase_index(elapsed: float) -> int:
    if elapsed < 0:
        elapsed = 0.0
    return int(elapsed // PHASE_SEC) % len(DEMO_PHASES)


def raw_detections(elapsed: float) -> list[dict[str, Any]]:
    return [dict(item) | {"bbox": dict(item["bbox"])} for item in DEMO_PHASES[phase_index(elapsed)]]


def _plural(count: int, forms: tuple[str, str, str]) -> str:
    n = abs(count) % 100
    n1 = n % 10
    if 11 <= n <= 14:
        return forms[2]
    if n1 == 1:
        return forms[0]
    if 2 <= n1 <= 4:
        return forms[1]
    return forms[2]


def _place(bbox: dict[str, float]) -> str:
    cx = float(bbox["x"]) + float(bbox["width"]) / 2
    cy = float(bbox["y"]) + float(bbox["height"]) / 2
    horizontal = "слева" if cx < FRAME_WIDTH * 0.38 else "справа" if cx > FRAME_WIDTH * 0.62 else "по центру"
    depth = "впереди" if cy < FRAME_HEIGHT * 0.62 else "рядом"
    if horizontal == "по центру":
        return depth
    return f"{depth} {horizontal}"


def describe(detections: list[dict[str, Any]]) -> str:
    if not detections:
        return "Обнаружено:\nнет объектов"
    counts: dict[str, int] = {}
    for item in detections:
        name = str(item["class_name"])
        counts[name] = counts.get(name, 0) + 1
    lines = ["Обнаружено:"]
    for name, count in counts.items():
        forms = COUNT_FORMS.get(name, (name, name, name))
        lines.append(f"{count} {_plural(count, forms)}")
    for item in detections:
        label = CLASS_LABELS.get(str(item["class_name"]), str(item["class_name"]))
        lines.append(f"{label} {_place(item['bbox'])}")
    return "\n".join(lines)


def demo_frame_svg() -> str:
    """Aisle plate only. Detected objects stay in the detection overlay, not in the image."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{FRAME_WIDTH}" height="{FRAME_HEIGHT}" viewBox="0 0 {FRAME_WIDTH} {FRAME_HEIGHT}">
  <defs>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f3f46"/>
      <stop offset="1" stop-color="#1c1917"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0c0a09"/>
  <polygon points="210,28 430,28 610,348 30,348" fill="url(#floor)"/>
  <polygon points="300,28 340,28 360,348 280,348" fill="#292524"/>
  <polygon points="292,70 348,70 392,348 248,348" fill="none" stroke="#a8a29e" stroke-width="2" stroke-dasharray="10 8" opacity="0.55"/>
  <polygon points="40,348 250,36 286,36 92,348" fill="#292524"/>
  <polygon points="600,348 390,36 354,36 548,348" fill="#292524"/>
  <rect x="78" y="70" width="18" height="6" fill="#ea580c"/>
  <rect x="70" y="120" width="22" height="6" fill="#ea580c"/>
  <rect x="60" y="180" width="28" height="6" fill="#ea580c"/>
  <rect x="48" y="250" width="36" height="6" fill="#ea580c"/>
  <rect x="544" y="70" width="18" height="6" fill="#ea580c"/>
  <rect x="548" y="120" width="22" height="6" fill="#ea580c"/>
  <rect x="552" y="180" width="28" height="6" fill="#ea580c"/>
  <rect x="556" y="250" width="36" height="6" fill="#ea580c"/>
  <rect x="250" y="330" width="140" height="10" fill="#eab308" opacity="0.85"/>
  <rect x="0" y="0" width="640" height="18" fill="#000" opacity="0.35"/>
</svg>"""
