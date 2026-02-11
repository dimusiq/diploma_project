"""Справочник ролей (для выбора при создании/редактировании пользователя)."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import select

from app.api.deps import SessionDep, get_current_user_can_manage_users
from app.models import Role, RolePublic

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/", response_model=list[RolePublic])
def read_roles(
    session: SessionDep,
    _: Any = Depends(get_current_user_can_manage_users),
) -> Any:
    """Список ролей (admin или суперпользователь)."""
    roles = session.exec(select(Role).order_by(Role.name)).all()
    return list(roles)
