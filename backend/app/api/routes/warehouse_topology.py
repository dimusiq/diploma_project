"""Топология склада (зоны, проходы, буферы, доки) в spec активного layout."""

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_ZONES_MANAGE
from app.models import WarehouseLayout
from app.schemas.route_graph_sync import RouteGraphSyncBody, RouteGraphSyncResult
from app.schemas.warehouse_layout_spec import (
    canonical_spec_dict,
    parse_warehouse_layout_spec,
)
from app.schemas.warehouse_topology import (
    TopologyDocument,
    default_topology_from_layout_spec,
    parse_topology_from_spec,
)
from app.services.warehouse_route_graph_sync import sync_route_graph_from_topology

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


def _active_layout(session: Session) -> WarehouseLayout:
    row = session.exec(select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))).first()
    if not row:
        raise HTTPException(status_code=404, detail="Активная конфигурация склада не найдена")
    return row


@router.get("/topology", response_model=TopologyDocument)
def read_warehouse_topology(session: SessionDep, _current_user: CurrentUser) -> TopologyDocument:
    """Текущая топология или шаблон по числовому spec layout (если topology ещё не задана)."""
    layout = _active_layout(session)
    spec = layout.spec if isinstance(layout.spec, dict) else {}
    parsed = parse_topology_from_spec(spec)
    if parsed is not None:
        return parsed
    return default_topology_from_layout_spec(spec)


@router.put(
    "/topology",
    response_model=TopologyDocument,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def put_warehouse_topology(
    session: SessionDep,
    _current_user: CurrentUser,
    body: TopologyDocument,
) -> TopologyDocument:
    """Сохранить топологию в spec (канонический schema-driven JSON v1)."""
    layout = _active_layout(session)
    parsed = parse_warehouse_layout_spec(layout.spec if isinstance(layout.spec, dict) else {})
    parsed.topology = body
    layout.spec = canonical_spec_dict(parsed)
    layout.spec_schema_version = parsed.schema_version
    flag_modified(layout, "spec")
    session.add(layout)
    session.commit()
    session.refresh(layout)
    return body


@router.post(
    "/topology/reset-defaults",
    response_model=TopologyDocument,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def reset_warehouse_topology_defaults(
    session: SessionDep,
    _current_user: CurrentUser,
) -> TopologyDocument:
    """Перезаписать topology шаблоном из текущей геометрии spec."""
    layout = _active_layout(session)
    spec_raw = layout.spec if isinstance(layout.spec, dict) else {}
    doc = default_topology_from_layout_spec(spec_raw)
    parsed = parse_warehouse_layout_spec(spec_raw)
    parsed.topology = doc
    layout.spec = canonical_spec_dict(parsed)
    layout.spec_schema_version = parsed.schema_version
    flag_modified(layout, "spec")
    session.add(layout)
    session.commit()
    session.refresh(layout)
    return doc


@router.post(
    "/topology/sync-route-graph",
    response_model=RouteGraphSyncResult,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def post_topology_sync_route_graph(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: RouteGraphSyncBody | None = Body(default=None),
) -> Any:
    """
    Пересобрать `route_node` / `route_edge` из топологии в spec выбранной ревизии
    (по умолчанию — активной).
    """
    body = body or RouteGraphSyncBody()
    if body.warehouse_layout_id is not None:
        layout = session.get(WarehouseLayout, body.warehouse_layout_id)
        if not layout:
            raise HTTPException(status_code=404, detail="Layout не найден")
    else:
        layout = _active_layout(session)
    try:
        stats = sync_route_graph_from_topology(session, layout)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    session.commit()
    log_audit(
        session,
        user_id=current_user.id,
        action="warehouse_topology.sync_route_graph",
        resource_type="warehouse_layout",
        resource_id=layout.id,
        details=stats,
        ip_address=get_client_ip(request),
    )
    return RouteGraphSyncResult(warehouse_layout_id=layout.id, **stats)
