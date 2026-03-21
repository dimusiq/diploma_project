"""Layout: spec lifecycle, schema version column, route graph tied to layout revision.

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-03-20

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "warehouse_layout",
        sa.Column("spec_schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "warehouse_layout",
        sa.Column("lifecycle_status", sa.String(length=16), nullable=False, server_default="published"),
    )
    op.add_column(
        "warehouse_layout",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "warehouse_layout",
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE warehouse_layout SET published_at = created_at WHERE published_at IS NULL;
        UPDATE warehouse_layout SET activated_at = created_at WHERE is_active AND activated_at IS NULL;
        """
    )
    op.create_index(
        op.f("ix_warehouse_layout_lifecycle_status"),
        "warehouse_layout",
        ["lifecycle_status"],
        unique=False,
    )

    op.add_column(
        "route_node",
        sa.Column("warehouse_layout_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "route_edge",
        sa.Column("warehouse_layout_id", UUID(as_uuid=True), nullable=True),
    )

    op.execute(
        """
        UPDATE route_node SET warehouse_layout_id = (
            SELECT id FROM warehouse_layout WHERE is_active ORDER BY version ASC LIMIT 1
        ) WHERE warehouse_layout_id IS NULL;
        UPDATE route_node SET warehouse_layout_id = (
            SELECT id FROM warehouse_layout ORDER BY created_at ASC LIMIT 1
        ) WHERE warehouse_layout_id IS NULL;
        """
    )
    op.execute(
        """
        UPDATE route_edge e SET warehouse_layout_id = (
            SELECT n.warehouse_layout_id FROM route_node n WHERE n.id = e.from_node_id LIMIT 1
        ) WHERE warehouse_layout_id IS NULL;
        UPDATE route_edge SET warehouse_layout_id = (
            SELECT id FROM warehouse_layout WHERE is_active ORDER BY version ASC LIMIT 1
        ) WHERE warehouse_layout_id IS NULL;
        UPDATE route_edge SET warehouse_layout_id = (
            SELECT id FROM warehouse_layout ORDER BY created_at ASC LIMIT 1
        ) WHERE warehouse_layout_id IS NULL;
        """
    )

    op.alter_column("route_node", "warehouse_layout_id", nullable=False)
    op.alter_column("route_edge", "warehouse_layout_id", nullable=False)

    op.create_foreign_key(
        "fk_route_node_warehouse_layout_id",
        "route_node",
        "warehouse_layout",
        ["warehouse_layout_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_route_node_warehouse_layout_id"),
        "route_node",
        ["warehouse_layout_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_route_edge_warehouse_layout_id",
        "route_edge",
        "warehouse_layout",
        ["warehouse_layout_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_route_edge_warehouse_layout_id"),
        "route_edge",
        ["warehouse_layout_id"],
        unique=False,
    )

    op.drop_constraint("uq_route_node_wh_code", "route_node", type_="unique")
    op.create_unique_constraint(
        "uq_route_node_layout_code",
        "route_node",
        ["warehouse_layout_id", "code"],
    )

    op.drop_constraint("uq_route_edge_wh_from_to", "route_edge", type_="unique")
    op.create_unique_constraint(
        "uq_route_edge_layout_from_to",
        "route_edge",
        ["warehouse_layout_id", "from_node_id", "to_node_id"],
    )


def downgrade():
    op.drop_constraint("uq_route_edge_layout_from_to", "route_edge", type_="unique")
    op.create_unique_constraint(
        "uq_route_edge_wh_from_to",
        "route_edge",
        ["warehouse_id", "from_node_id", "to_node_id"],
    )

    op.drop_constraint("uq_route_node_layout_code", "route_node", type_="unique")
    op.create_unique_constraint(
        "uq_route_node_wh_code",
        "route_node",
        ["warehouse_id", "code"],
    )

    op.drop_constraint("fk_route_edge_warehouse_layout_id", "route_edge", type_="foreignkey")
    op.drop_index(op.f("ix_route_edge_warehouse_layout_id"), table_name="route_edge")
    op.drop_column("route_edge", "warehouse_layout_id")

    op.drop_constraint("fk_route_node_warehouse_layout_id", "route_node", type_="foreignkey")
    op.drop_index(op.f("ix_route_node_warehouse_layout_id"), table_name="route_node")
    op.drop_column("route_node", "warehouse_layout_id")

    op.drop_index(op.f("ix_warehouse_layout_lifecycle_status"), table_name="warehouse_layout")
    op.drop_column("warehouse_layout", "activated_at")
    op.drop_column("warehouse_layout", "published_at")
    op.drop_column("warehouse_layout", "lifecycle_status")
    op.drop_column("warehouse_layout", "spec_schema_version")
