"""Чат-ассистент по складу.

Контекст агента: оперативное состояние (агрегаты склада, сессия операций), база знаний
(RAG), политики (промпт, PII, sandbox, права), инструменты, срез истории domain events
при audit.read. Ответ: выводы и рекомендации в тексте; исполнение действий — только через
инструменты при разрешении API (allow_mutating_tools, pending-actions).
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import col, func, select

from app.agent.policy import sanitize_agent_reply_visible_text
from app.agent.reasoning_runtime import reply_without_first_paragraph_when_multi
from app.agent.tool_catalog import CATALOG_BY_NAME, tools_for_user
from app.agent.tool_safety import ToolSafetyClass
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
    require_permission,
)
from app.core.permissions import (
    PERM_AGENT_POLICIES_MANAGE,
    PERM_AGENT_POLICIES_READ,
    PERM_AGENT_USE,
    PERM_AUDIT_READ,
    PERM_INTEGRATIONS_INBOX_WRITE,
    can_use_agent,
    can_view_maintenance_schedule,
    user_has_permission,
)
from app.models import (
    AgentChatLog,
    AgentChatLogList,
    AgentChatLogPublic,
    AgentUserChat,
    AgentUserChatDetailPublic,
    AgentUserChatListResponse,
    AgentUserChatMessage,
    AgentUserChatMessagePublic,
    AgentUserChatPublic,
    AgentOperationSession,
    AgentOperationSessionCreate,
    AgentOperationSessionList,
    AgentOperationSessionPatch,
    AgentOperationSessionPublic,
    AgentOrchestrationJob,
    AgentOrchestrationJobCreate,
    AgentOrchestrationJobList,
    AgentOrchestrationJobPublic,
    AgentPendingAction,
    AgentPendingActionCreate,
    AgentPendingActionList,
    AgentPendingActionPublic,
    AgentPolicy,
    AgentPolicyList,
    AgentPolicyPublic,
    AgentPolicyUpdate,
    AgentRun,
    AgentRunList,
    AgentRunPublic,
)
from app.realtime.twin_stream_hub import publish_agent_run_finished
from app.services.agent_chat import run_agent_chat
from app.services.agent_operations import (
    append_session_fact,
    get_operation_session_for_user,
)
from app.services.agent_pending_actions import execute_pending_action
from app.services.agent_rate_limit import enforce_agent_chat_rate_limit
from app.services.agent_user_chats import append_user_chat_turn, get_user_chat_for_user

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    operation_session_id: uuid.UUID | None = Field(
        default=None,
        description="Долгоживущая операция: подмешать память сессии и записать итог в facts",
    )
    allow_mutating_tools: bool = Field(
        default=False,
        description=(
            "Разрешить act-инструменты с записью в БД. Только суперпользователь; "
            "при AGENT_SANDBOX_MODE=true запись всё равно блокируется (dry-run)."
        ),
    )
    include_reasoning_debug: bool = Field(
        default=False,
        description="Полный structured reasoning trace (только суперпользователь).",
    )
    user_chat_id: uuid.UUID | None = Field(
        default=None,
        description="Добавить пару сообщений в сохранённый чат пользователя (история БД).",
    )
    include_public_reasoning: bool = Field(
        default=False,
        description=(
            "Включить в ответ публичную сводку reasoning (как сформирован ответ). "
            "По умолчанию только текст ответа."
        ),
    )


class AgentPublicReasoningSummary(BaseModel):
    """Публичная сводка без полного chain-of-thought (фаза Conclude + метки цикла)."""

    brief_explanation: str
    tools_used: list[dict[str, Any]] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    recommendation: str
    models: dict[str, str] = Field(default_factory=dict)
    main_loop_task: str = "chat"
    next_steps: str = Field(
        default="—",
        description="Промежуточные абзацы ответа: что сделать дальше",
    )
    confidence: str = Field(
        default="средняя",
        description="Эвристика по результатам verify после tools",
    )
    kpi_effect: str | None = Field(
        default=None,
        description="Подсказка, если вызывались propose/act",
    )
    run_log_ref: str | None = Field(
        default=None,
        description="GET таймлайна запуска (тот же run_id, что в ответе чата)",
    )
    operational_cycle: dict[str, str] = Field(
        default_factory=dict,
        description="Краткая сводка фаз Observe→Reason→Act→Verify→Conclude",
    )


class AgentChatResponse(BaseModel):
    reply: str
    llm_available: bool
    model: str | None = None
    public_reasoning: AgentPublicReasoningSummary | None = None
    reasoning_debug: dict[str, Any] | None = None
    run_id: str | None = None


class AgentToolInfo(BaseModel):
    name: str
    version: str
    safety: str
    permission_code: str
    description: str
    superuser_only: bool = False


class AgentToolsListResponse(BaseModel):
    tools: list[AgentToolInfo]


class AgentPermissionsResponse(BaseModel):
    can_use: bool


class AgentPendingExecuteResponse(BaseModel):
    status: str
    tool_output_excerpt: str


@router.get("/permissions", response_model=AgentPermissionsResponse)
def agent_permissions(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Для UI: есть ли право пользоваться POST /agent/chat."""
    return AgentPermissionsResponse(can_use=can_use_agent(session, current_user))


