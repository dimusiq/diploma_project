from typing import Any
import uuid
from datetime import date, datetime, timezone

from sqlmodel import Field, Relationship, SQLModel

from app.models.inventory import Brand

# --- Equipment (складская техника, тип из справочника, бренд из справочника Brand) ---
EQUIPMENT_TYPE_AUTOPOGRUZCHIK = "autopogruzchik"
EQUIPMENT_TYPE_ELEKTROPOGRUZCHIK = "elektropogruzchik"
EQUIPMENT_TYPE_KOMPLEKTOVSHCHIK = "komplektovshchik"
EQUIPMENT_TYPE_RICHTRAK = "richtrak"
EQUIPMENT_TYPE_ELEKTROTELEZHKA = "elektrotelezhka"
EQUIPMENT_TYPES = (
    EQUIPMENT_TYPE_AUTOPOGRUZCHIK,
    EQUIPMENT_TYPE_ELEKTROPOGRUZCHIK,
    EQUIPMENT_TYPE_KOMPLEKTOVSHCHIK,
    EQUIPMENT_TYPE_RICHTRAK,
    EQUIPMENT_TYPE_ELEKTROTELEZHKA,
)


class Equipment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_type: str = Field(max_length=32)
    vin: str | None = Field(default=None, max_length=64)
    serial_number: str | None = Field(default=None, max_length=128)
    garage_number: str | None = Field(default=None, max_length=64)
    brand_id: uuid.UUID = Field(foreign_key="brand.id", ondelete="RESTRICT")
    model: str = Field(max_length=128)
    commissioned_at: date | None = None
    engine_hours: int | None = Field(default=None, ge=0)
    current_status: str = Field(default="active", max_length=32)
    zone: str | None = Field(default=None, max_length=128)
    attachments: str | None = Field(default=None, max_length=4096)
    instructions: str | None = Field(default=None, max_length=2048)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    brand: Brand | None = Relationship(back_populates="equipment")


class EquipmentCreate(SQLModel):
    equipment_type: str = Field(max_length=32)
    vin: str | None = None
    serial_number: str | None = None
    garage_number: str | None = None
    brand_id: uuid.UUID
    model: str = Field(min_length=1, max_length=128)
    commissioned_at: date | None = None
    engine_hours: int | None = Field(default=None, ge=0)
    current_status: str = Field(default="active", max_length=32)
    zone: str | None = None
    attachments: str | None = None
    instructions: str | None = None


class EquipmentUpdate(SQLModel):
    equipment_type: str | None = Field(default=None, max_length=32)
    vin: str | None = None
    serial_number: str | None = None
    garage_number: str | None = None
    brand_id: uuid.UUID | None = None
    model: str | None = Field(default=None, min_length=1, max_length=128)
    commissioned_at: date | None = None
    engine_hours: int | None = Field(default=None, ge=0)
    current_status: str | None = Field(default=None, max_length=32)
    zone: str | None = None
    attachments: str | None = None
    instructions: str | None = None


class EquipmentCurrentStatusPatch(SQLModel):
    """Только смена состояния техники (без изменения остальных полей через ORM)."""

    current_status: str = Field(max_length=32)


class EquipmentPublic(SQLModel):
    id: uuid.UUID
    equipment_type: str
    vin: str | None
    serial_number: str | None
    garage_number: str | None
    brand_id: uuid.UUID
    brand_name: str
    model: str
    commissioned_at: date | None
    engine_hours: int | None
    current_status: str
    zone: str | None
    attachments: str | None
    instructions: str | None
    created_at: datetime


class EquipmentList(SQLModel):
    data: list["EquipmentPublic"]
    count: int


class EquipmentImportRowError(SQLModel):
    """Ошибка разбора или сохранения одной строки файла импорта."""

    row: int
    message: str


class EquipmentImportResult(SQLModel):
    """Итог массового импорта техники из Excel."""

    created: int
    errors: list["EquipmentImportRowError"] = Field(default_factory=list)


# --- MaintenanceRecord (проведённое ТО по единице техники) ---
class MaintenanceRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_id: uuid.UUID = Field(foreign_key="wsim_device.id", ondelete="CASCADE")
    performed_at: date = Field(description="Дата проведения ТО")
    engine_hours_at_service: int | None = Field(
        default=None, ge=0, description="Моточасы на момент проведения"
    )
    interval_hours: int = Field(
        ge=1, description="Интервал ТО в моточасах (500, 1000 и т.д.)"
    )
    comment: str | None = Field(default=None, max_length=512)


