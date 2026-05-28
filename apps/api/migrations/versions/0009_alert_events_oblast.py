"""alert_events: add location_oblast / location_oblast_uid + backfill from raw_payload

alerts.in.ua fires alerts at oblast/raion/hromada/city level; without these
two columns it's impossible to GROUP BY oblast — top-10 widget shows raions
mixed with city-of-Kyiv entries instead of a clean per-oblast roll-up.

Revision ID: 0009
Revises: 0008
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "alert_events",
        sa.Column("location_oblast", sa.Text(), nullable=True),
    )
    op.add_column(
        "alert_events",
        sa.Column("location_oblast_uid", sa.Integer(), nullable=True),
    )

    # Backfill from the JSONB raw_payload. Sub-oblast alerts have the parent
    # title in raw_payload->>'location_oblast'; older rows (before the poller
    # was teaching the normalize step) don't carry it, so we fall back to
    # location_title (which means the row is itself an oblast).
    op.execute(
        """
        UPDATE alert_events
        SET location_oblast = COALESCE(
                raw_payload->>'location_oblast',
                location_title
            ),
            location_oblast_uid = COALESCE(
                NULLIF(raw_payload->>'location_oblast_uid', '')::int,
                location_uid
            )
        WHERE location_oblast IS NULL
        """
    )

    op.alter_column("alert_events", "location_oblast", nullable=False)
    op.alter_column("alert_events", "location_oblast_uid", nullable=False)

    # /stats/summary groups by these.
    op.create_index(
        "idx_alert_events_oblast",
        "alert_events",
        ["location_oblast_uid", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_alert_events_oblast", table_name="alert_events")
    op.drop_column("alert_events", "location_oblast_uid")
    op.drop_column("alert_events", "location_oblast")
