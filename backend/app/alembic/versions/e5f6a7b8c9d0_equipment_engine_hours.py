"""Add engine_hours to equipment

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2025-02-18

"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("equipment", sa.Column("engine_hours", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("equipment", "engine_hours")
