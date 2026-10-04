import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


# --- Warehouse (логический склад; активный layout для привязки 3D-сцены) ---
class Warehouse(SQLModel, table=True):
    __tablename__ = "warehouse"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=64, unique=True, index=True)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    active_layout_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse_layout.id",
        ondelete="SET NULL",
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- WarehouseZone (зоны склада в разрезе склада; справочник для техники и WMS) ---
class WarehouseZone(SQLModel, table=True):
    __tablename__ = "warehousezone"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_id", "name", name="uq_warehousezone_warehouse_name"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    name: str = Field(max_length=128)
    code: str | None = Field(default=None, max_length=64, index=True)
    zone_kind: str = Field(
        default="storage",
        max_length=32,
        description="storage|buffer|dock|staging|receiving|shipping|other",
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class WarehouseZoneCreate(SQLModel):
    name: str = Field(min_length=1, max_length=128)
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        description="Если не задан — используется склад с code=default",
    )
    code: str | None = Field(default=None, max_length=64)
    zone_kind: str = Field(default="storage", max_length=32)


class WarehouseZoneUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    warehouse_id: uuid.UUID | None = None
    code: str | None = Field(default=None, max_length=64)
    zone_kind: str | None = Field(default=None, max_length=32)
    extra: dict[str, Any] | None = None


class WarehouseZonePublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    name: str
    code: str | None = None
    zone_kind: str = "storage"
    extra: dict[str, Any] | None = None


# --- WarehouseLayout (геометрия цифрового двойника склада, версионируемый spec) ---
LAYOUT_LIFECYCLE_DRAFT = "draft"
LAYOUT_LIFECYCLE_PUBLISHED = "published"
LAYOUT_LIFECYCLE_ARCHIVED = "archived"
LAYOUT_LIFECYCLE_STATUSES = (
    LAYOUT_LIFECYCLE_DRAFT,
    LAYOUT_LIFECYCLE_PUBLISHED,
    LAYOUT_LIFECYCLE_ARCHIVED,
)


class WarehouseLayout(SQLModel, table=True):
    __tablename__ = "warehouse_layout"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=64, index=True)
    version: int = Field(default=1, ge=1)
    is_active: bool = Field(default=False)
    spec: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    spec_schema_version: int = Field(
        default=1,
        ge=1,
        description="Версия JSON-схемы spec (см. WarehouseLayoutSpecV1).",
    )
    lifecycle_status: str = Field(
        default=LAYOUT_LIFECYCLE_PUBLISHED,
        max_length=16,
        index=True,
    )
    published_at: datetime | None = Field(default=None)
    activated_at: datetime | None = Field(
        default=None,
        description="Когда эта ревизия стала активной (is_active=True).",
    )
    warehouse_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse.id",
        ondelete="SET NULL",
        index=True,
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WarehouseLayoutPublic(SQLModel):
    id: uuid.UUID
    code: str
    version: int
    is_active: bool
    spec: dict[str, Any]
    warehouse_id: uuid.UUID | None = None
    spec_schema_version: int = 1
    lifecycle_status: str = LAYOUT_LIFECYCLE_PUBLISHED
    published_at: datetime | None = None
    activated_at: datetime | None = None


class WarehouseLayoutSummary(SQLModel):
    """Краткая карточка ревизии layout (списки без полного spec)."""

    id: uuid.UUID
    code: str
    version: int
    is_active: bool
    warehouse_id: uuid.UUID | None = None
    spec_schema_version: int = 1
    lifecycle_status: str
    published_at: datetime | None = None
    activated_at: datetime | None = None
    created_at: datetime


class WarehouseLayoutsPublic(SQLModel):
    data: list["WarehouseLayoutSummary"]
    count: int


# --- Топология и операции WMS (привязка к складу и будущему 3D) ---


