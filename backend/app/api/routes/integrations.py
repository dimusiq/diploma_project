"""Входящая очередь интеграций, feature flags, заготовка каталога коннекторов."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
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

router = APIRouter(prefix="/integrations", tags=["integrations"])


class ConnectorStub(BaseModel):
    id: str
    kind: Literal["erp", "wms", "tms", "custom"]
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
        ]
    )


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
    row = IntegrationInbox(
        source=body.source,
        event_type=body.event_type,
        payload=body.payload,
        status="pending",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return IntegrationInboxPublic(
        id=row.id,
        source=row.source,
        event_type=row.event_type,
        status=row.status,
        created_at=row.created_at,
        processed_at=row.processed_at,
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
            )
            for r in rows
        ],
        count=count,
    )
