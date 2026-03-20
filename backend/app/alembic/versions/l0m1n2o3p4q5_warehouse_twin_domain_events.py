"""Warehouse layout, domain events, unique storage cell index.

Revision ID: l0m1n2o3p4q5
Revises: k4l5m6n7o8p9
Create Date: 2026-03-20

"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "l0m1n2o3p4q5"
down_revision = "k4l5m6n7o8p9"
branch_labels = None
depends_on = None

_DEFAULT_LAYOUT_ID = uuid.UUID("a0000001-0001-4000-8000-000000000001")
_DEFAULT_SPEC = {
    "rows": 12,
    "levels": 4,
    "cellX": 20,
    "cellZ": 1,
    "coordinateSystem": "1-based",
    "cellKeyFormat": "zeroBasedDashSeparated",
}


def upgrade():
    op.create_table(
        "warehouse_layout",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("spec", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_warehouse_layout_code", "warehouse_layout", ["code"], unique=False)
    op.create_index(
        "ix_warehouse_layout_active",
        "warehouse_layout",
        ["is_active"],
        unique=False,
    )

    op.create_table(
        "domain_event",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("aggregate_type", sa.String(length=64), nullable=False),
        sa.Column("aggregate_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("correlation_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_domain_event_occurred_at",
        "domain_event",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_domain_event_aggregate",
        "domain_event",
        ["aggregate_type", "aggregate_id", "occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_domain_event_type",
        "domain_event",
        ["event_type"],
        unique=False,
    )

    spec_json = json.dumps(_DEFAULT_SPEC, separators=(",", ":"))
    op.get_bind().execute(
        sa.text(
            """
            INSERT INTO warehouse_layout (id, code, version, is_active, spec, created_at)
            VALUES (CAST(:lid AS uuid), 'default', 1, true, CAST(:spec AS jsonb), NOW())
            """
        ),
        {"lid": str(_DEFAULT_LAYOUT_ID), "spec": spec_json},
    )

    op.create_index(
        "uq_item_storage_cell_when_full",
        "item",
        ["storage_row", "storage_level", "storage_cell_x", "storage_cell_z"],
        unique=True,
        postgresql_where=sa.text(
            "storage_row IS NOT NULL AND storage_level IS NOT NULL "
            "AND storage_cell_x IS NOT NULL AND storage_cell_z IS NOT NULL"
        ),
    )


def downgrade():
    op.drop_index("uq_item_storage_cell_when_full", table_name="item")
    op.drop_index("ix_domain_event_type", table_name="domain_event")
    op.drop_index("ix_domain_event_aggregate", table_name="domain_event")
    op.drop_index("ix_domain_event_occurred_at", table_name="domain_event")
    op.drop_table("domain_event")
    op.drop_index("ix_warehouse_layout_active", table_name="warehouse_layout")
    op.drop_index("ix_warehouse_layout_code", table_name="warehouse_layout")
    op.drop_table("warehouse_layout")
