"""Сводная аналитика цифрового двойника склада (без LLM)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_WAREHOUSE_TELEMETRY_INGEST, PERM_ZONES_MANAGE
from app.models import (
    TwinBusinessRule,
    TwinBusinessRuleCreate,
    TwinBusinessRuleList,
    TwinBusinessRulePublic,
    TwinSlaDefinition,
    TwinSlaDefinitionCreate,
    TwinSlaDefinitionList,
    TwinSlaDefinitionPublic,
)
from app.realtime.twin_stream_hub import publish_telemetry_fact
from app.schemas.warehouse_twin_semantics import (
    TwinSemanticOverviewResponse,
    build_default_vocabulary,
)
from app.services.domain_events import emit_domain_event
from app.services.warehouse_twin_metrics import build_twin_summary_dict

router = APIRouter(prefix="/warehouse/twin", tags=["warehouse-twin"])


class RowLoadItem(BaseModel):
    storage_row: int
    item_count: int


class TwinSummaryResponse(BaseModel):
    """Метрики с учётом прав пользователя на товары; события — только при audit.read."""

    domain_events_by_type: dict[str, int] = Field(default_factory=dict)
    warehouse_items_by_row: list[RowLoadItem] = Field(default_factory=list)
    warehouse_items_total: int = 0
    items_expiring_within_30_days: int = 0
    layout_capacity_cells: int | None = None
    occupied_slots: int = 0
    slot_utilization_ratio: float | None = None


class WhatIfBody(BaseModel):
    """Добавить условные единицы товара по рядам (1 единица ≈ 1 ячейка в модели)."""

    additional_items_by_row: dict[int, int] = Field(default_factory=dict)

    @field_validator("additional_items_by_row")
    @classmethod
    def _validate_rows(cls, v: dict[int, int]) -> dict[int, int]:
        out: dict[int, int] = {}
        for row, n in v.items():
            if row < 1 or row > 64:
                raise ValueError("storage_row вне допустимого диапазона")
            if n < 0 or n > 10_000:
                raise ValueError("количество должно быть 0…10000")
            if n:
                out[row] = n
        return out


class WhatIfResponse(BaseModel):
    baseline_occupied_slots: int
    baseline_utilization_ratio: float | None
    projected_occupied_slots: int
    projected_utilization_ratio: float | None
    warehouse_items_by_row_after: list[RowLoadItem]


@router.get("/summary", response_model=TwinSummaryResponse)
def read_twin_summary(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    raw = build_twin_summary_dict(session, current_user)
    raw["warehouse_items_by_row"] = [
        RowLoadItem(**x) for x in raw["warehouse_items_by_row"]
    ]
    return TwinSummaryResponse(**raw)


@router.post("/what-if", response_model=WhatIfResponse)
def twin_what_if(
    session: SessionDep,
    current_user: CurrentUser,
    body: WhatIfBody,
) -> Any:
    """Простая симуляция: к занятости и счётчикам по рядам добавляются заданные объёмы."""
    raw = build_twin_summary_dict(session, current_user)
    capacity = raw["layout_capacity_cells"]
    occupied = int(raw["occupied_slots"])
    ratio_b = raw["slot_utilization_ratio"]

    row_map: dict[int, int] = {
        int(x["storage_row"]): int(x["item_count"])
        for x in raw["warehouse_items_by_row"]
    }
    extra_slots = 0
    for row, add in body.additional_items_by_row.items():
        row_map[row] = row_map.get(row, 0) + add
        extra_slots += add

    projected_occ = occupied + extra_slots
    if capacity and capacity > 0:
        projected_occ = min(projected_occ, capacity)
    ratio_p: float | None = None
    if capacity and capacity > 0:
        ratio_p = round(projected_occ / capacity, 4)

    by_row_after = [
        RowLoadItem(storage_row=r, item_count=c)
        for r, c in sorted(row_map.items())
        if c > 0
    ]

    return WhatIfResponse(
        baseline_occupied_slots=occupied,
        baseline_utilization_ratio=ratio_b,
        projected_occupied_slots=projected_occ,
        projected_utilization_ratio=ratio_p,
        warehouse_items_by_row_after=by_row_after,
    )


class ExternalTwinFactCreate(BaseModel):
    """Унифицированный вход факта из WMS/ERP/PLC/TMS (публикуется в канал telemetry)."""

    source: Literal["wms", "erp", "plc", "sensor", "tms", "custom"]
    fact_type: str = Field(max_length=128)
    warehouse_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    correlation_id: uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    persist_domain_event: bool = False
    domain_event_type: str | None = Field(default=None, max_length=128)
    aggregate_type: str | None = Field(default=None, max_length=64)
    aggregate_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _require_aggregate_when_persisting(self) -> ExternalTwinFactCreate:
        if self.persist_domain_event:
            if not self.domain_event_type or not self.aggregate_type or not self.aggregate_id:
                raise ValueError(
                    "При persist_domain_event нужны domain_event_type, aggregate_type, aggregate_id"
                )
        return self


class ExternalTwinFactAccepted(BaseModel):
    ok: bool = True
    domain_event_id: uuid.UUID | None = None


def _sla_public(r: TwinSlaDefinition) -> TwinSlaDefinitionPublic:
    return TwinSlaDefinitionPublic.model_validate(r)


def _rule_public(r: TwinBusinessRule) -> TwinBusinessRulePublic:
    return TwinBusinessRulePublic.model_validate(r)


@router.get("/semantic-overview", response_model=TwinSemanticOverviewResponse)
def read_semantic_overview(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(
        default=None,
        description="Фильтр SLA/правил: склад + глобальные (warehouse_id IS NULL)",
    ),
) -> TwinSemanticOverviewResponse:
    stmt_sla = select(TwinSlaDefinition).where(TwinSlaDefinition.is_active == True)  # noqa: E712
    stmt_rule = select(TwinBusinessRule).where(TwinBusinessRule.is_active == True)  # noqa: E712
    if warehouse_id is not None:
        stmt_sla = stmt_sla.where(
            or_(
                TwinSlaDefinition.warehouse_id == warehouse_id,
                TwinSlaDefinition.warehouse_id.is_(None),
            )
        )
        stmt_rule = stmt_rule.where(
            or_(
                TwinBusinessRule.warehouse_id == warehouse_id,
                TwinBusinessRule.warehouse_id.is_(None),
            )
        )
    sla_rows = list(session.exec(stmt_sla.order_by(TwinSlaDefinition.code)).all())
    rule_rows = list(session.exec(stmt_rule.order_by(TwinBusinessRule.priority.desc())).all())
    return TwinSemanticOverviewResponse(
        vocabulary=build_default_vocabulary(),
        sla_definitions=[_sla_public(r) for r in sla_rows],
        business_rules=[_rule_public(r) for r in rule_rows],
    )


@router.post(
    "/sla-definitions",
    response_model=TwinSlaDefinitionPublic,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def create_sla_definition(
    session: SessionDep,
    _current_user: CurrentUser,
    body: TwinSlaDefinitionCreate,
) -> TwinSlaDefinitionPublic:
    now = datetime.now(timezone.utc)
    row = TwinSlaDefinition(
        warehouse_id=body.warehouse_id,
        code=body.code.strip(),
        title=body.title.strip(),
        description=body.description,
        target_entity_kind=body.target_entity_kind,
        metric_key=body.metric_key,
        target_spec=body.target_spec,
        window_spec=body.window_spec,
        is_active=body.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _sla_public(row)


@router.get("/sla-definitions", response_model=TwinSlaDefinitionList)
def list_sla_definitions(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> TwinSlaDefinitionList:
    stmt = select(TwinSlaDefinition)
    if warehouse_id is not None:
        stmt = stmt.where(
            or_(
                TwinSlaDefinition.warehouse_id == warehouse_id,
                TwinSlaDefinition.warehouse_id.is_(None),
            )
        )
    count_stmt = select(func.count()).select_from(TwinSlaDefinition)
    if warehouse_id is not None:
        count_stmt = count_stmt.where(
            or_(
                TwinSlaDefinition.warehouse_id == warehouse_id,
                TwinSlaDefinition.warehouse_id.is_(None),
            )
        )
    count = session.exec(count_stmt).one()
    rows = list(session.exec(stmt.order_by(TwinSlaDefinition.code).offset(skip).limit(limit)).all())
    return TwinSlaDefinitionList(data=[_sla_public(r) for r in rows], count=count)


@router.post(
    "/business-rules",
    response_model=TwinBusinessRulePublic,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def create_business_rule(
    session: SessionDep,
    _current_user: CurrentUser,
    body: TwinBusinessRuleCreate,
) -> TwinBusinessRulePublic:
    now = datetime.now(timezone.utc)
    row = TwinBusinessRule(
        warehouse_id=body.warehouse_id,
        code=body.code.strip(),
        title=body.title.strip(),
        rule_kind=body.rule_kind,
        applies_to_entity_kind=body.applies_to_entity_kind,
        expression=body.expression,
        priority=body.priority,
        is_active=body.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _rule_public(row)


@router.get("/business-rules", response_model=TwinBusinessRuleList)
def list_business_rules(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> TwinBusinessRuleList:
    stmt = select(TwinBusinessRule)
    if warehouse_id is not None:
        stmt = stmt.where(
            or_(
                TwinBusinessRule.warehouse_id == warehouse_id,
                TwinBusinessRule.warehouse_id.is_(None),
            )
        )
    count_stmt = select(func.count()).select_from(TwinBusinessRule)
    if warehouse_id is not None:
        count_stmt = count_stmt.where(
            or_(
                TwinBusinessRule.warehouse_id == warehouse_id,
                TwinBusinessRule.warehouse_id.is_(None),
            )
        )
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(TwinBusinessRule.priority.desc(), TwinBusinessRule.code)
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return TwinBusinessRuleList(data=[_rule_public(r) for r in rows], count=count)


@router.post(
    "/external-fact",
    response_model=ExternalTwinFactAccepted,
    dependencies=[require_permission(PERM_WAREHOUSE_TELEMETRY_INGEST)],
)
def ingest_external_twin_fact(
    session: SessionDep,
    current_user: CurrentUser,
    body: ExternalTwinFactCreate,
) -> ExternalTwinFactAccepted:
    ev_id: uuid.UUID | None = None
    if body.persist_domain_event:
        assert body.domain_event_type and body.aggregate_type and body.aggregate_id
        ev = emit_domain_event(
            session,
            event_type=body.domain_event_type,
            aggregate_type=body.aggregate_type,
            aggregate_id=body.aggregate_id,
            payload=dict(body.payload),
            actor_user_id=current_user.id,
            correlation_id=body.correlation_id,
            occurred_at=body.occurred_at,
            strict_payload=False,
        )
        session.commit()
        ev_id = ev.id
    tele_payload = {
        **body.payload,
        "source": body.source,
        "warehouse_id": str(body.warehouse_id) if body.warehouse_id else None,
        "correlation_id": str(body.correlation_id) if body.correlation_id else None,
    }
    if body.occurred_at:
        tele_payload["occurred_at"] = body.occurred_at.isoformat().replace("+00:00", "Z")
    publish_telemetry_fact(event_type=body.fact_type, payload=tele_payload)
    return ExternalTwinFactAccepted(ok=True, domain_event_id=ev_id)
