import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import EmailStr, computed_field
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.inventory import Item

# --- Role (роли: admin, manager, warehouse, viewer) ---
ROLE_ADMIN = "admin"
ROLE_MANAGER = "manager"
ROLE_WAREHOUSE = "warehouse"
ROLE_VIEWER = "viewer"


class RolePermission(SQLModel, table=True):
    """Связь роли и права (шаблон роли = набор permission для роли)."""

    __tablename__ = "role_permission"
    role_id: uuid.UUID = Field(
        foreign_key="role.id", ondelete="CASCADE", primary_key=True
    )
    permission_id: uuid.UUID = Field(
        foreign_key="permission.id", ondelete="CASCADE", primary_key=True
    )


class Role(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=32)
    users: list["User"] = Relationship(back_populates="role")
    permissions: list["Permission"] = Relationship(
        back_populates="roles", link_model=RolePermission
    )


class RolePublic(SQLModel):
    id: uuid.UUID
    name: str


# --- Permission (гранулярные права, привязка к ролям через RolePermission) ---
class Permission(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, max_length=64, index=True)
    description: str | None = Field(default=None, max_length=255)
    roles: list["Role"] = Relationship(
        back_populates="permissions", link_model=RolePermission
    )


class PermissionPublic(SQLModel):
    id: uuid.UUID
    code: str
    description: str | None = None


class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    role_id: uuid.UUID | None = Field(
        default=None, foreign_key="role.id", ondelete="SET NULL"
    )


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)
    role_id: uuid.UUID | None = None


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    last_login_at: datetime | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)
    avatar_ext: str | None = Field(default=None, max_length=8)
    role: Role | None = Relationship(back_populates="users")
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def role_name(self) -> str | None:
        role = self.role
        return role.name if role is not None else None


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    last_login_at: datetime | None = None
    deleted_at: datetime | None = None
    avatar_ext: str | None = None
    role_name: str | None = None


class UsersPublic(SQLModel):
    data: list["UserPublic"]
    count: int


class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)
