"""Drop warehouse_sector from equipment (только зона склада)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("equipment", "warehouse_sector")


def downgrade():
    op.add_column(
        "equipment",
        sa.Column("warehouse_sector", sa.String(length=128), nullable=True),
    )

