import uuid

from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_VIEWER,
    ROLE_WAREHOUSE,
    Brand,
    Role,
    User,
    UserCreate,
)

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def _ensure_roles(session: Session) -> None:
    if session.exec(select(Role)).first():
        return
    for name in (ROLE_ADMIN, ROLE_MANAGER, ROLE_WAREHOUSE, ROLE_VIEWER):
        session.add(Role(name=name))
    session.commit()


def init_db(session: Session) -> None:
    _ensure_roles(session)

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        admin_role = session.exec(select(Role).where(Role.name == ROLE_ADMIN)).first()
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
            role_id=admin_role.id if admin_role else None,
        )
        crud.create_user(session=session, user_create=user_in)
    else:
        admin_role = session.exec(select(Role).where(Role.name == ROLE_ADMIN)).first()
        if admin_role and (user.role_id is None or (user.role and user.role.name != ROLE_ADMIN)):
            user.role_id = admin_role.id
            session.add(user)
            session.commit()

    _ensure_brands(session)


def _ensure_brands(session: Session) -> dict[str, uuid.UUID]:
    """Создать бренды Linde и Jungheinrich, если их ещё нет. Возвращает словарь name -> id."""
    result: dict[str, uuid.UUID] = {}
    for name in ("Linde", "Jungheinrich"):
        brand = session.exec(select(Brand).where(Brand.name == name)).first()
        if not brand:
            brand = Brand(name=name)
            session.add(brand)
            session.commit()
            session.refresh(brand)
        result[name] = brand.id
    return result
