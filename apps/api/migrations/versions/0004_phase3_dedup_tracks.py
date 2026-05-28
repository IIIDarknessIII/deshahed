"""phase 3: drone_events cluster + sources, drone_tracks table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geography


revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # cluster_id + sources on drone_events. Nullable on add so we can
    # backfill before flipping NOT NULL.
    op.add_column(
        "drone_events",
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "drone_events",
        sa.Column(
            "sources",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # Backfill existing rows: every legacy event becomes its own cluster, and
    # its source descriptor is materialized from the existing columns.
    op.execute(
        """
        UPDATE drone_events
        SET cluster_id = gen_random_uuid(),
            sources = jsonb_build_array(
                jsonb_build_object(
                    'channel', source_channel,
                    'message_id', source_message_id,
                    'detected_at', to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                )
            )
        WHERE cluster_id IS NULL
        """
    )
    op.alter_column("drone_events", "cluster_id", nullable=False)
    op.create_index("idx_drone_events_cluster", "drone_events", ["cluster_id"])

    # Combined index supports the dedup lookup:
    #   WHERE event_type = X AND detected_at > NOW() - interval '3 minutes'
    op.create_index(
        "idx_drone_events_dedup",
        "drone_events",
        ["event_type", "detected_at"],
    )

    # drone_tracks table
    op.create_table(
        "drone_tracks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "path",
            Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column("confidence", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_drone_tracks_active",
        "drone_tracks",
        ["last_seen_at"],
        postgresql_where=sa.text("is_active"),
    )
    op.create_index(
        "idx_drone_tracks_path",
        "drone_tracks",
        ["path"],
        postgresql_using="gist",
    )
    op.create_index(
        "idx_drone_tracks_type_active",
        "drone_tracks",
        ["event_type", "last_seen_at"],
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("idx_drone_tracks_type_active", table_name="drone_tracks")
    op.drop_index("idx_drone_tracks_path", table_name="drone_tracks")
    op.drop_index("idx_drone_tracks_active", table_name="drone_tracks")
    op.drop_table("drone_tracks")
    op.drop_index("idx_drone_events_dedup", table_name="drone_events")
    op.drop_index("idx_drone_events_cluster", table_name="drone_events")
    op.drop_column("drone_events", "sources")
    op.drop_column("drone_events", "cluster_id")
