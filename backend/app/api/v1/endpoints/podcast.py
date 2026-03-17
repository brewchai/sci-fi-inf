"""
Podcast API endpoints.

Provides endpoints for generating and retrieving podcast episodes.
"""
from datetime import date, timedelta, datetime, timezone
from typing import List, Optional
from loguru import logger
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from xml.etree.ElementTree import Element, SubElement, tostring, register_namespace
from email.utils import format_datetime

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
    slug: Optional[str]
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


class CarouselSlideResponse(BaseModel):
    """Slide response for on-the-fly carousel generation."""
    paper_id: int
    category: str
    headline: str
    takeaways: List[str]
    caption: Optional[str] = None


@router.post(
    "/{episode_id}/generate-carousel",
    response_model=List[CarouselSlideResponse],
    summary="Generate engaging carousel slides on-the-fly using LLM",
)
async def generate_carousel_for_episode(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
) -> List[CarouselSlideResponse]:
    """Generates punchy Instagram-style slides from the episode's papers without saving to the DB."""
    from app.services.carousel import CarouselGenerator
    
    # 1. Fetch Episode
    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.id == episode_id)
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
        
    if not episode.paper_ids:
        return []
        
    # 2. Fetch Papers
    generator = PodcastGenerator(db)
    papers = await generator.fetch_papers(episode.paper_ids)
    
    # 3. Generate Carousel Formats
    carousel_generator = CarouselGenerator(db)
    slides = await carousel_generator.generate_carousel_content(papers)
    
    return [
        CarouselSlideResponse(
            paper_id=slide.get("paper_id", 0),
            category=slide.get("category", "SCIENCE"),
            headline=slide.get("headline", "Read about this amazing discovery"),
            takeaways=slide.get("takeaways", ["Listen to the full episode to learn more"]),
            caption=slide.get("caption")
        ) for slide in slides
    ]


@router.post(
    "/paper/{paper_id}/generate-carousel",
    response_model=CarouselSlideResponse,
    summary="Generate engaging carousel slides on-the-fly for a SINGLE paper",
)
async def generate_carousel_for_paper(
    paper_id: int,
    content_type: str = Query("latest", description="Controls generation framing ('latest', 'top-scientists', etc)"),
    db: AsyncSession = Depends(get_db),
) -> CarouselSlideResponse:
    """Generates robust, multi-sentence slides for a single paper."""
    from app.services.carousel import CarouselGenerator
    from app.services.editor import EditorEngine
    from app.models.paper import Paper
    from app.models.top_paper import TopPaper
    from app.models.daily_science_paper import DailySciencePaper
    
    paper = None
    if content_type == "top-papers":
        result = await db.execute(select(TopPaper).where(TopPaper.id == paper_id))
        paper = result.scalar_one_or_none()
    elif content_type == "daily-science":
        result = await db.execute(select(DailySciencePaper).where(DailySciencePaper.id == paper_id))
        paper = result.scalar_one_or_none()

    if not paper:
        result = await db.execute(select(Paper).where(Paper.id == paper_id))
        paper = result.scalar_one_or_none()
    
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
        
    # 2. On-demand Summarization (Phase 3)
    if not paper.eli5_summary or not paper.key_takeaways:
        editor = EditorEngine(db)
        await editor.generate_summary(paper)
        await db.commit()
        await db.refresh(paper)

    # 3. Generate Carousel Format
    carousel_generator = CarouselGenerator(db)
    slide = await carousel_generator.generate_paper_carousel_content(paper, content_type)
    
    return CarouselSlideResponse(
        paper_id=slide.get("paper_id", paper_id),
        category=slide.get("category", paper.category_slug or "SCIENCE"),
        headline=slide.get("headline", paper.headline or paper.title),
        takeaways=slide.get("takeaways", ["Listen to the full episode to learn more"]),
        caption=slide.get("caption")
    )


