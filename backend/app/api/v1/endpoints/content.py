import json
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.db.session import get_db
from app.api.v1.endpoints.podcast import GenerateReelRequest, ReelResponse
from app.services.harvester import OpenAlexHarvester
from app.models.paper import Paper
from app.models.top_paper import TopPaper
from app.models.daily_science_paper import DailySciencePaper
from app.domain.categories import get_category_registry

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _ensure_english_titles(papers: list, db: AsyncSession) -> None:
    """Send ALL titles to the LLM — translate non-English ones, return English ones unchanged.

    Works with any model that has `.id` and `.title` attributes.
    Handles German, French, and other Latin-script languages that the old
    ASCII heuristic missed.
    """
    if not papers:
        return

    titles_map = {str(p.id): p.title for p in papers}
    prompt = (
        "Below is a JSON object mapping paper IDs to their titles. "
        "Some titles may be in English, others in German, French, or other languages. "
        "Return a JSON object with the SAME keys. "
        "For titles already in English, return them unchanged. "
        "For non-English titles, return an accurate English translation. "
        "Keep translations academic and faithful to the original meaning.\n\n"
        + json.dumps(titles_map, ensure_ascii=False)
    )

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=4000,
        )
        translations = json.loads(resp.choices[0].message.content)

        changed = 0
        for paper in papers:
            translated = translations.get(str(paper.id))
            if translated and translated != paper.title:
                paper.title = translated
                changed += 1

        await db.flush()
        if changed:
            logger.info(f"Translated {changed}/{len(papers)} titles to English")
        else:
            logger.info("All titles already in English")
    except Exception as e:
        logger.warning(f"Title translation failed (non-fatal): {e}")


async def _store_top_papers(
    raw_papers: list[dict],
    category_slug: str,
    db: AsyncSession,
) -> list[TopPaper]:
    """Parse raw OpenAlex results and upsert into the top_papers table.

    Returns the list of TopPaper rows (new + existing) for the given
    openalex IDs, sorted by cited_by_count desc.
    """
    openalex_ids = [p.get("id") for p in raw_papers if p.get("id")]
    if not openalex_ids:
        return []

    existing_stmt = select(TopPaper).where(TopPaper.openalex_id.in_(openalex_ids))
    existing_result = await db.execute(existing_stmt)
    existing_map = {tp.openalex_id: tp for tp in existing_result.scalars().all()}

    for item in raw_papers:
        openalex_id = item.get("id")
        if not openalex_id or openalex_id in existing_map:
            continue

        pub_date_str = item.get("publication_date")
        if not pub_date_str:
            continue
        try:
            pub_date = date.fromisoformat(pub_date_str)
        except ValueError:
            continue

        abstract = OpenAlexHarvester.reconstruct_abstract(item.get("abstract_inverted_index"))

        oa = item.get("open_access", {}) or {}
        pdf_url = oa.get("oa_url") if oa.get("is_oa") else None

        tp = TopPaper(
            openalex_id=openalex_id,
            doi=item.get("doi"),
            title=item.get("title") or "Untitled",
            abstract=abstract or None,
            publication_date=pub_date,
            metrics={
                "cited_by_count": item.get("cited_by_count") or 0,
                "fwci": item.get("fwci"),
            },
            authors_metadata=item.get("authorships") or [],
            topics_metadata=item.get("topics") or [],
            pdf_url=pdf_url,
            landing_page_url=item.get("doi"),
            category_slug=category_slug,
        )
        db.add(tp)
        existing_map[openalex_id] = tp

    await db.flush()

    papers = [existing_map[oid] for oid in openalex_ids if oid in existing_map]
    papers.sort(
        key=lambda x: (x.metrics.get("cited_by_count", 0) if x.metrics else 0),
        reverse=True,
    )
    return papers


# ---------------------------------------------------------------------------
# Top Papers — fully isolated in top_papers table
# ---------------------------------------------------------------------------

