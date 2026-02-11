import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_change_status, can_see_all_items
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

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
) -> Any:
    """
    Retrieve items. Роли admin/manager/warehouse видят все, viewer — только свои.
    """
    if can_see_all_items(current_user):
        count_statement = select(func.count()).select_from(Item)
        if status:
            count_statement = count_statement.where(Item.status == status)
        count = session.exec(count_statement).one()
        statement = select(Item)
        if status:
            statement = statement.where(Item.status == status)
        statement = statement.offset(skip).limit(limit)
        items = session.exec(statement).all()
    else:
        count_statement = (
            select(func.count())
            .select_from(Item)
            .where(Item.owner_id == current_user.id)
        )
        if status:
            count_statement = count_statement.where(Item.status == status)
        count = session.exec(count_statement).one()
        statement = select(Item).where(Item.owner_id == current_user.id)
        if status:
            statement = statement.where(Item.status == status)
        statement = statement.offset(skip).limit(limit)
        items = session.exec(statement).all()

    return ItemsPublic(data=items, count=count)


def _get_item_or_404(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Item:
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not can_see_all_items(current_user) and (item.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return item


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
    session.add(item)
    session.commit()
    session.refresh(item)
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
    if "status" in update_dict and not can_change_status(current_user):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to change item status",
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
    for h in history_rows:
        session.add(h)
    session.commit()
    session.refresh(item)
    return item



@router.delete("/{id}")
def delete_item(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete an item.
    """
    item = _get_item_or_404(session, current_user, id)
    session.delete(item)
    session.commit()
    return Message(message="Item deleted successfully")
