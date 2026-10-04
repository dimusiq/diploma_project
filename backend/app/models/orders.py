import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class Shipment(SQLModel, table=True):
    """Отгрузка / перемещение груза (может объединять заказы)."""

    __tablename__ = "shipment"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "reference", name="uq_shipment_wh_ref"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    reference: str = Field(max_length=128)
    direction: str = Field(max_length=16, description="inbound|outbound|internal")
    status: str = Field(default="planned", max_length=32)
    scheduled_at: datetime | None = None
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InboundOrder(SQLModel, table=True):
    """Входящий заказ."""

    __tablename__ = "inbound_order"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_inbound_order_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64)
    shipment_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="shipment.id",
        ondelete="SET NULL",
        index=True,
    )
    status: str = Field(default="open", max_length=32)
    expected_at: datetime | None = None
    lines: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Строки заказа (до выделения отдельной таблицы)",
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OutboundOrder(SQLModel, table=True):
    """Исходящий заказ."""

    __tablename__ = "outbound_order"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_outbound_order_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64)
    shipment_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="shipment.id",
        ondelete="SET NULL",
        index=True,
    )
    status: str = Field(default="open", max_length=32)
    ship_by_at: datetime | None = None
    lines: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InboundOrderCreate(SQLModel):
    code: str = Field(min_length=1, max_length=64)
    warehouse_id: uuid.UUID | None = None
    shipment_id: uuid.UUID | None = None
    status: str = Field(default="open", max_length=32)
    expected_at: datetime | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None


class InboundOrderUpdate(SQLModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    expected_at: datetime | None = None
    shipment_id: uuid.UUID | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None


class InboundOrderPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    code: str
    shipment_id: uuid.UUID | None = None
    status: str
    expected_at: datetime | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class InboundOrderList(SQLModel):
    data: list["InboundOrderPublic"]
    count: int


class InboundReceiveLineRequest(SQLModel):
    """Фиксация факта приёмки по одной строке заказа."""

    line_index: int | None = Field(default=None, ge=0)
    line_key: str | None = Field(default=None, max_length=128)
    received_quantity: int = Field(ge=0)
    discrepancy_type: str | None = Field(
        default=None,
        max_length=32,
        description="shortage|overage|damage (опционально; иначе выводится из количеств)",
    )
    discrepancy_reason: str | None = Field(default=None, max_length=512)
    damage_quantity: int = Field(default=0, ge=0)


class InboundReceiveLineResult(SQLModel):
    order: "InboundOrderPublic"
    line_index: int
    line_key: str
    item_id: uuid.UUID | None = None
    discrepancy: dict[str, Any] | None = None
    putaway_created: int = 0
    putaway_task_ids: list[str] = []
    idempotent: bool = False


class OutboundConfirmPickRequest(SQLModel):
    """Подтверждение задания отбора (scan-verify) или инцидент «нет товара»."""

    task_id: uuid.UUID
    outcome: str = Field(default="ok", max_length=32, description="ok|no_stock")
    scanned_code: str | None = Field(default=None, max_length=200)
    scanned_slot_key: str | None = Field(default=None, max_length=128)
    quantity: int | None = Field(default=None, ge=1)
    reason: str | None = Field(default=None, max_length=512)


class OutboundConfirmPickResult(SQLModel):
    order: "OutboundOrderPublic"
    task_id: uuid.UUID
    status: str
    idempotent: bool = False
    incident: dict[str, Any] | None = None
    alternative: dict[str, Any] | None = None
    confirmed_quantity: int | None = None
    item_id: uuid.UUID | None = None


class OutboundPackRequest(SQLModel):
    """Фиксация упаковки (короба/паллеты опционально)."""

    handling_units: list[dict[str, Any]] | None = None


class OutboundOrderCreate(SQLModel):
    code: str = Field(min_length=1, max_length=64)
    warehouse_id: uuid.UUID | None = None
    shipment_id: uuid.UUID | None = None
    status: str = Field(default="open", max_length=32)
    ship_by_at: datetime | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None


class OutboundOrderUpdate(SQLModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    ship_by_at: datetime | None = None
    shipment_id: uuid.UUID | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None


class OutboundOrderPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    code: str
    shipment_id: uuid.UUID | None = None
    status: str
    ship_by_at: datetime | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class OutboundOrderList(SQLModel):
    data: list["OutboundOrderPublic"]
    count: int


class OutboundTimelineEvent(SQLModel):
    at: datetime
    kind: str
    label: str


class OutboundLineView(SQLModel):
    sku_id: str | None = None
    pallets: int = 0
    picked: int = 0
    quantity: int = 0


class OutboundLinkedItem(SQLModel):
    id: uuid.UUID
    sku: str | None = None
    title: str
    status: str
    quantity: int


class OutboundTaskView(SQLModel):
    id: uuid.UUID
    task_type: str
    status: str
    updated_at: datetime
    source: str | None = None
    destination: str | None = None
    equipment_id: str | None = None


class OutboundEquipmentView(SQLModel):
    id: str
    name: str
    code: str | None = None


class OutboundEventView(SQLModel):
    id: str
    at: datetime
    event_type: str
    message: str
    severity: str | None = None
    device_id: str | None = None


class OutboundFulfillmentPublic(SQLModel):
    """Исходящий заказ в operational-представлении отгрузки."""

    id: uuid.UUID
    warehouse_id: uuid.UUID
    code: str
    status: str
    shipment_id: uuid.UUID | None = None
    ship_by_at: datetime | None = None
    lines: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    customer: str | None = None
    items_count: int = 0
    total_quantity: int = 0
    pallets_count: int = 0
    picking_status: str = "pending"
    packing_status: str = "pending"
    ready_at: datetime | None = None
    transport_id: uuid.UUID | None = None
    transport_label: str | None = None
    transport_status: str | None = None
    transport_assigned: bool = False


class OutboundFulfillmentDetail(OutboundFulfillmentPublic):
    line_items: list["OutboundLineView"] = []
    tasks: list["OutboundTaskView"] = []
    items: list["OutboundLinkedItem"] = []
    timeline: list["OutboundTimelineEvent"] = []
    equipment: list["OutboundEquipmentView"] = []
    events: list["OutboundEventView"] = []


class OutboundFulfillmentList(SQLModel):
    data: list["OutboundFulfillmentPublic"]
    count: int
    ready_count: int = 0
    items_count: int = 0
    pallets_count: int = 0
    awaiting_transport: int = 0


class WarehouseTask(SQLModel, table=True):
    """Складское задание (погрузка, размещение, инвентаризация и т.д.)."""

    __tablename__ = "warehouse_task"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    task_type: str = Field(
        max_length=32, description="pick|putaway|move|replenish|count|other"
    )
    status: str = Field(default="pending", max_length=32)
    priority: int = Field(default=0)
    assigned_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL",
        index=True,
    )
    handling_unit_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="handling_unit.id",
        ondelete="SET NULL",
        index=True,
    )
    storage_bin_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="storage_bin.id",
        ondelete="SET NULL",
        index=True,
    )
    payload: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WarehouseTaskPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    task_type: str
    status: str
    priority: int
    assigned_user_id: uuid.UUID | None
    handling_unit_id: uuid.UUID | None
    storage_bin_id: uuid.UUID | None
    payload: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class WarehouseTaskList(SQLModel):
    data: list["WarehouseTaskPublic"]
    count: int


