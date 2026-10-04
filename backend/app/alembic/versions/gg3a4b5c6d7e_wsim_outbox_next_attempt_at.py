"""wsim_integration_outbox: next_attempt_at для экспоненциального backoff.

Revision ID: gg3a4b5c6d7e
Revises: ff2a3b4c5d6e
Create Date: 2026-10-04

Выборка pending учитывает время следующей попытки; изоляция ошибок — в коде outbox.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "gg3a4b5c6d7e"
down_revision = "ff2a3b4c5d6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wsim_integration_outbox",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE wsim_integration_outbox
        SET next_attempt_at = created_at
        WHERE status = 'pending' AND next_attempt_at IS NULL
        """
    )
    op.create_index(
        "ix_wsim_integration_outbox_next_attempt_at",
        "wsim_integration_outbox",
        ["next_attempt_at"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_status_next_attempt",
        "wsim_integration_outbox",
        ["status", "next_attempt_at", "sim_seq"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wsim_integration_outbox_status_next_attempt",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_next_attempt_at",
        table_name="wsim_integration_outbox",
    )
    op.drop_column("wsim_integration_outbox", "next_attempt_at")
