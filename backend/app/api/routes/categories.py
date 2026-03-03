import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_CATEGORIES_MANAGE
from app.models import Category, CategoryCreate, CategoryPublic, CategoryUpdate, Message

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryPublic])
def read_categories(session: SessionDep, _current_user: CurrentUser) -> Any:
    """
    Список категорий (для выбора в формах и фильтрах).
    """
    return list(session.exec(select(Category)).all())


@router.get("/{id}", response_model=CategoryPublic)
def read_category(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
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
    dependencies=[require_permission(PERM_CATEGORIES_MANAGE)],
)
def create_category(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    category_in: CategoryCreate,
) -> Any:
    """
    Создать категорию.
    """
    category = Category.model_validate(category_in)
    session.add(category)
    session.commit()
    session.refresh(category)
    log_audit(
        session,
        user_id=current_user.id,
        action="category.create",
        resource_type="category",
        resource_id=category.id,
        details={"name": category.name},
        ip_address=get_client_ip(request),
    )
    return category


@router.put(
    "/{id}",
    response_model=CategoryPublic,
    dependencies=[require_permission(PERM_CATEGORIES_MANAGE)],
)
def update_category(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
    category_in: CategoryUpdate,
) -> Any:
    """
    Обновить категорию.
    """
    category = session.get(Category, id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    update_dict = category_in.model_dump(exclude_unset=True)
    category.sqlmodel_update(update_dict)
    session.add(category)
    session.commit()
    session.refresh(category)
    log_audit(
        session,
        user_id=current_user.id,
        action="category.update",
        resource_type="category",
        resource_id=category.id,
        details={"name": category.name, "updated_fields": list(update_dict.keys())},
        ip_address=get_client_ip(request),
    )
    return category


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[require_permission(PERM_CATEGORIES_MANAGE)],
)
def delete_category(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Удалить категорию. У дочерних категорий parent_id станет null.
    """
    category = session.get(Category, id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    name = category.name
    session.delete(category)
    log_audit(
        session,
        user_id=current_user.id,
        action="category.delete",
        resource_type="category",
        resource_id=id,
        details={"name": name},
        ip_address=get_client_ip(request),
    )
    return Message(message="Category deleted")
