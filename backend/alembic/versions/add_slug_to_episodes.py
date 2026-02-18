"""Add slug to podcast episodes

Revision ID: add_slug_to_episodes
Revises: add_ai_curation_fields
Create Date: 2026-02-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_slug_to_episodes'
down_revision = 'add_ai_curation_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add slug column
    op.add_column('podcast_episodes', sa.Column('slug', sa.String(length=255), nullable=True))
    
    # Create index
    op.create_index(op.f('idx_podcast_episodes_slug'), 'podcast_episodes', ['slug'], unique=True)


def downgrade() -> None:
    # Drop index
    op.drop_index(op.f('idx_podcast_episodes_slug'), table_name='podcast_episodes')
    
    # Drop column
    op.drop_column('podcast_episodes', 'slug')
