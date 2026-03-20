"""Read-model: занятость ячеек склада (проекция для twin / KPI).

Revision ID: m1n2o3p4q5r6
Revises: l0m1n2o3p4q5
Create Date: 2026-03-20

"""

from alembic import op
import sqlalchemy as sa

revision = "m1n2o3p4q5r6"
down_revision = "l0m1n2o3p4q5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "warehouse_slot_occupancy",
        sa.Column("slot_key", sa.String(length=64), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("slot_key"),
        sa.UniqueConstraint("item_id", name="uq_warehouse_slot_occupancy_item_id"),
    )
    op.create_index(
        "ix_warehouse_slot_occupancy_owner_id",
        "warehouse_slot_occupancy",
        ["owner_id"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            INSERT INTO warehouse_slot_occupancy (slot_key, item_id, owner_id, updated_at)
            SELECT
                (item.storage_row - 1)::text || '-' || (item.storage_level - 1)::text || '-'
                || (item.storage_cell_x - 1)::text || '-' || (item.storage_cell_z - 1)::text,
                item.id,
                item.owner_id,
                NOW()
            FROM item
            WHERE item.storage_row IS NOT NULL
              AND item.storage_level IS NOT NULL
              AND item.storage_cell_x IS NOT NULL
              AND item.storage_cell_z IS NOT NULL
            """
        )
    )


def downgrade():
    op.drop_index("ix_warehouse_slot_occupancy_owner_id", table_name="warehouse_slot_occupancy")
    op.drop_table("warehouse_slot_occupancy")
