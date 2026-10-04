import uuid
from datetime import datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    data: list["AgentKnowledgeChunkAdminPublic"]
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
    data: list["AgentChatLogPublic"]
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
    data: list["AgentUserChatPublic"]
    count: int


class AgentUserChatDetailPublic(SQLModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list["AgentUserChatMessagePublic"]


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
    data: list["AgentRunPublic"]
    count: int


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
    data: list["AgentPolicyPublic"]
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
    data: list["AgentOperationSessionPublic"]
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
    data: list["AgentPendingActionPublic"]
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
    result: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
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
    data: list["AgentOrchestrationJobPublic"]
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
    data: list["IntegrationInboxPublic"]
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
    created_by_user_id: uuid.UUID = Field(
        foreign_key="user.id", ondelete="CASCADE", index=True
    )
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
    data: list["SimulationScenarioPublic"]
    count: int
