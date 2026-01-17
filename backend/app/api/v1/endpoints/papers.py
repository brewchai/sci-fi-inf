"""
Papers API endpoints.

This module provides REST endpoints for managing papers, including
fetching curated editions, triggering the harvesting pipeline, and
regenerating summaries.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.schemas import (
    CategoryResponse,
    PaperDetail,
    PaperSummary,
    PipelineRequest,
    PipelineResponse,
    RegenerateSummaryResponse,
)
from app.db.session import get_db
from app.domain.categories import Category, get_category_registry
from app.models.paper import Paper
# Note: Old CuratorEngine was replaced by PaperCurator for LLM-based curation
# Curation now happens via cron tasks, not this pipeline endpoint
from app.services.editor import EditorEngine
from app.services.harvester import OpenAlexHarvester


router = APIRouter()


# =============================================================================
# Category Endpoints
# =============================================================================

@router.get(
    "/categories",
    response_model=list[CategoryResponse],
    summary="List all available categories",
    description="Returns all active categories that can be used to filter papers.",
)
async def list_categories() -> list[CategoryResponse]:
    """
    Get all available paper categories.
    
    Returns:
        List of active categories with their metadata.
    """
    registry = get_category_registry()
    categories = registry.list_active()
    
    return [
        CategoryResponse(
            slug=c.slug,
            display_name=c.display_name,
            emoji=c.emoji,
            description=c.description,
        )
        for c in categories
    ]


# =============================================================================
# Paper Retrieval Endpoints
# =============================================================================

@router.get(
    "/latest-edition",
    response_model=list[PaperDetail],
    summary="Get the latest curated edition",
    description="Returns selected papers with their ELI5 summaries for the daily edition.",
)
async def get_latest_edition(
    category: Optional[str] = Query(
        None,
        description="Filter by category slug (e.g., 'ai_tech')",
    ),
    limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Maximum number of papers to return",
    ),
    db: AsyncSession = Depends(get_db),
) -> list[PaperDetail]:
    """
    Get the latest curated edition of papers.
    
    Args:
        category: Optional category slug to filter by.
        limit: Maximum number of papers to return.
        db: Database session.
        
    Returns:
        List of detailed paper information.
    """
    # Validate category if provided
    if category:
        registry = get_category_registry()
        if registry.get(category) is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category: '{category}'. Use GET /categories to see available options.",
            )
    
    stmt = (
        select(Paper)
        .where(Paper.is_selected.is_(True))
        .order_by(Paper.publication_date.desc(), Paper.curation_score.desc())
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    papers = result.scalars().all()
    
    # Filter by category if specified (until we add proper FK)
    if category:
        papers = [
            p for p in papers
            if (p.metrics or {}).get("category") == category
        ]
    
    return [_paper_to_detail(p) for p in papers]


@router.get(
    "/all",
    response_model=list[PaperSummary],
    summary="List all papers (admin)",
    description="Returns all papers in the database for debugging/admin purposes.",
)
async def get_all_papers(
    limit: int = Query(50, ge=1, le=200, description="Maximum papers to return"),
    db: AsyncSession = Depends(get_db),
) -> list[PaperSummary]:
    """
    Get all papers in the database.
    
    Args:
        limit: Maximum number of papers to return.
        db: Database session.
        
    Returns:
        List of paper summaries.
    """
    stmt = select(Paper).order_by(Paper.id.desc()).limit(limit)
    result = await db.execute(stmt)
    papers = result.scalars().all()
    
    return [
        PaperSummary(
            id=p.id,
            title=p.title,
            headline=p.headline,
            publication_date=p.publication_date,
            is_selected=p.is_selected,
            has_summary=p.eli5_summary is not None,
            curation_score=p.curation_score,
        )
        for p in papers
    ]


# =============================================================================
# Pipeline Endpoints
# =============================================================================

@router.post(
    "/trigger-pipeline",
    response_model=PipelineResponse,
    summary="Trigger the paper processing pipeline",
    description="Fetches papers from OpenAlex, curates them, and generates summaries.",
)
async def trigger_pipeline(
    request: PipelineRequest = PipelineRequest(),
    db: AsyncSession = Depends(get_db),
) -> PipelineResponse:
    """
    Trigger the full paper processing pipeline.
    
    Args:
        request: Pipeline configuration options.
        db: Database session.
        
    Returns:
        Pipeline execution results.
    """
    # Resolve category if provided
    category: Optional[Category] = None
    if request.category:
        registry = get_category_registry()
        category = registry.get(request.category)
        if category is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category: '{request.category}'. Use GET /categories to see available options.",
            )
    
    # Calculate from_date
    from_date = date.today() - timedelta(days=request.from_days_ago)
    
    # 1. Harvest
    harvester = OpenAlexHarvester(db)
    raw_papers = await harvester.fetch_papers(
        from_date=from_date,
        category=category,
        per_page=request.harvest_limit,
    )
    count_harvest = await harvester.process_and_store(
        raw_papers,
        category_slug=request.category,
    )
    
    # 2. Curate - now handled by cron tasks (app/cron/tasks/curate.py)
    # Papers are auto-selected during harvest when category_slug is provided
    selected_count = count_harvest
    
    # 3. Edit (generate summaries)
    editor = EditorEngine(db)
    count_edit = await editor.publish_edition()
    
    # 4. Commit all changes
    await db.commit()
    
    return PipelineResponse(
        status="success",
        category=request.category,
        harvested=count_harvest,
        selected=selected_count,
        edited=count_edit,
    )


@router.post(
    "/regenerate/{paper_id}",
    response_model=RegenerateSummaryResponse,
    summary="Regenerate summary for a paper",
    description="Regenerates the ELI5 summary for a specific paper using the LLM.",
)
async def regenerate_summary(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
) -> RegenerateSummaryResponse:
    """
    Regenerate the ELI5 summary for a specific paper.
    
    Args:
        paper_id: Database ID of the paper to regenerate.
        db: Database session.
        
    Returns:
        Updated paper with new summary.
        
    Raises:
        HTTPException: If paper not found or generation fails.
    """
    stmt = select(Paper).where(Paper.id == paper_id)
    result = await db.execute(stmt)
    paper = result.scalar_one_or_none()
    
    if paper is None:
        raise HTTPException(
            status_code=404,
            detail=f"Paper with id {paper_id} not found",
        )
    
    # Clear existing summary to force regeneration
    paper.eli5_summary = None
    paper.headline = None
    paper.key_takeaways = []
    
    # Regenerate
    editor = EditorEngine(db)
    success = await editor.generate_summary(paper)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate summary. Check OpenAI API key.",
        )
    
    await db.commit()
    
    return RegenerateSummaryResponse(
        status="Summary regenerated",
        paper=_paper_to_detail(paper),
    )


# =============================================================================
# Helper Functions
# =============================================================================

def _paper_to_detail(paper: Paper) -> PaperDetail:
    """
    Convert a Paper ORM model to PaperDetail response schema.
    
    Args:
        paper: Paper ORM instance.
        
    Returns:
        PaperDetail schema instance.
    """
    metrics = paper.metrics or {}
    
    return PaperDetail(
        id=paper.id,
        title=paper.title,
        headline=paper.headline,
        eli5_summary=paper.eli5_summary,
        key_takeaways=paper.key_takeaways or [],
        publication_date=paper.publication_date,
        curation_score=paper.curation_score,
        doi=paper.doi,
        pdf_url=paper.pdf_url,
        why_it_matters=metrics.get("why_it_matters", ""),
        field=metrics.get("field", ""),
        category=metrics.get("category"),
    )
