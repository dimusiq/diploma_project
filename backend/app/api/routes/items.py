import csv
import io
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from app.api.deps import CurrentUser, SessionDep, get_user_from_token_string
from app.core.db import engine
from app.core.permissions import can_change_status, can_see_all_items
from app.core.storage_slot import (
    format_storage_slot_key,
    storage_coordinates_partial,
)
from app.models import (
    Item,
    ItemCreate,
    ItemHistory,
    ItemHistoryList,
    ItemHistoryPublic,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
    Message,
)
from app.realtime.item_sse_hub import (
    items_sse_stream,
    publish_items_changed,
    subscribe_items_queue,
    unsubscribe_items_queue,
)
from app.realtime.twin_stream_hub import (
    publish_item_movement,
    publish_occupancy_changed,
)
from app.services.domain_events import (
    EVENT_ITEM_CREATED,
    EVENT_ITEM_DELETED,
    EVENT_ITEM_STATUS_CHANGED,
    EVENT_ITEM_STORAGE_UPDATED,
    emit_domain_event,
)
from app.services.pdf_service import build_label_pdf, build_shipping_note_pdf
from app.services.warehouse_slot_projection import sync_projection_for_item

router = APIRouter(prefix="/items", tags=["items"])

_ITEM_STORAGE_UQ = "uq_item_storage_cell_when_full"

# Допустимые переходы статусов: только по цепочке incoming → warehouse → shipment → shipped
ALLOWED_STATUS_TRANSITIONS: dict[str, list[str]] = {
    "incoming": ["warehouse"],
    "warehouse": ["shipment"],
    "shipment": ["shipped"],
}


def _allowed_next_statuses(current: str) -> list[str]:
    return ALLOWED_STATUS_TRANSITIONS.get(current, [])


class ShippingNoteRequest(BaseModel):
    """Тело запроса для печати накладной."""
    item_ids: list[uuid.UUID]


