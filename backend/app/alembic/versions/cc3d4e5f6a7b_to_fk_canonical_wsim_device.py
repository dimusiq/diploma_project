"""Point TO/work-order FKs at canonical wsim_device.

Revision ID: cc3d4e5f6a7b
Revises: bb2c3d4e5f6a
Create Date: 2026-09-20

"""

import sqlalchemy as sa
from alembic import op

revision = "cc3d4e5f6a7b"
down_revision = "bb2c3d4e5f6a"
branch_labels = None
depends_on = None

TABLES = ("workorder", "maintenancerecord", "chain_assignment")


def _drop_equipment_fk(table: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for fk in inspector.get_foreign_keys(table):
        if fk.get("constrained_columns") == ["equipment_id"] and fk.get("referred_table") == "equipment":
            op.drop_constraint(fk["name"], table, type_="foreignkey")


def upgrade():
    for table in TABLES:
        _drop_equipment_fk(table)
        op.execute(
            sa.text(
                f"DELETE FROM {table} WHERE equipment_id NOT IN (SELECT id FROM wsim_device)"
            )
        )
        op.create_foreign_key(
            f"fk_{table}_equipment_id_wsim_device",
            table,
            "wsim_device",
            ["equipment_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade():
    for table in TABLES:
        op.drop_constraint(f"fk_{table}_equipment_id_wsim_device", table, type_="foreignkey")
        op.execute(
            sa.text(
                f"DELETE FROM {table} WHERE equipment_id NOT IN (SELECT id FROM equipment)"
            )
        )
        op.create_foreign_key(
            f"{table}_equipment_id_fkey",
            table,
            "equipment",
            ["equipment_id"],
            ["id"],
            ondelete="CASCADE",
        )
