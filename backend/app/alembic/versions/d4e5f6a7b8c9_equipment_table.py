"""Equipment table (Список техники)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "equipment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vin", sa.String(length=64), nullable=True),
        sa.Column("serial_number", sa.String(length=128), nullable=True),
        sa.Column("brand", sa.String(length=128), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("commissioned_at", sa.Date(), nullable=True),
        sa.Column("current_status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("zone", sa.String(length=128), nullable=True),
        sa.Column("warehouse_sector", sa.String(length=128), nullable=True),
        sa.Column("attachments", sa.String(length=4096), nullable=True),
        sa.Column("instructions", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("equipment")