def _item_filters(
    statement: Any,
    *,
    status: str | None,
    search: str | None,
    category_id: uuid.UUID | None,
    created_at_from: date | None,
    created_at_to: date | None,
) -> Any:
    if status:
        statement = statement.where(Item.status == status)
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    if search and search.strip():
        q = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Item.title.ilike(q),
                Item.description.ilike(q),
                Item.sku.ilike(q),
                Item.barcode.ilike(q),
            )
        )
    if created_at_from is not None:
        dt_from = datetime.combine(created_at_from, time.min).replace(tzinfo=timezone.utc)
        statement = statement.where(Item.created_at >= dt_from)
    if created_at_to is not None:
        dt_to = datetime.combine(created_at_to + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
        statement = statement.where(Item.created_at < dt_to)
    return statement


_VALID_SORT_FIELDS = {"title", "created_at", "quantity", "sku", "description", "unit"}


def _apply_order(statement: Any, sort_by: str | None, sort_order: str | None) -> Any:
    if not sort_by or sort_by not in _VALID_SORT_FIELDS:
        sort_by = "created_at"
    if sort_order not in ("asc", "desc"):
        sort_order = "desc"
    col = getattr(Item, sort_by)
    return statement.order_by(col.desc() if sort_order == "desc" else col.asc())


@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = None,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    created_at_from: date | None = None,
    created_at_to: date | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> Any:
    """
    Retrieve items. Роли admin/manager/warehouse видят все, viewer — только свои.
    Фильтры: status, search, category_id, created_at_from, created_at_to.
    Сортировка: sort_by (title, created_at, quantity, sku), sort_order (asc, desc).
    """
    filters = {
        "status": status,
        "search": search,
        "category_id": category_id,
        "created_at_from": created_at_from,
        "created_at_to": created_at_to,
    }
    if can_see_all_items(session, current_user):
        count_statement = select(func.count()).select_from(Item)
        count_statement = _item_filters(count_statement, **filters)
        count = session.exec(count_statement).one()
        statement = select(Item)
        statement = _item_filters(statement, **filters)
        statement = _apply_order(statement, sort_by, sort_order)
        statement = statement.offset(skip).limit(limit)
        items = session.exec(statement).all()
    else:
        count_statement = (
            select(func.count())
            .select_from(Item)
            .where(Item.owner_id == current_user.id)
        )
        count_statement = _item_filters(count_statement, **filters)
        count = session.exec(count_statement).one()
        statement = select(Item).where(Item.owner_id == current_user.id)
        statement = _item_filters(statement, **filters)
        statement = _apply_order(statement, sort_by, sort_order)
        statement = statement.offset(skip).limit(limit)
        items = session.exec(statement).all()

    return ItemsPublic(data=items, count=count)


@router.get("/stream")
async def items_realtime_sse(_current_user: CurrentUser) -> StreamingResponse:
    """SSE: события об изменении товаров (`type`: `items_updated`). Heartbeat — comment ping."""
    return StreamingResponse(
        items_sse_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def items_realtime_ws(websocket: WebSocket) -> None:
    """WebSocket: те же события, что и SSE. Токен: query `token` или `access_token`."""
    token = websocket.query_params.get("token") or websocket.query_params.get(
        "access_token"
    )
    if not token:
        await websocket.close(code=1008)
        return
    with Session(engine) as session:
        user = get_user_from_token_string(session, token)
    if user is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    q = subscribe_items_queue()
    try:
        while True:
            msg = await q.get()
            await websocket.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe_items_queue(q)


def _items_for_export(
    session: Any,
    current_user: CurrentUser,
    status: str | None,
    search: str | None,
    category_id: uuid.UUID | None,
    created_at_from: date | None,
    created_at_to: date | None,
) -> list[Item]:
    """Items list with same filters as read_items, no limit (for export)."""
    filters = {
        "status": status,
        "search": search,
        "category_id": category_id,
        "created_at_from": created_at_from,
        "created_at_to": created_at_to,
    }
    if can_see_all_items(session, current_user):
        statement = select(Item)
    else:
        statement = select(Item).where(Item.owner_id == current_user.id)
    statement = _item_filters(statement, **filters)
    statement = _apply_order(statement, "created_at", "desc")
    return list(session.exec(statement).all())


@router.get("/export")
def export_items(
    session: SessionDep,
    current_user: CurrentUser,
    format: str = "csv",
    status: str | None = None,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    created_at_from: date | None = None,
    created_at_to: date | None = None,
    item_ids: list[uuid.UUID] | None = Query(None),
) -> Response:
    """
    Экспорт товаров в CSV или XLSX.
    Параметры: format=csv|xlsx, item_ids (опционально — выгрузить только выбранные),
    иначе status, search, category_id, created_at_from, created_at_to.
    """
    if format not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be csv or xlsx")
    if item_ids:
        statement = select(Item).where(Item.id.in_(item_ids))
        if not can_see_all_items(session, current_user):
            statement = statement.where(Item.owner_id == current_user.id)
        statement = _apply_order(statement, "created_at", "desc")
        items = list(session.exec(statement).all())
    else:
        items = _items_for_export(
            session, current_user, status, search, category_id, created_at_from, created_at_to
        )
    headers_ru: list[str] = [
        "ID", "Название", "Описание", "Кол-во", "Артикул", "Штрихкод", "Ед. изм.",
        "Срок годности", "Местоположение", "Статус", "Категория", "Дата создания", "Владелец (ID)",
    ]

    def _row(item: Item) -> list[str]:
        return [
            str(item.id),
            item.title or "",
            item.description or "",
            str(item.quantity),
            item.sku or "",
            item.barcode or "",
            item.unit or "",
            item.expires_at.isoformat() if item.expires_at else "",
            item.location or "",
            item.status or "",
            str(item.category_id) if item.category_id else "",
            item.created_at.isoformat() if item.created_at else "",
            str(item.owner_id),
        ]

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers_ru)
        for item in items:
            writer.writerow(_row(item))
        return Response(
            content=buf.getvalue().encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=items_export.csv"},
        )

    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Failed to create workbook")
    ws.title = "Товары"

    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_alignment = Alignment(vertical="center", wrap_text=True)

    ws.append(headers_ru)
    for item in items:
        ws.append(_row(item))

    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers_ru)):
        for cell in row:
            cell.border = thin_border
            cell.alignment = cell_alignment
            if cell.row == 1:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_alignment

    for col_idx in range(1, len(headers_ru) + 1):
        col_letter = get_column_letter(col_idx)
        max_len = max(
            (len(str(c.value or "")) for c in ws[col_letter]),
            default=10,
        )
        ws.column_dimensions[col_letter].width = min(50, max(max_len + 2, 12))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=items_export.xlsx"},
    )


