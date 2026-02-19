"""Add equipment_type to equipment (складская техника: типы и бренды Linde/Jungheinrich)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "equipment",
        sa.Column("equipment_type", sa.String(length=32), nullable=False, server_default="elektropogruzchik"),
    )
    op.alter_column("equipment", "equipment_type", server_default=None)


def downgrade():
    op.drop_column("equipment", "equipment_type")
