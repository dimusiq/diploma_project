"""
Таблицы симулятора склада (префикс `wsim_`).

Это persistent simulation configuration, не копия WMS:

* план и топология (склад, зоны, ячейки);
* справочник устройств и сценариев;
* журнал `wsim_event`;
* строка прогона `wsim_run`.

Бизнес-состояние (Item, заказы, задания, отгрузки, остатки) живёт
в существующих WMS-таблицах. Высокочастотное состояние — в памяти
`WarehouseSimRuntime.world` (часы, координаты, заряд, телеметрия).

Координаты — метры плана: `x` слева направо, `y` сверху вниз.
Модельное время — секунды от старта прогона (`sim_time_sec`).
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

# --- Зоны склада ---
ZONE_RECEIVING = "RECEIVING"
ZONE_STORAGE = "STORAGE"
ZONE_PICKING = "PICKING"
ZONE_PACKING = "PACKING"
ZONE_SHIPPING = "SHIPPING"
ZONE_CHARGING = "CHARGING"
ZONE_TRANSIT = "TRANSIT"
ZONE_TYPES = (
    ZONE_RECEIVING,
    ZONE_STORAGE,
    ZONE_PICKING,
    ZONE_PACKING,
    ZONE_SHIPPING,
    ZONE_CHARGING,
    ZONE_TRANSIT,
)

# --- Доки ---
DOCK_RECEIVING = "RECEIVING"
DOCK_SHIPPING = "SHIPPING"
DOCK_TYPES = (DOCK_RECEIVING, DOCK_SHIPPING)

DOCK_STATUS_FREE = "FREE"
DOCK_STATUS_OCCUPIED = "OCCUPIED"
DOCK_STATUS_BLOCKED = "BLOCKED"
DOCK_STATUSES = (DOCK_STATUS_FREE, DOCK_STATUS_OCCUPIED, DOCK_STATUS_BLOCKED)

# --- Устройства ---
DEVICE_AGV = "AGV"
DEVICE_AMR = "AMR"
DEVICE_FORKLIFT = "FORKLIFT"
DEVICE_SCANNER = "SCANNER"
DEVICE_SENSOR = "SENSOR"
DEVICE_CONVEYOR = "CONVEYOR"
DEVICE_DOCK = "DOCK"
DEVICE_CHARGING_STATION = "CHARGING_STATION"
DEVICE_TYPES = (
    DEVICE_AGV,
    DEVICE_AMR,
    DEVICE_FORKLIFT,
    DEVICE_SCANNER,
    DEVICE_SENSOR,
    DEVICE_CONVEYOR,
    DEVICE_DOCK,
    DEVICE_CHARGING_STATION,
)
#: Устройства, которые перемещаются по плану и берут транспортные задания.
MOBILE_DEVICE_TYPES = (DEVICE_AGV, DEVICE_AMR, DEVICE_FORKLIFT)

DEVICE_STATUS_ONLINE = "ONLINE"
DEVICE_STATUS_IDLE = "IDLE"
DEVICE_STATUS_MOVING = "MOVING"
DEVICE_STATUS_BUSY = "BUSY"
DEVICE_STATUS_WAITING = "WAITING"
DEVICE_STATUS_CHARGING = "CHARGING"
DEVICE_STATUS_ERROR = "ERROR"
DEVICE_STATUS_OFFLINE = "OFFLINE"
DEVICE_STATUSES = (
    DEVICE_STATUS_ONLINE,
    DEVICE_STATUS_IDLE,
    DEVICE_STATUS_MOVING,
    DEVICE_STATUS_BUSY,
    DEVICE_STATUS_WAITING,
    DEVICE_STATUS_CHARGING,
    DEVICE_STATUS_ERROR,
    DEVICE_STATUS_OFFLINE,
)

# --- Товар и его состояния ---
INVENTORY_RECEIVED = "RECEIVED"
INVENTORY_STORED = "STORED"
INVENTORY_RESERVED = "RESERVED"
INVENTORY_PICKED = "PICKED"
INVENTORY_PACKED = "PACKED"
INVENTORY_SHIPPED = "SHIPPED"
INVENTORY_STATES = (
    INVENTORY_RECEIVED,
    INVENTORY_STORED,
    INVENTORY_RESERVED,
    INVENTORY_PICKED,
    INVENTORY_PACKED,
    INVENTORY_SHIPPED,
)

#: Где физически находится грузовая единица.
LOCATION_ZONE = "ZONE"
LOCATION_STORAGE = "STORAGE_LOCATION"
LOCATION_DEVICE = "DEVICE"
LOCATION_TRUCK = "TRUCK"
LOCATION_KINDS = (LOCATION_ZONE, LOCATION_STORAGE, LOCATION_DEVICE, LOCATION_TRUCK)

MOVEMENT_RECEIPT = "RECEIPT"
MOVEMENT_PUTAWAY = "PUTAWAY"
MOVEMENT_PICK = "PICK"
MOVEMENT_PACK = "PACK"
MOVEMENT_SHIP = "SHIP"
MOVEMENT_TRANSFER = "TRANSFER"
MOVEMENT_TYPES = (
    MOVEMENT_RECEIPT,
    MOVEMENT_PUTAWAY,
    MOVEMENT_PICK,
    MOVEMENT_PACK,
    MOVEMENT_SHIP,
    MOVEMENT_TRANSFER,
)

# --- Заказы ---
ORDER_INBOUND = "INBOUND"
ORDER_OUTBOUND = "OUTBOUND"
ORDER_DIRECTIONS = (ORDER_INBOUND, ORDER_OUTBOUND)

ORDER_CREATED = "CREATED"
ORDER_RELEASED = "RELEASED"
ORDER_PICKING = "PICKING"
ORDER_PICKED = "PICKED"
ORDER_PACKING = "PACKING"
ORDER_PACKED = "PACKED"
ORDER_SHIPPING = "SHIPPING"
ORDER_SHIPPED = "SHIPPED"
ORDER_CANCELLED = "CANCELLED"
ORDER_STATUSES = (
    ORDER_CREATED,
    ORDER_RELEASED,
    ORDER_PICKING,
    ORDER_PICKED,
    ORDER_PACKING,
    ORDER_PACKED,
    ORDER_SHIPPING,
    ORDER_SHIPPED,
    ORDER_CANCELLED,
)

# --- Транспорт во дворе ---
TRUCK_QUEUED = "QUEUED"
TRUCK_DOCKED = "DOCKED"
TRUCK_UNLOADING = "UNLOADING"
TRUCK_LOADING = "LOADING"
TRUCK_DEPARTED = "DEPARTED"
TRUCK_STATUSES = (
    TRUCK_QUEUED,
    TRUCK_DOCKED,
    TRUCK_UNLOADING,
    TRUCK_LOADING,
    TRUCK_DEPARTED,
)

# --- Задания ---
TASK_RECEIVING = "RECEIVING"
TASK_PUTAWAY = "PUTAWAY"
TASK_PICKING = "PICKING"
TASK_PACKING = "PACKING"
TASK_LOADING = "LOADING"
TASK_SHIPPING = "SHIPPING"
TASK_CHARGING = "CHARGING"
TASK_TRANSPORT = "TRANSPORT"
TASK_TYPES = (
    TASK_RECEIVING,
    TASK_PUTAWAY,
    TASK_PICKING,
    TASK_PACKING,
    TASK_LOADING,
    TASK_SHIPPING,
    TASK_CHARGING,
    TASK_TRANSPORT,
)

TASK_STATUS_CREATED = "CREATED"
TASK_STATUS_QUEUED = "QUEUED"
TASK_STATUS_ASSIGNED = "ASSIGNED"
TASK_STATUS_IN_PROGRESS = "IN_PROGRESS"
TASK_STATUS_BLOCKED = "BLOCKED"
TASK_STATUS_COMPLETED = "COMPLETED"
TASK_STATUS_FAILED = "FAILED"
TASK_STATUS_CANCELLED = "CANCELLED"
TASK_STATUSES = (
    TASK_STATUS_CREATED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_ASSIGNED,
    TASK_STATUS_IN_PROGRESS,
    TASK_STATUS_BLOCKED,
    TASK_STATUS_COMPLETED,
    TASK_STATUS_FAILED,
    TASK_STATUS_CANCELLED,
)
#: Задания, которые ещё ждут или выполняются.
TASK_OPEN_STATUSES = (
    TASK_STATUS_CREATED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_ASSIGNED,
    TASK_STATUS_IN_PROGRESS,
    TASK_STATUS_BLOCKED,
)

# --- События ---
SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_ERROR = "ERROR"
SEVERITY_CRITICAL = "CRITICAL"
SEVERITIES = (SEVERITY_INFO, SEVERITY_WARNING, SEVERITY_ERROR, SEVERITY_CRITICAL)

# --- Прогон симуляции ---
SIM_STOPPED = "STOPPED"
SIM_RUNNING = "RUNNING"
SIM_PAUSED = "PAUSED"
SIM_STATES = (SIM_STOPPED, SIM_RUNNING, SIM_PAUSED)

#: Множители модельного времени, доступные в интерфейсе.
SIM_SPEEDS = (0.5, 1.0, 2.0, 5.0, 10.0, 50.0)

# --- Сценарии (код → строка в wsim_scenario) ---
SCENARIO_NORMAL = "NORMAL_OPERATION"
SCENARIO_PEAK_LOAD = "PEAK_LOAD"
SCENARIO_INBOUND_PEAK = "INBOUND_PEAK"
SCENARIO_EQUIPMENT_FAILURE = "EQUIPMENT_FAILURE"
SCENARIO_CONVEYOR_FAILURE = "CONVEYOR_FAILURE"
SCENARIO_CONGESTION = "WAREHOUSE_CONGESTION"
SCENARIO_EMERGENCY = "EMERGENCY"
SCENARIO_CODES = (
    SCENARIO_NORMAL,
    SCENARIO_PEAK_LOAD,
    SCENARIO_INBOUND_PEAK,
    SCENARIO_EQUIPMENT_FAILURE,
    SCENARIO_CONVEYOR_FAILURE,
    SCENARIO_CONGESTION,
    SCENARIO_EMERGENCY,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --- План склада ---


class SimWarehouse(SQLModel, table=True):
    """Склад симулятора: габариты плана и шаг сетки маршрутизации."""

    __tablename__ = "wsim_warehouse"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=64, unique=True)
    name: str = Field(max_length=255)
    width_m: float = Field(gt=0, description="Размер плана по оси x, метры")
    height_m: float = Field(gt=0, description="Размер плана по оси y, метры")
    grid_cell_m: float = Field(default=1.0, gt=0, description="Шаг сетки для A*")
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class SimZone(SQLModel, table=True):
    """Функциональная зона (прямоугольник на плане)."""

    __tablename__ = "wsim_zone"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_wsim_zone_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64)
    name: str = Field(max_length=255)
    zone_type: str = Field(max_length=32, description="|".join(ZONE_TYPES))
    x: float = Field(description="Левая граница, метры")
    y: float = Field(description="Верхняя граница, метры")
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    color: str = Field(default="#3b82f6", max_length=32)
    created_at: datetime = Field(default_factory=_utcnow)


class SimAisle(SQLModel, table=True):
    """Проезд: отрезок, по которому разрешено движение техники."""

    __tablename__ = "wsim_aisle"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_wsim_aisle_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_zone.id", ondelete="SET NULL", index=True
    )
    code: str = Field(max_length=64)
    name: str = Field(max_length=255)
    orientation: str = Field(max_length=16, description="horizontal|vertical")
    axis_coord: float = Field(description="y для horizontal, x для vertical")
    from_coord: float = Field(description="Начало отрезка по свободной оси")
    to_coord: float = Field(description="Конец отрезка по свободной оси")
    width_m: float = Field(default=2.5, gt=0)
    created_at: datetime = Field(default_factory=_utcnow)


class SimRack(SQLModel, table=True):
    """Стеллаж: непроходимый прямоугольник с секциями и уровнями."""

    __tablename__ = "wsim_rack"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_wsim_rack_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_zone.id", ondelete="SET NULL", index=True
    )
    code: str = Field(max_length=64)
    name: str = Field(max_length=255)
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    bays: int = Field(ge=1, description="Секций по длине стеллажа")
    levels: int = Field(ge=1, description="Ярусов по высоте")
    created_at: datetime = Field(default_factory=_utcnow)


class SimStorageLocation(SQLModel, table=True):
    """Ячейка хранения. `approach_*` — точка в проезде, откуда с ней работают."""

    __tablename__ = "wsim_storage_location"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_wsim_storage_location_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    rack_id: uuid.UUID = Field(foreign_key="wsim_rack.id", ondelete="CASCADE", index=True)
    code: str = Field(max_length=64)
    bay: int = Field(ge=1)
    level: int = Field(ge=1)
    capacity: int = Field(default=1, ge=1, description="Сколько грузовых единиц вмещает")
    occupied: int = Field(default=0, ge=0)
    approach_x: float
    approach_y: float
    blocked: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)


class SimDock(SQLModel, table=True):
    """Док (ворота) с площадкой во дворе, где встаёт транспорт."""

    __tablename__ = "wsim_dock"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_wsim_dock_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_zone.id", ondelete="SET NULL", index=True
    )
    code: str = Field(max_length=64)
    dock_type: str = Field(max_length=16, description="|".join(DOCK_TYPES))
    status: str = Field(default=DOCK_STATUS_FREE, max_length=16)
    x: float
    y: float
    yard_x: float = Field(description="Точка ожидания транспорта, метры")
    yard_y: float
    created_at: datetime = Field(default_factory=_utcnow)


# --- Устройства ---


class SimDevice(SQLModel, table=True):
    """
    Устройство склада. В БД лежит «медленное» состояние (тип, статус, заряд,
    последняя позиция); координаты по тикам обновляются только в памяти движка
    и периодически флашатся, чтобы перезапуск продолжал картину.
    """

    __tablename__ = "wsim_device"
    __table_args__ = (UniqueConstraint("warehouse_id", "name", name="uq_wsim_device_wh_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_zone.id", ondelete="SET NULL", index=True
    )
    name: str = Field(max_length=64, description="AGV-01, FORKLIFT-02 и т.п.")
    device_type: str = Field(max_length=32, index=True, description="|".join(DEVICE_TYPES))
    status: str = Field(default=DEVICE_STATUS_IDLE, max_length=16, index=True)
    battery: float | None = Field(
        default=None, ge=0, le=100, description="Проценты; None — устройство без батареи"
    )
    x: float
    y: float
    home_x: float = Field(description="Точка парковки / базовая позиция")
    home_y: float
    speed_mps: float = Field(default=0.0, ge=0, description="Максимальная скорость, м/с")
    #: Мягкая ссылка на wsim_task (без FK, чтобы не замыкать связь device ↔ task).
    current_task_id: uuid.UUID | None = Field(default=None, index=True)
    meta: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


# --- Товар ---


class SimProduct(SQLModel, table=True):
    """Номенклатура (SKU)."""

    __tablename__ = "wsim_product"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    sku: str = Field(max_length=64, unique=True)
    name: str = Field(max_length=255)
    unit: str = Field(default="шт", max_length=32)
    units_per_pallet: int = Field(default=100, ge=1)
    cold_chain: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)


class SimInventoryItem(SQLModel, table=True):
    """
    Грузовая единица (паллета) с количеством товара.

    Жизненный цикл состояния: RECEIVED → STORED → RESERVED → PICKED → PACKED → SHIPPED.
    """

    __tablename__ = "wsim_inventory_item"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    product_id: uuid.UUID = Field(
        foreign_key="wsim_product.id", ondelete="CASCADE", index=True
    )
    lpn: str = Field(max_length=64, unique=True, description="Номер грузовой единицы (SSCC)")
    qty: int = Field(ge=0)
    state: str = Field(default=INVENTORY_RECEIVED, max_length=16, index=True)
    location_kind: str = Field(default=LOCATION_ZONE, max_length=24)
    storage_location_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_storage_location.id", ondelete="SET NULL", index=True
    )
    zone_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_zone.id", ondelete="SET NULL", index=True
    )
    #: Мягкие ссылки: устройство-носитель, транспорт, заказ-резерв.
    device_id: uuid.UUID | None = Field(default=None, index=True)
    truck_id: uuid.UUID | None = Field(default=None, index=True)
    order_id: uuid.UUID | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class SimInventoryMovement(SQLModel, table=True):
    """Факт перемещения грузовой единицы (append-only)."""

    __tablename__ = "wsim_inventory_movement"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    inventory_item_id: uuid.UUID = Field(
        foreign_key="wsim_inventory_item.id", ondelete="CASCADE", index=True
    )
    product_id: uuid.UUID = Field(
        foreign_key="wsim_product.id", ondelete="CASCADE", index=True
    )
    movement_type: str = Field(max_length=16, index=True, description="|".join(MOVEMENT_TYPES))
    qty: int
    from_kind: str | None = Field(default=None, max_length=24)
    from_id: uuid.UUID | None = None
    from_label: str | None = Field(default=None, max_length=128)
    to_kind: str | None = Field(default=None, max_length=24)
    to_id: uuid.UUID | None = None
    to_label: str | None = Field(default=None, max_length=128)
    task_id: uuid.UUID | None = Field(default=None, index=True)
    sim_time_sec: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=_utcnow, index=True)


# --- Документы ---


class SimTruck(SQLModel, table=True):
    """Транспорт во дворе: приезжает, занимает док, уезжает."""

    __tablename__ = "wsim_truck"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    plate: str = Field(max_length=32)
    carrier: str = Field(max_length=128)
    direction: str = Field(max_length=16, description="|".join(ORDER_DIRECTIONS))
    status: str = Field(default=TRUCK_QUEUED, max_length=16, index=True)
    dock_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_dock.id", ondelete="SET NULL", index=True
    )
    pallets_planned: int = Field(default=0, ge=0)
    pallets_done: int = Field(default=0, ge=0)
    x: float = Field(default=0.0)
    y: float = Field(default=0.0)
    arrived_sim_sec: float = Field(default=0.0)
    departed_sim_sec: float | None = None
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    updated_at: datetime = Field(default_factory=_utcnow)


class SimOrder(SQLModel, table=True):
    """Заказ: входящий (поставка) или исходящий (отгрузка клиенту)."""

    __tablename__ = "wsim_order"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_wsim_order_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=64)
    direction: str = Field(max_length=16, index=True, description="|".join(ORDER_DIRECTIONS))
    status: str = Field(default=ORDER_CREATED, max_length=16, index=True)
    priority: int = Field(default=0, description="Больше — важнее")
    counterparty: str = Field(default="", max_length=128, description="Клиент или поставщик")
    truck_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_truck.id", ondelete="SET NULL", index=True
    )
    created_sim_sec: float = Field(default=0.0)
    due_sim_sec: float | None = None
    released_sim_sec: float | None = None
    completed_sim_sec: float | None = None
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    updated_at: datetime = Field(default_factory=_utcnow)


class SimOrderItem(SQLModel, table=True):
    """Строка заказа в грузовых единицах (паллетах)."""

    __tablename__ = "wsim_order_item"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    order_id: uuid.UUID = Field(foreign_key="wsim_order.id", ondelete="CASCADE", index=True)
    product_id: uuid.UUID = Field(
        foreign_key="wsim_product.id", ondelete="CASCADE", index=True
    )
    qty_ordered: int = Field(ge=1)
    qty_received: int = Field(default=0, ge=0)
    qty_picked: int = Field(default=0, ge=0)
    qty_packed: int = Field(default=0, ge=0)
    qty_shipped: int = Field(default=0, ge=0)


class SimTask(SQLModel, table=True):
    """Задание: что перевезти/сделать, откуда, куда и кем."""

    __tablename__ = "wsim_task"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    code: str = Field(max_length=32, description="Читаемый номер задания, T-000123")
    task_type: str = Field(max_length=16, index=True, description="|".join(TASK_TYPES))
    status: str = Field(default=TASK_STATUS_CREATED, max_length=16, index=True)
    priority: int = Field(default=0)
    source_kind: str | None = Field(default=None, max_length=24)
    source_id: uuid.UUID | None = None
    source_label: str = Field(default="", max_length=128)
    source_x: float = Field(default=0.0)
    source_y: float = Field(default=0.0)
    dest_kind: str | None = Field(default=None, max_length=24)
    dest_id: uuid.UUID | None = None
    dest_label: str = Field(default="", max_length=128)
    dest_x: float = Field(default=0.0)
    dest_y: float = Field(default=0.0)
    assigned_device_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_device.id", ondelete="SET NULL", index=True
    )
    order_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_order.id", ondelete="SET NULL", index=True
    )
    inventory_item_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_inventory_item.id", ondelete="SET NULL", index=True
    )
    storage_location_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_storage_location.id", ondelete="SET NULL", index=True
    )
    blocked_reason: str | None = Field(default=None, max_length=255)
    payload: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_sim_sec: float = Field(default=0.0)
    started_sim_sec: float | None = None
    completed_sim_sec: float | None = None
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    started_at: datetime | None = None
    completed_at: datetime | None = None


# --- Журнал событий ---


class SimEvent(SQLModel, table=True):
    """
    Событие склада (append-only журнал).

    Ссылки на устройство/задание/заказ хранятся без FK: журнал должен
    переживать сброс симуляции и удаление документов (как `domain_event`).
    """

    __tablename__ = "wsim_event"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    seq: int = Field(
        sa_column=Column(BigInteger, nullable=False, index=True),
        description="Монотонный номер внутри прогона: стабильный порядок и курсор",
    )
    warehouse_id: uuid.UUID | None = Field(default=None, index=True)
    run_id: uuid.UUID | None = Field(default=None, index=True)
    occurred_at: datetime = Field(default_factory=_utcnow, index=True)
    sim_time_sec: float = Field(default=0.0)
    event_type: str = Field(max_length=48, index=True)
    severity: str = Field(default=SEVERITY_INFO, max_length=16, index=True)
    message: str = Field(max_length=512)
    device_id: uuid.UUID | None = Field(default=None, index=True)
    task_id: uuid.UUID | None = Field(default=None, index=True)
    order_id: uuid.UUID | None = Field(default=None, index=True)
    product_id: uuid.UUID | None = Field(default=None, index=True)
    zone_id: uuid.UUID | None = Field(default=None, index=True)
    payload: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


# --- Сценарии и прогоны ---


class SimScenario(SQLModel, table=True):
    """Сценарий: набор параметров генератора и стартовых воздействий."""

    __tablename__ = "wsim_scenario"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=48, unique=True)
    name: str = Field(max_length=255)
    description: str = Field(default="", max_length=1024)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    is_builtin: bool = Field(default=True)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)


class SimRun(SQLModel, table=True):
    """
    Прогон симуляции: текущее состояние движка, модельное время и KPI.

    Активная строка одна: движок при старте продолжает её или создаёт новую
    после сброса. Позволяет восстановить часы и счётчик событий после рестарта.
    """

    __tablename__ = "wsim_run"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(
        foreign_key="wsim_warehouse.id", ondelete="CASCADE", index=True
    )
    scenario_id: uuid.UUID | None = Field(
        default=None, foreign_key="wsim_scenario.id", ondelete="SET NULL", index=True
    )
    state: str = Field(default=SIM_STOPPED, max_length=16, index=True)
    is_active: bool = Field(default=True, index=True)
    speed: float = Field(default=1.0, gt=0)
    sim_time_sec: float = Field(default=0.0)
    day_start_sec: float = Field(
        default=8 * 3600, description="Модельное время суток на старте прогона, секунды"
    )
    event_seq: int = Field(
        sa_column=Column(BigInteger, nullable=False, server_default="0"),
        description="Последний выданный номер события",
    )
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    kpi: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    started_at: datetime = Field(default_factory=_utcnow)
    stopped_at: datetime | None = None
    updated_at: datetime = Field(default_factory=_utcnow)