def _get_item_or_404(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Item:
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not can_see_all_items(session, current_user) and (item.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return item


def _validate_item_storage_coordinates(item: Item) -> None:
    if storage_coordinates_partial(
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Укажите все параметры ячейки (ряд, уровень, позиция X, позиция Z) "
                "или оставьте хранение пустым."
            ),
        )


def _storage_event_payload(
    row: int | None,
    level: int | None,
    cell_x: int | None,
    cell_z: int | None,
) -> dict[str, Any] | None:
    if row is None and level is None and cell_x is None and cell_z is None:
        return None
    return {
        "storage_row": row,
        "storage_level": level,
        "storage_cell_x": cell_x,
        "storage_cell_z": cell_z,
        "slot_key": format_storage_slot_key(row, level, cell_x, cell_z),
    }


def _commit_item_session_or_conflict(session: SessionDep) -> None:
    try:
        session.commit()
    except IntegrityError as e:
        session.rollback()
        diag = getattr(getattr(e, "orig", None), "diag", None)
        cname = getattr(diag, "constraint_name", None) if diag is not None else None
        if cname == _ITEM_STORAGE_UQ:
            raise HTTPException(
                status_code=409,
                detail="Ячейка уже занята другим товаром (конфликт при сохранении).",
            ) from e
        raise


def _cell_is_occupied(
    session: SessionDep,
    storage_row: int,
    storage_level: int,
    storage_cell_x: int,
    storage_cell_z: int,
    exclude_item_id: uuid.UUID | None = None,
) -> bool:
    """Проверяет, занята ли ячейка другим товаром."""
    stmt = select(Item).where(
        Item.storage_row == storage_row,
        Item.storage_level == storage_level,
        Item.storage_cell_x == storage_cell_x,
        Item.storage_cell_z == storage_cell_z,
    )
    if exclude_item_id is not None:
        stmt = stmt.where(Item.id != exclude_item_id)
    return session.exec(stmt).first() is not None


def _barcode_exists(
    session: SessionDep, barcode: str, exclude_item_id: uuid.UUID | None = None
) -> bool:
    """Проверяет, занят ли штрихкод другим товаром (barcode не пустой)."""
    if not barcode or not barcode.strip():
        return False
    stmt = select(Item).where(Item.barcode == barcode.strip())
    if exclude_item_id is not None:
        stmt = stmt.where(Item.id != exclude_item_id)
    return session.exec(stmt).first() is not None


@router.post("/shipping-note-pdf")
def shipping_note_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    body: ShippingNoteRequest,
) -> Response:
    """
    Генерация PDF накладной по списку товаров (для отгрузки).
    Передайте item_ids — возвращается PDF.
    """
    if not body.item_ids:
        raise HTTPException(status_code=400, detail="item_ids не может быть пустым")
    items: list[Item] = []
    for item_id in body.item_ids:
        item = session.get(Item, item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
        if not can_see_all_items(session, current_user) and item.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        items.append(item)
    pdf_bytes = build_shipping_note_pdf(items)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=shipping-note.pdf"},
    )


@router.get("/{id}/label-pdf")
def label_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Response:
    """
    Генерация PDF этикетки товара (со штрихкодом при наличии barcode).
    """
    item = _get_item_or_404(session, current_user, id)
    pdf_bytes = build_label_pdf(item)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=label.pdf"},
    )


