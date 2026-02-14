"""Add storage cell fields to Item (storage_row, storage_level, storage_cell_x, storage_cell_z)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2025-01-26

"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("item", sa.Column("storage_row", sa.Integer(), nullable=True))
    op.add_column("item", sa.Column("storage_level", sa.Integer(), nullable=True))
    op.add_column("item", sa.Column("storage_cell_x", sa.Integer(), nullable=True))
    op.add_column("item", sa.Column("storage_cell_z", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("item", "storage_cell_z")
    op.drop_column("item", "storage_cell_x")
    op.drop_column("item", "storage_level")
    op.drop_column("item", "storage_row")
