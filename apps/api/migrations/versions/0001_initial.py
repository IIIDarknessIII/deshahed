"""initial: postgis extension + alert_events

Revision ID: 0001
Revises:
Create Date: 2026-05-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "alert_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("location_uid", sa.Integer(), nullable=False),
        sa.Column("location_title", sa.Text(), nullable=False),
        sa.Column("location_type", sa.Text(), nullable=False),
        sa.Column("alert_type", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    op.create_index(
        "idx_alert_events_active",
        "alert_events",
        ["finished_at"],
        postgresql_where=sa.text("finished_at IS NULL"),
    )
    op.create_index(
        "idx_alert_events_location",
        "alert_events",
        ["location_uid", sa.text("started_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_alert_events_location", table_name="alert_events")
    op.drop_index("idx_alert_events_active", table_name="alert_events")
    op.drop_table("alert_events")
    # PostGIS extension intentionally left in place — other migrations may depend on it.
