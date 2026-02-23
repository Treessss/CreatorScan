"""scope creator uniqueness by owner

Revision ID: 20260220_0002
Revises: 20260220_0001
Create Date: 2026-02-20 23:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260220_0002"
down_revision = "20260220_0001"
branch_labels = None
depends_on = None


def _constraint_names(bind):
    inspector = sa.inspect(bind)
    uniques = inspector.get_unique_constraints("creators")
    return {u.get("name") for u in uniques if u.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    names = _constraint_names(bind)

    with op.batch_alter_table("creators") as batch_op:
        if "_platform_uid_uc" in names:
            batch_op.drop_constraint("_platform_uid_uc", type_="unique")
        if "_owner_platform_uid_uc" not in names:
            batch_op.create_unique_constraint(
                "_owner_platform_uid_uc",
                ["owner_id", "platform", "unique_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    names = _constraint_names(bind)

    with op.batch_alter_table("creators") as batch_op:
        if "_owner_platform_uid_uc" in names:
            batch_op.drop_constraint("_owner_platform_uid_uc", type_="unique")
        if "_platform_uid_uc" not in names:
            batch_op.create_unique_constraint(
                "_platform_uid_uc",
                ["platform", "unique_id"],
            )
