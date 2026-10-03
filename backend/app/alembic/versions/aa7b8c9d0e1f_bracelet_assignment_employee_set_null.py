"""Сохранение истории браслетов при удалении сотрудника.

Revision ID: aa7b8c9d0e1f
Revises: ff6a7b8c9d0e
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "aa7b8c9d0e1f"
down_revision = "ff6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "wsim_bracelet_assignment_employee_id_fkey",
        "wsim_bracelet_assignment",
        type_="foreignkey",
    )
    op.alter_column(
        "wsim_bracelet_assignment",
        "employee_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_foreign_key(
        "wsim_bracelet_assignment_employee_id_fkey",
        "wsim_bracelet_assignment",
        "warehouse_employee",
        ["employee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "wsim_bracelet_assignment_employee_id_fkey",
        "wsim_bracelet_assignment",
        type_="foreignkey",
    )
    op.execute(
        "DELETE FROM wsim_bracelet_assignment WHERE employee_id IS NULL"
    )
    op.alter_column(
        "wsim_bracelet_assignment",
        "employee_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.create_foreign_key(
        "wsim_bracelet_assignment_employee_id_fkey",
        "wsim_bracelet_assignment",
        "warehouse_employee",
        ["employee_id"],
        ["id"],
        ondelete="CASCADE",
    )
