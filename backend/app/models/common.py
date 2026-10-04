import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class FeatureFlag(SQLModel, table=True):
    __tablename__ = "feature_flag"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key: str = Field(max_length=128, unique=True, index=True)
    enabled: bool = Field(default=False)
    description: str | None = Field(default=None, max_length=512)
    meta: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class FeatureFlagPublic(SQLModel):
    key: str
    enabled: bool
    description: str | None = None


class FeatureFlagMap(SQLModel):
    flags: dict[str, bool]


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    data: list["AuditLogPublic"]
    count: int


# --- Notification (центр уведомлений: тип, severity, прочитано, entity) ---
NOTIFICATION_SEVERITY_CRITICAL = "critical"
NOTIFICATION_SEVERITY_WARNING = "warning"
NOTIFICATION_SEVERITY_INFO = "info"
NOTIFICATION_SEVERITIES = (
    NOTIFICATION_SEVERITY_CRITICAL,
    NOTIFICATION_SEVERITY_WARNING,
    NOTIFICATION_SEVERITY_INFO,
)


class Notification(SQLModel, table=True):
    __tablename__ = "notification"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    type: str = Field(
        max_length=64,
        index=True,
        description="Тип события: overdue_maintenance, soon_maintenance, item_stuck, etc.",
    )
    severity: str = Field(max_length=16, default=NOTIFICATION_SEVERITY_INFO)
    title: str = Field(max_length=256)
    body: str | None = Field(default=None, max_length=2048)
    source: str | None = Field(
        default=None, max_length=128, description="Источник: График ТО, Склад, Аудит"
    )
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: uuid.UUID | None = Field(default=None)
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read_at: datetime | None = Field(default=None)
    archived_at: datetime | None = Field(
        default=None,
        description="Если задано — уведомление скрыто (архивировано) и не показывается по умолчанию",
    )


class NotificationPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    severity: str
    title: str
    body: str | None
    source: str | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    is_read: bool
    created_at: datetime
    read_at: datetime | None


class NotificationList(SQLModel):
    data: list["NotificationPublic"]
    count: int


# --- UserCommunicationPreference (настройки уведомлений/отчётов: in-app/email) ---
COMM_PREF_KIND_NOTIFICATION = "notification"
COMM_PREF_KIND_REPORT = "report"
COMM_PREF_KINDS = (COMM_PREF_KIND_NOTIFICATION, COMM_PREF_KIND_REPORT)


class UserCommunicationPreference(SQLModel, table=True):
    """
    Пользовательские настройки подписок на уведомления и email-рассылки.

    Запись существует только если пользователь менял дефолт.
    Дефолт для отсутствующей записи: включено (in_app/email зависят от вида).
    """

    __tablename__ = "user_communication_preference"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, index=True, ondelete="CASCADE"
    )
    kind: str = Field(max_length=32, index=True, description="notification|report")
    key: str = Field(
        max_length=64,
        index=True,
        description="Идентификатор типа (например overdue_maintenance)",
    )
    in_app_enabled: bool = Field(
        default=True, description="Показывать в центре уведомлений приложения"
    )
    email_enabled: bool = Field(
        default=False, description="Отправлять по email (уведомление/отчёт)"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCommunicationPreferencePublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    key: str
    in_app_enabled: bool
    email_enabled: bool
    created_at: datetime
    updated_at: datetime


class UserCommunicationPreferenceUpsert(SQLModel):
    kind: str = Field(max_length=32)
    key: str = Field(max_length=64)
    in_app_enabled: bool
    email_enabled: bool


class UserCommunicationPreferenceList(SQLModel):
    data: list["UserCommunicationPreferencePublic"]


# --- ReportEmailDeliveryLog (идемпотентность и аудит отправок отчётов) ---
class ReportEmailDeliveryLog(SQLModel, table=True):
    __tablename__ = "report_email_delivery_log"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, index=True, ondelete="CASCADE"
    )
    report_key: str = Field(max_length=64, index=True)
    period_start: date = Field(index=True)
    period_end: date = Field(index=True)
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="sent", max_length=16, description="sent|failed")
    error: str | None = Field(default=None, max_length=2048)


class ReportEmailDeliveryLogPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    report_key: str
    period_start: date
    period_end: date
    sent_at: datetime
    status: str
    error: str | None = None
