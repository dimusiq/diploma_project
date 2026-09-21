import uuid
from datetime import date, datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from pydantic import EmailStr, computed_field, field_validator
from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS
from app.core.storage_slot import format_storage_slot_key

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


# --- Справочные фрагменты для RAG ассистента (эмбеддинг опционален, JSONB) ---
class AgentKnowledgeChunk(SQLModel, table=True):
    __tablename__ = "agent_knowledge_chunk"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    source: str = Field(default="manual", max_length=128)
    title: str = Field(max_length=255)
    content: str = Field(min_length=1)
    embedding: list[float] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    embedding_vec: list[float] | None = Field(
        default=None,
        sa_column=Column(Vector(AGENT_EMBEDDING_VECTOR_DIMENSIONS), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AgentKnowledgeChunkCreate(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=32000)
    source: str = Field(default="manual", max_length=128)


class AgentKnowledgeChunkUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=32000)
    source: str | None = Field(default=None, max_length=128)


class AgentKnowledgeChunkAdminPublic(SQLModel):
    id: uuid.UUID
    source: str
    title: str
    content: str
    created_at: datetime
    embedding_ready: bool


class AgentKnowledgeChunkList(SQLModel):
    data: list[AgentKnowledgeChunkAdminPublic]
    count: int


# --- Журнал запросов к чат-ассистенту (для суперпользователя / аудита использования) ---
class AgentChatLog(SQLModel, table=True):
    __tablename__ = "agent_chat_log"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    operation_session_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="agent_operation_session.id",
        ondelete="SET NULL",
        index=True,
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    message_preview: str = Field(max_length=500)
    reply_preview: str = Field(max_length=500)
    ollama_available: bool = Field(default=False)
    model: str | None = Field(default=None, max_length=128)


class AgentChatLogPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    operation_session_id: uuid.UUID | None = None
    created_at: datetime
    message_preview: str
    reply_preview: str
    llm_available: bool
    model: str | None = None


class AgentChatLogList(SQLModel):
    data: list[AgentChatLogPublic]
    count: int


# --- Пользовательские чаты ассистента (синхронизация между устройствами) ---
class AgentUserChat(SQLModel, table=True):
    __tablename__ = "agent_user_chat"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    title: str = Field(default="Новый чат", max_length=200)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )


class AgentUserChatMessage(SQLModel, table=True):
    __tablename__ = "agent_user_chat_message"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    chat_id: uuid.UUID = Field(
        foreign_key="agent_user_chat.id",
        ondelete="CASCADE",
        index=True,
    )
    seq: int = Field(ge=0)
    role: str = Field(max_length=16)
    content: str = Field(default="", sa_column=Column(Text, nullable=False))
    assistant_meta: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("chat_id", "seq", name="uq_agent_user_chat_message_chat_seq"),
    )


class AgentUserChatMessagePublic(SQLModel):
    id: uuid.UUID
    role: str
    content: str
    seq: int
    assistant_meta: dict[str, Any] | None = None


class AgentUserChatPublic(SQLModel):
    id: uuid.UUID
    title: str
    updated_at: datetime


class AgentUserChatListResponse(SQLModel):
    data: list[AgentUserChatPublic]
    count: int


class AgentUserChatDetailPublic(SQLModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[AgentUserChatMessagePublic]


class AgentRun(SQLModel, table=True):
    """Сохранённая трассировка одного запуска ассистента (шаги + публичная сводка)."""

    __tablename__ = "agent_run"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    agent_chat_log_id: uuid.UUID = Field(
        foreign_key="agent_chat_log.id",
        ondelete="CASCADE",
        unique=True,
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    ollama_available: bool = Field(default=False)
    model: str | None = Field(default=None, max_length=128)
    steps: list[Any] = Field(sa_column=Column(JSONB, nullable=False))
    public_reasoning: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )


class AgentRunPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    agent_chat_log_id: uuid.UUID
    created_at: datetime
    llm_available: bool
    model: str | None
    steps: list[Any]
    public_reasoning: dict[str, Any] | None


class AgentRunList(SQLModel):
    data: list[AgentRunPublic]
    count: int


class FeatureFlag(SQLModel, table=True):
    __tablename__ = "feature_flag"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key: str = Field(max_length=128, unique=True, index=True)
    enabled: bool = Field(default=False)
    description: str | None = Field(default=None, max_length=512)
    meta: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


class FeatureFlagPublic(SQLModel):
    key: str
    enabled: bool
    description: str | None = None


class FeatureFlagMap(SQLModel):
    flags: dict[str, bool]


class AgentPolicy(SQLModel, table=True):
    __tablename__ = "agent_policy"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=64, unique=True, index=True)
    title: str = Field(max_length=255)
    rules: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )


