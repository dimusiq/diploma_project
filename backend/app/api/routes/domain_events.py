"""Список доменных событий (отладка, будущий SSE)."""

import uuid
from typing import Any

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.api.deps import SessionDep, require_permission
from app.core.permissions import PERM_AUDIT_READ
from app.models import DomainEvent, DomainEventList, DomainEventPublic

router = APIRouter(prefix="/domain-events", tags=["domain-events"])


@router.get("/", response_model=DomainEventList)
def read_domain_events(
    session: SessionDep,
    _perm: Any = require_permission(PERM_AUDIT_READ),
    skip: int = 0,
    limit: int = Query(100, le=500),
    aggregate_type: str | None = Query(None),
    aggregate_id: uuid.UUID | None = Query(None),
    event_type: str | None = Query(None),
) -> Any:
    """Пагинированный список событий (те же права, что и журнал аудита)."""
    stmt = select(DomainEvent).order_by(DomainEvent.occurred_at.desc())
    count_stmt = select(func.count()).select_from(DomainEvent)
    if aggregate_type:
        stmt = stmt.where(DomainEvent.aggregate_type == aggregate_type)
        count_stmt = count_stmt.where(DomainEvent.aggregate_type == aggregate_type)
    if aggregate_id is not None:
        stmt = stmt.where(DomainEvent.aggregate_id == aggregate_id)
        count_stmt = count_stmt.where(DomainEvent.aggregate_id == aggregate_id)
    if event_type:
        stmt = stmt.where(DomainEvent.event_type == event_type)
        count_stmt = count_stmt.where(DomainEvent.event_type == event_type)
    count = session.exec(count_stmt).one()
    rows = list(session.exec(stmt.offset(skip).limit(limit)).all())
    return DomainEventList(
        data=[DomainEventPublic.model_validate(r) for r in rows],
        count=count,
    )
