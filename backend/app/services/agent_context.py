"""Сборка read-only контекста склада для LLM (агрегаты layout/остатков + срез истории событий)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.permissions import can_read_audit, can_see_all_items
from app.models import (
    EQUIPMENT_TYPES,
    DomainEvent,
    Equipment,
    Item,
    TwinQueueDepthProjection,
    User,
    WarehouseLayout,
    WarehouseSlotOccupancy,
)
from app.schemas.warehouse_layout_spec import try_parse_warehouse_layout_spec


def build_warehouse_context_for_user(session: Session, user: User) -> str:
    """Текстовый блок фактов, видимых пользователю (те же границы, что у списка товаров)."""
    lines: list[str] = []

    layout = session.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    if layout:
        spec = layout.spec
        parsed = try_parse_warehouse_layout_spec(spec if isinstance(spec, dict) else None)
        if parsed:
            g = parsed.geometry
            lines.append(
                f"Активный layout склада: code={layout.code}, version={layout.version}, "
                f"lifecycle={layout.lifecycle_status}, spec_schema_version={layout.spec_schema_version}, "
                f"rows={g.rows}, levels={g.levels}, cellX={g.cellX}, cellZ={g.cellZ}."
            )
        else:
            lines.append(
                f"Активный layout склада: code={layout.code}, version={layout.version} "
                f"(spec не удалось разобрать по схеме)."
            )
    else:
        lines.append("Активный layout склада в системе не задан.")

    see_all = can_see_all_items(session, user)
    item_stmt = select(func.count()).select_from(Item)
    if not see_all:
        item_stmt = item_stmt.where(Item.owner_id == user.id)
    total_items = session.exec(item_stmt).one()

    wh_stmt = select(func.count()).select_from(Item).where(Item.status == "warehouse")
    if not see_all:
        wh_stmt = wh_stmt.where(Item.owner_id == user.id)
    on_warehouse = session.exec(wh_stmt).one()

    placed_stmt = select(func.count()).select_from(Item).where(
        Item.storage_row.is_not(None),
        Item.storage_level.is_not(None),
        Item.storage_cell_x.is_not(None),
        Item.storage_cell_z.is_not(None),
    )
    if not see_all:
        placed_stmt = placed_stmt.where(Item.owner_id == user.id)
    with_cell = session.exec(placed_stmt).one()

    lines.append(
        f"Товары (в пределах вашего доступа): всего {total_items}, "
        f"со статусом «на складе» {on_warehouse}, с указанной ячейкой хранения {with_cell}."
    )

    occ_stmt = select(func.count()).select_from(WarehouseSlotOccupancy)
    if not see_all:
        occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
    occ = session.exec(occ_stmt).one()
    lines.append(
        f"Занятых ячеек в проекции (slot_key → item): {occ}. "
        "Проекция — read-модель; при расхождении с карточкой товара опирайся на инструменты (ячейка/остаток)."
    )

    eq_stmt = (
        select(func.count())
        .select_from(Equipment)
        .where(col(Equipment.equipment_type).in_(EQUIPMENT_TYPES))
    )
    total_equipment = int(session.exec(eq_stmt).one())
    lines.append(
        f"Складская техника (раздел «Техника»): в учёте {total_equipment} единиц; "
        "подробности по моделям и operational status в карточке — get_equipment_status "
        "(поля total_units, operational_status_breakdown_ru). Просрочка/скоро по плановому ТО "
        "по моточасам — отдельно get_maintenance_calendar_events, не выводить из get_equipment_status."
    )

    if see_all:
        lines.append("Доступ: вы видите товары всех пользователей (роль с правом items.read_all).")
    else:
        lines.append("Доступ: вы видите только свои товары.")

    return "\n".join(lines)


def build_historical_domain_events_block(
    session: Session, user: User
) -> tuple[str | None, dict[str, Any]]:
    """
    Краткая метрика по domain events для промпта агента (п.7 «исторические события»).
    Только при праве audit.read — как у инструмента get_recent_events.
    """
    meta: dict[str, Any] = {
        "historical_domain_events": False,
        "domain_events_24h_total": None,
        "domain_events_top_types_7d": 0,
    }
    if not can_read_audit(session, user):
        return None, meta

    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)

    n24 = session.exec(
        select(func.count())
        .select_from(DomainEvent)
        .where(col(DomainEvent.occurred_at) >= since_24h)
    ).one()
    cnt = func.count().label("n")
    stmt = (
        select(DomainEvent.event_type, cnt)
        .where(col(DomainEvent.occurred_at) >= since_7d)
        .group_by(DomainEvent.event_type)
        .order_by(cnt.desc())
        .limit(15)
    )
    top_rows = list(session.exec(stmt).all())
    meta["historical_domain_events"] = True
    meta["domain_events_24h_total"] = int(n24)
    meta["domain_events_top_types_7d"] = len(top_rows)

    parts = [
        "История и метрики (domain events, срез для анализа; детали — инструмент get_recent_events):",
        f"За последние 24 ч событий: {int(n24)}.",
        "За 7 суток топ типов по частоте:",
    ]
    if top_rows:
        for et, n in top_rows:
            parts.append(f"  - {et}: {int(n)}")
    else:
        parts.append("  (нет событий за окно)")

    return "\n".join(parts), meta


def build_twin_queue_depth_snapshot_block(
    session: Session,
) -> tuple[str | None, dict[str, Any]]:
    """
    Снимок twin: проекции глубины очередей для склада активного layout (фаза Observe).
    """
    meta: dict[str, Any] = {
        "twin_queue_projections": False,
        "twin_queue_projection_rows": 0,
    }
    layout = session.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    if layout is None:
        return None, meta
    wh_id = layout.warehouse_id
    rows = list(
        session.exec(
            select(TwinQueueDepthProjection).where(
                TwinQueueDepthProjection.warehouse_id == wh_id
            )
        ).all()
    )
    if not rows:
        meta["twin_queue_projections"] = True
        return (
            "Снимок twin (проекции очередей): для активного склада записей нет.",
            meta,
        )
    meta["twin_queue_projections"] = True
    meta["twin_queue_projection_rows"] = len(rows)
    lines = [
        "Снимок twin (проекции глубины очередей, read-only; склад активного layout):",
    ]
    for r in sorted(rows, key=lambda x: x.queue_name):
        lines.append(f"  {r.queue_name}: depth={int(r.depth)}")
    return "\n".join(lines), meta
