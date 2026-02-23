"""add user 2fa fields

Revision ID: 20260221_0003
Revises: 20260220_0002
Create Date: 2026-02-21 00:15:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260221_0003"
down_revision = "20260220_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("two_fa_enabled", sa.Boolean(), nullable=True, server_default=sa.false()))
        batch_op.add_column(sa.Column("two_fa_secret", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("two_fa_temp_secret", sa.String(), nullable=True))

    op.execute("UPDATE users SET two_fa_enabled = 0 WHERE two_fa_enabled IS NULL")

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("two_fa_enabled", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("two_fa_temp_secret")
        batch_op.drop_column("two_fa_secret")
        batch_op.drop_column("two_fa_enabled")