# =============================================================================
# Audiogram Generation
# =============================================================================

class GenerateAudiogramRequest(BaseModel):
    """Request to generate an audiogram video slide."""
    headline: str = Field(..., description="Title headline for the slide")
    category: str = Field(default="NEW RESEARCH", description="Category label")
    start_seconds: float = Field(default=0, description="Start time in the audio")
    duration_seconds: float = Field(default=8, description="Clip duration in seconds")
    custom_text: Optional[str] = Field(default=None, description="If provided, generate fresh HD TTS audio from this text instead of using episode audio")


class AudiogramResponse(BaseModel):
    """Response with the generated audiogram video URL."""
    video_url: str
    episode_id: int
    duration_seconds: float


@router.post(
    "/episode/{episode_id}/generate-audiogram",
    response_model=AudiogramResponse,
    summary="Generate an audiogram video for carousel Slide 1",
)
async def generate_audiogram(
    episode_id: int,
    request: GenerateAudiogramRequest,
    db: AsyncSession = Depends(get_db),
) -> AudiogramResponse:
    """
    Generate a 1080x1080 video with animated waveform + title + audio
    for use as Slide 1 in an Instagram carousel.
    """
    from app.services.audiogram_generator import AudiogramGenerator

    # Look up episode
    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.id == episode_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if not episode.audio_url:
        raise HTTPException(status_code=400, detail="Episode has no audio")

    generator = AudiogramGenerator()
    video_url = await generator.generate(
        episode_id=episode_id,
        audio_url=episode.audio_url,
        headline=request.headline,
        category=request.category,
        start_seconds=request.start_seconds,
        duration_seconds=request.duration_seconds,
        custom_text=request.custom_text,
    )

    return AudiogramResponse(
        video_url=video_url,
        episode_id=episode_id,
        duration_seconds=request.duration_seconds,
    )


# =============================================================================
# Reel Script Generation
# =============================================================================

class ReelScriptResponse(BaseModel):
    """Response with generated reel narration script."""
    script: str
    headline: str


@router.post(
    "/paper/{paper_id}/generate-reel-script",
    response_model=ReelScriptResponse,
    summary="Generate a reel narration script for a paper",
)
async def generate_reel_script(
    paper_id: int,
    content_type: str = Query("latest", description="Controls generation framing"),
    db: AsyncSession = Depends(get_db),
) -> ReelScriptResponse:
    """
    Generate a ~30-second hook-driven narration script
    optimised for Instagram Reels from a paper's metadata.
    """
    from app.services.reel_script_generator import ReelScriptGenerator
    from app.models.paper import Paper
    from app.models.top_paper import TopPaper
    from app.models.daily_science_paper import DailySciencePaper

    paper = None
    if content_type == "top-papers":
        result = await db.execute(select(TopPaper).where(TopPaper.id == paper_id))
        paper = result.scalar_one_or_none()
    elif content_type == "daily-science":
        result = await db.execute(select(DailySciencePaper).where(DailySciencePaper.id == paper_id))
        paper = result.scalar_one_or_none()

    if not paper:
        result = await db.execute(select(Paper).where(Paper.id == paper_id))
        paper = result.scalar_one_or_none()

    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    generator = ReelScriptGenerator()
    script_data = await generator.generate(paper, content_type)

    return ReelScriptResponse(
        script=script_data["script"],
        headline=script_data["headline"],
    )


# =============================================================================
# Reel Generation
# =============================================================================

class TimelineEvent(BaseModel):
    image_url: str = Field(..., description="The raw AI Image generation URL")
    start_time_seconds: float = Field(..., description="The exact float timestamp this image should appear based on the spoken Anchor Word")
    effect_transition_name: Optional[str] = Field(default=None, description="Named transition/effect selected from AI Director guidance")


class SelectedSceneAsset(BaseModel):
    asset_source: str = Field(..., description="local_image | local_video | stock_image | stock_video | ai_image | user_image | user_video | none")
    asset_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    candidate_id: Optional[str] = None


