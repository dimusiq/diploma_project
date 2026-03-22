"""Стартовое состояние DES из проекций очередей twin (TwinQueueDepthProjection)."""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.models import TwinQueueDepthProjection, User, Warehouse
from app.services.warehouse_twin_metrics import build_twin_summary_dict


class TwinSeedResolutionError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


MAX_INITIAL_QUEUE_TOTAL = 500


def classify_queue_for_des(queue_name: str) -> str | None:
    """Сопоставление имени очереди с ветками DES: dock | putaway | pick."""
    n = queue_name.lower().strip()
    if not n:
        return None
    if "pick" in n:
        return "pick"
    if "putaway" in n or "staging" in n:
        return "putaway"
    if (
        "dock" in n
        or "gate" in n
        or "inbound" in n
        or "yard" in n
        or n in {"receiving", "unload"}
    ):
        return "dock"
    return None


def resolve_simulation_warehouse_id(
    session: Session, warehouse_id: uuid.UUID | None
) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if wh is None:
            raise TwinSeedResolutionError(404, "Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if wh is None:
        raise TwinSeedResolutionError(400, "В системе нет складов")
    return wh.id


def initial_queues_from_twin_projections(
    session: Session, warehouse_id: uuid.UUID
) -> tuple[int, int, int, list[dict[str, object]]]:
    rows = list(
        session.exec(
            select(TwinQueueDepthProjection).where(
                TwinQueueDepthProjection.warehouse_id == warehouse_id
            )
        ).all()
    )
    dock = put = pick = 0
    detail: list[dict[str, object]] = []
    for r in rows:
        cat = classify_queue_for_des(r.queue_name)
        d = max(0, int(r.depth))
        detail.append(
            {
                "queue_name": r.queue_name,
                "depth": r.depth,
                "category": cat,
            }
        )
        if cat == "dock":
            dock += d
        elif cat == "putaway":
            put += d
        elif cat == "pick":
            pick += d
    dock = min(dock, MAX_INITIAL_QUEUE_TOTAL)
    put = min(put, MAX_INITIAL_QUEUE_TOTAL)
    pick = min(pick, MAX_INITIAL_QUEUE_TOTAL)
    return dock, put, pick, detail


def build_twin_initial_state_payload(
    session: Session,
    user: User,
    warehouse_id: uuid.UUID,
    initial_dock: int,
    initial_putaway: int,
    initial_pick: int,
    queue_rows: list[dict[str, object]],
) -> dict[str, object]:
    wh = session.get(Warehouse, warehouse_id)
    summary = build_twin_summary_dict(session, user)
    return {
        "warehouse_id": str(warehouse_id),
        "warehouse_code": wh.code if wh else None,
        "warehouse_name": wh.name if wh else None,
        "twin_summary": {
            "occupied_slots": summary.get("occupied_slots"),
            "layout_capacity_cells": summary.get("layout_capacity_cells"),
            "slot_utilization_ratio": summary.get("slot_utilization_ratio"),
        },
        "initial_dock_queue": initial_dock,
        "initial_putaway_queue": initial_putaway,
        "initial_pick_queue": initial_pick,
        "queue_projection_rows": queue_rows,
    }
