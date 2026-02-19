"""Brand table and equipment.brand_id (бренды из справочника)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2025-02-18

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "brand",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_brand_name"),
    )

    id1, id2 = str(uuid.uuid4()), str(uuid.uuid4())
    op.execute(
        "INSERT INTO brand (id, name) VALUES ('%s', 'Linde'), ('%s', 'Jungheinrich')" % (id1, id2)
    )

    op.add_column(
        "equipment",
        sa.Column("brand_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key("fk_equipment_brand_id", "equipment", "brand", ["brand_id"], ["id"], ondelete="RESTRICT")

    op.execute(
        """
        UPDATE equipment e
        SET brand_id = (SELECT id FROM brand b WHERE b.name = e.brand LIMIT 1)
        """
    )
    op.execute(
        """
        UPDATE equipment SET brand_id = (SELECT id FROM brand LIMIT 1) WHERE brand_id IS NULL
        """
    )
    op.drop_column("equipment", "brand")
    op.alter_column(
        "equipment",
        "brand_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )


def downgrade():
    op.add_column(
        "equipment",
        sa.Column("brand", sa.String(length=128), nullable=True),
    )
    op.execute(
        """
        UPDATE equipment e
        SET brand = (SELECT name FROM brand b WHERE b.id = e.brand_id)
        """
    )
    op.alter_column("equipment", "brand", nullable=False)
    op.drop_constraint("fk_equipment_brand_id", "equipment", type_="foreignkey")
    op.drop_column("equipment", "brand_id")
    op.drop_table("brand")
