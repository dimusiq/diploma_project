"""Константы и карты типов интеграционного слоя warehouse_sim → WMS."""

from __future__ import annotations

from app.warehouse_sim.layout import BLOCK_COUNT, RACK_BAYS, RACK_LEVELS

# Физические ячейки: 8 блоков × 2 стороны × 3 яруса × 12 секций = 576.
_SIM_STORAGE_ROWS = BLOCK_COUNT * 2  # rack-N-A/B → линейный row 1..16
_SIM_STORAGE_LEVELS = RACK_LEVELS
_SIM_STORAGE_BAYS = RACK_BAYS

SOURCE = "warehouse_sim"
BARCODE_PREFIX = "WDS-"
TASK_TYPE_MAP = {
    "unload": "putaway",
    "putaway": "putaway",
    "pick": "pick",
    "load": "move",
    "replenish": "replenish",
    "charge": "other",
}
TASK_STATUS_MAP = {
    "pending": "pending",
    "assigned": "in_progress",
    "in_progress": "in_progress",
    "done": "completed",
    "blocked": "blocked",
    "failed": "cancelled",
}
_STATUS_CHAIN = ("incoming", "warehouse", "shipment", "shipped")
_OUTBOUND_RANK = {
    "open": 0,
    "confirmed": 0,
    "picking": 1,
    "picking_complete": 2,
    "packed": 3,
    "shipped": 4,
    "closed": 5,
}