@router.get("/{id}/history", response_model=ItemHistoryList)
def read_item_history(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    История изменений товара (владелец или суперпользователь).
    """
    _get_item_or_404(session, current_user, id)
    rows = list(
        session.exec(
            select(ItemHistory).where(ItemHistory.item_id == id).order_by(ItemHistory.changed_at.desc())
        ).all()
    )
    return ItemHistoryList(
        data=[ItemHistoryPublic.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.get("/{id}", response_model=ItemPublic)
def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get item by ID.
    """
    return _get_item_or_404(session, current_user, id)


@router.post("/", response_model=ItemPublic)
def create_item(
    *, session: SessionDep, current_user: CurrentUser, item_in: ItemCreate
) -> Any:
    """
    Create new item.
    """
    item = Item.model_validate(item_in, update={"owner_id": current_user.id})
    if item.barcode and _barcode_exists(session, item.barcode):
        raise HTTPException(
            status_code=400,
            detail="Штрихкод уже используется другим товаром. Укажите другой или оставьте пустым.",
        )
    _validate_item_storage_coordinates(item)
    if (
        item.storage_row is not None
        and item.storage_level is not None
        and item.storage_cell_x is not None
        and item.storage_cell_z is not None
    ):
        if _cell_is_occupied(
            session,
            item.storage_row,
            item.storage_level,
            item.storage_cell_x,
            item.storage_cell_z,
        ):
            raise HTTPException(
                status_code=400,
                detail="Ячейка уже занята. Выберите другую ячейку хранения.",
            )
    session.add(item)
    session.flush()
    emit_domain_event(
        session,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=current_user.id,
        payload={
            "title": item.title,
            "status": item.status,
            "storage": _storage_event_payload(
                item.storage_row,
                item.storage_level,
                item.storage_cell_x,
                item.storage_cell_z,
            ),
        },
    )
    sync_projection_for_item(session, item)
    _commit_item_session_or_conflict(session)
    session.refresh(item)
    publish_items_changed()
    publish_item_movement(item_id=item.id, reason="created")
    publish_occupancy_changed()
    return item


def _str_val(v: Any) -> str:
    return "" if v is None else str(v)


@router.put("/{id}", response_model=ItemPublic)
def update_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    item_in: ItemUpdate,
) -> Any:
    """
    Update an item. Смена статуса только у ролей admin/manager/warehouse (viewer — нет).
    """
    item = _get_item_or_404(session, current_user, id)
    update_dict = item_in.model_dump(exclude_unset=True)
    if "status" in update_dict and not can_change_status(session, current_user):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to change item status",
        )
    if "status" in update_dict:
        new_status = update_dict["status"]
        allowed = _allowed_next_statuses(item.status)
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status transition: {item.status} → {new_status}. Allowed: {allowed}",
            )
        if new_status == "warehouse":
            # При переводе на склад обязательна полная ячейка хранения
            storage_row = update_dict.get("storage_row", item.storage_row)
            storage_level = update_dict.get("storage_level", item.storage_level)
            storage_cell_x = update_dict.get("storage_cell_x", item.storage_cell_x)
            storage_cell_z = update_dict.get("storage_cell_z", item.storage_cell_z)
            if (
                storage_row is None
                or storage_level is None
                or storage_cell_x is None
                or storage_cell_z is None
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Для перемещения на склад укажите ячейку хранения "
                        "(ряд, уровень, позиция X и Z) в карточке товара."
                    ),
                )
    correlation_id = uuid.uuid4()
    old_status = item.status
    old_storage = (
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )
    # Аудит: до применения изменений сохраняем старые значения
    history_rows = []
    for k in update_dict:
        old = getattr(item, k, None)
        new = update_dict[k]
        history_rows.append(
            ItemHistory(
                item_id=item.id,
                user_id=current_user.id,
                field_name=k,
                old_value=_str_val(old),
                new_value=_str_val(new),
            )
        )
    item.sqlmodel_update(update_dict)
    session.add(item)
    if item.barcode and _barcode_exists(session, item.barcode, exclude_item_id=item.id):
        raise HTTPException(
            status_code=400,
            detail="Штрихкод уже используется другим товаром. Укажите другой или оставьте пустым.",
        )
    _validate_item_storage_coordinates(item)
    if (
        item.storage_row is not None
        and item.storage_level is not None
        and item.storage_cell_x is not None
        and item.storage_cell_z is not None
    ):
        if _cell_is_occupied(
            session,
            item.storage_row,
            item.storage_level,
            item.storage_cell_x,
            item.storage_cell_z,
            exclude_item_id=item.id,
        ):
            raise HTTPException(
                status_code=400,
                detail="Ячейка уже занята другим товаром. Выберите другую ячейку хранения.",
            )
    new_storage = (
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )
    if new_storage != old_storage:
        emit_domain_event(
            session,
            event_type=EVENT_ITEM_STORAGE_UPDATED,
            aggregate_type="item",
            aggregate_id=item.id,
            actor_user_id=current_user.id,
            correlation_id=correlation_id,
            payload={
                "from": _storage_event_payload(*old_storage),
                "to": _storage_event_payload(*new_storage),
            },
        )
    if item.status != old_status:
        emit_domain_event(
            session,
            event_type=EVENT_ITEM_STATUS_CHANGED,
            aggregate_type="item",
            aggregate_id=item.id,
            actor_user_id=current_user.id,
            correlation_id=correlation_id,
            payload={"from": old_status, "to": item.status},
        )
    for h in history_rows:
        session.add(h)
    sync_projection_for_item(session, item)
    _commit_item_session_or_conflict(session)
    session.refresh(item)
    publish_items_changed()
    publish_item_movement(item_id=item.id, reason="updated")
    publish_occupancy_changed()
    return item



@router.delete("/{id}")
def delete_item(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete an item.
    """
    item = _get_item_or_404(session, current_user, id)
    emit_domain_event(
        session,
        event_type=EVENT_ITEM_DELETED,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=current_user.id,
        payload={
            "title": item.title,
            "status": item.status,
            "storage": _storage_event_payload(
                item.storage_row,
                item.storage_level,
                item.storage_cell_x,
                item.storage_cell_z,
            ),
        },
    )
    iid = item.id
    session.delete(item)
    _commit_item_session_or_conflict(session)
    publish_items_changed()
    publish_item_movement(item_id=iid, reason="deleted")
    publish_occupancy_changed()
    return Message(message="Item deleted successfully")