class WarehouseAisle(SQLModel, table=True):
    """Проход между стеллажами (геометрия в JSON для согласования с twin)."""

    __tablename__ = "warehouse_aisle"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64, index=True)
    name: str | None = Field(default=None, max_length=255)
    path_norm: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Полилиния в нормализованных координатах плана [{x,y}, ...]",
    )
    sort_order: int = Field(default=0, ge=0)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WarehouseRack(SQLModel, table=True):
    """Стеллаж / ряд хранения внутри зоны."""

    __tablename__ = "warehouse_rack"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_warehouse_rack_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehousezone.id",
        ondelete="SET NULL",
        index=True,
    )
    code: str = Field(max_length=64)
    row_index: int | None = Field(
        default=None,
        ge=1,
        description="Индекс ряда в сетке склада (1-based), согласование с Item.storage_row",
    )
    level_count: int | None = Field(default=None, ge=1)
    cell_x_count: int | None = Field(default=None, ge=1)
    cell_z_count: int | None = Field(default=None, ge=1)
    pose: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Позиция/ориентация в мире или нормализованные якоря для 3D",
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StorageBin(SQLModel, table=True):
    """Ячейка / слот хранения (bin/slot)."""

    __tablename__ = "storage_bin"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "slot_key", name="uq_storage_bin_wh_slot"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    rack_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse_rack.id",
        ondelete="SET NULL",
        index=True,
    )
    slot_key: str = Field(max_length=64, index=True)
    storage_row: int = Field(ge=1)
    storage_level: int = Field(ge=1)
    storage_cell_x: int = Field(ge=1)
    storage_cell_z: int = Field(ge=1)
    is_active: bool = Field(default=True)
    max_weight_kg: float | None = Field(default=None, ge=0)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StagingArea(SQLModel, table=True):
    """Буферная / стадийная зона (приёмка, отгрузка, кросс-док)."""

    __tablename__ = "staging_area"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_staging_area_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehousezone.id",
        ondelete="SET NULL",
        index=True,
    )
    code: str = Field(max_length=64)
    name: str | None = Field(default=None, max_length=255)
    area_kind: str = Field(
        default="buffer",
        max_length=32,
        description="inbound|outbound|buffer|cross_dock|other",
    )
    bounds_norm: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Прямоугольник или полигон в нормализованных координатах плана",
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DockDoor(SQLModel, table=True):
    """Ворота / док."""

    __tablename__ = "dock_door"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_dock_door_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    staging_area_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="staging_area.id",
        ondelete="SET NULL",
        index=True,
    )
    code: str = Field(max_length=64)
    label: str | None = Field(default=None, max_length=255)
    position_norm: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Точка {x,y} 0…1 на плане или расширенный pose",
    )
    is_active: bool = Field(default=True)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteNode(SQLModel, table=True):
    """Узел маршрута (AGV / ручная навигация по складу)."""

    __tablename__ = "route_node"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_layout_id", "code", name="uq_route_node_layout_code"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    warehouse_layout_id: uuid.UUID = Field(
        foreign_key="warehouse_layout.id",
        ondelete="CASCADE",
        index=True,
    )
    code: str = Field(max_length=64)
    node_kind: str = Field(default="waypoint", max_length=32)
    floor_level: int | None = Field(default=None, ge=0)
    position: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="x,y,z или нормализованные + этаж",
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteEdge(SQLModel, table=True):
    """Ребро графа маршрутов между узлами."""

    __tablename__ = "route_edge"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_layout_id",
            "from_node_id",
            "to_node_id",
            name="uq_route_edge_layout_from_to",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    warehouse_layout_id: uuid.UUID = Field(
        foreign_key="warehouse_layout.id",
        ondelete="CASCADE",
        index=True,
    )
    from_node_id: uuid.UUID = Field(
        foreign_key="route_node.id", ondelete="CASCADE", index=True
    )
    to_node_id: uuid.UUID = Field(
        foreign_key="route_node.id", ondelete="CASCADE", index=True
    )
    bidirectional: bool = Field(default=True)
    weight: float | None = Field(default=None, ge=0)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
