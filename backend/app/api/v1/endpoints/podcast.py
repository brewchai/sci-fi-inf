"""
Podcast API endpoints.

Provides endpoints for generating and retrieving podcast episodes.
"""
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.session import get_db
from app.models.podcast import PodcastEpisode
from app.services.podcast import PodcastGenerator


router = APIRouter(prefix="/podcast", tags=["podcast"])


# =============================================================================
# Schemas
# =============================================================================

class GeneratePodcastRequest(BaseModel):
    """Request to generate a podcast episode."""
    paper_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="List of paper IDs to include in the episode",
        example=[42, 45, 48],
    )
    title: Optional[str] = Field(
        None,
        max_length=255,
        description="Optional episode title (auto-generated if not provided)",
    )
    episode_date: Optional[date] = Field(
        None,
        description="Date for the episode (defaults to today)",
    )
    voice: str = Field(
        "nova",
        description="TTS voice: alloy, echo, fable, nova, onyx, shimmer",
        pattern="^(alloy|echo|fable|nova|onyx|shimmer)$",
    )


class PodcastEpisodeResponse(BaseModel):
    """Response schema for a podcast episode."""
    id: int
    episode_date: date
    title: str
    paper_ids: List[int]
    script: Optional[str]
    audio_url: Optional[str]
    duration_seconds: Optional[int]
    status: str
    
    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/generate",
    response_model=PodcastEpisodeResponse,
    summary="Generate a podcast episode",
    description="Creates a podcast combining the specified papers into an audio briefing.",
)
async def generate_podcast(
    request: GeneratePodcastRequest,
    db: AsyncSession = Depends(get_db),
) -> PodcastEpisodeResponse:
    """
    Generate a new podcast episode from the given paper IDs.
    
    This will:
    1. Fetch the papers
    2. Generate a combined podcast script via LLM
    3. Convert the script to audio via TTS
    4. Save and return the episode
    """
    generator = PodcastGenerator(db)
    
    try:
        episode = await generator.generate_episode(
            paper_ids=request.paper_ids,
            episode_date=request.episode_date,
            title=request.title,
            voice=request.voice,
        )
        await db.commit()
        return PodcastEpisodeResponse.model_validate(episode)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate podcast: {str(e)}")


@router.post(
    "/backfill-titles",
    summary="Regenerate bland episode titles using AI",
)
async def backfill_titles(
    db: AsyncSession = Depends(get_db),
):
    """Find episodes with generic titles and regenerate them."""
    from app.models.paper import Paper
    
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.title.like("The Eureka Feed -%"))
        .where(PodcastEpisode.status == "ready")
        .order_by(desc(PodcastEpisode.episode_date))
    )
    episodes = result.scalars().all()
    
    if not episodes:
        return {"message": "No episodes need title updates", "updated": 0}
    
    generator = PodcastGenerator(db)
    updated = []
    
    for episode in episodes:
        if not episode.paper_ids:
            continue
        papers = await generator.fetch_papers(episode.paper_ids)
        if papers:
            new_title = await generator.generate_title(papers)
            if new_title:
                old_title = episode.title
                episode.title = new_title
                updated.append({"date": str(episode.episode_date), "old": old_title, "new": new_title})
    
    await db.commit()
    return {"message": f"Updated {len(updated)} episode titles", "updated": len(updated), "details": updated}


class EpisodeDateResponse(BaseModel):
    """Lightweight response with just episode ID, date, and title."""
    id: int
    episode_date: date
    title: str
    duration_seconds: Optional[int]

    class Config:
        from_attributes = True


@router.get(
    "/dates",
    response_model=List[EpisodeDateResponse],
    summary="Get episode dates for selector",
)
async def list_episode_dates(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
) -> List[EpisodeDateResponse]:
    """Get just episode IDs and dates for the date picker (lightweight)."""
    # Only show episodes from Jan 20, 2026 onwards
    min_date = date(2026, 1, 20)
    result = await db.execute(
        select(PodcastEpisode.id, PodcastEpisode.episode_date, PodcastEpisode.title, PodcastEpisode.duration_seconds)
        .where(PodcastEpisode.status == "ready")
        .where(PodcastEpisode.episode_date >= min_date)
        .order_by(desc(PodcastEpisode.episode_date))
        .limit(limit)
    )
    rows = result.all()
    return [
        EpisodeDateResponse(
            id=row.id, 
            episode_date=row.episode_date, 
            title=row.title,
            duration_seconds=row.duration_seconds
        )
        for row in rows
    ]


