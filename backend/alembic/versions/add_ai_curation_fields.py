"""Add AI curation fields to papers table

Revision ID: add_ai_curation_fields
Revises: 
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_ai_curation_fields'
down_revision = None  # Update this to your latest migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add AI curation fields
    op.add_column('papers', sa.Column('has_full_text', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('papers', sa.Column('full_text_source', sa.String(length=50), nullable=True))
    op.add_column('papers', sa.Column('quality_score', sa.Float(), nullable=True))
    op.add_column('papers', sa.Column('llm_rank', sa.Integer(), nullable=True))
    
    # Add premium content fields
    op.add_column('papers', sa.Column('deep_analysis', sa.Text(), nullable=True))
    op.add_column('papers', sa.Column('code_walkthrough', sa.Text(), nullable=True))
    op.add_column('papers', sa.Column('practical_applications', sa.Text(), nullable=True))
    
    # Add indexes
    op.create_index('idx_papers_has_full_text', 'papers', ['has_full_text'])
    op.create_index('idx_papers_quality_score', 'papers', ['quality_score'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_papers_quality_score', table_name='papers')
    op.drop_index('idx_papers_has_full_text', table_name='papers')
    
    # Drop columns
    op.drop_column('papers', 'practical_applications')
    op.drop_column('papers', 'code_walkthrough')
    op.drop_column('papers', 'deep_analysis')
    op.drop_column('papers', 'llm_rank')
    op.drop_column('papers', 'quality_score')
    op.drop_column('papers', 'full_text_source')
    op.drop_column('papers', 'has_full_text')
