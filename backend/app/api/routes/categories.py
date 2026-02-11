import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Category, CategoryCreate, CategoryPublic, CategoryUpdate, Message

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryPublic])
def read_categories(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Список категорий (для выбора в формах и фильтрах).
    """
    return list(session.exec(select(Category)).all())


@router.get("/{id}", response_model=CategoryPublic)
def read_category(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Получить категорию по ID.
    """
    category = session.get(Category, id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post(
    "/",
    response_model=CategoryPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_category(
    *, session: SessionDep, category_in: CategoryCreate
) -> Any:
    """
    Создать категорию (только суперпользователь).
    """
    category = Category.model_validate(category_in)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.put(
    "/{id}",
    response_model=CategoryPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def update_category(
    *, session: SessionDep, id: uuid.UUID, category_in: CategoryUpdate
) -> Any:
    """
    Обновить категорию (только суперпользователь).
    """
    category = session.get(Category, id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    update_dict = category_in.model_dump(exclude_unset=True)
    category.sqlmodel_update(update_dict)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_category(session: SessionDep, id: uuid.UUID) -> Any:
    """
    Удалить категорию (только суперпользователь).
    У дочерних категорий parent_id станет null. У товаров category_id станет null.
    """
    category = session.get(Category, id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    session.delete(category)
    session.commit()
    return Message(message="Category deleted")
