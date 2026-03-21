"""Реестр payload по (event_type, schema_version) для валидации при эмиссии."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.events import catalog
from app.events.payloads_v1 import (
    AlertPayloadV1,
    EquipmentBatteryPayloadV1,
    EquipmentPositionPayloadV1,
    InventoryEventPayloadV1,
    SlotBlockPayloadV1,
    TaskLifecyclePayloadV1,
)

# event_type -> модель для schema_version 1
PAYLOAD_MODEL_V1: dict[str, type[BaseModel]] = {
    catalog.EVENT_INVENTORY_RECEIVED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_PUTAWAY_PLANNED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_MOVED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_PICKED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_PACKED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_SHIPPED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_COUNTED: InventoryEventPayloadV1,
    catalog.EVENT_INVENTORY_ADJUSTED: InventoryEventPayloadV1,
    catalog.EVENT_SLOT_BLOCKED: SlotBlockPayloadV1,
    catalog.EVENT_SLOT_UNBLOCKED: SlotBlockPayloadV1,
    catalog.EVENT_EQUIPMENT_POSITION_UPDATED: EquipmentPositionPayloadV1,
    catalog.EVENT_EQUIPMENT_BATTERY_UPDATED: EquipmentBatteryPayloadV1,
    catalog.EVENT_TASK_CREATED: TaskLifecyclePayloadV1,
    catalog.EVENT_TASK_STARTED: TaskLifecyclePayloadV1,
    catalog.EVENT_TASK_PAUSED: TaskLifecyclePayloadV1,
    catalog.EVENT_TASK_COMPLETED: TaskLifecyclePayloadV1,
    catalog.EVENT_TASK_FAILED: TaskLifecyclePayloadV1,
    catalog.EVENT_ALERT_RAISED: AlertPayloadV1,
    catalog.EVENT_ALERT_RESOLVED: AlertPayloadV1,
}


def normalize_event_payload(
    event_type: str,
    payload_schema_version: int,
    payload: dict[str, Any],
    *,
    strict_typed_events: bool = True,
) -> dict[str, Any]:
    """
    Валидирует и нормализует payload.
    Для типов из VERSIONED_EVENT_TYPES при strict_typed_events=True требуется модель v1.
    """
    if payload_schema_version != 1:
        raise ValueError(f"Unsupported payload_schema_version: {payload_schema_version}")

    if strict_typed_events and event_type in catalog.VERSIONED_EVENT_TYPES:
        model = PAYLOAD_MODEL_V1.get(event_type)
        if model is None:
            raise ValueError(f"No payload model registered for event_type={event_type!r} v1")
        return model.model_validate(payload).model_dump(mode="json")

    # legacy / свободная форма
    return dict(payload)
