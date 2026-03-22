"""Входящая очередь интеграций, feature flags, заготовка каталога коннекторов."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.config import settings
from app.core.permissions import (
    PERM_INTEGRATIONS_INBOX_READ,
    PERM_INTEGRATIONS_INBOX_WRITE,
)
from app.models import (
    FeatureFlag,
    FeatureFlagMap,
    FeatureFlagPublic,
    IntegrationInbox,
    IntegrationInboxCreate,
    IntegrationInboxList,
    IntegrationInboxPublic,
)
from app.services.feature_flags import all_flags_map
from app.services.integration_layer_status import (
    IntegrationLayerStatusResponse,
    build_integration_layer_status,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])

ConnectorKind = Literal[
    "erp",
    "wms",
    "tms",
    "plc_scada",
    "iot",
    "telemetry_rtls",
    "identification",
    "custom",
]


class ConnectorStub(BaseModel):
    id: str
    kind: ConnectorKind
    title: str
    status: Literal["planned", "beta", "active"] = "planned"


class ConnectorCatalogResponse(BaseModel):
    connectors: list[ConnectorStub]


@router.get("/connectors", response_model=ConnectorCatalogResponse)
def list_connectors_stub(_current_user: CurrentUser) -> ConnectorCatalogResponse:
    return ConnectorCatalogResponse(
        connectors=[
            ConnectorStub(
                id="stub-erp",
                kind="erp",
                title="ERP (заглушка фреймворка коннекторов)",
                status="planned",
            ),
            ConnectorStub(
                id="stub-wms",
                kind="wms",
                title="WMS — поток фактов → /warehouse/twin/external-fact",
                status="planned",
            ),
            ConnectorStub(
                id="stub-tms",
                kind="tms",
                title="TMS / транспорт (заглушка)",
                status="planned",
            ),
            ConnectorStub(
                id="stub-plc",
                kind="plc_scada",
                title="PLC/SCADA → брокер → external-fact / inbox (план)",
                status="planned",
            ),
            ConnectorStub(
                id="stub-iot",
                kind="iot",
                title="IoT edge → брокер (план)",
                status="planned",
            ),
            ConnectorStub(
                id="telemetry-http",
                kind="telemetry_rtls",
                title="Телеметрия: POST readings / vehicle-positions + twin SSE",
                status="beta",
            ),
            ConnectorStub(
                id="identification",
                kind="identification",
                title="SKU/штрихкод на товарах; RFID edge — план",
                status="partial",
            ),
        ]
    )


@router.get("/layer-status", response_model=IntegrationLayerStatusResponse)
def integration_layer_status(_current_user: CurrentUser) -> IntegrationLayerStatusResponse:
    """Машиночитаемая сводка: адаптеры, брокер, outbox/replay, inbox (факт vs план)."""
    return build_integration_layer_status(settings)


@router.get("/feature-flags", response_model=FeatureFlagMap)
def read_feature_flags(
    session: SessionDep,
    _current_user: CurrentUser,
) -> FeatureFlagMap:
    return FeatureFlagMap(flags=all_flags_map(session))


@router.get("/feature-flags/detail", response_model=list[FeatureFlagPublic])
def read_feature_flags_detail(
    session: SessionDep,
    _current_user: CurrentUser,
) -> list[FeatureFlagPublic]:
    rows = list(session.exec(select(FeatureFlag).order_by(FeatureFlag.key)).all())
    return [
        FeatureFlagPublic(key=r.key, enabled=bool(r.enabled), description=r.description)
        for r in rows
    ]


@router.post(
    "/inbox",
    response_model=IntegrationInboxPublic,
    dependencies=[require_permission(PERM_INTEGRATIONS_INBOX_WRITE)],
)
def integration_inbox_ingest(
    session: SessionDep,
    _current_user: CurrentUser,
    body: IntegrationInboxCreate,
) -> IntegrationInboxPublic:
    if body.idempotency_key:
        existing = session.exec(
            select(IntegrationInbox).where(
                IntegrationInbox.source == body.source,
                IntegrationInbox.idempotency_key == body.idempotency_key,
            )
        ).first()
        if existing is not None:
            return IntegrationInboxPublic(
                id=existing.id,
                source=existing.source,
                event_type=existing.event_type,
                status=existing.status,
                created_at=existing.created_at,
                processed_at=existing.processed_at,
                twin_published_at=existing.twin_published_at,
                idempotency_key=existing.idempotency_key,
                domain_event_id=existing.domain_event_id,
                processing_error=existing.processing_error,
            )
    row = IntegrationInbox(
        source=body.source,
        event_type=body.event_type,
        payload=body.payload,
        status="pending",
        idempotency_key=body.idempotency_key,
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.exec(
            select(IntegrationInbox).where(
                IntegrationInbox.source == body.source,
                IntegrationInbox.idempotency_key == body.idempotency_key,
            )
        ).first()
        if existing is None:
            raise
        return IntegrationInboxPublic(
            id=existing.id,
            source=existing.source,
            event_type=existing.event_type,
            status=existing.status,
            created_at=existing.created_at,
            processed_at=existing.processed_at,
            twin_published_at=existing.twin_published_at,
            idempotency_key=existing.idempotency_key,
            domain_event_id=existing.domain_event_id,
            processing_error=existing.processing_error,
        )
    session.refresh(row)
    return IntegrationInboxPublic(
        id=row.id,
        source=row.source,
        event_type=row.event_type,
        status=row.status,
        created_at=row.created_at,
        processed_at=row.processed_at,
        twin_published_at=row.twin_published_at,
        idempotency_key=row.idempotency_key,
        domain_event_id=row.domain_event_id,
        processing_error=row.processing_error,
    )


@router.get(
    "/inbox",
    response_model=IntegrationInboxList,
    dependencies=[require_permission(PERM_INTEGRATIONS_INBOX_READ)],
)
def integration_inbox_list(
    session: SessionDep,
    _current_user: CurrentUser,
    status: str | None = Query(default=None, max_length=32),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> IntegrationInboxList:
    stmt = select(IntegrationInbox).order_by(IntegrationInbox.created_at.desc())
    if status is not None:
        stmt = stmt.where(IntegrationInbox.status == status)
    count_stmt = select(func.count()).select_from(IntegrationInbox)
    if status is not None:
        count_stmt = count_stmt.where(IntegrationInbox.status == status)
    count = session.exec(count_stmt).one()
    rows = list(session.exec(stmt.offset(skip).limit(limit)).all())
    return IntegrationInboxList(
        data=[
            IntegrationInboxPublic(
                id=r.id,
                source=r.source,
                event_type=r.event_type,
                status=r.status,
                created_at=r.created_at,
                processed_at=r.processed_at,
                twin_published_at=r.twin_published_at,
                idempotency_key=r.idempotency_key,
                domain_event_id=r.domain_event_id,
                processing_error=r.processing_error,
            )
            for r in rows
        ],
        count=count,
    )