class SceneTimelineEvent(BaseModel):
    scene_id: str
    anchor_word: str
    start_time_seconds: float
    end_time_seconds: float
    transcript_excerpt: Optional[str] = None
    effect_transition_name: Optional[str] = None
    selected_asset: Optional[SelectedSceneAsset] = None
    ai_prompt: Optional[str] = None
    ai_image_url: Optional[str] = None
    asset_source: str = Field(default="none", description="local_image | local_video | stock_image | stock_video | ai_image | user_image | user_video | none")

class GenerateReelRequest(BaseModel):
    """Request to generate a vertical waveform reel."""
    headline: str = Field(..., description="Hook headline for the reel")
    start_seconds: float = Field(default=0, description="Start time in the audio")
    duration_seconds: float = Field(default=30, description="Reel duration in seconds")
    custom_text: Optional[str] = Field(default=None, description="If provided, generate fresh HD TTS audio unless audio_url is given")
    audio_url: Optional[str] = Field(default=None, description="Pre-compiled TTS audio URL, skips TTS generation")
    closing_statement: Optional[str] = Field(default=None, description="Closing CTA statement to append at the end")
    background_video_url: Optional[str] = Field(default=None, description="URL to an optional background video to loop behind the reel")
    overlay_video_url: Optional[str] = Field(default=None, description="URL to an optional overlay video to place on top (via screen/colorkey)")
    voice: str = Field(default="nova", description="TTS voice: nova, onyx, or fable (OpenAI) / brian, matilda, charlie, dave, lily, adam (ElevenLabs)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="TTS speed (0.5–2.0)")
    elevenlabs_stability: float = Field(default=0.65, ge=0.0, le=1.0, description="ElevenLabs stability setting")
    elevenlabs_similarity_boost: float = Field(default=0.85, ge=0.0, le=1.0, description="ElevenLabs similarity boost setting")
    elevenlabs_style: float = Field(default=0.1, ge=0.0, le=1.0, description="ElevenLabs style exaggeration setting")
    tts_provider: str = Field(default="openai", description="TTS provider: openai or elevenlabs", pattern="^(openai|elevenlabs)$")
    auto_visuals: bool = Field(default=False, description="Auto-fetch relevant stock footage from Pexels as background")
    background_clip_urls: Optional[List[str]] = Field(default=None, description="User-approved Pexels clip URLs in order (from Fetch visuals flow)")
    anchor_timeline: Optional[List[TimelineEvent]] = Field(default=None, description="Exact spoken-word timeline for explicit AI image pacing")
    scene_timeline: Optional[List[SceneTimelineEvent]] = Field(default=None, description="Resolved mixed-asset scene timeline for the custom reel flow")
    word_timestamps: Optional[List[dict]] = Field(default=None, description="Pre-computed Whisper word timestamps to skip regeneration")
    include_waveform: bool = Field(default=True, description="Whether to render the animated waveform overlay")


class ReelResponse(BaseModel):
    """Response with the generated reel video URL."""
    video_url: str
    episode_id: int
    duration_seconds: float


@router.post(
    "/episode/{episode_id}/generate-reel",
    response_model=ReelResponse,
    summary="Generate a vertical waveform reel",
)
async def generate_reel(
    episode_id: int,
    request: GenerateReelRequest,
    db: AsyncSession = Depends(get_db),
) -> ReelResponse:
    """
    Generate a 1080x1920 vertical reel with animated waveform,
    word-by-word captions, and transitions.
    """
    from app.services.reel_generator import ReelGenerator

    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.id == episode_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if not episode.audio_url and not request.custom_text:
        raise HTTPException(status_code=400, detail="Episode has no audio and no custom text provided")

    # Background clips: user-approved URLs (from Fetch visuals) take priority
    clip_paths = None
    if request.background_clip_urls and len(request.background_clip_urls) > 0:
        from app.services.visual_search import download_clips_from_urls
        clip_paths = await download_clips_from_urls(request.background_clip_urls)
    elif request.auto_visuals:
        logger.info("Auto-visuals enabled: fetching Pexels stock footage")
        from app.services.visual_search import extract_visual_keywords, search_stock_clips, download_clip
        headline = request.headline or ""
        script = request.custom_text or (episode.script or "")
        if headline or script:
            keywords = await extract_visual_keywords(headline, script)
            if keywords:
                clips = await search_stock_clips(keywords, orientation="portrait")
                if clips:
                    paths = []
                    for clip in clips:
                        try:
                            path = await download_clip(clip)
                            paths.append(path)
                        except Exception as e:
                            logger.error(f"Failed to download clip '{clip.keyword}': {e}")
                    if paths:
                        clip_paths = paths

    temp_clip_paths = clip_paths or []

    try:
        generator = ReelGenerator()
        video_url = await generator.generate(
            episode_id=episode_id,
            audio_url=episode.audio_url or "",
            headline=request.headline,
            start_seconds=request.start_seconds,
            duration_seconds=request.duration_seconds,
            custom_text=request.custom_text,
            closing_statement=request.closing_statement,
            background_video_url=request.background_video_url if not clip_paths else None,
            overlay_video_url=request.overlay_video_url,
            background_clip_paths=clip_paths,
            anchor_timeline=request.anchor_timeline,
            scene_timeline=request.scene_timeline,
            voice=request.voice,
            speed=request.speed,
            elevenlabs_stability=request.elevenlabs_stability,
            elevenlabs_similarity_boost=request.elevenlabs_similarity_boost,
            elevenlabs_style=request.elevenlabs_style,
            tts_provider=request.tts_provider,
            include_waveform=request.include_waveform,
        )
    finally:
        import os
        for p in temp_clip_paths:
            try:
                os.unlink(p)
            except OSError:
                pass

    return ReelResponse(
        video_url=video_url,
        episode_id=episode_id,
        duration_seconds=request.duration_seconds,
    )

@router.post(
    "/backfill-slugs",
    summary="Backfill slugs for existing episodes",
)
async def backfill_slugs(
    db: AsyncSession = Depends(get_db),
):
    """Generate slugs for episodes that don't have them."""
    from slugify import slugify
    
    result = await db.execute(
        select(PodcastEpisode).where(PodcastEpisode.slug.is_(None))
    )
    episodes = result.scalars().all()
    
    updated_count = 0
    for episode in episodes:
        base_slug = slugify(episode.title)
        # Append date to ensure uniqueness and SEO value
        date_suffix = episode.episode_date.strftime('%b-%d-%Y').lower()
        episode.slug = f"{base_slug}-{date_suffix}"
        updated_count += 1
    
    await db.commit()
    return {"message": f"Backfilled slugs for {updated_count} episodes"}


class EpisodeDateResponse(BaseModel):
    """Lightweight response with just episode ID, date, title, and slug."""
    id: int
    episode_date: date
    title: str
    duration_seconds: Optional[int]
    slug: Optional[str]

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
        select(PodcastEpisode.id, PodcastEpisode.episode_date, PodcastEpisode.title, PodcastEpisode.duration_seconds, PodcastEpisode.slug)
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
            duration_seconds=row.duration_seconds,
            slug=row.slug,
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
    slug: Optional[str]
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
            slug=ep.slug,
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
        slug=episode.slug,
        is_public=is_public,
    )


