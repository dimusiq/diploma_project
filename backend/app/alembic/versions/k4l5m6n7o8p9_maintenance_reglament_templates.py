"""Maintenance reglament templates (checklist + required spares).

Revision ID: k4l5m6n7o8p9
Revises: h3i4j5k6l7m8
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa

revision = "k4l5m6n7o8p9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "maintenance_reglament_template",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("equipment_type", sa.String(length=32), nullable=False),
        sa.Column("interval_hours", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_reglament_template_equipment_type",
        "maintenance_reglament_template",
        ["equipment_type"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_reglament_template_interval_hours",
        "maintenance_reglament_template",
        ["interval_hours"],
        unique=False,
    )

    op.create_table(
        "maintenance_template_checklist_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["maintenance_reglament_template.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_template_checklist_item_sort_order",
        "maintenance_template_checklist_item",
        ["sort_order"],
        unique=False,
    )

    op.create_table(
        "maintenance_template_spare_part_requirement",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column("spare_part_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["maintenance_reglament_template.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["spare_part_id"],
            ["spare_part.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_template_spare_part_requirement_spare_part_id",
        "maintenance_template_spare_part_requirement",
        ["spare_part_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        "ix_maintenance_template_spare_part_requirement_spare_part_id",
        table_name="maintenance_template_spare_part_requirement",
    )
    op.drop_table("maintenance_template_spare_part_requirement")
    op.drop_index(
        "ix_maintenance_template_checklist_item_sort_order",
        table_name="maintenance_template_checklist_item",
    )
    op.drop_table("maintenance_template_checklist_item")
    op.drop_index(
        "ix_maintenance_reglament_template_interval_hours",
        table_name="maintenance_reglament_template",
    )
    op.drop_index(
        "ix_maintenance_reglament_template_equipment_type",
        table_name="maintenance_reglament_template",
    )
    op.drop_table("maintenance_reglament_template")

