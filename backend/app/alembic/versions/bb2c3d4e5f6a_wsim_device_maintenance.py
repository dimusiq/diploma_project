"""ТО симуляторного парка: wsim_device_maintenance.

Revision ID: bb2c3d4e5f6a
Revises: aa1b2c3d4e5f
Create Date: 2026-09-19

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "bb2c3d4e5f6a"
down_revision = "aa1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "wsim_device_maintenance",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.String(length=4096), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("performed_by", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["wsim_device.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wsim_device_maintenance_device_id",
        "wsim_device_maintenance",
        ["device_id"],
    )
    op.create_index(
        "ix_wsim_device_maintenance_status",
        "wsim_device_maintenance",
        ["status"],
    )


def downgrade():
    op.drop_index("ix_wsim_device_maintenance_status", table_name="wsim_device_maintenance")
    op.drop_index("ix_wsim_device_maintenance_device_id", table_name="wsim_device_maintenance")
    op.drop_table("wsim_device_maintenance")
