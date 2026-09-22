"""CRUD API for OutboundOrder (исходящие заказы) и operational-отгрузка."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    OutboundFulfillmentDetail,
    OutboundFulfillmentList,
    OutboundOrder,
    OutboundOrderCreate,
    OutboundOrderList,
    OutboundOrderPublic,
    OutboundOrderUpdate,
    Shipment,
    Warehouse,
)
from app.services.outbound_fulfillment import (
    READY_STATUS,
    SHIPPED_STATUS,
    list_board,
    related_tasks,
    resolve_outbound_id,
    ship_order,
    to_detail,
)

router = APIRouter(prefix="/outbound-orders", tags=["outbound-orders"])


def _resolve_warehouse_id(session: SessionDep, warehouse_id: uuid.UUID | None) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh:
            raise HTTPException(status_code=404, detail="Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if not wh:
        wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if not wh:
        raise HTTPException(status_code=500, detail="Не настроен ни один склад")
    return wh.id


@router.get("/ready-for-shipment", response_model=OutboundFulfillmentList)
def list_ready_for_shipment(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    customer: str | None = None,
    transport: str | None = None,
    ready_date: str | None = None,
) -> Any:
    return list_board(
        session,
        status=READY_STATUS,
        skip=skip,
        limit=limit,
        search=search,
        customer=customer,
        transport=transport,
        ready_date=ready_date,
    )


@router.get("/shipped-board", response_model=OutboundFulfillmentList)
def list_shipped_board(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    customer: str | None = None,
    transport: str | None = None,
    ready_date: str | None = None,
) -> Any:
    return list_board(
        session,
        status=SHIPPED_STATUS,
        skip=skip,
        limit=limit,
        search=search,
        customer=customer,
        transport=transport,
        ready_date=ready_date,
    )


@router.get("/resolve")
def resolve_outbound_order(
    session: SessionDep,
    _current_user: CurrentUser,
    sim_id: str = Query(min_length=1, max_length=128),
) -> Any:
    """Строковый идентификатор симуляции → UUID исходящего заказа WMS."""
    found = resolve_outbound_id(session, sim_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    return {"id": str(found)}


@router.get("/", response_model=OutboundOrderList)
def list_outbound_orders(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = None,
) -> Any:
    stmt = select(OutboundOrder)
    count_stmt = select(func.count()).select_from(OutboundOrder)
    if status:
        stmt = stmt.where(OutboundOrder.status == status)
        count_stmt = count_stmt.where(OutboundOrder.status == status)
    count = session.exec(count_stmt).one()
    rows = session.exec(
        stmt.order_by(OutboundOrder.created_at.desc()).offset(skip).limit(limit)
    ).all()
    return OutboundOrderList(data=rows, count=count)


@router.get("/{id}/fulfillment", response_model=OutboundFulfillmentDetail)
def get_outbound_fulfillment(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    order = session.get(OutboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    shipment = session.get(Shipment, order.shipment_id) if order.shipment_id else None
    return to_detail(session, order, shipment=shipment, tasks=related_tasks(session, order))


@router.post("/{id}/ship", response_model=OutboundFulfillmentDetail)
def ship_outbound_order(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    return ship_order(session, current_user, id)


@router.get("/{id}", response_model=OutboundOrderPublic)
def get_outbound_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    order = session.get(OutboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    return order


@router.post("/", response_model=OutboundOrderPublic)
def create_outbound_order(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    body: OutboundOrderCreate,
) -> Any:
    wid = _resolve_warehouse_id(session, body.warehouse_id)
    order = OutboundOrder(
        warehouse_id=wid,
        code=body.code,
        shipment_id=body.shipment_id,
        status=body.status,
        ship_by_at=body.ship_by_at,
        lines=body.lines,
        extra=body.extra,
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


@router.patch("/{id}", response_model=OutboundOrderPublic)
def update_outbound_order(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: OutboundOrderUpdate,
) -> Any:
    order = session.get(OutboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    update_data = body.model_dump(exclude_unset=True)
    order.sqlmodel_update(update_data)
    order.updated_at = datetime.now(timezone.utc)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


@router.delete("/{id}", response_model=Message)
def delete_outbound_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    order = session.get(OutboundOrder, id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    session.delete(order)
    session.commit()
    return Message(message="Исходящий заказ удалён")
