"""Work order (заявка) tables: workorder, status history, comments, checklist, attachments.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workorder",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("equipment_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.String(length=4096), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workorder_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by_id", sa.Uuid(), nullable=True),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workorder_comment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.String(length=4096), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workorder_checklist_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workorder_attachment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("file_path", sa.String(length=1024), nullable=False),
        sa.Column("filename", sa.String(length=256), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("workorder_attachment")
    op.drop_table("workorder_checklist_item")
    op.drop_table("workorder_comment")
    op.drop_table("workorder_status_history")
    op.drop_table("workorder")