class AgentPolicyPublic(SQLModel):
    id: uuid.UUID
    code: str
    title: str
    rules: dict[str, Any]
    updated_at: datetime


class AgentPolicyUpdate(SQLModel):
    title: str | None = Field(default=None, max_length=255)
    rules: dict[str, Any] | None = None


class AgentPolicyList(SQLModel):
    data: list[AgentPolicyPublic]
    count: int


class AgentOperationSession(SQLModel, table=True):
    """Долгоживущая операционная сессия агента: память (сводка + факты) между запросами чата."""

    __tablename__ = "agent_operation_session"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    title: str | None = Field(default=None, max_length=255)
    status: str = Field(default="open", max_length=32, index=True)
    rolling_summary: str | None = Field(default=None)
    facts: list[Any] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Список записей {run_id, excerpt, at, phase?}",
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentOperationSessionCreate(SQLModel):
    title: str | None = Field(default=None, max_length=255)


class AgentOperationSessionPatch(SQLModel):
    title: str | None = Field(default=None, max_length=255)
    rolling_summary: str | None = None
    status: str | None = Field(default=None, max_length=32)


class AgentOperationSessionPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    status: str
    rolling_summary: str | None
    facts: list[Any]
    created_at: datetime
    updated_at: datetime


class AgentOperationSessionList(SQLModel):
    data: list[AgentOperationSessionPublic]
    count: int


class AgentPendingAction(SQLModel, table=True):
    """Очередь подтверждения act-инструментов (approval layer)."""

    __tablename__ = "agent_pending_action"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    agent_run_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="agent_run.id",
        ondelete="SET NULL",
        index=True,
    )
    tool_name: str = Field(max_length=128)
    arguments: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    rationale: str | None = Field(default=None)
    status: str = Field(default="pending", max_length=32, index=True)
    result_preview: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: datetime | None = Field(default=None)
    resolved_by_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL",
    )
    source: str = Field(default="manual", max_length=32)


class AgentPendingActionCreate(SQLModel):
    tool_name: str = Field(min_length=1, max_length=128)
    arguments: dict[str, Any] = Field(default_factory=dict)
    rationale: str | None = None
    agent_run_id: uuid.UUID | None = None


class AgentPendingActionPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    agent_run_id: uuid.UUID | None
    tool_name: str
    arguments: dict[str, Any]
    rationale: str | None
    status: str
    result_preview: str | None
    created_at: datetime
    resolved_at: datetime | None
    resolved_by_user_id: uuid.UUID | None
    source: str = "manual"


class AgentPendingActionList(SQLModel):
    data: list[AgentPendingActionPublic]
    count: int


class AgentOrchestrationJob(SQLModel, table=True):
    """Отложенные шаги оркестрации (обрабатывает воркер)."""

    __tablename__ = "agent_orchestration_job"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    operation_session_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="agent_operation_session.id",
        ondelete="CASCADE",
        index=True,
    )
    job_type: str = Field(max_length=64)
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    run_after: datetime = Field(index=True)
    status: str = Field(default="pending", max_length=32, index=True)
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    last_error: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentOrchestrationJobCreate(SQLModel):
    operation_session_id: uuid.UUID
    run_after_seconds: int = Field(default=0, ge=0, le=86400 * 14)
    fact: dict[str, Any] = Field(default_factory=dict)


class AgentOrchestrationJobPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    operation_session_id: uuid.UUID | None
    job_type: str
    payload: dict[str, Any]
    run_after: datetime
    status: str
    result: dict[str, Any] | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class AgentOrchestrationJobList(SQLModel):
    data: list[AgentOrchestrationJobPublic]
    count: int


class IntegrationInbox(SQLModel, table=True):
    __tablename__ = "integration_inbox"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    source: str = Field(max_length=128)
    event_type: str = Field(max_length=128)
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    status: str = Field(default="pending", max_length=32, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    processed_at: datetime | None = None
    twin_published_at: datetime | None = Field(default=None)
    idempotency_key: str | None = Field(default=None, max_length=256)
    processing_error: str | None = Field(default=None)
    domain_event_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="domain_event.id",
        ondelete="SET NULL",
    )


