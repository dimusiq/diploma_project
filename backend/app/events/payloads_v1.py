"""Payload доменных событий, схема v1 (Pydantic). Версионирование: payload_schema_version в aggregate + модель."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION_V1: Literal[1] = 1


class EventPayloadBaseV1(BaseModel):
    """Базовый контракт v1; неизвестные поля отбрасываются при валидации."""

    model_config = {"extra": "ignore"}

    schema_version: Literal[1] = 1


class InventoryEventPayloadV1(EventPayloadBaseV1):
    warehouse_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None
    handling_unit_id: uuid.UUID | None = None
    quantity: int | None = Field(default=None, ge=0)
    slot_key: str | None = Field(default=None, max_length=128)
    reference: str | None = Field(default=None, max_length=256)
    meta: dict[str, Any] = Field(default_factory=dict)


class SlotBlockPayloadV1(EventPayloadBaseV1):
    warehouse_id: uuid.UUID | None = None
    slot_key: str = Field(min_length=1, max_length=128)
    reason: str | None = Field(default=None, max_length=512)


class EquipmentPositionPayloadV1(EventPayloadBaseV1):
    equipment_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID | None = None
    pose: dict[str, Any] = Field(default_factory=dict)
    source: str | None = Field(default=None, max_length=64)


class EquipmentBatteryPayloadV1(EventPayloadBaseV1):
    equipment_id: uuid.UUID
    percent: int | None = Field(default=None, ge=0, le=100)
    voltage_v: float | None = None


class TaskLifecyclePayloadV1(EventPayloadBaseV1):
    task_id: uuid.UUID
    warehouse_task_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID | None = None
    status: str | None = Field(default=None, max_length=32)
    meta: dict[str, Any] = Field(default_factory=dict)


class AlertPayloadV1(EventPayloadBaseV1):
    alert_id: uuid.UUID | None = None
    severity: str | None = Field(default=None, max_length=32)
    code: str | None = Field(default=None, max_length=64)
    message: str | None = Field(default=None, max_length=2048)
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: uuid.UUID | None = None


class QueueDepthPayloadV1(EventPayloadBaseV1):
    warehouse_id: uuid.UUID
    queue_name: str = Field(min_length=1, max_length=64)
    depth: int = Field(ge=0, le=1_000_000)
    meta: dict[str, Any] = Field(default_factory=dict)
