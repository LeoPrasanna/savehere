"""add todos

Revision ID: b3f1c7a20d94
Revises: 9aa25548aadb
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f1c7a20d94'
down_revision: Union[str, Sequence[str], None] = '9aa25548aadb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the cross-reel to-do list table."""
    op.create_table(
        'todos',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        # SET NULL, not CASCADE: deleting a save must not delete the user's plan.
        sa.Column('reel_id', sa.String(), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sa.String(), nullable=False, server_default='medium'),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['reel_id'], ['reels.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_todos_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_todos_reel_id'), ['reel_id'], unique=False)

    # Lock the table down IN THE SAME TRANSACTION that creates it.
    #
    # Supabase publishes every table in `public` over PostgREST, and the
    # publishable key that reaches it ships inside the mobile bundle. A table
    # created without RLS is therefore world-readable and world-WRITABLE from
    # the moment it exists — and `todos` carries `user_id` directly, so there's
    # no parent-row ownership check to fall back on.
    #
    # `backend/scripts/enable_rls.sql` covers the same ground, but it's applied
    # BY HAND: between the deploy that creates this table and the moment someone
    # remembers to re-run it, the data is exposed. Doing it here closes that
    # window entirely. The script stays as the audit/verify tool and the place
    # the reasoning lives — keep the two in step.
    #
    # Deny-all: RLS on, no policies. The backend connects with the service-role
    # key, which bypasses RLS by design, so nothing in the app changes. FORCE
    # matters because without it the table OWNER role still bypasses RLS.
    #
    # Postgres-only. SQLite (local dev, CI) has no RLS and would raise a syntax
    # error, so the dialect guard is load-bearing, not defensive dressing.
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('ALTER TABLE todos ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE todos FORCE ROW LEVEL SECURITY')


def downgrade() -> None:
    # No RLS teardown needed — dropping the table takes it with them.
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_todos_reel_id'))
        batch_op.drop_index(batch_op.f('ix_todos_user_id'))
    op.drop_table('todos')
