import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class InventorySnapshot(SQLModel, table=True):
    """Снимок остатков / состояния склада на момент времени."""

    __tablename__ = "inventory_snapshot"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    label: str | None = Field(default=None, max_length=255)
    taken_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    snapshot: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class SensorReading(SQLModel, table=True):
    """Показание датчика (температура, вес, RFID и т.д.)."""

    __tablename__ = "sensor_reading"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="CASCADE",
        index=True,
    )
    sensor_code: str = Field(max_length=64, index=True)
    metric_key: str = Field(max_length=64, index=True)
    read_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    value_float: float | None = None
    value_text: str | None = Field(default=None, max_length=1024)
    position: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    raw: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class SensorReadingPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID | None
    sensor_code: str
    metric_key: str
    read_at: datetime
    value_float: float | None
    value_text: str | None
    position: dict[str, Any] | None
    raw: dict[str, Any] | None


class SensorReadingList(SQLModel):
    data: list["SensorReadingPublic"]
    count: int


class SensorReadingCreate(SQLModel):
    sensor_code: str = Field(max_length=64)
    metric_key: str = Field(max_length=64)
    warehouse_id: uuid.UUID | None = None
    read_at: datetime | None = None
    value_float: float | None = None
    value_text: str | None = Field(default=None, max_length=1024)
    position: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None


class VehiclePosition(SQLModel, table=True):
    """Позиция техники / ТС на складе (связь с Equipment при наличии)."""

    __tablename__ = "vehicle_position"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="CASCADE",
        index=True,
    )
    equipment_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="equipment.id",
        ondelete="SET NULL",
        index=True,
    )
    external_vehicle_id: str | None = Field(default=None, max_length=128, index=True)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    pose: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="x,y,z, yaw и пр.",
    )
    source: str | None = Field(default=None, max_length=64)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class VehiclePositionPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID | None
    equipment_id: uuid.UUID | None
    external_vehicle_id: str | None
    recorded_at: datetime
    pose: dict[str, Any]
    source: str | None
    extra: dict[str, Any] | None


class VehiclePositionCreate(SQLModel):
    warehouse_id: uuid.UUID | None = None
    equipment_id: uuid.UUID | None = None
    external_vehicle_id: str | None = Field(default=None, max_length=128)
    recorded_at: datetime | None = None
    pose: dict[str, Any] = Field(default_factory=dict)
    source: str | None = Field(default=None, max_length=64)
    extra: dict[str, Any] | None = None


# --- DomainEvent (доменные события для twin / проекций / будущего SSE) ---
class DomainEvent(SQLModel, table=True):
    __tablename__ = "domain_event"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actor_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    event_type: str = Field(max_length=128, index=True)
    aggregate_type: str = Field(max_length=64)
    aggregate_id: uuid.UUID = Field(index=True)
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    payload_schema_version: int = Field(default=1, ge=1)
    event_seq: int = Field(index=True)
    correlation_id: uuid.UUID | None = Field(default=None)


class DomainEventPublic(SQLModel):
    id: uuid.UUID
    occurred_at: datetime
    actor_user_id: uuid.UUID | None
    event_type: str
    aggregate_type: str
    aggregate_id: uuid.UUID
    payload: dict[str, Any]
    payload_schema_version: int = 1
    event_seq: int
    correlation_id: uuid.UUID | None


class DomainEventList(SQLModel):
    data: list["DomainEventPublic"]
    count: int


class EventOutbox(SQLModel, table=True):
    """Transactional outbox: одна запись на domain_event до доставки во все проекции."""

    __tablename__ = "event_outbox"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain_event_id: uuid.UUID = Field(
        foreign_key="domain_event.id",
        ondelete="CASCADE",
        unique=True,
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = Field(default=None, index=True)
    attempts: int = Field(default=0, ge=0)
    last_error: str | None = Field(default=None, max_length=2048)


class ProjectionConsumerProcessed(SQLModel, table=True):
    """Идемпотентность потребителей: пара (consumer, event_id) уникальна."""

    __tablename__ = "projection_consumer_processed"

    consumer_name: str = Field(max_length=64, primary_key=True)
    domain_event_id: uuid.UUID = Field(
        foreign_key="domain_event.id",
        ondelete="CASCADE",
        primary_key=True,
    )
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TwinProjectionEntry(SQLModel, table=True):
    """Read-модель ленты twin, наполняется проекцией из доменных событий."""

    __tablename__ = "twin_projection_entry"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    domain_event_id: uuid.UUID = Field(
        foreign_key="domain_event.id",
        ondelete="CASCADE",
        unique=True,
    )
    event_seq: int = Field(index=True)
    occurred_at: datetime = Field(index=True)
    event_type: str = Field(max_length=128, index=True)
    aggregate_type: str = Field(max_length=64)
    aggregate_id: uuid.UUID = Field(index=True)
    payload_summary: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))


class TwinProjectionEntryPublic(SQLModel):
    id: uuid.UUID
    domain_event_id: uuid.UUID
    event_seq: int
    occurred_at: datetime
    event_type: str
    aggregate_type: str
    aggregate_id: uuid.UUID
    payload_summary: dict[str, Any]


