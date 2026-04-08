"""Обработка очереди agent_orchestration_job (воркер)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, col, select

from app.models import AgentOrchestrationJob, User
from app.services.agent_operations import (
    append_session_fact,
    get_operation_session_for_user,
)


def _process_one(session: Session, job: AgentOrchestrationJob) -> None:
    if job.job_type != "operation_session_append_fact":
        raise ValueError(f"Неизвестный job_type: {job.job_type}")
    oid = job.operation_session_id
    if oid is None:
        raise ValueError("operation_session_id обязателен")
    user = session.get(User, job.user_id)
    if user is None:
        raise ValueError("user не найден")
    op = get_operation_session_for_user(session, session_id=oid, user=user)
    if op is None:
        raise ValueError("Операционная сессия не найдена")
    fact = job.payload.get("fact") if isinstance(job.payload, dict) else None
    if not isinstance(fact, dict):
        fact = {"note": "orchestration_job", "job_id": str(job.id)}
    fact.setdefault("phase", "orchestrator")
    fact.setdefault("at", datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    append_session_fact(session, op=op, fact=fact)


def process_orchestration_jobs_batch(session: Session, *, limit: int = 20) -> int:
    now = datetime.now(timezone.utc)
    stmt = (
        select(AgentOrchestrationJob)
        .where(
            AgentOrchestrationJob.status == "pending",
            col(AgentOrchestrationJob.run_after) <= now,
        )
        .order_by(col(AgentOrchestrationJob.run_after))
        .limit(limit)
    )
    jobs = list(session.exec(stmt).all())
    done = 0
    for job in jobs:
        jid = job.id
        try:
            row = session.get(AgentOrchestrationJob, jid)
            if row is None or row.status != "pending":
                continue
            row.status = "processing"
            row.updated_at = datetime.now(timezone.utc)
            session.add(row)
            session.flush()
            _process_one(session, row)
            row.status = "completed"
            row.result = {"ok": True}
            row.updated_at = datetime.now(timezone.utc)
            session.add(row)
            session.commit()
            done += 1
        except Exception as e:
            session.rollback()
            row = session.get(AgentOrchestrationJob, jid)
            if row:
                row.status = "failed"
                row.last_error = str(e)[:4000]
                row.updated_at = datetime.now(timezone.utc)
                session.add(row)
                session.commit()
    return done


def publish_pending_inbox_to_twin_batch(session: Session, *, limit: int = 25) -> int:
    """Устарело: обработка inbox → `integration_inbox_processor.process_integration_inbox_batch` (воркер)."""
    from app.models import IntegrationInbox
    from app.realtime.twin_stream_hub import publish_telemetry_fact

    stmt = (
        select(IntegrationInbox)
        .where(
            IntegrationInbox.status == "pending",
            col(IntegrationInbox.twin_published_at).is_(None),
        )
        .order_by(col(IntegrationInbox.created_at))
        .limit(limit)
    )
    rows = list(session.exec(stmt).all())
    n = 0
    ts = datetime.now(timezone.utc)
    for r in rows:
        publish_telemetry_fact(
            event_type=r.event_type,
            payload={
                "integration_inbox_id": str(r.id),
                "source": r.source,
                "payload": r.payload,
            },
        )
        r.twin_published_at = ts
        session.add(r)
        n += 1
    if n:
        session.commit()
    return n