@router.get(
    "/user-chats",
    response_model=AgentUserChatListResponse,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_agent_user_chats(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> Any:
    """Список чатов текущего пользователя (сортировка по updated_at)."""
    q = (
        select(AgentUserChat)
        .where(AgentUserChat.user_id == current_user.id)
        .order_by(AgentUserChat.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = session.exec(q).all()
    count = session.exec(
        select(func.count(AgentUserChat.id)).where(
            AgentUserChat.user_id == current_user.id
        )
    ).one()
    return AgentUserChatListResponse(
        data=[
            AgentUserChatPublic(
                id=r.id,
                title=r.title,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        count=int(count),
    )


@router.post(
    "/user-chats",
    response_model=AgentUserChatPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def create_agent_user_chat(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Добавить пустой чат."""
    c = AgentUserChat(user_id=current_user.id, title="Новый чат")
    session.add(c)
    session.commit()
    session.refresh(c)
    return AgentUserChatPublic(id=c.id, title=c.title, updated_at=c.updated_at)


@router.get(
    "/user-chats/{chat_id}",
    response_model=AgentUserChatDetailPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def get_agent_user_chat(
    session: SessionDep,
    current_user: CurrentUser,
    chat_id: uuid.UUID,
) -> Any:
    """Сообщения чата (по seq)."""
    chat = get_user_chat_for_user(session, chat_id=chat_id, user=current_user)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")
    msgs = session.exec(
        select(AgentUserChatMessage)
        .where(AgentUserChatMessage.chat_id == chat_id)
        .order_by(AgentUserChatMessage.seq)
    ).all()
    return AgentUserChatDetailPublic(
        id=chat.id,
        title=chat.title,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        messages=[
            AgentUserChatMessagePublic(
                id=m.id,
                role=m.role,
                content=m.content,
                seq=m.seq,
                assistant_meta=m.assistant_meta,
            )
            for m in msgs
        ],
    )


@router.delete(
    "/user-chats/{chat_id}",
    status_code=204,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def delete_agent_user_chat(
    session: SessionDep,
    current_user: CurrentUser,
    chat_id: uuid.UUID,
) -> None:
    chat = get_user_chat_for_user(session, chat_id=chat_id, user=current_user)
    if chat is None:
        raise HTTPException(status_code=404, detail="Чат не найден")
    session.delete(chat)
    session.commit()


@router.get(
    "/chat/logs",
    response_model=AgentChatLogList,
    dependencies=[Depends(get_current_active_superuser)],
)
def list_agent_chat_logs(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Any:
    """Журнал обращений к ассистенту (только суперпользователь)."""
    count = session.exec(select(func.count()).select_from(AgentChatLog)).one()
    rows = list(
        session.exec(
            select(AgentChatLog)
            .order_by(AgentChatLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return AgentChatLogList(
        data=[
            AgentChatLogPublic(
                id=r.id,
                user_id=r.user_id,
                operation_session_id=r.operation_session_id,
                created_at=r.created_at,
                message_preview=r.message_preview,
                reply_preview=r.reply_preview,
                llm_available=r.ollama_available,
                model=r.model,
            )
            for r in rows
        ],
        count=count,
    )


@router.get(
    "/tools",
    response_model=AgentToolsListResponse,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_agent_tools_catalog(
    session: SessionDep,
    current_user: CurrentUser,
) -> AgentToolsListResponse:
    has_audit = user_has_permission(session, current_user, PERM_AUDIT_READ)
    has_inbox = user_has_permission(session, current_user, PERM_INTEGRATIONS_INBOX_WRITE)
    has_maint = can_view_maintenance_schedule(session, current_user)
    items = tools_for_user(
        is_superuser=bool(current_user.is_superuser),
        has_audit_read=has_audit,
        has_inbox_write=has_inbox,
        has_maintenance_schedule_view=has_maint,
    )
    return AgentToolsListResponse(
        tools=[
            AgentToolInfo(
                name=t.name,
                version=t.version,
                safety=t.safety.value,
                permission_code=t.permission_code,
                description=t.description,
                superuser_only=t.superuser_only,
            )
            for t in items
        ]
    )


@router.get(
    "/runs",
    response_model=AgentRunList,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_agent_runs(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
) -> Any:
    stmt = select(AgentRun).order_by(col(AgentRun.created_at).desc())
    if not current_user.is_superuser:
        stmt = stmt.where(AgentRun.user_id == current_user.id)
    count_stmt = select(func.count()).select_from(AgentRun)
    if not current_user.is_superuser:
        count_stmt = count_stmt.where(AgentRun.user_id == current_user.id)
    count = session.exec(count_stmt).one()
    rows = list(session.exec(stmt.offset(skip).limit(limit)).all())
    return AgentRunList(
        data=[
            AgentRunPublic(
                id=r.id,
                user_id=r.user_id,
                agent_chat_log_id=r.agent_chat_log_id,
                created_at=r.created_at,
                llm_available=r.ollama_available,
                model=r.model,
                steps=r.steps,
                public_reasoning=r.public_reasoning,
            )
            for r in rows
        ],
        count=count,
    )


@router.get(
    "/runs/{run_id}",
    response_model=AgentRunPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def get_agent_run(
    session: SessionDep,
    current_user: CurrentUser,
    run_id: uuid.UUID,
) -> Any:
    row = session.get(AgentRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Запуск не найден")
    if row.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=404, detail="Запуск не найден")
    return AgentRunPublic(
        id=row.id,
        user_id=row.user_id,
        agent_chat_log_id=row.agent_chat_log_id,
        created_at=row.created_at,
        llm_available=row.ollama_available,
        model=row.model,
        steps=row.steps,
        public_reasoning=row.public_reasoning,
    )


@router.get(
    "/policies",
    response_model=AgentPolicyList,
    dependencies=[require_permission(PERM_AGENT_POLICIES_READ)],
)
def list_agent_policies(session: SessionDep, _current_user: CurrentUser) -> Any:
    rows = list(session.exec(select(AgentPolicy).order_by(AgentPolicy.code)).all())
    return AgentPolicyList(
        data=[
            AgentPolicyPublic(
                id=r.id,
                code=r.code,
                title=r.title,
                rules=r.rules,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        count=len(rows),
    )


@router.put(
    "/policies/{code}",
    response_model=AgentPolicyPublic,
    dependencies=[require_permission(PERM_AGENT_POLICIES_MANAGE)],
)
def update_agent_policy(
    session: SessionDep,
    _current_user: CurrentUser,
    code: str,
    body: AgentPolicyUpdate,
) -> Any:
    row = session.exec(select(AgentPolicy).where(AgentPolicy.code == code)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Политика не найдена")
    if body.title is not None:
        row.title = body.title
    if body.rules is not None:
        row.rules = body.rules
    session.add(row)
    session.commit()
    session.refresh(row)
    return AgentPolicyPublic(
        id=row.id,
        code=row.code,
        title=row.title,
        rules=row.rules,
        updated_at=row.updated_at,
    )


@router.post(
    "/chat",
    response_model=AgentChatResponse,
    response_model_exclude_none=True,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
async def agent_chat(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentChatRequest,
) -> Any:
    """
    Операционный агент: цикл Observe (контекст+twin+RAG+метрики) → Reason → Act (tools) →
    Verify → Conclude. Лимит: `AGENT_CHAT_RATE_LIMIT_PER_MINUTE`.
    """
    enforce_agent_chat_rate_limit(current_user.id)
    allow_act = body.allow_mutating_tools
    if allow_act and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="allow_mutating_tools доступен только суперпользователю",
        )
    if body.include_reasoning_debug and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="include_reasoning_debug доступен только суперпользователю",
        )
    if body.user_chat_id is not None:
        uc = get_user_chat_for_user(
            session, chat_id=body.user_chat_id, user=current_user
        )
        if uc is None:
            raise HTTPException(status_code=404, detail="Чат не найден")
    try:
        outcome = await run_agent_chat(
            session,
            current_user,
            body.message,
            allow_mutating_tools=allow_act,
            include_reasoning_debug=body.include_reasoning_debug,
            operation_session_id=body.operation_session_id,
        )
    except httpx.HTTPStatusError as e:
        snippet = ""
        try:
            snippet = (e.response.text or "")[:800]
        except Exception:
            snippet = ""
        raise HTTPException(
            status_code=502,
            detail=(
                f"Inference (vLLM) HTTP {e.response.status_code}; "
                f"запрос: {e.request.url!s}"
                + (f"; тело: {snippet}" if snippet else "")
            ),
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Нет связи с inference (vLLM): {e!s}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось обратиться к inference (vLLM): {e!s}",
        ) from e

    reply_for_client = (
        reply_without_first_paragraph_when_multi(outcome.reply)
        if not body.include_public_reasoning
        else outcome.reply
    )
    reply_for_client = sanitize_agent_reply_visible_text(reply_for_client)

    log = AgentChatLog(
        user_id=current_user.id,
        operation_session_id=body.operation_session_id,
        message_preview=body.message[:500],
        reply_preview=reply_for_client[:500],
        ollama_available=outcome.llm_available,
        model=outcome.model,
    )
    session.add(log)
    session.flush()
    run_uuid: uuid.UUID | None = None
    if outcome.run_id:
        try:
            run_uuid = uuid.UUID(outcome.run_id)
        except ValueError:
            run_uuid = None
    if run_uuid is not None:
        ar = AgentRun(
            id=run_uuid,
            user_id=current_user.id,
            agent_chat_log_id=log.id,
            ollama_available=outcome.llm_available,
            model=outcome.model,
            steps=outcome.trace_steps,
            public_reasoning=outcome.public_reasoning,
        )
        session.add(ar)
    if body.operation_session_id is not None:
        op = get_operation_session_for_user(
            session, session_id=body.operation_session_id, user=current_user
        )
        if op is not None:
            append_session_fact(
                session,
                op=op,
                fact={
                    "phase": "conclude",
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "run_id": outcome.run_id,
                    "message_excerpt": body.message[:240],
                    "reply_excerpt": reply_for_client[:400],
                },
            )
    if body.user_chat_id is not None:
        append_user_chat_turn(
            session,
            chat_id=body.user_chat_id,
            user_message=body.message,
            outcome=outcome,
            run_uuid=run_uuid,
            include_public_reasoning_in_meta=body.include_public_reasoning,
            assistant_reply_text=reply_for_client,
        )
    session.commit()
    session.refresh(log)
    publish_agent_run_finished(
        user_id=current_user.id,
        log_id=log.id,
        message_preview=log.message_preview,
        llm_available=outcome.llm_available,
    )

    pr: AgentPublicReasoningSummary | None = None
    if body.include_public_reasoning:
        pr = AgentPublicReasoningSummary(**outcome.public_reasoning)
    return AgentChatResponse(
        reply=reply_for_client,
        llm_available=outcome.llm_available,
        model=outcome.model,
        public_reasoning=pr,
        reasoning_debug=outcome.reasoning_debug,
        run_id=str(run_uuid) if run_uuid else None,
    )


def _op_public(r: AgentOperationSession) -> AgentOperationSessionPublic:
    return AgentOperationSessionPublic.model_validate(r)


def _pending_public(r: AgentPendingAction) -> AgentPendingActionPublic:
    return AgentPendingActionPublic.model_validate(r)


def _orch_public(r: AgentOrchestrationJob) -> AgentOrchestrationJobPublic:
    return AgentOrchestrationJobPublic.model_validate(r)


@router.post(
    "/operation-sessions",
    response_model=AgentOperationSessionPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def create_operation_session(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentOperationSessionCreate,
) -> Any:
    now = datetime.now(timezone.utc)
    row = AgentOperationSession(
        user_id=current_user.id,
        title=body.title,
        status="open",
        facts=[],
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _op_public(row)


@router.get(
    "/operation-sessions",
    response_model=AgentOperationSessionList,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_operation_sessions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
) -> Any:
    stmt = (
        select(AgentOperationSession)
        .where(AgentOperationSession.user_id == current_user.id)
        .order_by(col(AgentOperationSession.updated_at).desc())
    )
    count = session.exec(
        select(func.count())
        .select_from(AgentOperationSession)
        .where(AgentOperationSession.user_id == current_user.id)
    ).one()
    rows = list(session.exec(stmt.offset(skip).limit(limit)).all())
    return AgentOperationSessionList(data=[_op_public(r) for r in rows], count=count)


@router.get(
    "/operation-sessions/{session_id}",
    response_model=AgentOperationSessionPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def get_operation_session(
    session: SessionDep,
    current_user: CurrentUser,
    session_id: uuid.UUID,
) -> Any:
    row = get_operation_session_for_user(session, session_id=session_id, user=current_user)
    if row is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    return _op_public(row)


@router.patch(
    "/operation-sessions/{session_id}",
    response_model=AgentOperationSessionPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def patch_operation_session(
    session: SessionDep,
    current_user: CurrentUser,
    session_id: uuid.UUID,
    body: AgentOperationSessionPatch,
) -> Any:
    row = get_operation_session_for_user(session, session_id=session_id, user=current_user)
    if row is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if body.title is not None:
        row.title = body.title
    if body.rolling_summary is not None:
        row.rolling_summary = body.rolling_summary
    if body.status is not None:
        row.status = body.status[:32]
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _op_public(row)


@router.post(
    "/pending-actions",
    response_model=AgentPendingActionPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def create_pending_action(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentPendingActionCreate,
) -> Any:
    spec = CATALOG_BY_NAME.get(body.tool_name)
    if spec is None or spec.safety != ToolSafetyClass.ACT:
        raise HTTPException(
            status_code=400,
            detail="Разрешена постановка в очередь только для зарегистрированных act-инструментов",
        )
    row = AgentPendingAction(
        user_id=current_user.id,
        agent_run_id=body.agent_run_id,
        tool_name=body.tool_name,
        arguments=dict(body.arguments or {}),
        rationale=body.rationale,
        status="pending",
        source="manual",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _pending_public(row)


@router.get(
    "/pending-actions",
    response_model=AgentPendingActionList,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_pending_actions(
    session: SessionDep,
    current_user: CurrentUser,
    status: str | None = Query(default="pending", max_length=32),
    all_users: bool = Query(
        default=False,
        description="Суперпользователь: видеть очередь всех пользователей",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Any:
    stmt = select(AgentPendingAction)
    if status:
        stmt = stmt.where(AgentPendingAction.status == status)
    if not current_user.is_superuser or not all_users:
        stmt = stmt.where(AgentPendingAction.user_id == current_user.id)
    count_stmt = select(func.count()).select_from(AgentPendingAction)
    if status:
        count_stmt = count_stmt.where(AgentPendingAction.status == status)
    if not current_user.is_superuser or not all_users:
        count_stmt = count_stmt.where(AgentPendingAction.user_id == current_user.id)
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(col(AgentPendingAction.created_at).desc()).offset(skip).limit(limit)
        ).all()
    )
    return AgentPendingActionList(data=[_pending_public(r) for r in rows], count=count)


@router.post(
    "/pending-actions/{pending_id}/reject",
    response_model=AgentPendingActionPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def reject_pending_action(
    session: SessionDep,
    current_user: CurrentUser,
    pending_id: uuid.UUID,
) -> Any:
    row = session.get(AgentPendingAction, pending_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    if row.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Нет доступа")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Уже обработано")
    row.status = "rejected"
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by_user_id = current_user.id
    session.add(row)
    session.commit()
    session.refresh(row)
    return _pending_public(row)


@router.post(
    "/pending-actions/{pending_id}/execute",
    response_model=AgentPendingExecuteResponse,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def execute_pending_action_route(
    session: SessionDep,
    current_user: CurrentUser,
    pending_id: uuid.UUID,
) -> Any:
    row, out = execute_pending_action(session, actor=current_user, pending_id=pending_id)
    return AgentPendingExecuteResponse(status=row.status, tool_output_excerpt=out[:4000])


@router.post(
    "/orchestration-jobs",
    response_model=AgentOrchestrationJobPublic,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def create_orchestration_job(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentOrchestrationJobCreate,
) -> Any:
    op = get_operation_session_for_user(
        session, session_id=body.operation_session_id, user=current_user
    )
    if op is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    now = datetime.now(timezone.utc)
    run_after = now + timedelta(seconds=int(body.run_after_seconds))
    row = AgentOrchestrationJob(
        user_id=current_user.id,
        operation_session_id=body.operation_session_id,
        job_type="operation_session_append_fact",
        payload={"fact": dict(body.fact or {})},
        run_after=run_after,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _orch_public(row)


@router.get(
    "/orchestration-jobs",
    response_model=AgentOrchestrationJobList,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
def list_orchestration_jobs(
    session: SessionDep,
    current_user: CurrentUser,
    status: str | None = Query(default=None, max_length=32),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Any:
    stmt = select(AgentOrchestrationJob).where(
        AgentOrchestrationJob.user_id == current_user.id
    )
    if status:
        stmt = stmt.where(AgentOrchestrationJob.status == status)
    count_stmt = select(func.count()).select_from(AgentOrchestrationJob).where(
        AgentOrchestrationJob.user_id == current_user.id
    )
    if status:
        count_stmt = count_stmt.where(AgentOrchestrationJob.status == status)
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(col(AgentOrchestrationJob.created_at).desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return AgentOrchestrationJobList(data=[_orch_public(r) for r in rows], count=count)
