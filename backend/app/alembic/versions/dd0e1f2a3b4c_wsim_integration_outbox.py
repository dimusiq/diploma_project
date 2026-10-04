"""Durable outbox интеграции симуляции → WMS (wsim_integration_outbox).

Revision ID: dd0e1f2a3b4c
Revises: cc9d0e1f2a3b
Create Date: 2026-10-04

Очередь integration_queue в памяти теряется при краше процесса.
Таблица хранит pending-события до подтверждённого применения к домену.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "dd0e1f2a3b4c"
down_revision = "cc9d0e1f2a3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wsim_integration_outbox",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_key", sa.String(length=128), nullable=False),
        sa.Column("sim_seq", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key", name="uq_wsim_integration_outbox_event_key"),
    )
    op.create_index(
        "ix_wsim_integration_outbox_event_key",
        "wsim_integration_outbox",
        ["event_key"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_sim_seq",
        "wsim_integration_outbox",
        ["sim_seq"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_status",
        "wsim_integration_outbox",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_created_at",
        "wsim_integration_outbox",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_completed_at",
        "wsim_integration_outbox",
        ["completed_at"],
        unique=False,
    )
    op.create_index(
        "ix_wsim_integration_outbox_status_seq",
        "wsim_integration_outbox",
        ["status", "sim_seq"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wsim_integration_outbox_status_seq",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_completed_at",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_created_at",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_status",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_sim_seq",
        table_name="wsim_integration_outbox",
    )
    op.drop_index(
        "ix_wsim_integration_outbox_event_key",
        table_name="wsim_integration_outbox",
    )
    op.drop_table("wsim_integration_outbox")