class MaintenanceRecordCreate(SQLModel):
    performed_at: date
    engine_hours_at_service: int | None = None
    interval_hours: int = Field(ge=1)
    comment: str | None = None


class MaintenanceRecordPublic(SQLModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    performed_at: date
    engine_hours_at_service: int | None
    interval_hours: int
    comment: str | None


class MaintenanceRecordList(SQLModel):
    data: list["MaintenanceRecordPublic"]
    count: int


class MaintenanceRecordWithEquipmentPublic(SQLModel):
    """Запись ТО с отображаемым названием техники для общего списка."""

    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str  # canonical SimDevice.name
    performed_at: date
    engine_hours_at_service: int | None
    interval_hours: int
    comment: str | None


class MaintenanceRecordListWithEquipment(SQLModel):
    data: list["MaintenanceRecordWithEquipmentPublic"]
    count: int


# --- Work Order (заявка на обслуживание/ремонт): жизненный цикл, исполнитель, приоритет, чек-листы, вложения ---
WORK_ORDER_STATUS_OPEN = "open"
WORK_ORDER_STATUS_IN_PROGRESS = "in_progress"
WORK_ORDER_STATUS_WAITING_PARTS = "waiting_parts"
WORK_ORDER_STATUS_DONE = "done"
WORK_ORDER_STATUS_CANCELED = "canceled"
WORK_ORDER_STATUSES = [
    WORK_ORDER_STATUS_OPEN,
    WORK_ORDER_STATUS_IN_PROGRESS,
    WORK_ORDER_STATUS_WAITING_PARTS,
    WORK_ORDER_STATUS_DONE,
    WORK_ORDER_STATUS_CANCELED,
]

WORK_ORDER_PRIORITY_LOW = "low"
WORK_ORDER_PRIORITY_MEDIUM = "medium"
WORK_ORDER_PRIORITY_HIGH = "high"
WORK_ORDER_PRIORITY_CRITICAL = "critical"
WORK_ORDER_PRIORITIES = [
    WORK_ORDER_PRIORITY_LOW,
    WORK_ORDER_PRIORITY_MEDIUM,
    WORK_ORDER_PRIORITY_HIGH,
    WORK_ORDER_PRIORITY_CRITICAL,
]

ATTACHMENT_KIND_BEFORE = "before_photo"
ATTACHMENT_KIND_AFTER = "after_photo"
ATTACHMENT_KIND_FILE = "attachment"
ATTACHMENT_KINDS = [ATTACHMENT_KIND_BEFORE, ATTACHMENT_KIND_AFTER, ATTACHMENT_KIND_FILE]


class WorkOrder(SQLModel, table=True):
    __tablename__ = "workorder"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_id: uuid.UUID = Field(foreign_key="wsim_device.id", ondelete="CASCADE")
    title: str = Field(max_length=256)
    description: str | None = Field(default=None, max_length=4096)
    status: str = Field(default=WORK_ORDER_STATUS_OPEN, max_length=32)
    priority: str = Field(default=WORK_ORDER_PRIORITY_MEDIUM, max_length=32)
    assigned_to_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    start_at: datetime | None = Field(
        default=None, description="Временное окно выполнения (начало)"
    )
    end_at: datetime | None = Field(
        default=None, description="Временное окно выполнения (конец)"
    )
    due_at: datetime | None = Field(default=None)
    created_by_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderStatusHistory(SQLModel, table=True):
    __tablename__ = "workorder_status_history"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    from_status: str | None = Field(default=None, max_length=32)
    to_status: str = Field(max_length=32)
    changed_by_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    comment: str | None = Field(default=None, max_length=1024)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderComment(SQLModel, table=True):
    __tablename__ = "workorder_comment"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    body: str = Field(max_length=4096)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderChecklistItem(SQLModel, table=True):
    __tablename__ = "workorder_checklist_item"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    title: str = Field(max_length=512)
    sort_order: int = Field(default=0, ge=0)
    completed: bool = Field(default=False)


class WorkOrderAttachment(SQLModel, table=True):
    __tablename__ = "workorder_attachment"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    file_path: str = Field(max_length=1024, description="Путь или URL к файлу")
    filename: str | None = Field(default=None, max_length=256)
    kind: str = Field(default=ATTACHMENT_KIND_FILE, max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# API schemas for WorkOrder
class WorkOrderCreate(SQLModel):
    equipment_id: uuid.UUID
    title: str = Field(min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4096)
    priority: str = Field(default=WORK_ORDER_PRIORITY_MEDIUM, max_length=32)
    assigned_to_id: uuid.UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    due_at: datetime | None = None


class WorkOrderUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    status: str | None = None
    status_comment: str | None = Field(default=None, max_length=1024)
    priority: str | None = None
    assigned_to_id: uuid.UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    due_at: datetime | None = None


class WorkOrderFromMaintenanceEventCreate(SQLModel):
    """Создание work order из расчетного события календаря ТО."""

    equipment_id: uuid.UUID
    interval_hours: int | None = Field(default=None, ge=1)
    start_at: datetime
    end_at: datetime
    assigned_to_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4096)


class WorkOrderStatusHistoryPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    from_status: str | None
    to_status: str
    changed_by_id: uuid.UUID | None
    changed_by_email: str | None = None
    comment: str | None
    created_at: datetime


class WorkOrderCommentCreate(SQLModel):
    body: str = Field(min_length=1, max_length=4096)


class WorkOrderCommentPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str | None = None
    body: str
    created_at: datetime


class WorkOrderChecklistItemPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    title: str
    sort_order: int
    completed: bool


class WorkOrderChecklistItemCreate(SQLModel):
    title: str = Field(min_length=1, max_length=512)
    sort_order: int = Field(default=0, ge=0)


class WorkOrderChecklistItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    completed: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


class WorkOrderAttachmentCreate(SQLModel):
    file_path: str = Field(min_length=1, max_length=1024)
    filename: str | None = Field(default=None, max_length=256)
    kind: str = Field(default=ATTACHMENT_KIND_FILE, max_length=32)


class WorkOrderAttachmentPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    file_path: str
    filename: str | None
    kind: str
    created_at: datetime


# --- Склад запчастей (отдельная сущность, не Item) ---
class SparePart(SQLModel, table=True):
    __tablename__ = "spare_part"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    sku: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    quantity: int = Field(default=0, ge=0)
    min_quantity: int | None = Field(
        default=None, ge=0, description="Минимальный остаток для алерта"
    )
    unit: str | None = Field(default=None, max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SparePartCreate(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    sku: str | None = None
    description: str | None = None
    quantity: int = Field(default=0, ge=0)
    min_quantity: int | None = Field(default=None, ge=0)
    unit: str | None = None


class SparePartUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = None
    description: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    min_quantity: int | None = Field(default=None, ge=0)
    unit: str | None = None


class SparePartPublic(SQLModel):
    id: uuid.UUID
    title: str
    sku: str | None
    description: str | None
    quantity: int
    min_quantity: int | None
    unit: str | None
    created_at: datetime
    updated_at: datetime


class SparePartsPublic(SQLModel):
    data: list["SparePartPublic"]
    count: int


# --- Резерв запчастей под заявку и фактическое списание (привязка к SparePart) ---
class WorkOrderPartReservation(SQLModel, table=True):
    __tablename__ = "workorder_part_reservation"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    spare_part_id: uuid.UUID = Field(foreign_key="spare_part.id", ondelete="CASCADE")
    quantity: int = Field(ge=1, description="Зарезервировано единиц")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderPartConsumption(SQLModel, table=True):
    __tablename__ = "workorder_part_consumption"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    spare_part_id: uuid.UUID = Field(foreign_key="spare_part.id", ondelete="CASCADE")
    quantity: int = Field(ge=1, description="Списано единиц")
    consumed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderPartReservationCreate(SQLModel):
    spare_part_id: uuid.UUID
    quantity: int = Field(ge=1)


class WorkOrderPartReservationPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    spare_part_id: uuid.UUID
    spare_part_title: str | None = None
    spare_part_sku: str | None = None
    quantity: int
    created_at: datetime


class WorkOrderPartConsumptionCreate(SQLModel):
    spare_part_id: uuid.UUID
    quantity: int = Field(ge=1)


class WorkOrderPartConsumptionPublic(SQLModel):
    id: uuid.UUID
    work_order_id: uuid.UUID
    spare_part_id: uuid.UUID
    spare_part_title: str | None = None
    spare_part_sku: str | None = None
    quantity: int
    consumed_at: datetime


class WorkOrderPublic(SQLModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str | None = None
    title: str
    description: str | None
    status: str
    priority: str
    assigned_to_id: uuid.UUID | None
    assigned_to_email: str | None = None
    start_at: datetime | None
    end_at: datetime | None
    due_at: datetime | None
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class WorkOrderDetailPublic(WorkOrderPublic):
    status_history: list["WorkOrderStatusHistoryPublic"] = Field(default_factory=list)
    comments: list["WorkOrderCommentPublic"] = Field(default_factory=list)
    checklist_items: list["WorkOrderChecklistItemPublic"] = Field(default_factory=list)
    attachments: list["WorkOrderAttachmentPublic"] = Field(default_factory=list)
    part_reservations: list["WorkOrderPartReservationPublic"] = Field(
        default_factory=list
    )
    part_consumptions: list["WorkOrderPartConsumptionPublic"] = Field(
        default_factory=list
    )


class WorkOrderList(SQLModel):
    data: list["WorkOrderPublic"]
    count: int


# --- Расписание ТО: цепочки, шаги, привязка техники, журнал изменений ---


class MaintenanceChain(SQLModel, table=True):
    __tablename__ = "maintenance_chain"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    color_tag: str = Field(default="blue", max_length=32)
    remind_before_hours: int = Field(default=50, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaintenanceChainStep(SQLModel, table=True):
    __tablename__ = "maintenance_chain_step"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    chain_id: uuid.UUID = Field(foreign_key="maintenance_chain.id", ondelete="CASCADE")
    position: int = Field(ge=0, description="Порядок шага в цепочке")
    interval_hours: int = Field(ge=1, description="Интервал ТО в моточасах")


class ChainAssignment(SQLModel, table=True):
    __tablename__ = "chain_assignment"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    chain_id: uuid.UUID = Field(foreign_key="maintenance_chain.id", ondelete="CASCADE")
    equipment_id: uuid.UUID = Field(foreign_key="wsim_device.id", ondelete="CASCADE")


class MaintenanceChainAudit(SQLModel, table=True):
    """Журнал изменений цепочек ТО: кто и когда поменял интервалы/настройки."""

    __tablename__ = "maintenance_chain_audit"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    chain_id: uuid.UUID | None = Field(
        default=None, foreign_key="maintenance_chain.id", ondelete="SET NULL"
    )
    user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    action: str = Field(
        max_length=64, description="intervals_updated, name_changed, created, deleted"
    )
    old_intervals: str | None = Field(
        default=None, max_length=2048, description="JSON array до изменения"
    )
    new_intervals: str | None = Field(
        default=None, max_length=2048, description="JSON array после"
    )
    details: str | None = Field(default=None, max_length=1024)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaintenanceScheduleConfig(SQLModel, table=True):
    """Глобальные настройки расписания ТО: доступные интервалы и напоминание по умолчанию."""

    __tablename__ = "maintenance_schedule_config"
    key: str = Field(max_length=64, primary_key=True)
    value: str = Field(max_length=2048, description="JSON")


class MaintenanceReglamentTemplate(SQLModel, table=True):
    """Шаблон регламента обслуживания по типу техники (+ опционально интервалу)."""

    __tablename__ = "maintenance_reglament_template"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_type: str = Field(max_length=32, index=True)
    # Если интервал не задан - шаблон общий для типа техники.
    interval_hours: int | None = Field(default=None, ge=1, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaintenanceTemplateChecklistItem(SQLModel, table=True):
    __tablename__ = "maintenance_template_checklist_item"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    template_id: uuid.UUID = Field(
        foreign_key="maintenance_reglament_template.id", ondelete="CASCADE"
    )
    title: str = Field(max_length=512)
    sort_order: int = Field(default=0, ge=0, index=True)


class MaintenanceTemplateSparePartRequirement(SQLModel, table=True):
    """Требуемые запчасти для шаблона регламента."""

    __tablename__ = "maintenance_template_spare_part_requirement"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    template_id: uuid.UUID = Field(
        foreign_key="maintenance_reglament_template.id", ondelete="CASCADE"
    )
    spare_part_id: uuid.UUID = Field(
        foreign_key="spare_part.id", ondelete="RESTRICT", index=True
    )
    quantity: int = Field(ge=1)


# Schemas for API
class MaintenanceChainStepPublic(SQLModel):
    id: uuid.UUID
    chain_id: uuid.UUID
    position: int
    interval_hours: int


class MaintenanceChainPublic(SQLModel):
    id: uuid.UUID
    name: str
    color_tag: str
    remind_before_hours: int
    interval_hours: list[int]  # ordered by position
    equipment_ids: list[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class MaintenanceChainCreate(SQLModel):
    name: str = Field(min_length=1, max_length=128)
    color_tag: str = Field(default="blue", max_length=32)
    remind_before_hours: int = Field(default=50, ge=0)
    interval_hours: list[int] = Field(
        description="Упорядоченный список интервалов (м/ч)"
    )
    equipment_ids: list[uuid.UUID] = Field(default_factory=list)


class MaintenanceChainUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    color_tag: str | None = Field(default=None, max_length=32)
    remind_before_hours: int | None = Field(default=None, ge=0)
    interval_hours: list[int] | None = None
    equipment_ids: list[uuid.UUID] | None = None


class MaintenanceChainAuditPublic(SQLModel):
    id: uuid.UUID
    chain_id: uuid.UUID | None
    user_id: uuid.UUID | None
    user_email: str | None = None
    action: str
    old_intervals: str | None
    new_intervals: str | None
    details: str | None
    created_at: datetime


class MaintenanceChainList(SQLModel):
    data: list["MaintenanceChainPublic"]
    count: int


class MaintenanceScheduleConfigPublic(SQLModel):
    default_intervals: list[int]
    default_remind_before_hours: int


class MaintenanceTemplateChecklistItemPublic(SQLModel):
    id: uuid.UUID
    title: str
    sort_order: int


class MaintenanceTemplateSparePartRequirementPublic(SQLModel):
    id: uuid.UUID
    spare_part_id: uuid.UUID
    spare_part_title: str | None = None
    spare_part_sku: str | None = None
    quantity: int


class MaintenanceReglamentTemplatePublic(SQLModel):
    id: uuid.UUID
    equipment_type: str
    interval_hours: int | None
    created_at: datetime
    updated_at: datetime


class MaintenanceReglamentTemplateDetailPublic(MaintenanceReglamentTemplatePublic):
    checklist_items: list["MaintenanceTemplateChecklistItemPublic"] = Field(
        default_factory=list
    )
    spare_part_requirements: list["MaintenanceTemplateSparePartRequirementPublic"] = (
        Field(default_factory=list)
    )


class MaintenanceTemplateChecklistItemCreate(SQLModel):
    title: str = Field(min_length=1, max_length=512)
    sort_order: int | None = Field(default=None, ge=0)


class MaintenanceTemplateSparePartRequirementCreate(SQLModel):
    spare_part_id: uuid.UUID
    quantity: int = Field(ge=1)


class MaintenanceReglamentTemplateCreate(SQLModel):
    equipment_type: str = Field(min_length=1, max_length=32)
    interval_hours: int | None = Field(default=None, ge=1)
    checklist_items: list["MaintenanceTemplateChecklistItemCreate"] = Field(
        default_factory=list
    )
    spare_part_requirements: list["MaintenanceTemplateSparePartRequirementCreate"] = (
        Field(default_factory=list)
    )


class MaintenanceReglamentTemplateUpdate(MaintenanceReglamentTemplateCreate):
    pass


class MaintenanceReglamentTemplateList(SQLModel):
    data: list["MaintenanceReglamentTemplatePublic"]
    count: int


class MaintenanceCalendarEventPublic(SQLModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str | None
    chain_id: uuid.UUID | None
    interval_hours: int
    engine_hours: int | None
    next_service_at_hours: int | None
    remaining_hours: int | None
    status: str  # overdue | due_soon | ok


class MaintenanceCalendarEventList(SQLModel):
    data: list["MaintenanceCalendarEventPublic"]
    count: int
    total_matching: int | None = Field(
        default=None,
        description="Событий по фильтру до обрезки limit; если задано и больше count — список data усечён",
    )


class MaintenanceChainImportBody(SQLModel):
    """Тело запроса импорта из localStorage (массив цепочек в старом формате)."""

    chains: list[dict[str, Any]]
