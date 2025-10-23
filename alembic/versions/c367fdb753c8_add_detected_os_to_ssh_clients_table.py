"""add detected_os to ssh_clients table

Revision ID: c367fdb753c8
Revises: b13b6b1948cf
Create Date: 2025-10-19 21:31:30.721063

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c367fdb753c8'
down_revision: Union[str, None] = 'b13b6b1948cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add detected_os column to ssh_clients table
    op.add_column('ssh_clients', sa.Column('detected_os', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove detected_os column from ssh_clients table
    op.drop_column('ssh_clients', 'detected_os')
