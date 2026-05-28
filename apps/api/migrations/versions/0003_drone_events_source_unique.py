"""drone_events: make (source_channel, source_message_id) unique

The LLM extractor uses ON CONFLICT to dedup repeat ingestion of the same
TG message; PostgreSQL requires a unique constraint (not just an index)
for that. Migration 0002 created a plain btree; flip it to a UNIQUE one.

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("idx_drone_events_source", table_name="drone_events")
    op.create_index(
        "idx_drone_events_source",
        "drone_events",
        ["source_channel", "source_message_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_drone_events_source", table_name="drone_events")
    op.create_index(
        "idx_drone_events_source",
        "drone_events",
        ["source_channel", "source_message_id"],
    )
