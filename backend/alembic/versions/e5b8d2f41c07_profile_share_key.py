"""profiles: share key for the Android invisible-share Activity

Revision ID: e5b8d2f41c07
Revises: d4a9c1e73b52
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5b8d2f41c07'
down_revision: Union[str, Sequence[str], None] = 'd4a9c1e73b52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the share-key columns used by the Android no-display share Activity.

    Why a separate credential instead of the Supabase session: that Activity
    runs outside the JS runtime, and a Supabase access token lives ~1 h and only
    auto-refreshes while the app is open — so a share made hours after the app
    was last opened would always 401, which is the majority case. Refreshing
    from native code was rejected: Supabase rotates refresh tokens, so a native
    refresh revokes the one the app is still holding and signs the user out.

    Nullable with no backfill: a user has no share key until the app mints one,
    and no key means the Activity falls back to today's visible launch path.

    `share_key_tier` and `share_key_subject` are snapshots taken from the
    VERIFIED JWT at mint time. A share-key request carries no JWT, so without
    them `app_metadata.tier` would read as free (entitling a paying Pro user's
    silent share as free) and `quota_subject` would fall back to `user_id`,
    charging a DIFFERENT daily AI bucket than the same user's normal saves.
    """
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('share_key_hash', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('share_key_tier', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('share_key_subject', sa.String(), nullable=True))
        batch_op.create_index('ix_profiles_share_key_hash', ['share_key_hash'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.drop_index('ix_profiles_share_key_hash')
        batch_op.drop_column('share_key_subject')
        batch_op.drop_column('share_key_tier')
        batch_op.drop_column('share_key_hash')
