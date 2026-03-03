"""Справочник ролей (для выбора при создании/редактировании пользователя)."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import select

from app.api.deps import SessionDep, require_permission
from app.core.permissions import PERM_ROLES_READ
from app.models import Role, RolePublic

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/", response_model=list[RolePublic])
def read_roles(
    session: SessionDep,
    _: Any = require_permission(PERM_ROLES_READ),
) -> Any:
    """Список ролей (право roles.read)."""
    roles = session.exec(select(Role).order_by(Role.name)).all()
    return list(roles)