@router.get(
    "/public/slug/{slug}",
    response_model=PublicEpisodeResponse,
    summary="Get a public episode by slug",
)
async def get_public_episode_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicEpisodeResponse:
    """Get public episode by slug."""
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.slug == slug)
        .where(PodcastEpisode.status == "ready")
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode not found: {slug}")
        
    cutoff = date.today() - timedelta(days=PUBLIC_CUTOFF_DAYS)
    is_public = episode.episode_date <= cutoff

    return PublicEpisodeResponse(
        id=episode.id,
        episode_date=episode.episode_date,
        title=episode.title,
        script=episode.script if is_public else None,
        audio_url=episode.audio_url if is_public else None,
        duration_seconds=episode.duration_seconds if is_public else None,
        slug=episode.slug,
        is_public=is_public,
    )


@router.get(
    "/by-slug/{slug}",
    response_model=PodcastEpisodeResponse,
    summary="Get full episode by slug (authenticated, no 14-day gate)",
)
async def get_episode_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PodcastEpisodeResponse:
    """Get full episode content by slug. Used by the frontend for logged-in users."""
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.slug == slug)
        .where(PodcastEpisode.status == "ready")
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode not found: {slug}")

    return PodcastEpisodeResponse.model_validate(episode)


# =============================================================================
# Stats
# =============================================================================

