"""Чат-ассистент по складу: контекст из БД, RAG, Ollama, инструменты."""

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import col, func, select

from app.agent.tool_catalog import tools_for_user
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
    can_use_agent,
    user_has_permission,
)
from app.models import (
    AgentChatLog,
    AgentChatLogList,
    AgentChatLogPublic,
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
from app.services.agent_rate_limit import enforce_agent_chat_rate_limit

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
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


class AgentPublicReasoningSummary(BaseModel):
    """Публичная сводка без полного chain-of-thought."""

    brief_explanation: str
    tools_used: list[dict[str, Any]] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    recommendation: str
    models: dict[str, str] = Field(default_factory=dict)
    main_loop_task: str = "chat"


class AgentChatResponse(BaseModel):
    reply: str
    ollama_available: bool
    model: str | None = None
    public_reasoning: AgentPublicReasoningSummary
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


@router.get("/permissions", response_model=AgentPermissionsResponse)
def agent_permissions(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Для UI: есть ли право пользоваться POST /agent/chat."""
    return AgentPermissionsResponse(can_use=can_use_agent(session, current_user))


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
        data=[AgentChatLogPublic.model_validate(r) for r in rows],
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
    items = tools_for_user(
        is_superuser=bool(current_user.is_superuser),
        has_audit_read=has_audit,
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
                ollama_available=r.ollama_available,
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
        ollama_available=row.ollama_available,
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
    dependencies=[require_permission(PERM_AGENT_USE)],
)
async def agent_chat(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentChatRequest,
) -> Any:
    """
    Ответ на вопрос по складу. Контекст — агрегаты, layout, RAG по справочнику, инструменты (поиск товаров).
    Лимит запросов: `AGENT_CHAT_RATE_LIMIT_PER_MINUTE` (память процесса или Redis).
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
    try:
        outcome = await run_agent_chat(
            session,
            current_user,
            body.message,
            allow_mutating_tools=allow_act,
            include_reasoning_debug=body.include_reasoning_debug,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama вернула ошибку: {e.response.status_code}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось обратиться к Ollama: {e!s}",
        ) from e

    log = AgentChatLog(
        user_id=current_user.id,
        message_preview=body.message[:500],
        reply_preview=outcome.reply[:500],
        ollama_available=outcome.ollama_available,
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
            ollama_available=outcome.ollama_available,
            model=outcome.model,
            steps=outcome.trace_steps,
            public_reasoning=outcome.public_reasoning,
        )
        session.add(ar)
    session.commit()
    session.refresh(log)
    publish_agent_run_finished(
        user_id=current_user.id,
        log_id=log.id,
        message_preview=log.message_preview,
        ollama_available=outcome.ollama_available,
    )

    return AgentChatResponse(
        reply=outcome.reply,
        ollama_available=outcome.ollama_available,
        model=outcome.model,
        public_reasoning=AgentPublicReasoningSummary(**outcome.public_reasoning),
        reasoning_debug=outcome.reasoning_debug,
        run_id=str(run_uuid) if run_uuid else None,
    )
