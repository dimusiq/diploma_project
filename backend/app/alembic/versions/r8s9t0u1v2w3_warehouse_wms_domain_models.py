"""WMS: warehouse, зоны по складу, топология и операционные сущности.

Revision ID: r8s9t0u1v2w3
Revises: q5r6s7t8u9v0
Create Date: 2026-03-20

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "r8s9t0u1v2w3"
down_revision = "q5r6s7t8u9v0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "warehouse",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("active_layout_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["active_layout_id"],
            ["warehouse_layout.id"],
            name="fk_warehouse_active_layout_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_warehouse_code"),
    )

    op.execute(
        """
        INSERT INTO warehouse (id, code, name, description, active_layout_id, created_at, updated_at)
        SELECT gen_random_uuid(), 'default', 'Основной склад', NULL, NULL, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM warehouse LIMIT 1)
        """
    )

    op.add_column(
        "warehouse_layout",
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_warehouse_layout_warehouse_id",
        "warehouse_layout",
        "warehouse",
        ["warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_warehouse_layout_warehouse_id"),
        "warehouse_layout",
        ["warehouse_id"],
        unique=False,
    )
    op.execute(
        """
        UPDATE warehouse_layout wl
        SET warehouse_id = (SELECT id FROM warehouse WHERE code = 'default' LIMIT 1)
        WHERE wl.warehouse_id IS NULL
        """
    )

    op.add_column(
        "warehousezone",
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        """
        UPDATE warehousezone z
        SET warehouse_id = (SELECT id FROM warehouse WHERE code = 'default' LIMIT 1)
        WHERE z.warehouse_id IS NULL
        """
    )
    op.alter_column("warehousezone", "warehouse_id", nullable=False)
    op.create_foreign_key(
        "fk_warehousezone_warehouse_id",
        "warehousezone",
        "warehouse",
        ["warehouse_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_warehousezone_warehouse_id"),
        "warehousezone",
        ["warehouse_id"],
        unique=False,
    )
    op.drop_constraint("uq_warehousezone_name", "warehousezone", type_="unique")
    op.create_unique_constraint(
        "uq_warehousezone_warehouse_name",
        "warehousezone",
        ["warehouse_id", "name"],
    )
    op.add_column("warehousezone", sa.Column("code", sa.String(length=64), nullable=True))
    op.add_column(
        "warehousezone",
        sa.Column("zone_kind", sa.String(length=32), nullable=False, server_default="storage"),
    )
    op.add_column("warehousezone", sa.Column("extra", JSONB, nullable=True))
    op.create_index(op.f("ix_warehousezone_code"), "warehousezone", ["code"], unique=False)

    op.create_table(
        "warehouse_aisle",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "path_norm",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_warehouse_aisle_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_warehouse_aisle_warehouse_id"),
        "warehouse_aisle",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(op.f("ix_warehouse_aisle_code"), "warehouse_aisle", ["code"], unique=False)

    op.create_table(
        "warehouse_rack",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=True),
        sa.Column("level_count", sa.Integer(), nullable=True),
        sa.Column("cell_x_count", sa.Integer(), nullable=True),
        sa.Column("cell_z_count", sa.Integer(), nullable=True),
        sa.Column("pose", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_warehouse_rack_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["warehousezone.id"],
            name="fk_warehouse_rack_zone_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_warehouse_rack_wh_code"),
    )
    op.create_index(
        op.f("ix_warehouse_rack_warehouse_id"),
        "warehouse_rack",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_warehouse_rack_zone_id"), "warehouse_rack", ["zone_id"], unique=False
    )

    op.create_table(
        "storage_bin",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rack_id", UUID(as_uuid=True), nullable=True),
        sa.Column("slot_key", sa.String(length=64), nullable=False),
        sa.Column("storage_row", sa.Integer(), nullable=False),
        sa.Column("storage_level", sa.Integer(), nullable=False),
        sa.Column("storage_cell_x", sa.Integer(), nullable=False),
        sa.Column("storage_cell_z", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("max_weight_kg", sa.Float(), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["rack_id"],
            ["warehouse_rack.id"],
            name="fk_storage_bin_rack_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_storage_bin_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "slot_key", name="uq_storage_bin_wh_slot"),
    )
    op.create_index(
        op.f("ix_storage_bin_warehouse_id"), "storage_bin", ["warehouse_id"], unique=False
    )
    op.create_index(op.f("ix_storage_bin_rack_id"), "storage_bin", ["rack_id"], unique=False)
    op.create_index(op.f("ix_storage_bin_slot_key"), "storage_bin", ["slot_key"], unique=False)

    op.create_table(
        "staging_area",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "area_kind",
            sa.String(length=32),
            nullable=False,
            server_default="buffer",
        ),
        sa.Column("bounds_norm", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_staging_area_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["warehousezone.id"],
            name="fk_staging_area_zone_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_staging_area_wh_code"),
    )
    op.create_index(
        op.f("ix_staging_area_warehouse_id"),
        "staging_area",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_staging_area_zone_id"), "staging_area", ["zone_id"], unique=False
    )

    op.create_table(
        "dock_door",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("staging_area_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("position_norm", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["staging_area_id"],
            ["staging_area.id"],
            name="fk_dock_door_staging_area_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_dock_door_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_dock_door_wh_code"),
    )
    op.create_index(
        op.f("ix_dock_door_warehouse_id"), "dock_door", ["warehouse_id"], unique=False
    )
    op.create_index(
        op.f("ix_dock_door_staging_area_id"),
        "dock_door",
        ["staging_area_id"],
        unique=False,
    )

    op.create_table(
        "route_node",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("node_kind", sa.String(length=32), nullable=False, server_default="waypoint"),
        sa.Column("floor_level", sa.Integer(), nullable=True),
        sa.Column(
            "position",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_route_node_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_route_node_wh_code"),
    )
    op.create_index(
        op.f("ix_route_node_warehouse_id"), "route_node", ["warehouse_id"], unique=False
    )

    op.create_table(
        "route_edge",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("from_node_id", UUID(as_uuid=True), nullable=False),
        sa.Column("to_node_id", UUID(as_uuid=True), nullable=False),
        sa.Column("bidirectional", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["from_node_id"],
            ["route_node.id"],
            name="fk_route_edge_from_node_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["to_node_id"],
            ["route_node.id"],
            name="fk_route_edge_to_node_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_route_edge_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "warehouse_id",
            "from_node_id",
            "to_node_id",
            name="uq_route_edge_wh_from_to",
        ),
    )
    op.create_index(
        op.f("ix_route_edge_warehouse_id"), "route_edge", ["warehouse_id"], unique=False
    )
    op.create_index(
        op.f("ix_route_edge_from_node_id"),
        "route_edge",
        ["from_node_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_route_edge_to_node_id"), "route_edge", ["to_node_id"], unique=False
    )

    op.create_table(
        "handling_unit",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("unit_kind", sa.String(length=32), nullable=False),
        sa.Column("sscc", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="created"),
        sa.Column("current_bin_id", UUID(as_uuid=True), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["current_bin_id"],
            ["storage_bin.id"],
            name="fk_handling_unit_current_bin_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_handling_unit_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_handling_unit_warehouse_id"),
        "handling_unit",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_handling_unit_sscc"), "handling_unit", ["sscc"], unique=False
    )
    op.create_index(
        op.f("ix_handling_unit_current_bin_id"),
        "handling_unit",
        ["current_bin_id"],
        unique=False,
    )

    op.create_table(
        "pallet",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("handling_unit_id", UUID(as_uuid=True), nullable=False),
        sa.Column("length_mm", sa.Integer(), nullable=True),
        sa.Column("width_mm", sa.Integer(), nullable=True),
        sa.Column("height_mm", sa.Integer(), nullable=True),
        sa.Column("max_weight_kg", sa.Float(), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["handling_unit_id"],
            ["handling_unit.id"],
            name="fk_pallet_handling_unit_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("handling_unit_id", name="uq_pallet_handling_unit_id"),
    )

    op.create_table(
        "inventory_lot",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("lot_code", sa.String(length=128), nullable=False),
        sa.Column("item_id", UUID(as_uuid=True), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["item.id"],
            name="fk_inventory_lot_item_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_inventory_lot_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "lot_code", name="uq_inventory_lot_wh_code"),
    )
    op.create_index(
        op.f("ix_inventory_lot_warehouse_id"),
        "inventory_lot",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_lot_item_id"), "inventory_lot", ["item_id"], unique=False
    )

    op.create_table(
        "shipment",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_shipment_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "reference", name="uq_shipment_wh_ref"),
    )
    op.create_index(
        op.f("ix_shipment_warehouse_id"), "shipment", ["warehouse_id"], unique=False
    )

    op.create_table(
        "inbound_order",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("shipment_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("expected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lines", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["shipment_id"],
            ["shipment.id"],
            name="fk_inbound_order_shipment_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_inbound_order_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_inbound_order_wh_code"),
    )
    op.create_index(
        op.f("ix_inbound_order_warehouse_id"),
        "inbound_order",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inbound_order_shipment_id"),
        "inbound_order",
        ["shipment_id"],
        unique=False,
    )

    op.create_table(
        "outbound_order",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("shipment_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("ship_by_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lines", JSONB, nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["shipment_id"],
            ["shipment.id"],
            name="fk_outbound_order_shipment_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_outbound_order_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_outbound_order_wh_code"),
    )
    op.create_index(
        op.f("ix_outbound_order_warehouse_id"),
        "outbound_order",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_outbound_order_shipment_id"),
        "outbound_order",
        ["shipment_id"],
        unique=False,
    )

    op.create_table(
        "warehouse_task",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("task_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("handling_unit_id", UUID(as_uuid=True), nullable=True),
        sa.Column("storage_bin_id", UUID(as_uuid=True), nullable=True),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["assigned_user_id"],
            ["user.id"],
            name="fk_warehouse_task_assigned_user_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["handling_unit_id"],
            ["handling_unit.id"],
            name="fk_warehouse_task_handling_unit_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["storage_bin_id"],
            ["storage_bin.id"],
            name="fk_warehouse_task_storage_bin_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_warehouse_task_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_warehouse_task_warehouse_id"),
        "warehouse_task",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_warehouse_task_assigned_user_id"),
        "warehouse_task",
        ["assigned_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_warehouse_task_handling_unit_id"),
        "warehouse_task",
        ["handling_unit_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_warehouse_task_storage_bin_id"),
        "warehouse_task",
        ["storage_bin_id"],
        unique=False,
    )

    op.create_table(
        "task_execution",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_task_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="started"),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["user.id"],
            name="fk_task_execution_actor_user_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_task_id"],
            ["warehouse_task.id"],
            name="fk_task_execution_warehouse_task_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_task_execution_warehouse_task_id"),
        "task_execution",
        ["warehouse_task_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_task_execution_actor_user_id"),
        "task_execution",
        ["actor_user_id"],
        unique=False,
    )

    op.create_table(
        "inventory_snapshot",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("extra", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_inventory_snapshot_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_inventory_snapshot_warehouse_id"),
        "inventory_snapshot",
        ["warehouse_id"],
        unique=False,
    )

    op.create_table(
        "sensor_reading",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
        sa.Column("sensor_code", sa.String(length=64), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value_float", sa.Float(), nullable=True),
        sa.Column("value_text", sa.String(length=1024), nullable=True),
        sa.Column("position", JSONB, nullable=True),
        sa.Column("raw", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_sensor_reading_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_sensor_reading_warehouse_id"),
        "sensor_reading",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sensor_reading_sensor_code"),
        "sensor_reading",
        ["sensor_code"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sensor_reading_metric_key"), "sensor_reading", ["metric_key"], unique=False
    )

    op.create_table(
        "vehicle_position",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
        sa.Column("equipment_id", UUID(as_uuid=True), nullable=True),
        sa.Column("external_vehicle_id", sa.String(length=128), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "pose",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("extra", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            name="fk_vehicle_position_equipment_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_id"],
            ["warehouse.id"],
            name="fk_vehicle_position_warehouse_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vehicle_position_warehouse_id"),
        "vehicle_position",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vehicle_position_equipment_id"),
        "vehicle_position",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vehicle_position_external_vehicle_id"),
        "vehicle_position",
        ["external_vehicle_id"],
        unique=False,
    )


def downgrade():
    op.drop_table("vehicle_position")
    op.drop_table("sensor_reading")
    op.drop_table("inventory_snapshot")
    op.drop_table("task_execution")
    op.drop_table("warehouse_task")
    op.drop_table("outbound_order")
    op.drop_table("inbound_order")
    op.drop_table("shipment")
    op.drop_table("inventory_lot")
    op.drop_table("pallet")
    op.drop_table("handling_unit")
    op.drop_table("route_edge")
    op.drop_table("route_node")
    op.drop_table("dock_door")
    op.drop_table("staging_area")
    op.drop_table("storage_bin")
    op.drop_table("warehouse_rack")
    op.drop_table("warehouse_aisle")

    op.drop_index(op.f("ix_warehousezone_code"), table_name="warehousezone")
    op.drop_column("warehousezone", "extra")
    op.drop_column("warehousezone", "zone_kind")
    op.drop_column("warehousezone", "code")
    op.drop_constraint("uq_warehousezone_warehouse_name", "warehousezone", type_="unique")
    op.create_unique_constraint("uq_warehousezone_name", "warehousezone", ["name"])
    op.drop_constraint("fk_warehousezone_warehouse_id", "warehousezone", type_="foreignkey")
    op.drop_index(op.f("ix_warehousezone_warehouse_id"), table_name="warehousezone")
    op.drop_column("warehousezone", "warehouse_id")

    op.drop_constraint("fk_warehouse_layout_warehouse_id", "warehouse_layout", type_="foreignkey")
    op.drop_index(op.f("ix_warehouse_layout_warehouse_id"), table_name="warehouse_layout")
    op.drop_column("warehouse_layout", "warehouse_id")

    op.drop_constraint("fk_warehouse_active_layout_id", "warehouse", type_="foreignkey")
    op.drop_table("warehouse")