class TwinProjectionFeed(SQLModel):
    data: list["TwinProjectionEntryPublic"]
    count: int


class TwinTaskStateProjection(SQLModel, table=True):
    """Проекция состояния складских заданий для twin/UI (обновляется из доменных событий)."""

    __tablename__ = "twin_task_state_projection"

    warehouse_task_id: uuid.UUID = Field(
        foreign_key="warehouse_task.id",
        ondelete="CASCADE",
        primary_key=True,
    )
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    task_type: str = Field(max_length=32)
    status: str = Field(max_length=32, index=True)
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_domain_event_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="domain_event.id",
        ondelete="SET NULL",
    )


class TwinEquipmentPoseProjection(SQLModel, table=True):
    """Последняя известная поза техники (из equipment.position_updated)."""

    __tablename__ = "twin_equipment_pose_projection"

    equipment_id: uuid.UUID = Field(
        foreign_key="equipment.id",
        ondelete="CASCADE",
        primary_key=True,
    )
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="SET NULL",
    )
    pose: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    source: str | None = Field(default=None, max_length=64)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_domain_event_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="domain_event.id",
        ondelete="SET NULL",
    )


class TwinQueueDepthProjection(SQLModel, table=True):
    """Глубина очередей (док, отбор, …) для дашборда twin."""

    __tablename__ = "twin_queue_depth_projection"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_id", "queue_name", name="uq_twin_queue_depth_wh_name"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    queue_name: str = Field(max_length=64)
    depth: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_domain_event_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="domain_event.id",
        ondelete="SET NULL",
    )


class TwinAlertOpenProjection(SQLModel, table=True):
    """Открытые алерты (alert.raised / alert.resolved)."""

    __tablename__ = "twin_alert_open_projection"

    alert_id: uuid.UUID = Field(primary_key=True)
    severity: str | None = Field(default=None, max_length=32)
    code: str | None = Field(default=None, max_length=64)
    message: str | None = Field(default=None, max_length=2048)
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: uuid.UUID | None = Field(default=None)
    raised_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: datetime | None = Field(default=None)
    last_domain_event_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="domain_event.id",
        ondelete="SET NULL",
    )


# --- Twin SLA / business rules (семантический слой ограничений и KPI/SLA) ---


class TwinSlaDefinition(SQLModel, table=True):
    """Декларативное SLA: на что действует, метрика, порог (JSON), окно агрегации."""

    __tablename__ = "twin_sla_definition"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_twin_sla_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="CASCADE",
        index=True,
        description="NULL — определение на уровне тенанта / всех складов",
    )
    code: str = Field(max_length=64, index=True)
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    target_entity_kind: str = Field(
        max_length=64,
        description="См. TwinEntityKind в warehouse_twin_semantics",
    )
    metric_key: str = Field(max_length=128)
    target_spec: dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False),
        description="Порог, оператор сравнения, единицы (произвольный JSON)",
    )
    window_spec: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Окно времени / скользящий интервал",
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TwinSlaDefinitionCreate(SQLModel):
    code: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    warehouse_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=1024)
    target_entity_kind: str = Field(max_length=64)
    metric_key: str = Field(max_length=128)
    target_spec: dict[str, Any]
    window_spec: dict[str, Any] | None = None
    is_active: bool = True


class TwinSlaDefinitionPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID | None
    code: str
    title: str
    description: str | None
    target_entity_kind: str
    metric_key: str
    target_spec: dict[str, Any]
    window_spec: dict[str, Any] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TwinSlaDefinitionList(SQLModel):
    data: list["TwinSlaDefinitionPublic"]
    count: int


class TwinBusinessRule(SQLModel, table=True):
    """Правило / ограничение: JSON-выражение под будущий движок; kind задаёт роль."""

    __tablename__ = "twin_business_rule"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_twin_rule_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="CASCADE",
        index=True,
    )
    code: str = Field(max_length=64, index=True)
    title: str = Field(max_length=255)
    rule_kind: str = Field(
        max_length=32,
        description="constraint|validation|routing_hint|policy",
    )
    applies_to_entity_kind: str | None = Field(
        default=None,
        max_length=64,
        description="Необязательная привязка к TwinEntityKind",
    )
    expression: dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False),
        description="Структурированное условие / шаблон маршрутизации",
    )
    priority: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TwinBusinessRuleCreate(SQLModel):
    code: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    warehouse_id: uuid.UUID | None = None
    rule_kind: str = Field(max_length=32)
    applies_to_entity_kind: str | None = Field(default=None, max_length=64)
    expression: dict[str, Any]
    priority: int = 0
    is_active: bool = True


class TwinBusinessRulePublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID | None
    code: str
    title: str
    rule_kind: str
    applies_to_entity_kind: str | None
    expression: dict[str, Any]
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TwinBusinessRuleList(SQLModel):
    data: list["TwinBusinessRulePublic"]
    count: int