@router.get(
    "/list",
    response_model=List[PodcastEpisodeResponse],
    summary="Get all podcast episodes",
)
async def list_episodes(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> List[PodcastEpisodeResponse]:
    """Get all podcast episodes, ordered by date descending."""
    # Only show episodes from Jan 20, 2026 onwards
    min_date = date(2026, 1, 20)
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.status == "ready")
        .where(PodcastEpisode.episode_date >= min_date)
        .order_by(desc(PodcastEpisode.episode_date))
        .limit(limit)
    )
    episodes = result.scalars().all()
    return [PodcastEpisodeResponse.model_validate(ep) for ep in episodes]


@router.get(
    "/latest",
    response_model=Optional[PodcastEpisodeResponse],
    summary="Get the latest podcast episode",
)
async def get_latest_episode(
    db: AsyncSession = Depends(get_db),
) -> Optional[PodcastEpisodeResponse]:
    """Get the most recent podcast episode."""
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.status == "ready")
        .order_by(desc(PodcastEpisode.episode_date))
        .limit(1)
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="No podcast episodes found")
    
    return PodcastEpisodeResponse.model_validate(episode)


# =============================================================================
# Public Endpoints (for SEO — no auth required)
# IMPORTANT: These must be defined BEFORE /{episode_id} to avoid route conflicts
# =============================================================================

PUBLIC_CUTOFF_DAYS = 14  # Episodes older than this are publicly accessible


class PublicEpisodeResponse(BaseModel):
    """Public episode response — includes is_public flag for gating."""
    id: int
    episode_date: date
    title: str
    script: Optional[str]
    audio_url: Optional[str]
    duration_seconds: Optional[int]
    is_public: bool

    class Config:
        from_attributes = True


@router.get(
    "/public",
    response_model=List[PublicEpisodeResponse],
    summary="Get publicly accessible episodes (older than 2 weeks)",
)
async def list_public_episodes(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> List[PublicEpisodeResponse]:
    """Get episodes older than 14 days for public SEO pages."""
    cutoff = date.today() - timedelta(days=PUBLIC_CUTOFF_DAYS)
    min_date = date(2026, 1, 20)
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.status == "ready")
        .where(PodcastEpisode.episode_date >= min_date)
        .where(PodcastEpisode.episode_date <= cutoff)
        .order_by(desc(PodcastEpisode.episode_date))
        .limit(limit)
    )
    episodes = result.scalars().all()
    return [
        PublicEpisodeResponse(
            id=ep.id,
            episode_date=ep.episode_date,
            title=ep.title,
            script=ep.script,
            audio_url=ep.audio_url,
            duration_seconds=ep.duration_seconds,
            is_public=True,
        )
        for ep in episodes
    ]


@router.get(
    "/public/{episode_date}",
    response_model=PublicEpisodeResponse,
    summary="Get a single episode for public page",
)
async def get_public_episode(
    episode_date: date,
    db: AsyncSession = Depends(get_db),
) -> PublicEpisodeResponse:
    """
    Get episode by date for public pages.
    
    If episode is older than 14 days: returns full content (is_public=True).
    If episode is recent: returns title/date only, no content (is_public=False).
    """
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.episode_date == episode_date)
        .where(PodcastEpisode.status == "ready")
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail=f"No episode found for {episode_date}")

    cutoff = date.today() - timedelta(days=PUBLIC_CUTOFF_DAYS)
    is_public = episode.episode_date <= cutoff

    return PublicEpisodeResponse(
        id=episode.id,
        episode_date=episode.episode_date,
        title=episode.title,
        script=episode.script if is_public else None,
        audio_url=episode.audio_url if is_public else None,
        duration_seconds=episode.duration_seconds if is_public else None,
        is_public=is_public,
    )


# =============================================================================
# ID/Date Lookup Endpoints (these use path params, must come AFTER /public)
# =============================================================================

@router.get(
    "/{episode_id}",
    response_model=PodcastEpisodeResponse,
    summary="Get a podcast episode by ID",
)
async def get_episode(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
) -> PodcastEpisodeResponse:
    """Get a specific podcast episode by its ID."""
    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.id == episode_id)
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")
    
    return PodcastEpisodeResponse.model_validate(episode)


@router.get(
    "/by-date/{episode_date}",
    response_model=PodcastEpisodeResponse,
    summary="Get a podcast episode by date",
)
async def get_episode_by_date(
    episode_date: date,
    db: AsyncSession = Depends(get_db),
) -> PodcastEpisodeResponse:
    """Get the podcast episode for a specific date."""
    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.episode_date == episode_date)
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail=f"No episode found for {episode_date}")
    
    return PodcastEpisodeResponse.model_validate(episode)
