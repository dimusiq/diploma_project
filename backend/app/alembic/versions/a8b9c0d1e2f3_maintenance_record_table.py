"""MaintenanceRecord table (проведённые ТО)

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa

revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "maintenancerecord",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("equipment_id", sa.Uuid(), nullable=False),
        sa.Column("performed_at", sa.Date(), nullable=False),
        sa.Column("engine_hours_at_service", sa.Integer(), nullable=True),
        sa.Column("interval_hours", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("maintenancerecord")
