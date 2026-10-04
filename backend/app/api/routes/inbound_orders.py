"""CRUD API for InboundOrder (входящие заказы) + операция приёмки."""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    InboundOrder,
    InboundOrderCreate,
    InboundOrderList,
    InboundOrderPublic,
    InboundOrderUpdate,
    InboundReceiveLineRequest,
    InboundReceiveLineResult,
    Message,
    Warehouse,
)
from app.services.inbound_planning import plan_inbound_putaways
from app.services.inbound_receiving import close_receiving, receive_line

router = APIRouter(prefix="/inbound-orders", tags=["inbound-orders"])


def _resolve_warehouse_id(
    session: SessionDep, warehouse_id: uuid.UUID | None
) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh:
            raise HTTPException(status_code=404, detail="Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if not wh:
        wh = session.exec(select(Warehouse).order_by(col(Warehouse.created_at))).first()
    if not wh:
        raise HTTPException(status_code=500, detail="Не настроен ни один склад")
    return wh.id


@router.get("/", response_model=InboundOrderList)
def list_inbound_orders(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = None,
) -> Any:
    stmt = select(InboundOrder)
    count_stmt = select(func.count()).select_from(InboundOrder)
    if status:
        stmt = stmt.where(InboundOrder.status == status)
        count_stmt = count_stmt.where(InboundOrder.status == status)
    count = session.exec(count_stmt).one()
    rows = session.exec(
        stmt.order_by(col(InboundOrder.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return InboundOrderList(data=rows, count=count)


@router.get("/{id}", response_model=InboundOrderPublic)
def get_inbound_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    order = session.get(InboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Входящий заказ не найден")
    return order


@router.post("/", response_model=InboundOrderPublic)
def create_inbound_order(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    body: InboundOrderCreate,
) -> Any:
    wid = _resolve_warehouse_id(session, body.warehouse_id)
    order = InboundOrder(
        warehouse_id=wid,
        code=body.code,
        shipment_id=body.shipment_id,
        status=body.status,
        expected_at=body.expected_at,
        lines=body.lines,
        extra=body.extra,
    )
    session.add(order)
    session.flush()
    try:
        # Putaway появится после receive-line (факт приёмки).
        plan_inbound_putaways(session, order)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(order)
    return order


@router.patch("/{id}", response_model=InboundOrderPublic)
def update_inbound_order(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: InboundOrderUpdate,
) -> Any:
    order = session.get(InboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Входящий заказ не найден")
    update_data = body.model_dump(exclude_unset=True)
    order.sqlmodel_update(update_data)
    order.updated_at = datetime.now(timezone.utc)
    session.add(order)
    session.flush()
    try:
        plan_inbound_putaways(session, order)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(order)
    return order


@router.post(
    "/{id}/receive-line",
    response_model=InboundReceiveLineResult,
)
def receive_inbound_line(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: InboundReceiveLineRequest,
) -> Any:
    order = session.get(InboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Входящий заказ не найден")
    if body.line_index is None and not body.line_key:
        raise HTTPException(
            status_code=422, detail="Укажите line_index или line_key"
        )
    try:
        result = receive_line(
            session,
            order,
            received_quantity=body.received_quantity,
            actor_user_id=current_user.id,
            line_index=body.line_index,
            line_key=body.line_key,
            discrepancy_type=body.discrepancy_type,
            discrepancy_reason=body.discrepancy_reason,
            damage_quantity=body.damage_quantity,
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(order)
    item_raw = result.get("item_id")
    item_id = uuid.UUID(str(item_raw)) if item_raw else None
    return InboundReceiveLineResult(
        order=InboundOrderPublic.model_validate(order),
        line_index=int(result["line_index"]),
        line_key=str(result["line_key"]),
        item_id=item_id,
        discrepancy=result.get("discrepancy"),
        putaway_created=int(result.get("putaway_created") or 0),
        putaway_task_ids=list(result.get("putaway_task_ids") or []),
        idempotent=bool(result.get("idempotent")),
    )


@router.post("/{id}/close-receiving", response_model=InboundOrderPublic)
def close_inbound_receiving(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    order = session.get(InboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Входящий заказ не найден")
    try:
        close_receiving(session, order, actor_user_id=current_user.id)
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(order)
    return order


@router.delete("/{id}", response_model=Message)
def delete_inbound_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    order = session.get(InboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Входящий заказ не найден")
    session.delete(order)
    session.commit()
    return Message(message="Входящий заказ удалён")
