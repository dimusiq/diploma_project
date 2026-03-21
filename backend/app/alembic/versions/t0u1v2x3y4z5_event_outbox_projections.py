"""Outbox, идемпотентность потребителей, twin_projection_entry, event_seq.

Revision ID: t0u1v2x3y4z5
Revises: s9t0u1v2w3x4
Create Date: 2026-03-20

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "t0u1v2x3y4z5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "domain_event",
        sa.Column("payload_schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("domain_event", sa.Column("event_seq", sa.BigInteger(), nullable=True))

    op.execute(
        """
        UPDATE domain_event d
        SET event_seq = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY occurred_at ASC, id ASC) AS rn
            FROM domain_event
        ) sub
        WHERE d.id = sub.id
        """
    )
    op.alter_column("domain_event", "event_seq", nullable=False)

    op.execute("CREATE SEQUENCE IF NOT EXISTS domain_event_event_seq_seq")
    op.execute(
        "SELECT setval('domain_event_event_seq_seq', "
        "(SELECT COALESCE(MAX(event_seq), 0) FROM domain_event))"
    )
    op.create_index(op.f("ix_domain_event_event_seq"), "domain_event", ["event_seq"], unique=False)

    op.create_table(
        "event_outbox",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("domain_event_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=2048), nullable=True),
        sa.ForeignKeyConstraint(
            ["domain_event_id"],
            ["domain_event.id"],
            name="fk_event_outbox_domain_event_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain_event_id", name="uq_event_outbox_domain_event_id"),
    )
    op.create_index(
        op.f("ix_event_outbox_completed_at"),
        "event_outbox",
        ["completed_at"],
        unique=False,
    )

    op.create_table(
        "projection_consumer_processed",
        sa.Column("consumer_name", sa.String(length=64), nullable=False),
        sa.Column("domain_event_id", UUID(as_uuid=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_event_id"],
            ["domain_event.id"],
            name="fk_projection_consumer_processed_domain_event_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("consumer_name", "domain_event_id"),
    )

    op.create_table(
        "twin_projection_entry",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("domain_event_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_seq", sa.BigInteger(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("aggregate_type", sa.String(length=64), nullable=False),
        sa.Column("aggregate_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payload_summary", JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_event_id"],
            ["domain_event.id"],
            name="fk_twin_projection_entry_domain_event_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain_event_id", name="uq_twin_projection_entry_domain_event_id"),
    )
    op.create_index(
        op.f("ix_twin_projection_entry_event_seq"),
        "twin_projection_entry",
        ["event_seq"],
        unique=False,
    )
    op.create_index(
        op.f("ix_twin_projection_entry_occurred_at"),
        "twin_projection_entry",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_twin_projection_entry_event_type"),
        "twin_projection_entry",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_twin_projection_entry_aggregate_id"),
        "twin_projection_entry",
        ["aggregate_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO event_outbox (id, domain_event_id, created_at, completed_at, attempts)
        SELECT gen_random_uuid(), id, occurred_at, NOW(), 0
        FROM domain_event
        """
    )


def downgrade():
    op.drop_index(op.f("ix_twin_projection_entry_aggregate_id"), table_name="twin_projection_entry")
    op.drop_index(op.f("ix_twin_projection_entry_event_type"), table_name="twin_projection_entry")
    op.drop_index(op.f("ix_twin_projection_entry_occurred_at"), table_name="twin_projection_entry")
    op.drop_index(op.f("ix_twin_projection_entry_event_seq"), table_name="twin_projection_entry")
    op.drop_table("twin_projection_entry")

    op.drop_table("projection_consumer_processed")

    op.drop_index(op.f("ix_event_outbox_completed_at"), table_name="event_outbox")
    op.drop_table("event_outbox")

    op.drop_index(op.f("ix_domain_event_event_seq"), table_name="domain_event")
    op.execute("DROP SEQUENCE IF EXISTS domain_event_event_seq_seq")
    op.drop_column("domain_event", "event_seq")
    op.drop_column("domain_event", "payload_schema_version")
