"""Справочник ролей (для выбора при создании/редактировании пользователя)."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_ROLES_READ
from app.models import Permission, Role, RolePermission, RolePublic, User

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/", response_model=list[RolePublic])
def read_roles(
    session: SessionDep,
    _: Any = require_permission(PERM_ROLES_READ),
) -> Any:
    """Список ролей (право roles.read)."""
    roles = session.exec(select(Role).order_by(Role.name)).all()
    return list(roles)


class RoleDetailPublic(BaseModel):
    id: str
    name: str
    permissions: list[str]
    user_count: int


@router.get("/detailed", response_model=list[RoleDetailPublic])
def read_roles_detailed(
    session: SessionDep,
    _current_user: CurrentUser,
) -> Any:
    """Roles with permission codes and active user count."""
    roles = list(session.exec(select(Role).order_by(Role.name)).all())

    result: list[RoleDetailPublic] = []
    for role in roles:
        perm_codes = list(
            session.exec(
                select(Permission.code)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .where(RolePermission.role_id == role.id)
                .order_by(Permission.code)
            ).all()
        )
        user_count = session.exec(
            select(func.count())
            .select_from(User)
            .where(User.role_id == role.id, User.deleted_at.is_(None))
        ).one()
        result.append(
            RoleDetailPublic(
                id=str(role.id),
                name=role.name,
                permissions=perm_codes,
                user_count=user_count,
            )
        )
    return result
