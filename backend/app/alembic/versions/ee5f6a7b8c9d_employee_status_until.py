"""Статусы персонала: working/sick/vacation/break и дата окончания.

Старые значения не удаляют сотрудников:
- active → working
- on_leave → vacation, status_until NULL (дата раньше не хранилась)
- inactive и terminated → working, status_until NULL
  В новой модели нет статуса «не активен». Записи остаются в справочнике,
  чтобы их можно было отредактировать или удалить явно.

Revision ID: ee5f6a7b8c9d
Revises: dd4e5f6a7b8c
"""

import sqlalchemy as sa
from alembic import op

revision = "ee5f6a7b8c9d"
down_revision = "dd4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("warehouse_employee", sa.Column("status_until", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE warehouse_employee
        SET status = 'working', status_until = NULL
        WHERE status = 'active'
        """
    )
    op.execute(
        """
        UPDATE warehouse_employee
        SET status = 'vacation', status_until = NULL
        WHERE status = 'on_leave'
        """
    )
    op.execute(
        """
        UPDATE warehouse_employee
        SET status = 'working', status_until = NULL
        WHERE status IN ('inactive', 'terminated')
        """
    )
    op.alter_column("warehouse_employee", "status", server_default="working")


def downgrade() -> None:
    op.execute(
        """
        UPDATE warehouse_employee
        SET status = 'on_leave'
        WHERE status = 'vacation'
        """
    )
    op.execute(
        """
        UPDATE warehouse_employee
        SET status = 'active'
        WHERE status IN ('working', 'sick', 'break')
        """
    )
    op.alter_column("warehouse_employee", "status", server_default="active")
    op.drop_column("warehouse_employee", "status_until")
