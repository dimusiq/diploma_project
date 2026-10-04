import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Any

from pydantic import computed_field, field_validator
from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

from app.core.storage_slot import format_storage_slot_key
from app.models.auth import User

if TYPE_CHECKING:
    from app.models.maintenance import Equipment


# --- Category (справочник для Item, иерархия через parent) ---
class Category(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="category.id", ondelete="SET NULL"
    )
    items: list["Item"] = Relationship(back_populates="category")


class CategoryCreate(SQLModel):
    name: str = Field(min_length=1, max_length=128)
    parent_id: uuid.UUID | None = None


class CategoryUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    parent_id: uuid.UUID | None = None


class CategoryPublic(SQLModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None = None


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    quantity: int = Field(default=1, ge=1)
    sku: str | None = Field(default=None, max_length=64)
    barcode: str | None = Field(default=None, max_length=64)
    unit: str | None = Field(default=None, max_length=32)
    expires_at: date | None = None
    location: str | None = Field(default=None, max_length=128)
    # 16 = 8 блоков × 2 стороны (rack-N-A/B) симулятора; глубина z=1.
    storage_row: int | None = Field(default=None, ge=1, le=16)
    storage_level: int | None = Field(default=None, ge=1, le=4)
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    category_id: uuid.UUID | None = None


# Properties to receive on item update (all optional)
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    quantity: int | None = Field(default=None, ge=1)
    sku: str | None = None
    barcode: str | None = None
    unit: str | None = None
    expires_at: date | None = None
    location: str | None = None
    storage_row: int | None = Field(default=None, ge=1, le=16)
    storage_level: int | None = Field(default=None, ge=1, le=4)
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)
    status: str | None = None
    category_id: uuid.UUID | None = None


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    # ge=0: после списания отбора остаток может стать 0 (создание по-прежнему ≥1).
    quantity: int = Field(default=1, ge=0)
    reserved_quantity: int = Field(
        default=0,
        ge=0,
        description="Зарезервировано под открытые задания отбора",
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    status: str = Field(default="incoming", max_length=32)
    category_id: uuid.UUID | None = Field(
        default=None, foreign_key="category.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    storage_row: int | None = Field(default=None, ge=1, le=16)
    storage_level: int | None = Field(default=None, ge=1, le=4)
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)
    owner: User | None = Relationship(back_populates="items")
    category: Category | None = Relationship(back_populates="items")


class ItemReservation(SQLModel, table=True):
    """Резерв товара под складское задание (отдельный контур от запчастей ТО)."""

    __tablename__ = "item_reservation"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_task_id", name="uq_item_reservation_warehouse_task_id"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(
        foreign_key="item.id", ondelete="CASCADE", index=True
    )
    warehouse_task_id: uuid.UUID = Field(
        foreign_key="warehouse_task.id", ondelete="CASCADE", index=True
    )
    outbound_order_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="outbound_order.id",
        ondelete="SET NULL",
        index=True,
    )
    quantity: int = Field(ge=1)
    status: str = Field(
        default="active",
        max_length=16,
        description="active|consumed|released",
        index=True,
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventoryCountAct(SQLModel, table=True):
    """Акт инвентаризации (черновик → проведён)."""

    __tablename__ = "inventory_count_act"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_task_id", name="uq_inventory_count_act_warehouse_task_id"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    warehouse_task_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="warehouse_task.id",
        ondelete="SET NULL",
        index=True,
    )
    status: str = Field(
        default="draft",
        max_length=16,
        description="draft|posted",
        index=True,
    )
    mode: str = Field(
        default="selective",
        max_length=32,
        description="selective|cycle",
    )
    reason: str | None = Field(default=None, max_length=512)
    actor_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    posted_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventoryCountLine(SQLModel, table=True):
    """Строка акта: системный остаток, факт, расхождение."""

    __tablename__ = "inventory_count_line"
    __table_args__ = (
        UniqueConstraint(
            "act_id", "item_id", name="uq_inventory_count_line_act_item"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    act_id: uuid.UUID = Field(
        foreign_key="inventory_count_act.id", ondelete="CASCADE", index=True
    )
    item_id: uuid.UUID = Field(
        foreign_key="item.id", ondelete="CASCADE", index=True
    )
    slot_key: str | None = Field(default=None, max_length=128)
    sku: str | None = Field(default=None, max_length=64)
    system_qty: int = Field(ge=0)
    counted_qty: int | None = Field(default=None, ge=0)
    variance: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventoryCountLineInput(SQLModel):
    item_id: uuid.UUID | None = None
    slot_key: str | None = Field(default=None, max_length=128)
    sku: str | None = Field(default=None, max_length=64)


class InventoryCountCreate(SQLModel):
    warehouse_id: uuid.UUID | None = None
    mode: str = Field(default="selective", max_length=32)
    reason: str | None = Field(default=None, max_length=512)
    lines: list[InventoryCountLineInput] = Field(min_length=1)


class InventoryCountFactLine(SQLModel):
    item_id: uuid.UUID
    counted_quantity: int = Field(ge=0)


class InventoryCountFactsRequest(SQLModel):
    lines: list[InventoryCountFactLine] = Field(min_length=1)


class InventoryCountPostRequest(SQLModel):
    reason: str | None = Field(default=None, max_length=512)


class InventoryCountLinePublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    slot_key: str | None = None
    sku: str | None = None
    system_qty: int
    counted_qty: int | None = None
    variance: int | None = None


class InventoryCountActPublic(SQLModel):
    id: uuid.UUID
    warehouse_id: uuid.UUID
    warehouse_task_id: uuid.UUID | None = None
    status: str
    mode: str
    reason: str | None = None
    actor_user_id: uuid.UUID | None = None
    posted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    lines: list[InventoryCountLinePublic] = []
    idempotent: bool = False


class InventoryCountActList(SQLModel):
    data: list[InventoryCountActPublic]
    count: int


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    status: str
    category_id: uuid.UUID | None = None
    created_at: datetime
    reserved_quantity: int = 0
    # Read model is lenient: sim/legacy rows may have z=0 or z outside the 1×1 floor-plan depth.
    storage_row: int | None = None
    storage_level: int | None = None
    storage_cell_x: int | None = None
    storage_cell_z: int | None = None

    @field_validator("storage_cell_z", mode="before")
    @classmethod
    def _coerce_storage_cell_z(cls, v: object) -> object:
        if isinstance(v, int | float) and int(v) < 1:
            return 1
        return v

    @computed_field  # type: ignore[prop-decorator]
    @property
    def slot_key(self) -> str | None:
        return format_storage_slot_key(
            self.storage_row,
            self.storage_level,
            self.storage_cell_x,
            self.storage_cell_z,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def available(self) -> int:
        """Доступно к резерву: quantity − reserved_quantity (≥ 0)."""
        q = int(self.quantity or 0)
        r = int(self.reserved_quantity or 0)
        return max(0, q - r)


class ItemsPublic(SQLModel):
    data: list["ItemPublic"]
    count: int


# --- ItemHistory (аудит изменений Item) ---
class ItemHistory(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    field_name: str = Field(max_length=64)
    old_value: str = Field(max_length=512, default="")
    new_value: str = Field(max_length=512, default="")


class ItemHistoryPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    user_id: uuid.UUID
    changed_at: datetime
    field_name: str
    old_value: str
    new_value: str


class ItemHistoryList(SQLModel):
    data: list["ItemHistoryPublic"]
    count: int


# --- Brand (справочник брендов техники, управление в админке) ---
class Brand(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128, unique=True)
    equipment: list["Equipment"] = Relationship(back_populates="brand")


class BrandCreate(SQLModel):
    name: str = Field(min_length=1, max_length=128)


class BrandUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)


class BrandPublic(SQLModel):
    id: uuid.UUID
    name: str

class HandlingUnit(SQLModel, table=True):
    """Транспортная единица (паллета, короб, контейнер)."""

    __tablename__ = "handling_unit"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    unit_kind: str = Field(max_length=32, description="pallet|case|container|other")
    sscc: str | None = Field(default=None, max_length=64, index=True)
    status: str = Field(default="created", max_length=32)
    current_bin_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="storage_bin.id",
        ondelete="SET NULL",
        index=True,
    )
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Pallet(SQLModel, table=True):
    """Детализация паллеты (ссылка на handling unit 1:1)."""

    __tablename__ = "pallet"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    handling_unit_id: uuid.UUID = Field(
        foreign_key="handling_unit.id",
        ondelete="CASCADE",
        unique=True,
    )
    length_mm: int | None = Field(default=None, ge=1)
    width_mm: int | None = Field(default=None, ge=1)
    height_mm: int | None = Field(default=None, ge=1)
    max_weight_kg: float | None = Field(default=None, ge=0)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventoryLot(SQLModel, table=True):
    """Партия / лот (batch/lot)."""

    __tablename__ = "inventory_lot"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "lot_code", name="uq_inventory_lot_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="warehouse.id", ondelete="CASCADE", index=True
    )
    lot_code: str = Field(max_length=128)
    item_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="item.id",
        ondelete="SET NULL",
        index=True,
    )
    quantity: int = Field(default=0, ge=0)
    received_at: datetime | None = Field(default=None)
    expires_at: date | None = None
    status: str = Field(default="active", max_length=32)
    extra: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# --- WarehouseSlotOccupancy (read-модель: какая ячейка → какой товар; KPI / лёгкие запросы) ---
class WarehouseSlotOccupancy(SQLModel, table=True):
    __tablename__ = "warehouse_slot_occupancy"

    slot_key: str = Field(primary_key=True, max_length=64)
    item_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE", unique=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WarehouseSlotOccupancyEntry(SQLModel):
    slot_key: str
    item_id: uuid.UUID


class WarehouseOccupancyResponse(SQLModel):
    data: list["WarehouseSlotOccupancyEntry"]
    count: int