class WarehouseTaskCreate(SQLModel):
    task_type: str = Field(max_length=32)
    status: str | None = Field(default="pending", max_length=32)
    priority: int = 0
    warehouse_id: uuid.UUID | None = None
    assigned_user_id: uuid.UUID | None = None
    handling_unit_id: uuid.UUID | None = None
    storage_bin_id: uuid.UUID | None = None
    payload: dict[str, Any] | None = None


class WarehouseTaskPatch(SQLModel):
    status: str | None = Field(default=None, max_length=32)
    priority: int | None = None
    assigned_user_id: uuid.UUID | None = None
    payload: dict[str, Any] | None = None


class TaskExecution(SQLModel, table=True):
    """Исполнение задания (попытки, фактическое время, результат)."""

    __tablename__ = "task_execution"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_task_id: uuid.UUID = Field(
        foreign_key="warehouse_task.id",
        ondelete="CASCADE",
        index=True,
    )
    status: str = Field(default="started", max_length=32)
    actor_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL",
        index=True,
    )
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    result: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class PickWave(SQLModel, table=True):
    """Волна отбора: несколько исходящих заказов одним маршрутом."""

    __tablename__ = "pick_wave"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_pick_wave_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64)
    status: str = Field(
        default="draft",
        max_length=32,
        description="draft|planned|released|done|cancelled",
        index=True,
    )
    mode: str = Field(
        default="batch",
        max_length=16,
        description="batch|zone",
    )
    criteria: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    route_length_m: float | None = Field(default=None)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PickWaveOrder(SQLModel, table=True):
    """Связь волны с исходящим заказом."""

    __tablename__ = "pick_wave_order"
    __table_args__ = (
        UniqueConstraint(
            "wave_id", "outbound_order_id", name="uq_pick_wave_order_wave_order"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    wave_id: uuid.UUID = Field(
        foreign_key="pick_wave.id", ondelete="CASCADE", index=True
    )
    outbound_order_id: uuid.UUID = Field(
        foreign_key="outbound_order.id", ondelete="CASCADE", index=True
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PickWaveZoneAssignment(SQLModel, table=True):
    """Закрепление зоны волны за оператором (зонный отбор)."""

    __tablename__ = "pick_wave_zone_assignment"
    __table_args__ = (
        UniqueConstraint(
            "wave_id", "zone_code", name="uq_pick_wave_zone_assignment_wave_zone"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    wave_id: uuid.UUID = Field(
        foreign_key="pick_wave.id", ondelete="CASCADE", index=True
    )
    zone_code: str = Field(max_length=64)
    assigned_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL",
        index=True,
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PickWaveZoneAssignItem(SQLModel):
    zone_code: str = Field(min_length=1, max_length=64)
    assigned_user_id: uuid.UUID


class PickWaveCreate(SQLModel):
    warehouse_id: uuid.UUID | None = None
    code: str | None = Field(default=None, max_length=64)
    mode: str = Field(default="batch", max_length=16)
    order_ids: list[uuid.UUID] = Field(min_length=1)
    criteria: dict[str, Any] | None = None


class PickWaveZoneAssignRequest(SQLModel):
    assignments: list[PickWaveZoneAssignItem] = Field(min_length=1)


class PickWaveZoneAssignmentPublic(SQLModel):
    zone_code: str
    assigned_user_id: uuid.UUID | None = None


class PickWavePublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    code: str
    status: str
    mode: str
    criteria: dict[str, Any] | None = None
    route_length_m: float | None = None
    route_length_per_order_m: float | None = None
    extra: dict[str, Any] | None = None
    order_ids: list[uuid.UUID] = []
    zone_assignments: list[PickWaveZoneAssignmentPublic] = []
    task_ids: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime


class PickWaveList(SQLModel):
    data: list[PickWavePublic]
    count: int


class PickWavePlanResult(SQLModel):
    wave: PickWavePublic
    created_tasks: int = 0
    route_length_m: float = 0.0
    route_length_per_order_m: float = 0.0
    savings_m: float = 0.0
