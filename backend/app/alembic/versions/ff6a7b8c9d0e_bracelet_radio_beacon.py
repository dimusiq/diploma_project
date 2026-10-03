"""Браслеты-радиомаяки: тип устройства и история назначений.

Revision ID: ff6a7b8c9d0e
Revises: ee5f6a7b8c9d
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "ff6a7b8c9d0e"
down_revision = "ee5f6a7b8c9d"
branch_labels = None
depends_on = None

DEMO_BRACELETS = (
    ("rb-1", "RB-001", "Браслет RB-001", "SN-RB-001", "11111111-1111-4111-8111-111111111001"),
    ("rb-2", "RB-002", "Браслет RB-002", "SN-RB-002", "11111111-1111-4111-8111-111111111002"),
    ("rb-3", "RB-003", "Браслет RB-003", "SN-RB-003", "11111111-1111-4111-8111-111111111003"),
)


def upgrade() -> None:
    op.create_table(
        "wsim_bracelet_assignment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("unassigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("previous_device_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["device_id"], ["wsim_device.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["warehouse_employee.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previous_device_id"], ["wsim_device.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wsim_bracelet_assignment_device_id", "wsim_bracelet_assignment", ["device_id"])
    op.create_index(
        "ix_wsim_bracelet_assignment_employee_id", "wsim_bracelet_assignment", ["employee_id"]
    )
    op.create_index(
        "ix_wsim_bracelet_assignment_assigned_at", "wsim_bracelet_assignment", ["assigned_at"]
    )
    op.create_index(
        "ix_wsim_bracelet_assignment_unassigned_at",
        "wsim_bracelet_assignment",
        ["unassigned_at"],
    )
    op.create_index(
        "uq_wsim_bracelet_active_device",
        "wsim_bracelet_assignment",
        ["device_id"],
        unique=True,
        postgresql_where=sa.text("unassigned_at IS NULL"),
    )
    op.create_index(
        "uq_wsim_bracelet_active_employee",
        "wsim_bracelet_assignment",
        ["employee_id"],
        unique=True,
        postgresql_where=sa.text("unassigned_at IS NULL"),
    )

    conn = op.get_bind()
    warehouse = conn.execute(
        sa.text("SELECT id FROM wsim_warehouse WHERE code = 'DEMO' LIMIT 1")
    ).first()
    if warehouse is None:
        return
    warehouse_id = warehouse[0]
    now = datetime.now(timezone.utc)
    for idx, (code, name, label, serial, employee_id) in enumerate(DEMO_BRACELETS):
        exists = conn.execute(
            sa.text(
                "SELECT id FROM wsim_device WHERE warehouse_id = :wh AND code = :code LIMIT 1"
            ),
            {"wh": warehouse_id, "code": code},
        ).first()
        if exists:
            device_id = exists[0]
        else:
            device_id = uuid.uuid4()
            meta = {
                "kind": "radio_beacon",
                "serialNumber": serial,
                "locationSource": "simulation",
                "zoneId": "zone-storage",
            }
            conn.execute(
                sa.text(
                    """
                    INSERT INTO wsim_device (
                        id, warehouse_id, zone_id, code, name, description, device_type,
                        enabled, archived, status, battery, x, y, home_x, home_y,
                        speed_mps, current_task_id, meta, created_at, updated_at
                    ) VALUES (
                        :id, :wh, NULL, :code, :name, :description, 'RADIO_BEACON',
                        true, false, 'ONLINE', :battery, :x, :y, :x, :y,
                        0, NULL, CAST(:meta AS jsonb), :now, :now
                    )
                    """
                ),
                {
                    "id": device_id,
                    "wh": warehouse_id,
                    "code": code,
                    "name": name,
                    "description": label,
                    "battery": 88.0 - idx * 4,
                    "x": 10.0 + idx * 2,
                    "y": 12.0,
                    "meta": __import__("json").dumps(meta, ensure_ascii=False),
                    "now": now,
                },
            )
        emp = conn.execute(
            sa.text("SELECT id FROM warehouse_employee WHERE id = :id LIMIT 1"),
            {"id": employee_id},
        ).first()
        if emp is None:
            continue
        active = conn.execute(
            sa.text(
                """
                SELECT id FROM wsim_bracelet_assignment
                WHERE device_id = :device_id AND unassigned_at IS NULL
                LIMIT 1
                """
            ),
            {"device_id": device_id},
        ).first()
        if active:
            continue
        emp_active = conn.execute(
            sa.text(
                """
                SELECT id FROM wsim_bracelet_assignment
                WHERE employee_id = :employee_id AND unassigned_at IS NULL
                LIMIT 1
                """
            ),
            {"employee_id": employee_id},
        ).first()
        if emp_active:
            continue
        conn.execute(
            sa.text(
                """
                INSERT INTO wsim_bracelet_assignment (
                    id, device_id, employee_id, assigned_at, unassigned_at,
                    assigned_by_user_id, previous_device_id, notes
                ) VALUES (
                    :id, :device_id, :employee_id, :now, NULL, NULL, NULL, 'demo seed'
                )
                """
            ),
            {
                "id": uuid.uuid4(),
                "device_id": device_id,
                "employee_id": employee_id,
                "now": now,
            },
        )


def downgrade() -> None:
    op.drop_index("uq_wsim_bracelet_active_employee", table_name="wsim_bracelet_assignment")
    op.drop_index("uq_wsim_bracelet_active_device", table_name="wsim_bracelet_assignment")
    op.drop_index("ix_wsim_bracelet_assignment_unassigned_at", table_name="wsim_bracelet_assignment")
    op.drop_index("ix_wsim_bracelet_assignment_assigned_at", table_name="wsim_bracelet_assignment")
    op.drop_index("ix_wsim_bracelet_assignment_employee_id", table_name="wsim_bracelet_assignment")
    op.drop_index("ix_wsim_bracelet_assignment_device_id", table_name="wsim_bracelet_assignment")
    op.drop_table("wsim_bracelet_assignment")
    op.execute("DELETE FROM wsim_device WHERE device_type = 'RADIO_BEACON'")
