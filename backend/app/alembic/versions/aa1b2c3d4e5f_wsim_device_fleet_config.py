"""Fleet config columns on wsim_device: code, description, enabled, archived.

Revision ID: aa1b2c3d4e5f
Revises: a9b0c1d2e3f4
Create Date: 2026-09-19

"""

import sqlalchemy as sa
from alembic import op

revision = "aa1b2c3d4e5f"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("wsim_device", sa.Column("code", sa.String(length=64), nullable=True))
    op.add_column(
        "wsim_device",
        sa.Column("description", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "wsim_device",
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "wsim_device",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        """
        UPDATE wsim_device
        SET code = CASE
            WHEN name ~ '^FORKLIFT-([0-9]+)$' THEN 'fl-' || CAST(CAST(substring(name from '([0-9]+)$') AS int) AS text)
            WHEN name ~ '^AGV-([0-9]+)$' THEN 'agv-' || CAST(CAST(substring(name from '([0-9]+)$') AS int) AS text)
            WHEN name ~ '^AMR-([0-9]+)$' THEN 'amr-' || CAST(CAST(substring(name from '([0-9]+)$') AS int) AS text)
            WHEN name = 'CONVEYOR-01' THEN 'cnv-1'
            WHEN name = 'CONVEYOR-02' THEN 'cnv-2'
            WHEN name = 'DOCK IN-1' THEN 'dock-in-1'
            WHEN name = 'DOCK IN-2' THEN 'dock-in-2'
            WHEN name = 'DOCK IN-3' THEN 'dock-in-3'
            WHEN name = 'DOCK OUT-1' THEN 'dock-out-1'
            WHEN name = 'DOCK OUT-2' THEN 'dock-out-2'
            WHEN name = 'DOCK OUT-3' THEN 'dock-out-3'
            WHEN name = 'SCANNER IN-1' THEN 'scn-IN-1'
            WHEN name = 'SCANNER IN-2' THEN 'scn-IN-2'
            WHEN name = 'SCANNER IN-3' THEN 'scn-IN-3'
            WHEN name = 'SCANNER OUT-1' THEN 'scn-OUT-1'
            WHEN name = 'SCANNER OUT-2' THEN 'scn-OUT-2'
            WHEN name = 'SCANNER OUT-3' THEN 'scn-OUT-3'
            WHEN name = 'SCANNER PACK' THEN 'scn-PACK'
            WHEN name LIKE 'SENSOR T-01%' THEN 'sns-T-01'
            WHEN name LIKE 'SENSOR T-02%' THEN 'sns-T-02'
            WHEN name LIKE 'SENSOR H-01%' THEN 'sns-H-01'
            WHEN name LIKE 'SENSOR V-01%' THEN 'sns-V-01'
            WHEN name LIKE 'SENSOR C-01%' THEN 'sns-C-01'
            WHEN name LIKE 'SENSOR W-01%' THEN 'sns-W-01'
            WHEN name LIKE 'SENSOR P-01%' THEN 'sns-P-01'
            WHEN name = 'CHARGING_STATION CH-01' THEN 'chg-1'
            WHEN name = 'CHARGING_STATION CH-02' THEN 'chg-2'
            WHEN name = 'CHARGING_STATION CH-03' THEN 'chg-3'
            WHEN name = 'CHARGING_STATION CH-04' THEN 'chg-4'
            ELSE replace(lower(name), ' ', '-')
        END
        WHERE code IS NULL
        """
    )
    op.alter_column("wsim_device", "code", existing_type=sa.String(length=64), nullable=False)
    op.create_unique_constraint("uq_wsim_device_wh_code", "wsim_device", ["warehouse_id", "code"])


def downgrade():
    op.drop_constraint("uq_wsim_device_wh_code", "wsim_device", type_="unique")
    op.drop_column("wsim_device", "archived")
    op.drop_column("wsim_device", "enabled")
    op.drop_column("wsim_device", "description")
    op.drop_column("wsim_device", "code")