@router.get("/stats", summary="Get podcast stats (episode count, papers scanned)")
async def get_podcast_stats(db: AsyncSession = Depends(get_db)) -> dict:
    """Returns episode count and estimated total papers scanned."""
    episode_count = await db.scalar(
        select(func.count()).select_from(PodcastEpisode)
        .where(PodcastEpisode.status == "ready")
    )
    return {
        "episodes": episode_count or 0,
        "papers_scanned": (episode_count or 0) * 500,  # 10 categories × 50 papers/day
    }


# =============================================================================
# RSS Feed for Apple Podcasts / Spotify
# IMPORTANT: Must come BEFORE /{episode_id} to avoid route conflicts
# =============================================================================


PODCAST_TITLE = "The Eureka Feed"
PODCAST_DESCRIPTION = (
    "Cutting-edge academic research distilled into 3-minute daily audio briefings. "
    "Every morning, we transform the latest scientific papers into accessible, "
    "engaging summaries — from quantum physics to climate science, AI to biology. "
    "Perfect for the curious mind on the go."
)
PODCAST_AUTHOR = "The Eureka Feed"
PODCAST_EMAIL = "ninad.mundalik@gmail.com"
PODCAST_SITE = "https://www.theeurekafeed.com"
PODCAST_COVER = "https://qdkooqoknppsulbiwxbn.supabase.co/storage/v1/object/public/podcast-audio/podcast_cover.png"
PODCAST_LANGUAGE = "en"
PODCAST_CATEGORY = "Science"
PODCAST_SUBCATEGORY = "Nature"


