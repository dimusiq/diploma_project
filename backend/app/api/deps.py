import uuid
from collections.abc import Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.core.permissions import can_manage_users, user_has_permission
from app.models import ROLE_ADMIN, TokenPayload, User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    try:
        user_id = uuid.UUID(token_data.sub) if isinstance(token_data.sub, str) else token_data.sub
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = session.exec(
        select(User).where(User.id == user_id).options(selectinload(User.role))
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or no longer exists",
        )
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


def get_user_from_token_string(session: Session, token: str) -> User | None:
    """Декодирование JWT без Depends (WebSocket, внешние клиенты)."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        return None
    try:
        user_id = uuid.UUID(token_data.sub) if isinstance(token_data.sub, str) else token_data.sub
    except (ValueError, TypeError):
        return None
    user = session.get(User, user_id)
    if not user:
        return None
    if not user.is_active or user.deleted_at is not None:
        return None
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def user_is_warehouse_sim_admin(user: User) -> bool:
    """Доступ к Warehouse Device Server: суперпользователь или роль admin."""
    if user.is_superuser:
        return True
    role = user.role
    return role is not None and role.name == ROLE_ADMIN


def get_current_warehouse_sim_admin(current_user: CurrentUser) -> User:
    if not user_is_warehouse_sim_admin(current_user):
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def get_current_user_can_manage_users(
    session: SessionDep, current_user: CurrentUser
) -> User:
    """Доступ: суперпользователь или право users.manage."""
    if not can_manage_users(session, current_user):
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def require_permission(permission_code: str):
    """Зависимость: текущий пользователь должен иметь указанное право."""

    def _dependency(session: SessionDep, current_user: CurrentUser) -> User:
        if not user_has_permission(session, current_user, permission_code):
            raise HTTPException(
                status_code=403,
                detail="The user doesn't have enough privileges",
            )
        return current_user

    return Depends(_dependency)