@router.get("/top-papers")
async def get_top_papers(
    category: str = Query(..., description="Category slug"),
    start_year: Optional[str] = Query(None, description="Start year (YYYY) or date (YYYY-MM-DD)"),
    end_year: Optional[str] = Query(None, description="End year (YYYY) or date (YYYY-MM-DD)"),
    limit: int = Query(20, description="Number of results"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the most cited papers for a given category and date range.

    Results are stored in the `top_papers` table (not `papers`).
    """
    registry = get_category_registry()
    category_obj = registry.get(category)
    if not category_obj:
        raise HTTPException(status_code=400, detail="Invalid category slug")

    from_date = None
    to_date = None
    try:
        if start_year:
            from_date = date(int(start_year), 1, 1) if len(start_year) == 4 else date.fromisoformat(start_year)
        if end_year:
            to_date = date(int(end_year), 12, 31) if len(end_year) == 4 else date.fromisoformat(end_year)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY or YYYY-MM-DD")

    if not from_date:
        from_date = date(1900, 1, 1)

    harvester = OpenAlexHarvester(db)
    raw_papers = await harvester.fetch_papers(
        from_date=from_date,
        to_date=to_date,
        category=category_obj,
        per_page=limit,
    )

    if not raw_papers:
        return []

    db_papers = await _store_top_papers(raw_papers, category, db)
    await _ensure_english_titles(db_papers, db)
    await db.commit()

    return db_papers


@router.delete("/top-papers")
async def delete_top_papers(
    db: AsyncSession = Depends(get_db),
):
    """Delete all rows from the top_papers table."""
    from sqlalchemy import delete
    await db.execute(delete(TopPaper))
    await db.commit()
    return {"detail": "All top papers deleted"}


@router.post("/top-papers/analyze")
async def analyze_top_papers(
    paper_ids: list[int],
    db: AsyncSession = Depends(get_db),
):
    """AI-generated impact analysis for a batch of top papers.

    Returns a short, opinionated ranking with reasoning —
    which paper is the most impactful and why.
    """
    if not paper_ids:
        raise HTTPException(status_code=400, detail="No paper IDs provided")

    stmt = select(TopPaper).where(TopPaper.id.in_(paper_ids))
    result = await db.execute(stmt)
    papers = list(result.scalars().all())

    if not papers:
        raise HTTPException(status_code=404, detail="No matching papers found")

    paper_summaries = []
    for p in papers:
        citations = (p.metrics or {}).get("cited_by_count", 0)
        fwci = (p.metrics or {}).get("fwci")
        fwci_str = f"{fwci:.2f}" if fwci is not None else "N/A"
        authors = ", ".join(
            a.get("author", {}).get("display_name", "")
            for a in (p.authors_metadata or [])[:3]
        )
        paper_summaries.append(
            f"- [ID {p.id}] \"{p.title}\" by {authors} "
            f"({p.publication_date.year if p.publication_date else '?'}). "
            f"Citations: {citations:,}. FWCI: {fwci_str}.\n"
            f"  Abstract: {(p.abstract or '')[:400]}"
        )

    prompt = f"""You are a science historian and impact analyst. Below are {len(papers)} highly-cited papers.

Your job is to assess the REAL-WORLD IMPACT of each paper — not just count citations.
Think about: Did this paper change how we treat diseases? Did it enable new technology?
Did it shift an entire field's paradigm? Did it influence policy, industry, or daily life?

FWCI (Field-Weighted Citation Impact) normalises citations against field/year averages.
1.0 = average for the field. Use FWCI to spot papers that punched above their weight.

Papers:
{chr(10).join(paper_summaries)}

Your task:
1. Pick the paper with the greatest REAL-WORLD impact (not just highest citations).
2. `top_pick_reason`: 1 sentence on what this paper actually changed in the real world.
3. For EVERY paper in the list, write a `note` (1 sentence max) about its real-world
   significance — what it enabled, what it changed, or why it matters beyond academia.
   Be specific (name the technology, the treatment, the paradigm shift).

Return valid JSON:
{{
  "top_pick_id": <int>,
  "top_pick_reason": "<string>",
  "paper_notes": [
    {{"id": <int>, "note": "<string>", "fwci": <float|null>, "cited_by_count": <int>}}
  ]
}}"""

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1500,
        )
        analysis = json.loads(resp.choices[0].message.content)
        return analysis
    except Exception as e:
        logger.error(f"Impact analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Impact analysis failed")


# ---------------------------------------------------------------------------
# Helpers — Daily Science storage
# ---------------------------------------------------------------------------

async def _store_daily_science_papers(
    raw_papers: list[dict],
    db: AsyncSession,
) -> list[DailySciencePaper]:
    """Parse raw OpenAlex results and upsert into the daily_science_papers table."""
    openalex_ids = [p.get("id") for p in raw_papers if p.get("id")]
    if not openalex_ids:
        return []

    existing_stmt = select(DailySciencePaper).where(DailySciencePaper.openalex_id.in_(openalex_ids))
    existing_result = await db.execute(existing_stmt)
    existing_map = {dp.openalex_id: dp for dp in existing_result.scalars().all()}

    for item in raw_papers:
        openalex_id = item.get("id")
        if not openalex_id or openalex_id in existing_map:
            continue

        pub_date_str = item.get("publication_date")
        if not pub_date_str:
            continue
        try:
            pub_date = date.fromisoformat(pub_date_str)
        except ValueError:
            continue

        abstract = OpenAlexHarvester.reconstruct_abstract(item.get("abstract_inverted_index"))

        oa = item.get("open_access", {}) or {}
        pdf_url = oa.get("oa_url") if oa.get("is_oa") else None

        dp = DailySciencePaper(
            openalex_id=openalex_id,
            doi=item.get("doi"),
            title=item.get("title") or "Untitled",
            abstract=abstract or None,
            publication_date=pub_date,
            metrics={
                "cited_by_count": item.get("cited_by_count") or 0,
                "fwci": item.get("fwci"),
            },
            authors_metadata=item.get("authorships") or [],
            topics_metadata=item.get("topics") or [],
            pdf_url=pdf_url,
            landing_page_url=item.get("doi"),
            category_slug=None,
        )
        db.add(dp)
        existing_map[openalex_id] = dp

    await db.flush()

    papers = [existing_map[oid] for oid in openalex_ids if oid in existing_map]
    return papers


# ---------------------------------------------------------------------------
# Daily Science — fully isolated in daily_science_papers table
# ---------------------------------------------------------------------------

@router.get("/daily-science")
async def get_daily_science(
    keywords: str = Query(..., description="Keywords/concept to search"),
    start_year: Optional[str] = Query(None, description="Start year (YYYY) or date (YYYY-MM-DD)"),
    limit: int = Query(20, description="Number of results"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch foundational/seminal papers for a concept.

    Sorts by citation count to surface the papers that defined the field.
    Uses relaxed filters (no publishedVersion requirement) to include
    older foundational work. Results stored in `daily_science_papers`.
    """
    from_date = None
    try:
        if start_year:
            from_date = date(int(start_year), 1, 1) if len(start_year) == 4 else date.fromisoformat(start_year)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY or YYYY-MM-DD")

    harvester = OpenAlexHarvester(db)
    raw_papers = await harvester.fetch_papers(
        from_date=from_date,
        to_date=None,
        category=None,
        query=keywords,
        per_page=limit,
        sort="cited_by_count:desc",
        relaxed_filters=True,
    )
    if not raw_papers:
        return []

    db_papers = await _store_daily_science_papers(raw_papers, db)
    await _ensure_english_titles(db_papers, db)
    await db.commit()
    return db_papers


@router.delete("/daily-science")
async def delete_daily_science_papers(
    db: AsyncSession = Depends(get_db),
):
    """Delete all rows from the daily_science_papers table."""
    from sqlalchemy import delete
    await db.execute(delete(DailySciencePaper))
    await db.commit()
    return {"detail": "All daily science papers deleted"}


@router.post("/daily-science/analyze")
async def analyze_daily_science(
    paper_ids: list[int],
    query: str = Query("", description="The original search query for relevance scoring"),
    db: AsyncSession = Depends(get_db),
):
    """AI-generated relevance & story-worthiness analysis for daily science papers.

    Picks the most relevant paper to the user's query and the most
    story-worthy one, plus a short note for every paper.
    """
    if not paper_ids:
        raise HTTPException(status_code=400, detail="No paper IDs provided")

    stmt = select(DailySciencePaper).where(DailySciencePaper.id.in_(paper_ids))
    result = await db.execute(stmt)
    papers = list(result.scalars().all())

    if not papers:
        raise HTTPException(status_code=404, detail="No matching papers found")

    paper_summaries = []
    for p in papers:
        citations = (p.metrics or {}).get("cited_by_count", 0)
        fwci = (p.metrics or {}).get("fwci")
        fwci_str = f"{fwci:.2f}" if fwci is not None else "N/A"
        authors = ", ".join(
            a.get("author", {}).get("display_name", "")
            for a in (p.authors_metadata or [])[:3]
        )
        paper_summaries.append(
            f"- [ID {p.id}] \"{p.title}\" by {authors} "
            f"({p.publication_date.year if p.publication_date else '?'}). "
            f"Citations: {citations:,}. FWCI: {fwci_str}.\n"
            f"  Abstract: {(p.abstract or '')[:400]}"
        )

    query_context = f'The user searched for: "{query}"\n\n' if query else ""

    prompt = f"""{query_context}You are a science communicator picking the best paper to EXPLAIN A CONCEPT to a general audience.

The user wants to create educational content about "{query or 'this topic'}".
Your job is to pick the paper that BEST EXPLAINS the core concept — not just the most cited,
not just the most recent, but the one whose abstract most clearly and thoroughly describes
the underlying science in a way that could teach someone the concept from scratch.

Ideal pick: a review paper, a comprehensive study, or any paper whose abstract reads like
a mini-explainer of the topic. Avoid papers that are too narrow, too tangential, or assume
too much prior knowledge.

Papers:
{chr(10).join(paper_summaries)}

Your tasks:
1. **top_pick_id**: Pick the paper that BEST EXPLAINS the core concept behind the user's query.
   Prioritise papers whose abstracts give a clear, educational overview of the topic.
   A good review paper or a well-written study with a thorough abstract beats a narrow niche paper.
2. **top_pick_reason**: 1 sentence — why this paper is the best pick for explaining the concept.
3. For EVERY paper, write a `note` (1 sentence max) explaining what it covers and
   how well it explains the core concept. Be honest — if it's tangential or too niche, say so.

Return valid JSON:
{{
  "top_pick_id": <int>,
  "top_pick_reason": "<string>",
  "paper_notes": [
    {{"id": <int>, "note": "<string>", "fwci": <float|null>, "cited_by_count": <int>}}
  ]
}}"""

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1500,
        )
        analysis = json.loads(resp.choices[0].message.content)
        return analysis
    except Exception as e:
        logger.error(f"Daily science analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed")


@router.get("/scientists")
async def get_top_scientists(
    query: str = Query(..., description="Scientist Name/Field search"),
    sort_by: str = Query("citations", description="Sort parameter"),
    limit: int = Query(20, description="Number of results"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch top papers relevant to a scientist or field."""
    harvester = OpenAlexHarvester(db)
    raw_papers = await harvester.fetch_papers(
        from_date=None, to_date=None, category=None, query=query, per_page=limit,
    )
    if not raw_papers:
        return []

    await harvester.process_and_store(raw_papers, category_slug=None)
    await db.commit()

    openalex_ids = [p.get("id") for p in raw_papers if p.get("id")]
    if not openalex_ids:
        return []

    stmt = select(Paper).where(Paper.openalex_id.in_(openalex_ids))
    result = await db.execute(stmt)
    db_papers = list(result.scalars().all())
    db_papers.sort(key=lambda x: (x.metrics.get("cited_by_count", 0) if x.metrics else 0), reverse=True)

    await _ensure_english_titles(db_papers, db)
    await db.commit()
    return db_papers


# ---------------------------------------------------------------------------
# AI Image Generation (for Carousels)
# ---------------------------------------------------------------------------

class GenerateImagePromptRequest(BaseModel):
    text: str = Field(..., description="Slide headline and takeaways to base the prompt on")

class GenerateImagePromptResponse(BaseModel):
    prompt: str

@router.post("/generate-image-prompt", response_model=GenerateImagePromptResponse)
async def generate_image_prompt(request: GenerateImagePromptRequest):
    """Use LLM to generate a descriptive visual prompt from slide text."""
    from app.services.image_generator import image_generation_engine
    prompt = await image_generation_engine.generate_prompt_from_text(request.text)
    return GenerateImagePromptResponse(prompt=prompt)

class GenerateImageRequest(BaseModel):
    prompt: str = Field(..., description="Style-neutral visual prompt")
    style: Optional[str] = Field(None, description="Style preset slug (e.g. 'archival_bw')")

class GenerateImageResponse(BaseModel):
    image_url: str

@router.get("/image-styles")
async def get_image_styles():
    """Return available visual style presets for the UI dropdown."""
    from app.services.image_generator import STYLE_PRESETS, DEFAULT_STYLE
    labels = {
        "archival_bw": "🎞 Archival B&W",
        "photojournalism": "📷 Photojournalism",
        "cinematic_moody": "🎬 Cinematic Moody",
        "cold_scifi": "🔬 Cold Sci-Fi",
        "raw_documentary": "📹 Raw Documentary",
        "vintage_sepia": "🕰 Vintage Sepia",
    }
    return {
        "styles": [{"slug": k, "label": labels.get(k, k)} for k in STYLE_PRESETS],
        "default": DEFAULT_STYLE
    }

@router.post("/generate-image", response_model=GenerateImageResponse)
async def generate_image(request: GenerateImageRequest):
    """Call Together AI (FLUX.1) to generate an image and return local URL."""
    from app.services.image_generator import image_generation_engine
    image_url = await image_generation_engine.generate_image(
        request.prompt,
        style=request.style,
    )
    return GenerateImageResponse(image_url=image_url)


# ---------------------------------------------------------------------------
# Fetch visuals (user approval flow)
# ---------------------------------------------------------------------------

class ExtractVisualQueriesRequest(BaseModel):
    headline: str = Field("", description="Reel headline for context")
    script: str = Field(..., description="Narration script to extract visual keywords from")

class ExtractVisualQueriesResponse(BaseModel):
    queries: list[str]

@router.post("/extract-visual-queries", response_model=ExtractVisualQueriesResponse)
async def extract_visual_queries(request: ExtractVisualQueriesRequest):
    """Extract keywords from headline+script for user approval before searching Pexels."""
    from app.services.visual_search import extract_visual_keywords

    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required")

    queries = await extract_visual_keywords(
        headline=request.headline or "",
        script=request.script,
    )
    return ExtractVisualQueriesResponse(queries=queries)

class ExtractScenePromptsRequest(BaseModel):
    script: str = Field(..., description="Full narration script to split into precise timed image prompts")

class ExtractScenePromptsResponse(BaseModel):
    prompts: list[str]

@router.post("/extract-scene-prompts", response_model=ExtractScenePromptsResponse)
async def extract_scene_prompts_endpoint(request: ExtractScenePromptsRequest):
    """Use GPT-4o-mini to extract exact timed visual prompts for FLUX.1 based on script lengths."""
    from app.services.scene_extractor import extract_scene_prompts
    
    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required")
        
    prompts = await extract_scene_prompts(request.script)
    return ExtractScenePromptsResponse(prompts=prompts)


class RewriteVoiceScriptRequest(BaseModel):
    script: str = Field(..., description="Narration script to rewrite for documentary-style TTS")


class RewriteVoiceScriptResponse(BaseModel):
    rewritten_script: str


@router.post("/rewrite-voice-script", response_model=RewriteVoiceScriptResponse)
async def rewrite_voice_script(request: RewriteVoiceScriptRequest):
    """Rewrite a narration script so it sounds more natural when spoken by TTS."""
    from app.services.voice_script_rewriter import VoiceScriptRewriter

    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required")

    rewriter = VoiceScriptRewriter()
    rewritten_script = await rewriter.rewrite(request.script)
    return RewriteVoiceScriptResponse(rewritten_script=rewritten_script)

class AnchorWord(BaseModel):
    word: str
    start_time_seconds: float
    end_time_seconds: float

class TimelineEvent(BaseModel):
    image_url: str = Field(..., description="The AI Image generation URL or raw prompt text")
    start_time_seconds: float = Field(..., description="The exact timestamp this event should trigger")
    effect_transition_name: Optional[str] = Field(default=None, description="Named transition/effect selected from AI Director guidance")

class CompileAudioTimelineRequest(BaseModel):
    script: str = Field(..., description="Full narration script to generate TTS for")
    voice: str = Field("alloy", description="Voice ID to use for TTS")
    voice_provider: str = Field("openai", description="TTS Provider (openai/elevenlabs)")
    speed: float = Field(1.0, description="TTS speed multiplier")
    elevenlabs_stability: float = Field(default=0.3, ge=0.0, le=1.0, description="ElevenLabs stability setting")
    elevenlabs_similarity_boost: float = Field(default=0.75, ge=0.0, le=1.0, description="ElevenLabs similarity boost setting")
    elevenlabs_style: float = Field(default=0.4, ge=0.0, le=1.0, description="ElevenLabs style exaggeration setting")

class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float

class CompileAudioTimelineResponse(BaseModel):
    audio_url: str
    timeline: list[AnchorWord]
    duration: float
    word_timestamps: list[WordTimestamp]
    rewritten_script: str

@router.post("/compile-audio-timeline", response_model=CompileAudioTimelineResponse)
async def compile_audio_timeline(request: CompileAudioTimelineRequest):
    """
    1. Generates TTS audio and saves it.
    2. Runs Whisper to get word-level timestamps.
    3. Runs the LLM to map Anchor Words to FLUX prompts at 3s intervals.
    """
    from app.services.reel_generator import ReelGenerator
    from app.services.timeline_extractor import extract_timeline_prompts
    
    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required")
        
    generator = ReelGenerator()
    final_script = request.script.strip()
    
    # Generate the TTS Audio and get timestamps
    try:
        audio_path = await generator._generate_tts_audio(
            text=final_script,
            voice=request.voice,
            provider=request.voice_provider,
            speed=request.speed,
            elevenlabs_stability=request.elevenlabs_stability,
            elevenlabs_similarity_boost=request.elevenlabs_similarity_boost,
            elevenlabs_style=request.elevenlabs_style,
        )
        raw_words = await generator._get_word_timestamps(audio_path)
        word_timestamps = generator._restore_punctuation(raw_words, final_script)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"TTS Generation failed: {str(e)}")
        
    # Move the audio to a static URL so the frontend can preview it
    import os
    import shutil
    import uuid
    audio_id = str(uuid.uuid4())
    audio_filename = f"preview_{audio_id}.mp3"
    save_dir = os.path.join(os.getcwd(), "static", "audio_previews")
    os.makedirs(save_dir, exist_ok=True)
    final_audio_path = os.path.join(save_dir, audio_filename)
    
    shutil.move(audio_path, final_audio_path)
    audio_url = f"/static/audio_previews/{audio_filename}"
    
    # Calculate audio duration
    duration = 0.0
    if word_timestamps:
        duration = word_timestamps[-1]["end"] + 0.5
        
    # Extract the Anchor Word Timeline
    from app.services.anchor_selector import AnchorSelector
    selector = AnchorSelector()
    anchors = await selector.select_anchors(word_timestamps)
    
    timeline = []
    for item in anchors:
        timeline.append(AnchorWord(
            word=item["word"],
            start_time_seconds=item["start"],
            end_time_seconds=item["end"]
        ))
        
    return CompileAudioTimelineResponse(
        audio_url=audio_url,
        timeline=timeline,
        duration=duration,
        word_timestamps=[WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in word_timestamps] if word_timestamps else [],
        rewritten_script=final_script,
    )

class FetchVisualsRequest(BaseModel):
    queries: list[str] = Field(..., description="List of approved search queries")

class FetchVisualsClip(BaseModel):
    url: str
    thumbnail: str
    keyword: str
    duration: float

class FetchVisualsResponse(BaseModel):
    clips: list[FetchVisualsClip]


@router.post("/fetch-visuals", response_model=FetchVisualsResponse)
async def fetch_visuals(request: FetchVisualsRequest):
    """Search Pexels using the provided queries, return clip metadata for user approval."""
    from app.services.visual_search import fetch_visual_clips

    if not request.queries:
        raise HTTPException(status_code=400, detail="queries list is empty")

    clips = await fetch_visual_clips(request.queries)
    return FetchVisualsResponse(
        clips=[FetchVisualsClip(url=c["url"], thumbnail=c.get("thumbnail", ""), keyword=c["keyword"], duration=c["duration"]) for c in clips]
    )


# ---------------------------------------------------------------------------
# Reel generation from a content-engine paper
# ---------------------------------------------------------------------------

async def _download_clip_urls(urls: list[str]) -> list[str]:
    """Download clips from URLs to temp files. Returns paths."""
    from app.services.visual_search import download_clip_from_url

    paths = []
    for url in urls:
        try:
            path = await download_clip_from_url(url)
            paths.append(path)
        except Exception as e:
            logger.error(f"Failed to download clip from {url[:60]}...: {e}")
    return paths


async def _resolve_auto_visuals(request: GenerateReelRequest) -> list[str] | None:
    """If auto_visuals is on, extract keywords and download stock clips. Returns temp file paths or None."""
    if not request.auto_visuals:
        return None

    import os
    from app.services.visual_search import extract_visual_keywords, search_stock_clips, download_clip

    headline = request.headline or ""
    script = request.custom_text or ""
    if not headline and not script:
        return None

    keywords = await extract_visual_keywords(headline, script)
    if not keywords:
        return None

    clips = await search_stock_clips(keywords, orientation="portrait")
    if not clips:
        logger.warning("Auto-visuals: no stock clips found, falling back to default background")
        return None

    paths = []
    for clip in clips:
        try:
            path = await download_clip(clip)
            paths.append(path)
        except Exception as e:
            logger.error(f"Failed to download clip '{clip.keyword}': {e}")

    return paths if paths else None


@router.post("/paper/{paper_id}/generate-reel", response_model=ReelResponse)
async def generate_reel_from_paper(
    paper_id: int,
    request: GenerateReelRequest,
    content_type: str = Query("latest", description="Controls generation framing"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a reel from a specific paper without requiring a podcast episode."""
    from app.services.reel_generator import ReelGenerator
    from app.services.editor import EditorEngine

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

    if not request.custom_text:
        raise HTTPException(
            status_code=400,
            detail="Custom text is required for standalone paper reels since there is no podcast audio.",
        )

    if not paper.eli5_summary or not paper.key_takeaways:
        editor = EditorEngine(db)
        await editor.generate_summary(paper)
        await db.commit()
        await db.refresh(paper)

    clip_paths = None
    if request.background_clip_urls and len(request.background_clip_urls) > 0:
        clip_paths = await _download_clip_urls(request.background_clip_urls)
    else:
        clip_paths = await _resolve_auto_visuals(request)
    temp_clip_paths = clip_paths or []

    try:
        generator = ReelGenerator()
        video_url = await generator.generate(
            episode_id=None,
            paper_id=paper_id,
            audio_url=request.audio_url,
            headline=request.headline,
            start_seconds=request.start_seconds,
            duration_seconds=request.duration_seconds,
            custom_text=request.custom_text,
            closing_statement=request.closing_statement,
            background_video_url=request.background_video_url if not clip_paths else None,
            overlay_video_url=request.overlay_video_url,
            background_clip_paths=clip_paths,
            anchor_timeline=request.anchor_timeline,
            word_timestamps=request.word_timestamps,
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
        episode_id=0,
        duration_seconds=request.duration_seconds,
    )


@router.post("/custom/generate-reel", response_model=ReelResponse)
async def generate_custom_reel(
    request: GenerateReelRequest,
):
    """Generate a reel from custom user-provided script. No paper or episode needed."""
    from app.services.reel_generator import ReelGenerator

    if not request.custom_text:
        raise HTTPException(status_code=400, detail="custom_text is required")

    clip_paths = None
    if request.background_clip_urls and len(request.background_clip_urls) > 0:
        clip_paths = await _download_clip_urls(request.background_clip_urls)
    else:
        clip_paths = await _resolve_auto_visuals(request)
    temp_clip_paths = clip_paths or []

    try:
        generator = ReelGenerator()
        video_url = await generator.generate(
            episode_id=None,
            paper_id=None,
            audio_url=request.audio_url,
            headline=request.headline,
            start_seconds=0,
            duration_seconds=request.duration_seconds,
            custom_text=request.custom_text,
            closing_statement=request.closing_statement,
            background_video_url=request.background_video_url if not clip_paths else None,
            overlay_video_url=request.overlay_video_url,
            background_clip_paths=clip_paths,
            anchor_timeline=request.anchor_timeline,
            word_timestamps=request.word_timestamps,
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
        episode_id=0,
        duration_seconds=request.duration_seconds,
    )

class GeneratePromptsFromAnchorsRequest(BaseModel):
    script: str = Field(..., description="Full narration script")
    anchors: list[AnchorWord] = Field(..., description="The user-approved list of anchor words mapped to float times")

class GeneratePromptsFromAnchorsResponse(BaseModel):
    timeline: list[TimelineEvent]

@router.post("/generate-prompts-from-anchors", response_model=GeneratePromptsFromAnchorsResponse)
async def generate_prompts_from_anchors(request: GeneratePromptsFromAnchorsRequest):
    """Phase 2: Use established Anchor Words to write strictly timed FLUX.1 visual prompts."""
    from app.services.anchor_selector import AnchorSelector
    
    if not request.script.strip() or not request.anchors:
        raise HTTPException(status_code=400, detail="Script and anchors are required")

    selector = AnchorSelector()
    
    # Convert AnchorWord models to dicts for the service
    anchors_dict = [
        {"word": a.word, "start": a.start_time_seconds, "end": a.end_time_seconds}
        for a in request.anchors
    ]
    
    timeline_raw = await selector.generate_prompts(request.script, anchors_dict)
    
    timeline = []
    for item in timeline_raw:
        timeline.append(TimelineEvent(
            image_url=item["prompt"], # Temporarily holding the prompt text here before image generation
            start_time_seconds=item["start_time_seconds"],
            effect_transition_name=item.get("effect_transition_name"),
        ))
        
    return GeneratePromptsFromAnchorsResponse(timeline=timeline)
