"""Реестр категорий и типов оборудования поверх существующих kind симулятора.

Не отдельная таблица: category выводится из kind. Новые типы регистрируются здесь,
без новых route/page и без жёсткого enum из пяти значений.
"""

from __future__ import annotations

from typing import Any

from app.warehouse_sim.layout import build_zones

KIND_TO_CATEGORY: dict[str, str] = {
    "agv": "transport",
    "amr": "transport",
    "forklift": "transport",
    "scanner": "scanner",
    "conveyor": "conveyor",
    "sensor": "sensor",
    "dock_door": "gate",
    "charger": "charging",
}

#: Участвуют в in-process simulation world (create_world / assign_tasks / telemetry).
SIMULATED_KINDS = frozenset(KIND_TO_CATEGORY.keys())
#: Мобильная техника, которой simulation назначает транспортные задания.
TASK_CAPABLE_KINDS = frozenset({"agv", "amr", "forklift"})

KIND_LABELS: dict[str, str] = {
    "agv": "AGV",
    "amr": "AMR-робот",
    "forklift": "Погрузчик",
    "scanner": "Сканер",
    "conveyor": "Конвейер",
    "sensor": "Датчик",
    "dock_door": "Ворота",
    "charger": "Зарядная станция",
}

SENSOR_METRIC_LABELS: dict[str, str] = {
    "temperature": "Температура",
    "humidity": "Влажность",
    "vibration": "Вибрация",
    "weight": "Вес",
    "co2": "CO₂",
    "photo_eye": "Фотобарьер",
}

COMMON_FIELDS = ("name", "code", "description", "zoneId", "enabled")
KIND_FIELDS: dict[str, tuple[str, ...]] = {
    "agv": (*COMMON_FIELDS, "speed", "battery"),
    "amr": (*COMMON_FIELDS, "speed", "battery"),
    "forklift": (*COMMON_FIELDS, "speed", "battery"),
    "scanner": COMMON_FIELDS,
    "conveyor": COMMON_FIELDS,
    "sensor": (*COMMON_FIELDS, "metricKind", "metricUnit", "metricMin", "metricMax"),
    "dock_door": COMMON_FIELDS,
    "charger": COMMON_FIELDS,
}

CATEGORY_COLUMNS: dict[str, tuple[str, ...]] = {
    "all": ("name", "code", "kind", "zone", "status", "task", "maintenance", "enabled", "actions"),
    "transport": ("name", "code", "kind", "zone", "status", "battery", "task", "maintenance", "enabled", "actions"),
    "scanner": ("name", "code", "kind", "zone", "status", "enabled", "actions"),
    "conveyor": ("name", "code", "zone", "status", "enabled", "actions"),
    "sensor": ("name", "code", "subtype", "zone", "status", "value", "unit", "enabled", "actions"),
    "gate": ("name", "code", "zone", "status", "enabled", "actions"),
    "charging": ("name", "code", "zone", "status", "enabled", "actions"),
    "other": ("name", "code", "kind", "zone", "status", "enabled", "actions"),
}

CATEGORIES: tuple[dict[str, Any], ...] = (
    {"id": "all", "label": "Всё"},
    {"id": "transport", "label": "Транспорт"},
    {"id": "scanner", "label": "Сканеры"},
    {"id": "conveyor", "label": "Конвейеры"},
    {"id": "sensor", "label": "Датчики"},
    {"id": "gate", "label": "Ворота"},
    {"id": "charging", "label": "Зарядные станции"},
    {"id": "other", "label": "Прочее"},
)


def category_of(kind: str) -> str:
    return KIND_TO_CATEGORY.get(kind, "other")


def equipment_catalog() -> dict[str, Any]:
    types = []
    for kind, category in KIND_TO_CATEGORY.items():
        types.append(
            {
                "kind": kind,
                "category": category,
                "label": KIND_LABELS.get(kind, kind),
                "fields": list(KIND_FIELDS.get(kind, COMMON_FIELDS)),
                "simulated": kind in SIMULATED_KINDS,
                "taskCapable": kind in TASK_CAPABLE_KINDS,
            }
        )
    zones = [
        {"id": zone["id"], "name": zone["name"], "kind": zone["kind"]}
        for zone in build_zones()
    ]
    return {
        "categories": [
            {**cat, "columns": list(CATEGORY_COLUMNS.get(cat["id"], CATEGORY_COLUMNS["all"]))}
            for cat in CATEGORIES
        ],
        "types": types,
        "zones": zones,
        "sensorMetrics": [
            {"id": key, "label": label} for key, label in SENSOR_METRIC_LABELS.items()
        ],
    }
