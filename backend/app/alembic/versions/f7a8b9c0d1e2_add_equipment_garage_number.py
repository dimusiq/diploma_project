"""Add garage_number to equipment

Revision ID: f7a8b9c0d1e2
Revises: c9d0e1f2a3b4
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("equipment", sa.Column("garage_number", sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column("equipment", "garage_number")
