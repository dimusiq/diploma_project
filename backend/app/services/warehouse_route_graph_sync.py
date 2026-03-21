"""Построение route_node / route_edge из топологии склада (проходы, доки)."""

from __future__ import annotations

import math
import re
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models import RouteEdge, RouteNode, Warehouse, WarehouseLayout
from app.schemas.warehouse_layout_spec import parse_warehouse_layout_spec
from app.schemas.warehouse_topology import (
    TopologyDocument,
    default_topology_from_layout_spec,
)


def _resolve_warehouse_id(session: Session, layout: WarehouseLayout) -> UUID:
    if layout.warehouse_id is not None:
        return layout.warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh is None:
        wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if wh is None:
        raise ValueError("Не найден склад для привязки узлов маршрута")
    return wh.id


def _safe_node_code(prefix: str, suffix: str, max_len: int = 64) -> str:
    raw = f"{prefix}_{suffix}"
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw).strip("_")
    if len(slug) <= max_len:
        return slug
    return slug[:max_len]


def _topology_for_layout(layout: WarehouseLayout) -> TopologyDocument:
    spec = layout.spec if isinstance(layout.spec, dict) else {}
    parsed = parse_warehouse_layout_spec(spec)
    if parsed.topology is not None:
        return parsed.topology
    return default_topology_from_layout_spec(spec)


def sync_route_graph_from_topology(session: Session, layout: WarehouseLayout) -> dict[str, int]:
    """
    Перезаписывает граф маршрутов для данной ревизии layout по текущей топологии в spec.

    Узлы: полилинии проходов (waypoint) и доки (dock). Рёбра — последовательные
    сегменты полилинии с весом как расстояние в нормализованной плоскости x-z.
    """
    lid = layout.id
    wid = _resolve_warehouse_id(session, layout)
    topo = _topology_for_layout(layout)

    edges_del = list(
        session.exec(select(RouteEdge).where(RouteEdge.warehouse_layout_id == lid)).all()
    )
    for e in edges_del:
        session.delete(e)
    nodes_del = list(
        session.exec(select(RouteNode).where(RouteNode.warehouse_layout_id == lid)).all()
    )
    for n in nodes_del:
        session.delete(n)
    session.flush()

    nodes_created = 0
    edges_created = 0

    def add_node(
        code: str,
        node_kind: str,
        position: dict[str, Any],
        extra: dict[str, Any] | None,
    ) -> RouteNode:
        nonlocal nodes_created
        n = RouteNode(
            warehouse_id=wid,
            warehouse_layout_id=lid,
            code=code,
            node_kind=node_kind,
            position=position,
            extra=extra,
        )
        session.add(n)
        session.flush()
        nodes_created += 1
        return n

    for i, d in enumerate(topo.docks):
        code = _safe_node_code("dock", f"{i}_{d.code}")
        add_node(
            code,
            "dock",
            {"x_norm": d.x_norm, "z_norm": d.z_norm, "yaw_deg": d.yaw_deg},
            {"topology_dock_id": d.id, "name": d.name, "dock_type": d.dock_type},
        )

    for ai, aisle in enumerate(topo.aisles):
        prev: RouteNode | None = None
        prev_pt: Any | None = None
        for pi, p in enumerate(aisle.polyline_norm):
            code = _safe_node_code("aisle", f"{ai}_{pi}")
            n = add_node(
                code,
                "waypoint",
                {"x_norm": p.x, "z_norm": p.z, "floor_level": 0},
                {
                    "topology_aisle_id": aisle.id,
                    "aisle_name": aisle.name,
                    "aisle_kind": aisle.kind,
                    "point_index": pi,
                },
            )
            if prev is not None and prev_pt is not None:
                w = float(math.hypot(p.x - prev_pt.x, p.z - prev_pt.z))
                if w <= 0:
                    w = 1e-6
                e = RouteEdge(
                    warehouse_id=wid,
                    warehouse_layout_id=lid,
                    from_node_id=prev.id,
                    to_node_id=n.id,
                    bidirectional=True,
                    weight=w,
                    extra={
                        "topology_aisle_id": aisle.id,
                        "segment_from": pi - 1,
                        "segment_to": pi,
                    },
                )
                session.add(e)
                edges_created += 1
            prev = n
            prev_pt = p

    return {
        "nodes_deleted": len(nodes_del),
        "edges_deleted": len(edges_del),
        "nodes_created": nodes_created,
        "edges_created": edges_created,
    }
