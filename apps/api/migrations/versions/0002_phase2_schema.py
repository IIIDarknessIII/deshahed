"""phase 2 schema: drone_events + settlements + geocode_cache

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geography


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # drone_events: OSINT reports normalized & geocoded
    op.create_table(
        "drone_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source_channel", sa.Text(), nullable=False),
        sa.Column("source_message_id", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("location_text", sa.Text(), nullable=False),
        sa.Column("direction_text", sa.Text(), nullable=True),
        sa.Column(
            "location_point",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "direction_point",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("confidence", sa.Text(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("raw_payload", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    op.create_index(
        "idx_drone_events_expires", "drone_events", ["expires_at"]
    )
    op.create_index(
        "idx_drone_events_point",
        "drone_events",
        ["location_point"],
        postgresql_using="gist",
    )
    op.create_index(
        "idx_drone_events_source",
        "drone_events",
        ["source_channel", "source_message_id"],
    )

    # settlements: local geocoding reference (cities/towns/villages of Ukraine)
    op.create_table(
        "settlements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("name_normalized", sa.Text(), nullable=False),
        sa.Column("oblast", sa.Text(), nullable=False),
        sa.Column("raion", sa.Text(), nullable=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("type", sa.Text(), nullable=True),
    )
    op.create_index(
        "idx_settlements_name_trgm",
        "settlements",
        ["name_normalized"],
        postgresql_using="gin",
        postgresql_ops={"name_normalized": "gin_trgm_ops"},
    )

    # geocode_cache: long-term result cache keyed by query string
    op.create_table(
        "geocode_cache",
        sa.Column("query", sa.Text(), primary_key=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lon", sa.Float(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Text(), nullable=False),
        sa.Column(
            "cached_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("geocode_cache")
    op.drop_index("idx_settlements_name_trgm", table_name="settlements")
    op.drop_table("settlements")
    op.drop_index("idx_drone_events_source", table_name="drone_events")
    op.drop_index("idx_drone_events_point", table_name="drone_events")
    op.drop_index("idx_drone_events_expires", table_name="drone_events")
    op.drop_table("drone_events")
    # pg_trgm intentionally left in place.