@router.get(
    "/feed.xml",
    summary="Podcast RSS feed for Apple Podcasts, Spotify, etc.",
    response_class=Response,
)
async def podcast_rss_feed(
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Generate a valid podcast RSS feed with iTunes extensions."""
    min_date = date(2026, 1, 20)
    result = await db.execute(
        select(PodcastEpisode)
        .where(PodcastEpisode.status == "ready")
        .where(PodcastEpisode.audio_url.isnot(None))
        .where(PodcastEpisode.episode_date >= min_date)
        .order_by(desc(PodcastEpisode.episode_date))
        .limit(200)
    )
    episodes = result.scalars().all()

    # Build XML
    ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"
    ATOM_NS = "http://www.w3.org/2005/Atom"
    CONTENT_NS = "http://purl.org/rss/1.0/modules/content/"

    register_namespace("itunes", ITUNES_NS)
    register_namespace("atom", ATOM_NS)
    register_namespace("content", CONTENT_NS)

    rss = Element("rss", {
        "version": "2.0",
    })
    channel = SubElement(rss, "channel")

    # Channel metadata
    SubElement(channel, "title").text = PODCAST_TITLE
    SubElement(channel, "link").text = PODCAST_SITE
    SubElement(channel, "description").text = PODCAST_DESCRIPTION
    SubElement(channel, "language").text = PODCAST_LANGUAGE
    SubElement(channel, "copyright").text = f"© 2026 {PODCAST_AUTHOR}"

    # Last build date
    if episodes:
        ep_dt = datetime.combine(episodes[0].episode_date, datetime.min.time(), tzinfo=timezone.utc)
        SubElement(channel, "lastBuildDate").text = format_datetime(ep_dt)

    # Atom self link
    SubElement(channel, f"{{{ATOM_NS}}}link", {
        "href": f"{PODCAST_SITE}/api/v1/podcast/feed.xml",
        "rel": "self",
        "type": "application/rss+xml",
    })

    # iTunes tags
    SubElement(channel, f"{{{ITUNES_NS}}}author").text = PODCAST_AUTHOR
    SubElement(channel, f"{{{ITUNES_NS}}}summary").text = PODCAST_DESCRIPTION
    SubElement(channel, f"{{{ITUNES_NS}}}type").text = "episodic"
    SubElement(channel, f"{{{ITUNES_NS}}}explicit").text = "false"
    SubElement(channel, f"{{{ITUNES_NS}}}image", {"href": PODCAST_COVER})

    owner = SubElement(channel, f"{{{ITUNES_NS}}}owner")
    SubElement(owner, f"{{{ITUNES_NS}}}name").text = PODCAST_AUTHOR
    SubElement(owner, f"{{{ITUNES_NS}}}email").text = PODCAST_EMAIL

    category = SubElement(channel, f"{{{ITUNES_NS}}}category", {"text": PODCAST_CATEGORY})
    SubElement(category, f"{{{ITUNES_NS}}}category", {"text": PODCAST_SUBCATEGORY})

    # Image (standard RSS)
    image = SubElement(channel, "image")
    SubElement(image, "url").text = PODCAST_COVER
    SubElement(image, "title").text = PODCAST_TITLE
    SubElement(image, "link").text = PODCAST_SITE

    # Episodes
    for ep in episodes:
        item = SubElement(channel, "item")
        SubElement(item, "title").text = ep.title

        ep_url = f"{PODCAST_SITE}/episodes/{ep.slug}" if ep.slug else PODCAST_SITE
        SubElement(item, "link").text = ep_url

        # Description — first 3 paragraphs of transcript
        description = ""
        if ep.script:
            paragraphs = [p.strip() for p in ep.script.split("\n") if p.strip()]
            description = " ".join(paragraphs[:3])
            if len(paragraphs) > 3:
                description += "..."
        SubElement(item, "description").text = description or ep.title

        # GUID
        SubElement(item, "guid", {"isPermaLink": "false"}).text = f"eurekafeed-ep-{ep.id}"

        # Pub date
        ep_datetime = datetime.combine(ep.episode_date, datetime.min.time(), tzinfo=timezone.utc)
        SubElement(item, "pubDate").text = format_datetime(ep_datetime)

        # Audio enclosure
        SubElement(item, "enclosure", {
            "url": ep.audio_url,
            "type": "audio/mpeg",
            "length": str((ep.duration_seconds or 180) * 16000),
        })

        # iTunes episode tags
        SubElement(item, f"{{{ITUNES_NS}}}title").text = ep.title
        SubElement(item, f"{{{ITUNES_NS}}}summary").text = description or ep.title
        SubElement(item, f"{{{ITUNES_NS}}}explicit").text = "false"
        SubElement(item, f"{{{ITUNES_NS}}}episodeType").text = "full"

        if ep.duration_seconds:
            mins = ep.duration_seconds // 60
            secs = ep.duration_seconds % 60
            SubElement(item, f"{{{ITUNES_NS}}}duration").text = f"{mins}:{secs:02d}"

    # Serialize
    xml_bytes = b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(rss, encoding="unicode").encode("utf-8")

    return Response(
        content=xml_bytes,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=1800"},
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
