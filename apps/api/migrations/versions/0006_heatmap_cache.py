"""heatmap_cache table — H3-cell density per (period, event_type)

Revision ID: 0006
Revises: 0005
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "heatmap_cache",
        sa.Column("h3_index", sa.Text(), nullable=False),
        sa.Column("period", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("h3_index", "period", "event_type"),
    )
    # The REST endpoint always queries by (period, event_type).
    op.create_index(
        "idx_heatmap_lookup", "heatmap_cache", ["period", "event_type"]
    )


def downgrade() -> None:
    op.drop_index("idx_heatmap_lookup", table_name="heatmap_cache")
    op.drop_table("heatmap_cache")
