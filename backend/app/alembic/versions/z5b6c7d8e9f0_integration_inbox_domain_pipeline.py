"""Integration inbox → domain events + twin read projections (task, pose, queue, alert).

Revision ID: z5b6c7d8e9f0
Revises: x2y3z4a5b6c7
Create Date: 2026-03-22

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "z5b6c7d8e9f0"
down_revision = "x2y3z4a5b6c7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "integration_inbox",
        sa.Column("idempotency_key", sa.String(length=256), nullable=True),
    )
    op.add_column(
        "integration_inbox",
        sa.Column("processing_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "integration_inbox",
        sa.Column("domain_event_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_integration_inbox_domain_event_id",
        "integration_inbox",
        "domain_event",
        ["domain_event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_integration_inbox_domain_event_id",
        "integration_inbox",
        ["domain_event_id"],
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_integration_inbox_source_idempotency
        ON integration_inbox (source, idempotency_key)
        WHERE idempotency_key IS NOT NULL
        """
    )

    op.create_table(
        "twin_task_state_projection",
        sa.Column("warehouse_task_id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("task_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_domain_event_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["warehouse_task_id"],
            ["warehouse_task.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["last_domain_event_id"],
            ["domain_event.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("warehouse_task_id"),
    )
    op.create_index(
        "ix_twin_task_state_wh_status",
        "twin_task_state_projection",
        ["warehouse_id", "status"],
        unique=False,
    )

    op.create_table(
        "twin_equipment_pose_projection",
        sa.Column("equipment_id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
        sa.Column("pose", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_domain_event_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["last_domain_event_id"],
            ["domain_event.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("equipment_id"),
    )

    op.create_table(
        "twin_queue_depth_projection",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("queue_name", sa.String(length=64), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_domain_event_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["last_domain_event_id"],
            ["domain_event.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "warehouse_id",
            "queue_name",
            name="uq_twin_queue_depth_wh_name",
        ),
    )
    op.create_index(
        "ix_twin_queue_depth_warehouse_id",
        "twin_queue_depth_projection",
        ["warehouse_id"],
        unique=False,
    )

    op.create_table(
        "twin_alert_open_projection",
        sa.Column("alert_id", UUID(as_uuid=True), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=True),
        sa.Column("message", sa.String(length=2048), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "raised_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_domain_event_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["last_domain_event_id"],
            ["domain_event.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("alert_id"),
    )
    op.create_index(
        "ix_twin_alert_open_resolved",
        "twin_alert_open_projection",
        ["resolved_at"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_twin_alert_open_resolved", table_name="twin_alert_open_projection")
    op.drop_table("twin_alert_open_projection")
    op.drop_index("ix_twin_queue_depth_warehouse_id", table_name="twin_queue_depth_projection")
    op.drop_table("twin_queue_depth_projection")
    op.drop_table("twin_equipment_pose_projection")
    op.drop_index("ix_twin_task_state_wh_status", table_name="twin_task_state_projection")
    op.drop_table("twin_task_state_projection")
    op.execute("DROP INDEX IF EXISTS uq_integration_inbox_source_idempotency")
    op.drop_index("ix_integration_inbox_domain_event_id", table_name="integration_inbox")
    op.drop_constraint("fk_integration_inbox_domain_event_id", "integration_inbox", type_="foreignkey")
    op.drop_column("integration_inbox", "domain_event_id")
    op.drop_column("integration_inbox", "processing_error")
    op.drop_column("integration_inbox", "idempotency_key")
