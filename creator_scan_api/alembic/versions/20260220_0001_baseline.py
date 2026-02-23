"""baseline schema

Revision ID: 20260220_0001
Revises:
Create Date: 2026-02-20 22:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260220_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("hashed_password", sa.String(), nullable=True),
        sa.Column("is_master", sa.Boolean(), nullable=True),
        sa.Column("master_id", sa.Integer(), nullable=True),
        sa.Column("api_key", sa.String(), nullable=True),
        sa.Column("email_host", sa.String(), nullable=True),
        sa.Column("email_port", sa.Integer(), nullable=True),
        sa.Column("email_username", sa.String(), nullable=True),
        sa.Column("email_password", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["master_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_api_key", "users", ["api_key"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("details", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"], unique=False)

    op.create_table(
        "creators",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(), nullable=True),
        sa.Column("unique_id", sa.String(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("platform", "unique_id", name="_platform_uid_uc"),
    )
    op.create_index("ix_creators_id", "creators", ["id"], unique=False)
    op.create_index("ix_creators_platform", "creators", ["platform"], unique=False)
    op.create_index("ix_creators_unique_id", "creators", ["unique_id"], unique=False)

    op.create_table(
        "smtp_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("host", sa.String(), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("sender_name", sa.String(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_smtp_configs_id", "smtp_configs", ["id"], unique=False)

    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_templates_id", "email_templates", ["id"], unique=False)

    op.create_table(
        "email_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=True),
        sa.Column("recipient_id", sa.Integer(), nullable=True),
        sa.Column("recipient_email", sa.String(), nullable=True),
        sa.Column("recipient_name", sa.String(), nullable=True),
        sa.Column("smtp_config_id", sa.Integer(), nullable=True),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("body", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("replied", sa.Boolean(), nullable=True),
        sa.Column("reply_content", sa.String(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("replied_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["recipient_id"], ["creators.id"]),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["smtp_config_id"], ["smtp_configs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_logs_id", "email_logs", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_logs_id", table_name="email_logs")
    op.drop_table("email_logs")

    op.drop_index("ix_email_templates_id", table_name="email_templates")
    op.drop_table("email_templates")

    op.drop_index("ix_smtp_configs_id", table_name="smtp_configs")
    op.drop_table("smtp_configs")

    op.drop_index("ix_creators_unique_id", table_name="creators")
    op.drop_index("ix_creators_platform", table_name="creators")
    op.drop_index("ix_creators_id", table_name="creators")
    op.drop_table("creators")

    op.drop_index("ix_audit_logs_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_users_api_key", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
