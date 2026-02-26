"""Add author_emails table

Revision ID: add_author_emails
Revises: add_slug_to_episodes
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_author_emails'
down_revision = '9ec9b3d21b24'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'author_emails',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('paper_id', sa.Integer(), sa.ForeignKey('papers.id'), nullable=False, index=True),
        sa.Column('episode_id', sa.Integer(), sa.ForeignKey('podcast_episodes.id'), nullable=False, index=True),
        sa.Column('author_name', sa.String(255), nullable=False),
        sa.Column('author_openalex_id', sa.String(500), nullable=False),
        sa.Column('email_address', sa.String(255), nullable=True),
        sa.Column('episode_slug', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('resend_message_id', sa.String(255), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Unique constraint: one email record per paper+author combo
    op.create_unique_constraint(
        'uq_author_emails_paper_author',
        'author_emails',
        ['paper_id', 'author_openalex_id'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_author_emails_paper_author', 'author_emails', type_='unique')
    op.drop_table('author_emails')