class IntegrationInboxCreate(SQLModel):
    source: str = Field(max_length=128)
    event_type: str = Field(max_length=128)
    payload: dict[str, Any]
    idempotency_key: str | None = Field(default=None, max_length=256)


class IntegrationInboxPublic(SQLModel):
    id: uuid.UUID
    source: str
    event_type: str
    status: str
    created_at: datetime
    processed_at: datetime | None
    twin_published_at: datetime | None = None
    idempotency_key: str | None = None
    domain_event_id: uuid.UUID | None = None
    processing_error: str | None = None


class IntegrationInboxList(SQLModel):
    data: list[IntegrationInboxPublic]
    count: int


class SimulationScenario(SQLModel, table=True):
    __tablename__ = "simulation_scenario"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    config: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    baseline_kpis: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )


class SimulationScenarioCreate(SQLModel):
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    config: dict[str, Any]
    baseline_kpis: dict[str, Any] | None = None


class SimulationScenarioPublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None
    config: dict[str, Any]
    baseline_kpis: dict[str, Any] | None
    created_by_user_id: uuid.UUID
    created_at: datetime


class SimulationScenarioList(SQLModel):
    data: list[SimulationScenarioPublic]
    count: int


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
    last_login_at: datetime | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)
    avatar_ext: str | None = Field(default=None, max_length=8)
    role: Role | None = Relationship(back_populates="users")
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def role_name(self) -> str | None:
        role = self.role
        return role.name if role is not None else None


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    last_login_at: datetime | None = None
    deleted_at: datetime | None = None
    avatar_ext: str | None = None
    role_name: str | None = None


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
        UniqueConstraint("warehouse_id", "name", name="uq_warehousezone_warehouse_name"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    name: str = Field(max_length=128)
    code: str | None = Field(default=None, max_length=64, index=True)
    zone_kind: str = Field(
        default="storage",
        max_length=32,
        description="storage|buffer|dock|staging|receiving|shipping|other",
    )
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


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
    data: list[WarehouseLayoutSummary]
    count: int


# --- Топология и операции WMS (привязка к складу и будущему 3D) ---


class WarehouseAisle(SQLModel, table=True):
    """Проход между стеллажами (геометрия в JSON для согласования с twin)."""

    __tablename__ = "warehouse_aisle"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    code: str = Field(max_length=64, index=True)
    name: str | None = Field(default=None, max_length=255)
    path_norm: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Полилиния в нормализованных координатах плана [{x,y}, ...]",
    )
    sort_order: int = Field(default=0, ge=0)
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WarehouseRack(SQLModel, table=True):
    """Стеллаж / ряд хранения внутри зоны."""

    __tablename__ = "warehouse_rack"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_warehouse_rack_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StorageBin(SQLModel, table=True):
    """Ячейка / слот хранения (bin/slot)."""

    __tablename__ = "storage_bin"
    __table_args__ = (UniqueConstraint("warehouse_id", "slot_key", name="uq_storage_bin_wh_slot"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StagingArea(SQLModel, table=True):
    """Буферная / стадийная зона (приёмка, отгрузка, кросс-док)."""

    __tablename__ = "staging_area"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_staging_area_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DockDoor(SQLModel, table=True):
    """Ворота / док."""

    __tablename__ = "dock_door"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_dock_door_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteNode(SQLModel, table=True):
    """Узел маршрута (AGV / ручная навигация по складу)."""

    __tablename__ = "route_node"
    __table_args__ = (
        UniqueConstraint("warehouse_layout_id", "code", name="uq_route_node_layout_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
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
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    warehouse_layout_id: uuid.UUID = Field(
        foreign_key="warehouse_layout.id",
        ondelete="CASCADE",
        index=True,
    )
    from_node_id: uuid.UUID = Field(foreign_key="route_node.id", ondelete="CASCADE", index=True)
    to_node_id: uuid.UUID = Field(foreign_key="route_node.id", ondelete="CASCADE", index=True)
    bidirectional: bool = Field(default=True)
    weight: float | None = Field(default=None, ge=0)
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HandlingUnit(SQLModel, table=True):
    """Транспортная единица (паллета, короб, контейнер)."""

    __tablename__ = "handling_unit"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    unit_kind: str = Field(max_length=32, description="pallet|case|container|other")
    sscc: str | None = Field(default=None, max_length=64, index=True)
    status: str = Field(default="created", max_length=32)
    current_bin_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="storage_bin.id",
        ondelete="SET NULL",
        index=True,
    )
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventoryLot(SQLModel, table=True):
    """Партия / лот (batch/lot)."""

    __tablename__ = "inventory_lot"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "lot_code", name="uq_inventory_lot_wh_code"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Shipment(SQLModel, table=True):
    """Отгрузка / перемещение груза (может объединять заказы)."""

    __tablename__ = "shipment"
    __table_args__ = (UniqueConstraint("warehouse_id", "reference", name="uq_shipment_wh_ref"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    reference: str = Field(max_length=128)
    direction: str = Field(max_length=16, description="inbound|outbound|internal")
    status: str = Field(default="planned", max_length=32)
    scheduled_at: datetime | None = None
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InboundOrder(SQLModel, table=True):
    """Входящий заказ."""

    __tablename__ = "inbound_order"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_inbound_order_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OutboundOrder(SQLModel, table=True):
    """Исходящий заказ."""

    __tablename__ = "outbound_order"
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_outbound_order_wh_code"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    code: str = Field(max_length=64)
    shipment_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="shipment.id",
        ondelete="SET NULL",
        index=True,
    )
    status: str = Field(default="open", max_length=32)
    ship_by_at: datetime | None = None
    lines: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
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
    data: list[InboundOrderPublic]
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
    data: list[OutboundOrderPublic]
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
    line_items: list[OutboundLineView] = []
    tasks: list[OutboundTaskView] = []
    items: list[OutboundLinkedItem] = []
    timeline: list[OutboundTimelineEvent] = []


class OutboundFulfillmentList(SQLModel):
    data: list[OutboundFulfillmentPublic]
    count: int
    ready_count: int = 0
    items_count: int = 0
    pallets_count: int = 0
    awaiting_transport: int = 0


class WarehouseTask(SQLModel, table=True):
    """Складское задание (погрузка, размещение, инвентаризация и т.д.)."""

    __tablename__ = "warehouse_task"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    task_type: str = Field(max_length=32, description="pick|putaway|move|replenish|count|other")
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
    payload: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
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
    data: list[WarehouseTaskPublic]
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
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


class InventorySnapshot(SQLModel, table=True):
    """Снимок остатков / состояния склада на момент времени."""

    __tablename__ = "inventory_snapshot"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
    label: str | None = Field(default=None, max_length=255)
    taken_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    snapshot: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


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
    position: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    raw: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


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
    data: list[SensorReadingPublic]
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
    extra: dict[str, Any] | None = Field(default=None, sa_column=Column(JSONB, nullable=True))


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
    data: list[WarehouseSlotOccupancyEntry]
    count: int


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
    data: list[DomainEventPublic]
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
    data: list[TwinProjectionEntryPublic]
    count: int


class TwinTaskStateProjection(SQLModel, table=True):
    """Проекция состояния складских заданий для twin/UI (обновляется из доменных событий)."""

    __tablename__ = "twin_task_state_projection"

    warehouse_task_id: uuid.UUID = Field(
        foreign_key="warehouse_task.id",
        ondelete="CASCADE",
        primary_key=True,
    )
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
        UniqueConstraint("warehouse_id", "queue_name", name="uq_twin_queue_depth_wh_name"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    warehouse_id: uuid.UUID = Field(foreign_key="warehouse.id", ondelete="CASCADE", index=True)
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
    data: list[TwinSlaDefinitionPublic]
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
    data: list[TwinBusinessRulePublic]
    count: int


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
    data: list[EquipmentPublic]
    count: int


class EquipmentImportRowError(SQLModel):
    """Ошибка разбора или сохранения одной строки файла импорта."""

    row: int
    message: str


class EquipmentImportResult(SQLModel):
    """Итог массового импорта техники из Excel."""

    created: int
    errors: list[EquipmentImportRowError] = Field(default_factory=list)


# --- MaintenanceRecord (проведённое ТО по единице техники) ---
class MaintenanceRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    equipment_id: uuid.UUID = Field(foreign_key="wsim_device.id", ondelete="CASCADE")
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
    equipment_name: str  # canonical SimDevice.name
    performed_at: date
    engine_hours_at_service: int | None
    interval_hours: int
    comment: str | None


class MaintenanceRecordListWithEquipment(SQLModel):
    data: list[MaintenanceRecordWithEquipmentPublic]
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
    assigned_to_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    start_at: datetime | None = Field(default=None, description="Временное окно выполнения (начало)")
    end_at: datetime | None = Field(default=None, description="Временное окно выполнения (конец)")
    due_at: datetime | None = Field(default=None)
    created_by_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderStatusHistory(SQLModel, table=True):
    __tablename__ = "workorder_status_history"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    work_order_id: uuid.UUID = Field(foreign_key="workorder.id", ondelete="CASCADE")
    from_status: str | None = Field(default=None, max_length=32)
    to_status: str = Field(max_length=32)
    changed_by_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
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
    min_quantity: int | None = Field(default=None, ge=0, description="Минимальный остаток для алерта")
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
    data: list[SparePartPublic]
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
    status_history: list[WorkOrderStatusHistoryPublic] = Field(default_factory=list)
    comments: list[WorkOrderCommentPublic] = Field(default_factory=list)
    checklist_items: list[WorkOrderChecklistItemPublic] = Field(default_factory=list)
    attachments: list[WorkOrderAttachmentPublic] = Field(default_factory=list)
    part_reservations: list[WorkOrderPartReservationPublic] = Field(default_factory=list)
    part_consumptions: list[WorkOrderPartConsumptionPublic] = Field(default_factory=list)


class WorkOrderList(SQLModel):
    data: list[WorkOrderPublic]
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
    chain_id: uuid.UUID | None = Field(default=None, foreign_key="maintenance_chain.id", ondelete="SET NULL")
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    action: str = Field(max_length=64, description="intervals_updated, name_changed, created, deleted")
    old_intervals: str | None = Field(default=None, max_length=2048, description="JSON array до изменения")
    new_intervals: str | None = Field(default=None, max_length=2048, description="JSON array после")
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
    interval_hours: list[int] = Field(description="Упорядоченный список интервалов (м/ч)")
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
    data: list[MaintenanceChainPublic]
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
    checklist_items: list[MaintenanceTemplateChecklistItemPublic] = Field(default_factory=list)
    spare_part_requirements: list[MaintenanceTemplateSparePartRequirementPublic] = Field(default_factory=list)


class MaintenanceTemplateChecklistItemCreate(SQLModel):
    title: str = Field(min_length=1, max_length=512)
    sort_order: int | None = Field(default=None, ge=0)


class MaintenanceTemplateSparePartRequirementCreate(SQLModel):
    spare_part_id: uuid.UUID
    quantity: int = Field(ge=1)


class MaintenanceReglamentTemplateCreate(SQLModel):
    equipment_type: str = Field(min_length=1, max_length=32)
    interval_hours: int | None = Field(default=None, ge=1)
    checklist_items: list[MaintenanceTemplateChecklistItemCreate] = Field(default_factory=list)
    spare_part_requirements: list[MaintenanceTemplateSparePartRequirementCreate] = Field(default_factory=list)


class MaintenanceReglamentTemplateUpdate(MaintenanceReglamentTemplateCreate):
    pass


class MaintenanceReglamentTemplateList(SQLModel):
    data: list[MaintenanceReglamentTemplatePublic]
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
    data: list[MaintenanceCalendarEventPublic]
    count: int
    total_matching: int | None = Field(
        default=None,
        description="Событий по фильтру до обрезки limit; если задано и больше count — список data усечён",
    )


class MaintenanceChainImportBody(SQLModel):
    """Тело запроса импорта из localStorage (массив цепочек в старом формате)."""
    chains: list[dict]


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
    type: str = Field(max_length=64, index=True, description="Тип события: overdue_maintenance, soon_maintenance, item_stuck, etc.")
    severity: str = Field(max_length=16, default=NOTIFICATION_SEVERITY_INFO)
    title: str = Field(max_length=256)
    body: str | None = Field(default=None, max_length=2048)
    source: str | None = Field(default=None, max_length=128, description="Источник: График ТО, Склад, Аудит")
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
    data: list[NotificationPublic]
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
    key: str = Field(max_length=64, index=True, description="Идентификатор типа (например overdue_maintenance)")
    in_app_enabled: bool = Field(default=True, description="Показывать в центре уведомлений приложения")
    email_enabled: bool = Field(default=False, description="Отправлять по email (уведомление/отчёт)")
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
    data: list[UserCommunicationPreferencePublic]


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


