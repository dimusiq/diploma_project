"""Изоляция тестовой PostgreSQL: создание БД, миграции, TRUNCATE."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, func, select

# Миграция t0u1v2x3y4z5 на пустой domain_event делает setval(..., 0) → ошибка PG.
_PRE_T0_REVISION = "s9t0u1v2w3x4"
_T0_REVISION = "t0u1v2x3y4z5"


def ensure_database_exists(
    *, server: str, port: int, user: str, password: str, db_name: str
) -> None:
    """CREATE DATABASE при отсутствии (через служебную БД postgres)."""
    admin_url = f"postgresql+psycopg://{user}:{password}@{server}:{port}/postgres"
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"),
                {"n": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        engine.dispose()


def _apply_t0_migration_for_empty_db(engine: Engine) -> None:
    """Эквивалент t0u1v2x3y4z5 с setval ≥ 1 (не меняем файл миграции)."""
    stmts = [
        """
        ALTER TABLE domain_event
        ADD COLUMN IF NOT EXISTS payload_schema_version INTEGER NOT NULL DEFAULT 1
        """,
        """
        ALTER TABLE domain_event
        ADD COLUMN IF NOT EXISTS event_seq BIGINT
        """,
        """
        UPDATE domain_event d
        SET event_seq = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY occurred_at ASC, id ASC) AS rn
            FROM domain_event
        ) sub
        WHERE d.id = sub.id AND d.event_seq IS NULL
        """,
        "ALTER TABLE domain_event ALTER COLUMN event_seq SET NOT NULL",
        "CREATE SEQUENCE IF NOT EXISTS domain_event_event_seq_seq",
        """
        SELECT setval(
            'domain_event_event_seq_seq',
            GREATEST(1, COALESCE((SELECT MAX(event_seq) FROM domain_event), 1))
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_domain_event_event_seq ON domain_event (event_seq)",
        """
        CREATE TABLE IF NOT EXISTS event_outbox (
            id UUID NOT NULL PRIMARY KEY,
            domain_event_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error VARCHAR(2048),
            CONSTRAINT uq_event_outbox_domain_event_id UNIQUE (domain_event_id),
            CONSTRAINT fk_event_outbox_domain_event_id
                FOREIGN KEY (domain_event_id) REFERENCES domain_event(id) ON DELETE CASCADE
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_event_outbox_completed_at ON event_outbox (completed_at)",
        """
        CREATE TABLE IF NOT EXISTS projection_consumer_processed (
            consumer_name VARCHAR(64) NOT NULL,
            domain_event_id UUID NOT NULL,
            processed_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (consumer_name, domain_event_id),
            CONSTRAINT fk_projection_consumer_processed_domain_event_id
                FOREIGN KEY (domain_event_id) REFERENCES domain_event(id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS twin_projection_entry (
            id UUID NOT NULL PRIMARY KEY,
            domain_event_id UUID NOT NULL,
            event_seq BIGINT NOT NULL,
            occurred_at TIMESTAMPTZ NOT NULL,
            event_type VARCHAR(128) NOT NULL,
            aggregate_type VARCHAR(64) NOT NULL,
            aggregate_id UUID NOT NULL,
            payload_summary JSONB NOT NULL,
            CONSTRAINT uq_twin_projection_entry_domain_event_id UNIQUE (domain_event_id),
            CONSTRAINT fk_twin_projection_entry_domain_event_id
                FOREIGN KEY (domain_event_id) REFERENCES domain_event(id) ON DELETE CASCADE
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_twin_projection_entry_event_seq ON twin_projection_entry (event_seq)",
        "CREATE INDEX IF NOT EXISTS ix_twin_projection_entry_occurred_at ON twin_projection_entry (occurred_at)",
        "CREATE INDEX IF NOT EXISTS ix_twin_projection_entry_event_type ON twin_projection_entry (event_type)",
        "CREATE INDEX IF NOT EXISTS ix_twin_projection_entry_aggregate_id ON twin_projection_entry (aggregate_id)",
        """
        INSERT INTO event_outbox (id, domain_event_id, created_at, completed_at, attempts)
        SELECT gen_random_uuid(), id, occurred_at, NOW(), 0
        FROM domain_event d
        WHERE NOT EXISTS (
            SELECT 1 FROM event_outbox o WHERE o.domain_event_id = d.id
        )
        """,
    ]
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))


def run_alembic_upgrade(backend_dir: Path, engine: Engine) -> None:
    """Применить миграции; обойти setval(0) на пустой БД без правки файлов alembic.

    На PostgreSQL весь ``upgrade head`` идёт в одной DDL-транзакции: падение t0
    откатывает всё. Поэтому на пустой БД идём s9 → ручной t0 → stamp → head.
    """
    from alembic.runtime.migration import MigrationContext

    ini = backend_dir / "alembic.ini"
    cfg = Config(str(ini))
    cfg.attributes["configure_logger"] = False
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()

    if current is None:
        command.upgrade(cfg, _PRE_T0_REVISION)
        _apply_t0_migration_for_empty_db(engine)
        command.stamp(cfg, _T0_REVISION)
    elif current == _PRE_T0_REVISION:
        _apply_t0_migration_for_empty_db(engine)
        command.stamp(cfg, _T0_REVISION)

    command.upgrade(cfg, "head")


def assert_safe_test_database(session: Session, db_name: str) -> None:
    """Запрет запуска pytest на БД без суффикса ``_test``."""
    from app.models import Item, User

    users = int(session.exec(select(func.count()).select_from(User)).one())
    items = int(session.exec(select(func.count()).select_from(Item)).one())
    if not db_name.endswith("_test"):
        raise RuntimeError(
            f"Отказ запускать pytest на БД «{db_name}»: имя должно заканчиваться на _test "
            f"(сейчас user={users}, item={items}). "
            "Задайте TEST_POSTGRES_DB=<имя>_test или TEST_DATABASE_URL на тестовую БД."
        )
    if db_name in {"postgres_test", "template0_test", "template1_test"}:
        raise RuntimeError(f"Отказ: недопустимое имя тестовой БД «{db_name}».")


def _terminate_other_backends(engine: Engine) -> None:
    """Снять чужие сессии с тестовой БД (зомби pytest / idle-in-transaction)."""
    url = engine.url.set(drivername="postgresql+psycopg")
    admin = create_engine(url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with admin.connect() as conn:
            conn.execute(
                text(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND pid <> pg_backend_pid()
                      AND backend_type = 'client backend'
                    """
                )
            )
    finally:
        admin.dispose()


def truncate_all_tables(engine: Engine) -> None:
    """Полная очистка существующих таблиц public (кроме alembic_version)."""
    # Сбрасываем пул и чужие бэкенды: иначе «idle in transaction» /
    # параллельный pytest держат AccessShareLock → deadlock на TRUNCATE.
    engine.dispose()
    _terminate_other_backends(engine)
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '15s'"))
        existing = [
            row[0]
            for row in conn.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'public' AND tablename <> 'alembic_version' "
                    "ORDER BY tablename"
                )
            )
        ]
        if not existing:
            return
        joined = ", ".join(f'"{name}"' for name in existing)
        conn.execute(text(f"TRUNCATE {joined} RESTART IDENTITY CASCADE"))
        # Отдельная sequence для domain_event.event_seq (не SERIAL-колонка).
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_class WHERE relname = 'domain_event_event_seq_seq'
                    ) THEN
                        PERFORM setval('domain_event_event_seq_seq', 1, false);
                    END IF;
                END $$;
                """
            )
        )


def seed_baseline(session: Session) -> None:
    """Роли/суперпользователь/бренды + права + layout + wsim DEMO."""
    from app.core.db import init_db
    from app.tests.seed_reference import seed_all_reference

    init_db(session)
    seed_all_reference(session)
