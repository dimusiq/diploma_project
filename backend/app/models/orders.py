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
