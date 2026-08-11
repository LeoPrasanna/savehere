"""reels: stamp when startup recovery already spent a free summary on a row

Revision ID: d4a9c1e73b52
Revises: c7e2a4b81f36
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a9c1e73b52'
down_revision: Union[str, Sequence[str], None] = 'c7e2a4b81f36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add `recovered_at` — when startup recovery last re-ran this reel's summary.

    Why it exists: `recover_pending_summaries()` re-summarizes rows stuck at
    'pending' on every boot, and it passes `user=None`, which skips the quota
    charge. That is deliberate — the interrupted summary was our crash, not the
    user's action, so billing them for it would be wrong. But it left the only
    AI path in the app that spends Claude tokens without decrementing anyone's
    allowance or appearing in the usage meter, and Render's free tier cold-starts
    constantly. A row that can never complete was therefore re-summarized free
    and invisibly on every single boot, forever.

    Stamping the row bounds that to ONE free recovery each. Nullable with no
    backfill: existing pending rows have never had a recovery spent on them
    under this scheme, so they are correctly eligible for exactly one.
    """
    with op.batch_alter_table('reels', schema=None) as batch_op:
        batch_op.add_column(sa.Column('recovered_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('reels', schema=None) as batch_op:
        batch_op.drop_column('recovered_at')
