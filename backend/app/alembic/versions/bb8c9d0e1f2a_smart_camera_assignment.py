"""Умные камеры: тип устройства и история закреплений за техникой.

Revision ID: bb8c9d0e1f2a
Revises: aa7b8c9d0e1f
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "bb8c9d0e1f2a"
down_revision = "aa7b8c9d0e1f"
branch_labels = None
depends_on = None

DEMO_CAMERAS = (
    ("cam-1", "CAM-001", "Умная камера CAM-001", "SN-CAM-001", "agv-1"),
    ("cam-2", "CAM-002", "Умная камера CAM-002", "SN-CAM-002", None),
    ("cam-3", "CAM-003", "Умная камера CAM-003", "SN-CAM-003", None),
)


def upgrade() -> None:
    op.create_table(
        "wsim_smart_camera_assignment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("camera_device_id", sa.Uuid(), nullable=False),
        sa.Column("host_device_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("unassigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("previous_camera_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["camera_device_id"], ["wsim_device.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["host_device_id"], ["wsim_device.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previous_camera_id"], ["wsim_device.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_wsim_smart_camera_assignment_camera_device_id",
        "wsim_smart_camera_assignment",
        ["camera_device_id"],
    )
    op.create_index(
        "ix_wsim_smart_camera_assignment_host_device_id",
        "wsim_smart_camera_assignment",
        ["host_device_id"],
    )
    op.create_index(
        "ix_wsim_smart_camera_assignment_assigned_at",
        "wsim_smart_camera_assignment",
        ["assigned_at"],
    )
    op.create_index(
        "ix_wsim_smart_camera_assignment_unassigned_at",
        "wsim_smart_camera_assignment",
        ["unassigned_at"],
    )
    op.create_index(
        "uq_wsim_smart_camera_active_camera",
        "wsim_smart_camera_assignment",
        ["camera_device_id"],
        unique=True,
        postgresql_where=sa.text("unassigned_at IS NULL"),
    )
    op.create_index(
        "uq_wsim_smart_camera_active_host",
        "wsim_smart_camera_assignment",
        ["host_device_id"],
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
    for idx, (code, name, label, serial, host_code) in enumerate(DEMO_CAMERAS):
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
                "kind": "smart_camera",
                "serialNumber": serial,
                "model": "Scene camera",
                "targetFps": 24,
                "resolution": "1280x720",
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
                        :id, :wh, NULL, :code, :name, :description, 'SMART_CAMERA',
                        true, false, 'ONLINE', NULL, :x, :y, :x, :y,
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
                    "x": 20.0 + idx * 2,
                    "y": 14.0,
                    "meta": json.dumps(meta, ensure_ascii=False),
                    "now": now,
                },
            )
        if not host_code:
            continue
        host = conn.execute(
            sa.text(
                "SELECT id FROM wsim_device WHERE warehouse_id = :wh AND code = :code LIMIT 1"
            ),
            {"wh": warehouse_id, "code": host_code},
        ).first()
        if host is None:
            continue
        active = conn.execute(
            sa.text(
                """
                SELECT id FROM wsim_smart_camera_assignment
                WHERE (camera_device_id = :cam OR host_device_id = :host)
                  AND unassigned_at IS NULL
                LIMIT 1
                """
            ),
            {"cam": device_id, "host": host[0]},
        ).first()
        if active:
            continue
        conn.execute(
            sa.text(
                """
                INSERT INTO wsim_smart_camera_assignment (
                    id, camera_device_id, host_device_id, assigned_at, unassigned_at,
                    assigned_by_user_id, previous_camera_id, notes
                ) VALUES (
                    :id, :cam, :host, :now, NULL, NULL, NULL, 'demo seed'
                )
                """
            ),
            {
                "id": uuid.uuid4(),
                "cam": device_id,
                "host": host[0],
                "now": now,
            },
        )


def downgrade() -> None:
    op.drop_index(
        "uq_wsim_smart_camera_active_host",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_index(
        "uq_wsim_smart_camera_active_camera",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_index(
        "ix_wsim_smart_camera_assignment_unassigned_at",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_index(
        "ix_wsim_smart_camera_assignment_assigned_at",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_index(
        "ix_wsim_smart_camera_assignment_host_device_id",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_index(
        "ix_wsim_smart_camera_assignment_camera_device_id",
        table_name="wsim_smart_camera_assignment",
    )
    op.drop_table("wsim_smart_camera_assignment")
