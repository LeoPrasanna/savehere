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


def downgrade() -> None:
    with op.batch_alter_table('todos', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_todos_reel_id'))
        batch_op.drop_index(batch_op.f('ix_todos_user_id'))
    op.drop_table('todos')
