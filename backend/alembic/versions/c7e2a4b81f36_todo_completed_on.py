"""todos: local completion date for the daily goal

Revision ID: c7e2a4b81f36
Revises: b3f1c7a20d94
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e2a4b81f36'
down_revision: Union[str, Sequence[str], None] = 'b3f1c7a20d94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add `completed_on` — the user's LOCAL calendar day a task was ticked off.

    Nullable with no backfill on purpose: rows completed before this column
    existed have no trustworthy local date (only a UTC instant, which is exactly
    the thing that can be off by a day), and inventing one would put phantom
    completions into someone's daily-goal history. They simply don't count
    toward any day's goal, which is honest.
    """
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.add_column(sa.Column('completed_on', sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.drop_column('completed_on')
