"""Фикстуры pytest: отдельная БД ``*_test``, очистка TRUNCATE на каждый тест."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

# Порядок критичен: db_env меняет POSTGRES_DB до загрузки Settings.
# isort: off
from app.tests.db_env import TEST_DB_NAME
from app.core.config import settings
from app.core.db import engine
from app.main import app
from app.tests.db_setup import (
    assert_safe_test_database,
    ensure_database_exists,
    run_alembic_upgrade,
    seed_baseline,
    truncate_all_tables,
)
from app.tests.utils.user import authentication_token_from_email
from app.tests.utils.utils import get_superuser_token_headers

# isort: on


@pytest.fixture(scope="session", autouse=True)
def _prepare_test_database() -> Generator[None, None, None]:
    """Создать БД, прогнать alembic, проверить что это не боевые данные."""
    ensure_database_exists(
        server=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        db_name=settings.POSTGRES_DB,
    )
    backend_dir = Path(__file__).resolve().parents[2]
    run_alembic_upgrade(backend_dir, engine)

    # Нельзя держать Session открытой во время TRUNCATE — иначе deadlock
    # (SELECT в транзакции + TRUNCATE на другом соединении).
    with Session(engine) as session:
        assert_safe_test_database(session, settings.POSTGRES_DB)
    truncate_all_tables(engine)
    with Session(engine) as session:
        seed_baseline(session)

    assert settings.POSTGRES_DB == TEST_DB_NAME
    yield


@pytest.fixture(autouse=True)
def db() -> Generator[Session, None, None]:
    """Изоляция теста: TRUNCATE CASCADE → seed_baseline → сессия."""
    from app.warehouse_sim.integration_context import clear_process_caches
    from app.warehouse_sim.runtime import discard_runtime_singleton

    # Сначала сброс синглтонов/кэшей, потом TRUNCATE (без гонки с runtime).
    clear_process_caches()
    discard_runtime_singleton()
    truncate_all_tables(engine)
    with Session(engine) as session:
        seed_baseline(session)
        yield session
    # Закрыть пул после теста — не оставлять idle-in-transaction между прогонами.
    engine.dispose()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture()
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
