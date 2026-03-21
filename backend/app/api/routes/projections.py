"""Replay / rebuild проекций twin и просмотр ленты."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_AUDIT_READ
from app.models import (
    ProjectionConsumerProcessed,
    TwinProjectionEntry,
    TwinProjectionEntryPublic,
    TwinProjectionFeed,
)
from app.projections.consumers import CONSUMER_HANDLERS
from app.services.outbox_dispatch import enqueue_replay_all_domain_events

router = APIRouter(prefix="/projections", tags=["projections"])


class ProjectionReplayRequest(BaseModel):
    """Полная пересборка: очистка выбранных чекпоинтов + повторная постановка всех domain_event в outbox."""

    purge_twin_timeline: bool = Field(
        default=True,
        description="Удалить строки twin_projection_entry",
    )
    consumer_names: list[str] | None = Field(
        default=None,
        description="Сбросить идемпотентность только для этих потребителей; None = все",
    )


class ProjectionReplayResponse(BaseModel):
    twin_entries_deleted: int
    consumer_checkpoints_deleted: int
    outbox_enqueued: int
    registered_consumers: list[str]


@router.post(
    "/replay",
    response_model=ProjectionReplayResponse,
    dependencies=[require_permission(PERM_AUDIT_READ)],
)
def post_projections_replay(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    body: ProjectionReplayRequest,
) -> Any:
    """
    Rebuild twin-проекций: очистка read-модели и чекпоинтов, повторная постановка событий в outbox.
    Фактическая обработка — воркером (`outbox_dispatcher_loop`).
    """
    twin_deleted = 0
    if body.purge_twin_timeline:
        r = session.execute(delete(TwinProjectionEntry))
        twin_deleted = r.rowcount or 0

    proc_stmt = delete(ProjectionConsumerProcessed)
    if body.consumer_names:
        proc_stmt = proc_stmt.where(
            col(ProjectionConsumerProcessed.consumer_name).in_(body.consumer_names)
        )
    cr = session.execute(proc_stmt)
    proc_deleted = cr.rowcount or 0

    enq = enqueue_replay_all_domain_events(session)
    session.commit()
    return ProjectionReplayResponse(
        twin_entries_deleted=twin_deleted,
        consumer_checkpoints_deleted=proc_deleted,
        outbox_enqueued=enq,
        registered_consumers=sorted(CONSUMER_HANDLERS.keys()),
    )


@router.get(
    "/twin-feed",
    response_model=TwinProjectionFeed,
    dependencies=[require_permission(PERM_AUDIT_READ)],
)
def read_twin_projection_feed(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = Query(100, le=500),
) -> Any:
    """Лента twin, построенная проекцией из доменных событий."""
    stmt = (
        select(TwinProjectionEntry)
        .order_by(col(TwinProjectionEntry.event_seq).desc())
        .offset(skip)
        .limit(limit)
    )
    count_stmt = select(func.count()).select_from(TwinProjectionEntry)
    total = session.exec(count_stmt).one()
    rows = list(session.exec(stmt).all())
    return TwinProjectionFeed(
        data=[
            TwinProjectionEntryPublic(
                id=r.id,
                domain_event_id=r.domain_event_id,
                event_seq=r.event_seq,
                occurred_at=r.occurred_at,
                event_type=r.event_type,
                aggregate_type=r.aggregate_type,
                aggregate_id=r.aggregate_id,
                payload_summary=r.payload_summary,
            )
            for r in rows
        ],
        count=total,
    )
