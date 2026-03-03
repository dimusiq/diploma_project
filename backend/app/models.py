import uuid
from datetime import date, datetime, timezone

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel

# --- Role (роли: admin, manager, warehouse, viewer) ---
ROLE_ADMIN = "admin"
ROLE_MANAGER = "manager"
ROLE_WAREHOUSE = "warehouse"
ROLE_VIEWER = "viewer"


class RolePermission(SQLModel, table=True):
    """Связь роли и права (шаблон роли = набор permission для роли)."""
    __tablename__ = "role_permission"
    role_id: uuid.UUID = Field(foreign_key="role.id", ondelete="CASCADE", primary_key=True)
    permission_id: uuid.UUID = Field(
        foreign_key="permission.id", ondelete="CASCADE", primary_key=True
    )


class Role(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=32)
    users: list["User"] = Relationship(back_populates="role")
    permissions: list["Permission"] = Relationship(
        back_populates="roles", link_model=RolePermission
    )


class RolePublic(SQLModel):
    id: uuid.UUID
    name: str


# --- Permission (гранулярные права, привязка к ролям через RolePermission) ---
class Permission(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, max_length=64, index=True)
    description: str | None = Field(default=None, max_length=255)
    roles: list["Role"] = Relationship(
        back_populates="permissions", link_model=RolePermission
    )


class PermissionPublic(SQLModel):
    id: uuid.UUID
    code: str
    description: str | None = None


# --- AuditLog (аудит критичных действий администраторов) ---
class AuditLog(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    action: str = Field(max_length=128)
    resource_type: str = Field(max_length=64)
    resource_id: uuid.UUID | None = Field(default=None)
    details: str | None = Field(default=None, max_length=4096)
    ip_address: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AuditLogPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    user_email: str | None = None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    details: str | None
    ip_address: str | None
    created_at: datetime


class AuditLogList(SQLModel):
    data: list[AuditLogPublic]
    count: int


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    role_id: uuid.UUID | None = Field(default=None, foreign_key="role.id", ondelete="SET NULL")


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)
    role_id: uuid.UUID | None = None


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    role: Role | None = Relationship(back_populates="users")
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


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
    storage_row: int | None = Field(default=None, ge=1, le=12)
    storage_level: int | None = Field(default=None, ge=1, le=4)
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    category_id: uuid.UUID | None = None


# Properties to receive on item update (all optional)
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore
    description: str | None = Field(default=None, max_length=255)  # type: ignore
    quantity: int | None = Field(default=None, ge=1)  # type: ignore
    sku: str | None = None
    barcode: str | None = None
    unit: str | None = None
    expires_at: date | None = None
    location: str | None = None
    storage_row: int | None = Field(default=None, ge=1, le=12)  # type: ignore
    storage_level: int | None = Field(default=None, ge=1, le=4)  # type: ignore
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)  # type: ignore
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)  # type: ignore
    status: str | None = None
    category_id: uuid.UUID | None = None


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    status: str = Field(default="incoming", max_length=32)
    category_id: uuid.UUID | None = Field(
        default=None, foreign_key="category.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    storage_row: int | None = Field(default=None, ge=1, le=12)
    storage_level: int | None = Field(default=None, ge=1, le=4)
    storage_cell_x: int | None = Field(default=None, ge=1, le=20)
    storage_cell_z: int | None = Field(default=None, ge=1, le=1)
    owner: User | None = Relationship(back_populates="items")
    category: Category | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    status: str
    category_id: uuid.UUID | None = None
    created_at: datetime


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# --- ItemHistory (аудит изменений Item) ---
class ItemHistory(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    changed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
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
    data: list[ItemHistoryPublic]
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


# --- WarehouseZone (зоны склада, управление в админке) ---
class WarehouseZone(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128, unique=True)


class WarehouseZoneCreate(SQLModel):
    name: str = Field(min_length=1, max_length=128)


class WarehouseZoneUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)


class WarehouseZonePublic(SQLModel):
    id: uuid.UUID
    name: str


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
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
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
    data: list[EquipmentPublic]
    count: int


# --- MaintenanceRecord (проведённое ТО по единице техники) ---
class MaintenanceRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_id: uuid.UUID = Field(foreign_key="equipment.id", ondelete="CASCADE")
    performed_at: date = Field(description="Дата проведения ТО")
    engine_hours_at_service: int | None = Field(default=None, ge=0, description="Моточасы на момент проведения")
    interval_hours: int = Field(ge=1, description="Интервал ТО в моточасах (500, 1000 и т.д.)")
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
    data: list[MaintenanceRecordPublic]
    count: int


class MaintenanceRecordWithEquipmentPublic(SQLModel):
    """Запись ТО с отображаемым названием техники для общего списка."""
    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str  # brand + model
    performed_at: date
    engine_hours_at_service: int | None
    interval_hours: int
    comment: str | None


class MaintenanceRecordListWithEquipment(SQLModel):
    data: list[MaintenanceRecordWithEquipmentPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


