"""Активная геометрия склада для 3D twin, жизненный цикл layout, граф маршрутов."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_ZONES_MANAGE, can_see_all_items
from app.models import (
    LAYOUT_LIFECYCLE_ARCHIVED,
    LAYOUT_LIFECYCLE_DRAFT,
    LAYOUT_LIFECYCLE_PUBLISHED,
    RouteEdge,
    RouteNode,
    Warehouse,
    WarehouseLayout,
    WarehouseLayoutPublic,
    WarehouseLayoutsPublic,
    WarehouseLayoutSummary,
    WarehouseOccupancyResponse,
    WarehouseSlotOccupancy,
    WarehouseSlotOccupancyEntry,
)
from app.schemas.route_graph_sync import RouteGraphSyncResult
from app.schemas.warehouse_layout_spec import (
    layout_spec_for_api_response,
    parse_warehouse_layout_spec,
)
from app.services.warehouse_route_graph_sync import sync_route_graph_from_topology

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


class ForkWarehouseLayoutBody(BaseModel):
    """Если source_layout_id не задан — копируется текущий активный layout."""

    source_layout_id: uuid.UUID | None = None


def _sync_warehouses_active_layout(session: SessionDep, layout: WarehouseLayout) -> None:
    """Обновляет Warehouse.active_layout_id в соответствии с активной ревизией."""
    now = datetime.now(timezone.utc)
    if layout.warehouse_id is not None:
        wh = session.get(Warehouse, layout.warehouse_id)
        if wh is not None:
            wh.active_layout_id = layout.id
            wh.updated_at = now
            session.add(wh)
        return
    for wh in session.exec(select(Warehouse)).all():
        wh.active_layout_id = layout.id
        wh.updated_at = now
        session.add(wh)


def _active_layout_row(session: SessionDep) -> WarehouseLayout:
    row = session.exec(select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))).first()
    if not row:
        raise HTTPException(status_code=404, detail="Активная конфигурация склада не найдена")
    return row


def warehouse_layout_to_public(row: WarehouseLayout) -> WarehouseLayoutPublic:
    spec_parsed = parse_warehouse_layout_spec(row.spec if isinstance(row.spec, dict) else {})
    return WarehouseLayoutPublic(
        id=row.id,
        code=row.code,
        version=row.version,
        is_active=row.is_active,
        spec=layout_spec_for_api_response(spec_parsed),
        warehouse_id=row.warehouse_id,
        spec_schema_version=row.spec_schema_version,
        lifecycle_status=row.lifecycle_status,
        published_at=row.published_at,
        activated_at=row.activated_at,
    )


@router.get("/layout", response_model=WarehouseLayoutPublic)
def read_active_warehouse_layout(session: SessionDep, _current_user: CurrentUser) -> Any:
    """Текущий активный layout (spec — плоский JSON с schema_version и валидированной геометрией)."""
    return warehouse_layout_to_public(_active_layout_row(session))


@router.get("/layouts", response_model=WarehouseLayoutsPublic)
def list_warehouse_layouts(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    lifecycle_status: str | None = Query(default=None, max_length=16),
) -> Any:
    """Список ревизий layout (без полного spec)."""
    stmt = select(WarehouseLayout).order_by(
        WarehouseLayout.code,
        WarehouseLayout.version.desc(),
        WarehouseLayout.created_at.desc(),
    )
    if warehouse_id is not None:
        stmt = stmt.where(WarehouseLayout.warehouse_id == warehouse_id)
    if lifecycle_status is not None:
        stmt = stmt.where(WarehouseLayout.lifecycle_status == lifecycle_status)
    rows = list(session.exec(stmt).all())
    return WarehouseLayoutsPublic(
        data=[
            WarehouseLayoutSummary(
                id=r.id,
                code=r.code,
                version=r.version,
                is_active=r.is_active,
                warehouse_id=r.warehouse_id,
                spec_schema_version=r.spec_schema_version,
                lifecycle_status=r.lifecycle_status,
                published_at=r.published_at,
                activated_at=r.activated_at,
                created_at=r.created_at,
            )
            for r in rows
        ],
        count=len(rows),
    )


@router.get("/layout/versions", response_model=WarehouseLayoutsPublic)
def list_warehouse_layout_versions(
    session: SessionDep,
    current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    lifecycle_status: str | None = Query(default=None, max_length=16),
) -> Any:
    """Алиас blueprint `GET /warehouse/layout/versions` → тот же список, что `/warehouse/layouts`."""
    return list_warehouse_layouts(session, current_user, warehouse_id, lifecycle_status)


@router.post(
    "/layout/{layout_id}/publish",
    response_model=WarehouseLayoutSummary,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def publish_warehouse_layout(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    layout_id: uuid.UUID,
) -> Any:
    """Черновик → опубликован (published_at = сейчас)."""
    row = session.get(WarehouseLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout не найден")
    if row.lifecycle_status != LAYOUT_LIFECYCLE_DRAFT:
        raise HTTPException(status_code=400, detail="Опубликовать можно только черновик")
    now = datetime.now(timezone.utc)
    row.lifecycle_status = LAYOUT_LIFECYCLE_PUBLISHED
    row.published_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_layout.publish",
        resource_type="warehouse_layout",
        resource_id=row.id,
        details={"code": row.code, "version": row.version},
        ip_address=get_client_ip(request),
    )
    return WarehouseLayoutSummary(
        id=row.id,
        code=row.code,
        version=row.version,
        is_active=row.is_active,
        warehouse_id=row.warehouse_id,
        spec_schema_version=row.spec_schema_version,
        lifecycle_status=row.lifecycle_status,
        published_at=row.published_at,
        activated_at=row.activated_at,
        created_at=row.created_at,
    )


@router.post(
    "/layout/{layout_id}/activate",
    response_model=WarehouseLayoutPublic,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def activate_warehouse_layout(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    layout_id: uuid.UUID,
) -> Any:
    """Сделать ревизию активной (только published); снимает флаг с остальных в том же scope склада."""
    row = session.get(WarehouseLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout не найден")
    if row.lifecycle_status != LAYOUT_LIFECYCLE_PUBLISHED:
        raise HTTPException(status_code=400, detail="Активировать можно только опубликованную ревизию")
    now = datetime.now(timezone.utc)

    scope = select(WarehouseLayout)
    if row.warehouse_id is not None:
        scope = scope.where(WarehouseLayout.warehouse_id == row.warehouse_id)
    siblings = list(session.exec(scope).all())
    for s in siblings:
        if s.is_active:
            s.is_active = False
            session.add(s)
    row.is_active = True
    row.activated_at = now
    session.add(row)
    _sync_warehouses_active_layout(session, row)
    session.commit()
    session.refresh(row)
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_layout.activate",
        resource_type="warehouse_layout",
        resource_id=row.id,
        details={"code": row.code, "version": row.version},
        ip_address=get_client_ip(request),
    )
    return warehouse_layout_to_public(row)


@router.post(
    "/layout/fork-draft",
    response_model=WarehouseLayoutSummary,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def fork_warehouse_layout_draft(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: ForkWarehouseLayoutBody | None = Body(default=None),
) -> Any:
    """
    Копия layout в новую ревизию со статусом **draft** и `version = max+1`
    (в пределах пары code + warehouse_id).
    """
    body = body or ForkWarehouseLayoutBody()
    if body.source_layout_id is not None:
        src = session.get(WarehouseLayout, body.source_layout_id)
        if not src:
            raise HTTPException(status_code=404, detail="Исходный layout не найден")
    else:
        src = _active_layout_row(session)

    stmt = select(WarehouseLayout).where(WarehouseLayout.code == src.code)
    if src.warehouse_id is not None:
        stmt = stmt.where(WarehouseLayout.warehouse_id == src.warehouse_id)
    else:
        stmt = stmt.where(WarehouseLayout.warehouse_id.is_(None))
    siblings = list(session.exec(stmt).all())
    max_v = max((s.version for s in siblings), default=0)

    spec_copy: dict[str, Any] = (
        copy.deepcopy(src.spec) if isinstance(src.spec, dict) else {}
    )
    row = WarehouseLayout(
        code=src.code,
        version=max_v + 1,
        is_active=False,
        spec=spec_copy,
        spec_schema_version=src.spec_schema_version,
        lifecycle_status=LAYOUT_LIFECYCLE_DRAFT,
        published_at=None,
        activated_at=None,
        warehouse_id=src.warehouse_id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_layout.fork_draft",
        resource_type="warehouse_layout",
        resource_id=row.id,
        details={"from_id": str(src.id), "code": row.code, "version": row.version},
        ip_address=get_client_ip(request),
    )
    return WarehouseLayoutSummary(
        id=row.id,
        code=row.code,
        version=row.version,
        is_active=row.is_active,
        warehouse_id=row.warehouse_id,
        spec_schema_version=row.spec_schema_version,
        lifecycle_status=row.lifecycle_status,
        published_at=row.published_at,
        activated_at=row.activated_at,
        created_at=row.created_at,
    )


@router.post(
    "/layout/{layout_id}/sync-route-graph",
    response_model=RouteGraphSyncResult,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def sync_route_graph_for_layout_revision(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    layout_id: uuid.UUID,
) -> Any:
    """Пересобрать граф маршрутов из топологии в spec указанной ревизии layout."""
    row = session.get(WarehouseLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout не найден")
    try:
        stats = sync_route_graph_from_topology(session, row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    session.commit()
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_layout.sync_route_graph",
        resource_type="warehouse_layout",
        resource_id=row.id,
        details=stats,
        ip_address=get_client_ip(request),
    )
    return RouteGraphSyncResult(warehouse_layout_id=row.id, **stats)


@router.post(
    "/layout/{layout_id}/archive",
    response_model=WarehouseLayoutSummary,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def archive_warehouse_layout(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    layout_id: uuid.UUID,
) -> Any:
    """Архивировать ревизию (нельзя активировать без повторной публикации)."""
    row = session.get(WarehouseLayout, layout_id)
    if not row:
        raise HTTPException(status_code=404, detail="Layout не найден")
    if row.is_active:
        raise HTTPException(status_code=400, detail="Сначала активируйте другую ревизию")
    row.lifecycle_status = LAYOUT_LIFECYCLE_ARCHIVED
    session.add(row)
    session.commit()
    session.refresh(row)
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_layout.archive",
        resource_type="warehouse_layout",
        resource_id=row.id,
        details={"code": row.code, "version": row.version},
        ip_address=get_client_ip(request),
    )
    return WarehouseLayoutSummary(
        id=row.id,
        code=row.code,
        version=row.version,
        is_active=row.is_active,
        warehouse_id=row.warehouse_id,
        spec_schema_version=row.spec_schema_version,
        lifecycle_status=row.lifecycle_status,
        published_at=row.published_at,
        activated_at=row.activated_at,
        created_at=row.created_at,
    )


@router.get("/route-graph")
def read_route_graph_for_active_layout(
    session: SessionDep, _current_user: CurrentUser
) -> dict[str, Any]:
    """
    Граф перемещений (узлы и рёбра) для **активной** ревизии layout — основа route planning.
    """
    layout = _active_layout_row(session)
    nodes = list(
        session.exec(
            select(RouteNode)
            .where(RouteNode.warehouse_layout_id == layout.id)
            .order_by(RouteNode.code)
        ).all()
    )
    edges = list(
        session.exec(
            select(RouteEdge).where(RouteEdge.warehouse_layout_id == layout.id)
        ).all()
    )
    return {
        "warehouse_layout_id": str(layout.id),
        "nodes": [
            {
                "id": str(n.id),
                "warehouse_id": str(n.warehouse_id),
                "code": n.code,
                "node_kind": n.node_kind,
                "floor_level": n.floor_level,
                "position": n.position,
                "extra": n.extra,
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": str(e.id),
                "warehouse_id": str(e.warehouse_id),
                "from_node_id": str(e.from_node_id),
                "to_node_id": str(e.to_node_id),
                "bidirectional": e.bidirectional,
                "weight": e.weight,
                "extra": e.extra,
            }
            for e in edges
        ],
        "counts": {"nodes": len(nodes), "edges": len(edges)},
    }


@router.get("/occupancy", response_model=WarehouseOccupancyResponse)
def read_warehouse_occupancy(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Проекция занятости ячеек (slot_key → item_id): легковесный ответ для twin/KPI.
    Без items.read_all — только ячейки товаров текущего пользователя.
    """
    stmt = select(WarehouseSlotOccupancy)
    if not can_see_all_items(session, current_user):
        stmt = stmt.where(WarehouseSlotOccupancy.owner_id == current_user.id)
    rows = list(session.exec(stmt).all())
    return WarehouseOccupancyResponse(
        data=[
            WarehouseSlotOccupancyEntry(slot_key=r.slot_key, item_id=r.item_id) for r in rows
        ],
        count=len(rows),
    )
