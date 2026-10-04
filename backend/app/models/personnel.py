import uuid
from datetime import date, datetime, timezone

from pydantic import field_validator, model_validator
from sqlmodel import Field, SQLModel

EMPLOYEE_STATUSES = ("working", "sick", "vacation", "break")
EMPLOYEE_DATED_STATUSES = ("sick", "vacation")
EMPLOYEE_SHIFTS = ("morning", "day", "night")


class WarehouseEmployee(SQLModel, table=True):
    """Справочник сотрудника склада. Не хранит позицию в Digital Twin."""

    __tablename__ = "warehouse_employee"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    employee_code: str = Field(max_length=32, unique=True, index=True)
    first_name: str = Field(max_length=64)
    last_name: str = Field(max_length=64)
    middle_name: str | None = Field(default=None, max_length=64)
    position: str = Field(max_length=128)
    department: str = Field(default="Склад №1", max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    status: str = Field(default="working", max_length=16, index=True)
    status_until: date | None = Field(default=None)
    shift: str = Field(default="day", max_length=16, index=True)
    hire_date: date | None = Field(default=None)
    notes: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PersonnelBraceletInfo(SQLModel):
    device_id: uuid.UUID
    code: str
    name: str
    status: str
    battery: float | None = None
    last_signal_at: str | None = None
    location_label: str | None = None
    location_source: str | None = None
    location_stale: bool = False
    serial_number: str | None = None
    assigned_at: str | None = None


class PersonnelPublic(SQLModel):
    id: uuid.UUID
    employee_code: str
    first_name: str
    last_name: str
    middle_name: str | None
    position: str
    department: str
    phone: str | None
    email: str | None
    status: str
    status_until: date | None = None
    shift: str
    hire_date: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    current_zone: str | None = None
    motion_status: str | None = None
    person_code: str | None = None
    speed: float | None = None
    bracelet: PersonnelBraceletInfo | None = None
    location_source: str | None = None
    location_stale: bool = False
    last_signal_at: str | None = None


class PersonnelBraceletAssign(SQLModel):
    device_id: uuid.UUID


class PersonnelBraceletHistoryItem(SQLModel):
    id: str
    device_id: str
    device_code: str | None = None
    device_name: str | None = None
    employee_id: str | None = None
    employee_code: str | None = None
    employee_name: str | None = None
    assigned_at: str | None = None
    unassigned_at: str | None = None
    previous_device_id: str | None = None
    previous_device_code: str | None = None
    notes: str | None = None
    active: bool = False


class PersonnelBraceletHistoryList(SQLModel):
    data: list["PersonnelBraceletHistoryItem"]
    count: int


class PersonnelList(SQLModel):
    data: list["PersonnelPublic"]
    count: int


class PersonnelBulkIds(SQLModel):
    worker_ids: list[uuid.UUID] = Field(min_length=1)


class PersonnelBulkDepartment(SQLModel):
    worker_ids: list[uuid.UUID] = Field(min_length=1)
    department: str = Field(min_length=1, max_length=128)


class PersonnelBulkResult(SQLModel):
    updated: int = 0
    deleted: int = 0
    worker_ids: list[uuid.UUID] = []
    department: str | None = None
    message: str


class PersonnelDepartmentList(SQLModel):
    data: list[str]
    count: int


class PersonnelCreate(SQLModel):
    employee_code: str = Field(min_length=1, max_length=32)
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
    middle_name: str | None = Field(default=None, max_length=64)
    position: str = Field(min_length=1, max_length=128)
    department: str = Field(default="Склад №1", max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    status: str = "working"
    status_until: date | None = None
    shift: str = "day"
    hire_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in EMPLOYEE_STATUSES:
            raise ValueError("Неизвестный статус сотрудника")
        return value

    @model_validator(mode="after")
    def _status_until(self) -> "PersonnelCreate":
        if self.status in EMPLOYEE_DATED_STATUSES:
            if self.status_until is None:
                raise ValueError("Укажите дату окончания статуса")
        else:
            self.status_until = None
        return self

    @field_validator("shift")
    @classmethod
    def _shift(cls, value: str) -> str:
        if value not in EMPLOYEE_SHIFTS:
            raise ValueError("Неизвестная смена")
        return value

    @field_validator("email", "phone", "middle_name", "notes", mode="before")
    @classmethod
    def _blank(cls, value: str | None) -> str | None:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class PersonnelUpdate(SQLModel):
    employee_code: str | None = Field(default=None, max_length=32)
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    middle_name: str | None = Field(default=None, max_length=64)
    position: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    status: str | None = None
    status_until: date | None = None
    shift: str | None = None
    hire_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        if value is not None and value not in EMPLOYEE_STATUSES:
            raise ValueError("Неизвестный статус сотрудника")
        return value

    @field_validator("shift")
    @classmethod
    def _shift(cls, value: str | None) -> str | None:
        if value is not None and value not in EMPLOYEE_SHIFTS:
            raise ValueError("Неизвестная смена")
        return value


class PersonnelActivity(SQLModel):
    present: bool
    on_shift: bool
    person_code: str | None = None
    runtime_id: str | None = None
    zone: str | None = None
    motion_status: str | None = None
    speed: float | None = None
    target: str | None = None
    task_id: str | None = None
