"""Индексы журнала wsim_event: GIN(payload) + trigram(message/event_type).

Revision ID: cc9d0e1f2a3b
Revises: bb8c9d0e1f2a
Create Date: 2026-10-04

Пагинация/фильтры query_event_log опираются на ILIKE по message/event_type
и JSONB @> по payload.deviceId — без индексов это seq scan.

Прод: CREATE INDEX без CONCURRENTLY внутри транзакции Alembic блокирует
запись в wsim_event на время build. CREATE EXTENSION pg_trgm требует прав
суперпользователя/владельца — лучше выполнить заранее. Порядок применения
и альтернатива CONCURRENTLY: development.md («Миграции» / cc9d0e1f2a3b).
"""

from __future__ import annotations

from alembic import op

revision = "cc9d0e1f2a3b"
down_revision = "bb8c9d0e1f2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # Containment @> для фильтров payload (deviceId и др.)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_wsim_event_payload_gin
        ON wsim_event
        USING gin (payload jsonb_path_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_wsim_event_message_trgm
        ON wsim_event
        USING gin (message gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_wsim_event_event_type_trgm
        ON wsim_event
        USING gin (event_type gin_trgm_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_wsim_event_event_type_trgm")
    op.execute("DROP INDEX IF EXISTS ix_wsim_event_message_trgm")
    op.execute("DROP INDEX IF EXISTS ix_wsim_event_payload_gin")
    # pg_trgm может использоваться другими объектами — расширение не трогаем.
