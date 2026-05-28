"""push_subscriptions: store region as oblast title string

alerts.in.ua's `location_oblast_uid` is unreliable (equals location_uid for
sub-oblast alerts), so we filter pushes by the canonical oblast title
string instead. `region_uid` stays around as a no-op for backward
compatibility — null means "all of Ukraine".

Revision ID: 0008
Revises: 0007
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "push_subscriptions",
        sa.Column("region_oblast", sa.Text(), nullable=True),
    )
    op.create_index(
        "idx_push_subscriptions_oblast", "push_subscriptions", ["region_oblast"]
    )


def downgrade() -> None:
    op.drop_index("idx_push_subscriptions_oblast", table_name="push_subscriptions")
    op.drop_column("push_subscriptions", "region_oblast")
