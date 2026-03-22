"""Twin SLA definitions and business rules tables.

Revision ID: v0w1x2y3z4a5
Revises: u9v8w7x6y5z4
Create Date: 2026-03-22

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "v0w1x2y3z4a5"
down_revision = "u9v8w7x6y5z4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "twin_sla_definition",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("target_entity_kind", sa.String(length=64), nullable=False),
        sa.Column("metric_key", sa.String(length=128), nullable=False),
        sa.Column("target_spec", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("window_spec", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouse.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_twin_sla_wh_code"),
    )
    op.create_index(
        "ix_twin_sla_definition_warehouse_id",
        "twin_sla_definition",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        "ix_twin_sla_definition_code",
        "twin_sla_definition",
        ["code"],
        unique=False,
    )

    op.create_table(
        "twin_business_rule",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("rule_kind", sa.String(length=32), nullable=False),
        sa.Column("applies_to_entity_kind", sa.String(length=64), nullable=True),
        sa.Column("expression", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouse.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_twin_rule_wh_code"),
    )
    op.create_index(
        "ix_twin_business_rule_warehouse_id",
        "twin_business_rule",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        "ix_twin_business_rule_code",
        "twin_business_rule",
        ["code"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_twin_business_rule_code", table_name="twin_business_rule")
    op.drop_index("ix_twin_business_rule_warehouse_id", table_name="twin_business_rule")
    op.drop_table("twin_business_rule")
    op.drop_index("ix_twin_sla_definition_code", table_name="twin_sla_definition")
    op.drop_index("ix_twin_sla_definition_warehouse_id", table_name="twin_sla_definition")
    op.drop_table("twin_sla_definition")
