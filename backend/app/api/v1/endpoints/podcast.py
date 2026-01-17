"""
Podcast API endpoints.

Provides endpoints for generating and retrieving podcast episodes.
"""
from datetime import date
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
