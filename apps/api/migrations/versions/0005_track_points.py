"""drone_tracks: add last_point / prev_point / point_count

Lets the track assembler do its distance + direction checks via cheap
column reads instead of parsing the path LINESTRING each call.

Revision ID: 0005
Revises: 0004
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geography


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "drone_tracks",
        sa.Column(
            "last_point",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
    )
    op.add_column(
        "drone_tracks",
        sa.Column(
            "prev_point",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
    )
    op.add_column(
        "drone_tracks",
        sa.Column("point_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("drone_tracks", "point_count")
    op.drop_column("drone_tracks", "prev_point")
    op.drop_column("drone_tracks", "last_point")
