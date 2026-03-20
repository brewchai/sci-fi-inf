import json
import os
import shutil
import tempfile
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
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

def _scene_excerpt(
    word_timestamps: list[dict],
    start_time: float,
    end_time: float,
    fallback: str,
) -> str:
    words = [
        w["word"].strip()
        for w in word_timestamps
        if w["start"] >= max(0, start_time - 0.05) and w["start"] < max(start_time + 0.05, end_time - 0.05)
    ]
    text = " ".join(word for word in words if word)
    return text or fallback


def _build_scene_caption_suggestion(
    transcript_excerpt: str,
    anchor_phrase: str = "",
    focus_word: str = "",
) -> str:
    source_text = (anchor_phrase or transcript_excerpt or focus_word or "").strip()
    if not source_text:
        return ""

    cleaned = " ".join(source_text.replace("\n", " ").split())
    raw_tokens = [token.strip(" ,.!?;:\"'()[]{}") for token in cleaned.split()]
    tokens = [token for token in raw_tokens if token]
    if not tokens:
        return ""

    lowered = [token.lower() for token in tokens]
    leading_fillers = {
        "i", "we", "you", "they", "he", "she", "it",
        "was", "were", "am", "is", "are", "be", "been", "being",
        "have", "has", "had", "do", "did", "does",
        "to", "that", "just", "really", "kind", "sort",
    }
    while len(tokens) > 2 and lowered and lowered[0] in leading_fillers:
        tokens.pop(0)
        lowered.pop(0)

    lowered = [token.lower() for token in tokens]
    if "to" in lowered:
        idx = lowered.index("to")
        tail = tokens[idx + 1:]
        if 1 <= len(tail) <= 4:
            return " ".join(tail)

    if "for" in lowered:
        idx = lowered.index("for")
        start_idx = max(0, idx - 1)
        tail = tokens[start_idx:]
        if 2 <= len(tail) <= 4:
            return " ".join(tail)

    if len(tokens) <= 4:
        return " ".join(tokens)

    return " ".join(tokens[-3:])


def _build_scene_timeline(
    anchors: list[dict],
    word_timestamps: list[dict],
    total_duration: float,
) -> list["SceneTimelineItem"]:
    scenes: list["SceneTimelineItem"] = []
    for idx, anchor in enumerate(anchors):
        start_time = float(anchor["start"])
        next_start = float(anchors[idx + 1]["start"]) if idx < len(anchors) - 1 else total_duration
        end_time = max(next_start, float(anchor.get("end", start_time)))
        anchor_word = str(anchor["word"]).strip()
        transcript_excerpt = _scene_excerpt(
            word_timestamps,
            start_time,
            next_start,
            str(anchor.get("anchor_phrase") or anchor.get("focus_word") or anchor_word),
        )
        anchor_phrase = str(anchor.get("anchor_phrase", anchor_word)).strip()
        visual_focus_word = str(anchor.get("focus_word", anchor_word)).strip()
        scenes.append(SceneTimelineItem(
            scene_id=f"scene-{idx + 1}",
            anchor_word=anchor_word,
            visual_focus_word=visual_focus_word,
            anchor_phrase=anchor_phrase,
            start_time_seconds=start_time,
            end_time_seconds=end_time,
            transcript_excerpt=transcript_excerpt,
            caption_text=_build_scene_caption_suggestion(
                transcript_excerpt,
                anchor_phrase=anchor_phrase,
                focus_word=visual_focus_word,
            ),
            caption_is_custom=False,
            effect_transition_name=anchor.get("effect_transition_name"),
            asset_source="none",
            scene_state="unresolved",
        ))
    return scenes


def _save_audio_preview(audio_path: str, suffix: str = ".mp3") -> tuple[str, str]:
    audio_id = str(uuid.uuid4())
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    audio_filename = f"preview_{audio_id}{suffix}"
    save_dir = os.path.join(os.getcwd(), "static", "audio_previews")
    os.makedirs(save_dir, exist_ok=True)
    final_audio_path = os.path.join(save_dir, audio_filename)
    shutil.move(audio_path, final_audio_path)
    return final_audio_path, f"/static/audio_previews/{audio_filename}"

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


class PunctuateTranscriptRequest(BaseModel):
    transcript: str = Field(..., description="Raw transcript text to punctuate and clean for display")


class PunctuateTranscriptResponse(BaseModel):
    display_transcript: str


async def _punctuate_display_transcript(transcript: str, strict: bool = False) -> str:
    """Punctuate and lightly clean transcript text for display only (timings remain untouched)."""
    text = (transcript or "").strip()
    if not text:
        return ""

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    system_prompt = (
        "You are a transcript cleaner for short-form science narration. "
        "Return only cleaned transcript text.\n"
        "Rules:\n"
        "1. Add natural punctuation and sentence casing.\n"
        "2. Remove filler words and disfluencies (uh, um, like, you know, kind of, sort of, basically, actually) when safe.\n"
        "3. Keep semantic meaning unchanged.\n"
        "4. Do not add new facts.\n"
        "5. Output plain text only."
    )
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=2500,
        )
        cleaned = (resp.choices[0].message.content or "").strip()
        return cleaned or text
    except Exception as exc:
        logger.exception("Failed to punctuate transcript; using raw transcript")
        if strict:
            raise HTTPException(status_code=500, detail=f"Punctuation failed: {exc}")
        return text


@router.post("/punctuate-transcript", response_model=PunctuateTranscriptResponse)
async def punctuate_transcript(request: PunctuateTranscriptRequest):
    if not request.transcript.strip():
        raise HTTPException(status_code=400, detail="transcript is required")
    display_transcript = await _punctuate_display_transcript(request.transcript, strict=True)
    return PunctuateTranscriptResponse(display_transcript=display_transcript)

class AnchorWord(BaseModel):
    word: str
    start_time_seconds: float
    end_time_seconds: float
    focus_word: Optional[str] = None
    anchor_phrase: Optional[str] = None

class TimelineEvent(BaseModel):
    image_url: str = Field(..., description="The AI Image generation URL or raw prompt text")
    start_time_seconds: float = Field(..., description="The exact timestamp this event should trigger")
    effect_transition_name: Optional[str] = Field(default=None, description="Named transition/effect selected from AI Director guidance")

class CompileAudioTimelineRequest(BaseModel):
    script: str = Field(..., description="Full narration script to generate TTS for")
    voice: str = Field("alloy", description="Voice ID to use for TTS")
    voice_provider: str = Field("openai", description="TTS Provider (openai/elevenlabs)")
    speed: float = Field(1.0, description="TTS speed multiplier")
    elevenlabs_stability: float = Field(default=0.65, ge=0.0, le=1.0, description="ElevenLabs stability setting")
    elevenlabs_similarity_boost: float = Field(default=0.85, ge=0.0, le=1.0, description="ElevenLabs similarity boost setting")
    elevenlabs_style: float = Field(default=0.1, ge=0.0, le=1.0, description="ElevenLabs style exaggeration setting")

class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float


class SceneAssetCandidate(BaseModel):
    candidate_id: str
    type: str
    thumbnail_url: str
    asset_url: str
    source_provider: str
    width: int = 0
    height: int = 0
    duration_seconds: Optional[float] = None
    query: str
    score: float = 0.0


class SelectedSceneAsset(BaseModel):
    asset_source: str = Field(..., description="local_image | local_video | stock_image | stock_video | ai_image | user_image | user_video | none")
    asset_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    candidate_id: Optional[str] = None


class SceneTimelineItem(BaseModel):
    scene_id: str
    anchor_word: str
    visual_focus_word: Optional[str] = None
    anchor_phrase: Optional[str] = None
    start_time_seconds: float
    end_time_seconds: float
    transcript_excerpt: str
    caption_text: Optional[str] = None
    caption_is_custom: bool = False
    effect_transition_name: Optional[str] = None
    search_queries: list[str] = Field(default_factory=list)
    stock_candidates: list[SceneAssetCandidate] = Field(default_factory=list)
    selected_asset: Optional[SelectedSceneAsset] = None
    ai_prompt: Optional[str] = None
    ai_image_url: Optional[str] = None
    asset_source: str = "none"
    scene_state: str = "unresolved"

class CompileAudioTimelineResponse(BaseModel):
    audio_url: str
    timeline: list[AnchorWord]
    scenes: list[SceneTimelineItem]
    duration: float
    word_timestamps: list[WordTimestamp]
    rewritten_script: str
    display_script: str

@router.post("/compile-audio-timeline", response_model=CompileAudioTimelineResponse)
async def compile_audio_timeline(request: CompileAudioTimelineRequest):
    """
    1. Generates TTS audio and saves it.
    2. Runs Whisper to get word-level timestamps.
    3. Runs the LLM to map Anchor Words to FLUX prompts at 3s intervals.
    """
    from app.services.reel_generator import ReelGenerator
    
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
        
    _, audio_url = _save_audio_preview(audio_path, ".mp3")
    
    # Calculate audio duration
    duration = 0.0
    if word_timestamps:
        duration = word_timestamps[-1]["end"] + 0.5
        
    # Extract the Anchor Word Timeline
    from app.services.anchor_selector import AnchorSelector
    selector = AnchorSelector()
    anchors = await selector.select_anchors(word_timestamps)
    anchors = await selector.assign_effects(final_script, anchors)
    
    timeline = []
    for item in anchors:
        timeline.append(AnchorWord(
            word=item["word"],
            start_time_seconds=item["start"],
            end_time_seconds=item["end"],
            focus_word=item.get("focus_word"),
            anchor_phrase=item.get("anchor_phrase"),
        ))
    scenes = _build_scene_timeline(anchors, word_timestamps, duration)
        
    return CompileAudioTimelineResponse(
        audio_url=audio_url,
        timeline=timeline,
        scenes=scenes,
        duration=duration,
        word_timestamps=[WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in word_timestamps] if word_timestamps else [],
        rewritten_script=final_script,
        display_script=final_script,
    )


@router.post("/compile-uploaded-audio-timeline", response_model=CompileAudioTimelineResponse)
async def compile_uploaded_audio_timeline(
    audio_file: UploadFile = File(...),
    transcript_text: Optional[str] = Form(default=None),
):
    """Compile uploaded narration audio into timestamps, anchors, and scenes."""
    from app.services.reel_generator import ReelGenerator
    from app.services.anchor_selector import AnchorSelector

    if not audio_file.filename:
        raise HTTPException(status_code=400, detail="audio_file is required")

    suffix = os.path.splitext(audio_file.filename)[1] or ".mp3"
    fd, temp_audio_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        with open(temp_audio_path, "wb") as f:
            shutil.copyfileobj(audio_file.file, f)

        generator = ReelGenerator()
        raw_words = await generator._get_word_timestamps(temp_audio_path)
        display_script = (transcript_text or "").strip()
        word_timestamps = raw_words
        if display_script:
            display_script = await _punctuate_display_transcript(display_script)
        else:
            display_script = await _punctuate_display_transcript(" ".join(w["word"] for w in raw_words).strip())

        duration = word_timestamps[-1]["end"] + 0.5 if word_timestamps else 0.0
        selector = AnchorSelector()
        anchors = await selector.select_anchors(word_timestamps)
        anchors = await selector.assign_effects(display_script, anchors)
        scenes = _build_scene_timeline(anchors, word_timestamps, duration)
        _, audio_url = _save_audio_preview(temp_audio_path, suffix)

        timeline = [
            AnchorWord(
                word=item["word"],
                start_time_seconds=item["start"],
                end_time_seconds=item["end"],
                focus_word=item.get("focus_word"),
                anchor_phrase=item.get("anchor_phrase"),
            )
            for item in anchors
        ]
        return CompileAudioTimelineResponse(
            audio_url=audio_url,
            timeline=timeline,
            scenes=scenes,
            duration=duration,
            word_timestamps=[WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in word_timestamps],
            rewritten_script=display_script,
            display_script=display_script,
        )
    except Exception as exc:
        logger.exception("Uploaded audio compile failed")
        raise HTTPException(status_code=500, detail=f"Uploaded audio compile failed: {exc}")
    finally:
        try:
            audio_file.file.close()
        except Exception:
            pass
        if os.path.exists(temp_audio_path):
            try:
                os.unlink(temp_audio_path)
            except OSError:
                pass


class UploadSceneAssetResponse(BaseModel):
    asset_source: str
    asset_url: str
    thumbnail_url: Optional[str] = None
    width: int = 0
    height: int = 0
    duration_seconds: Optional[float] = None


@router.post("/upload-scene-asset", response_model=UploadSceneAssetResponse)
async def upload_scene_asset(file: UploadFile = File(...)):
    """Upload a user image/video for scene assignment."""
    from app.services.storage import StorageService
    from app.services.reel_generator import ReelGenerator

    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")

    content_type = (file.content_type or "").lower()
    is_image = content_type.startswith("image/")
    is_video = content_type.startswith("video/")
    if not is_image and not is_video:
        raise HTTPException(status_code=400, detail="Only image/* or video/* files are supported")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(file_bytes) > 300 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 300MB)")

    ext = os.path.splitext(file.filename)[1].lower() or (".mp4" if is_video else ".jpg")
    safe_ext = ext if ext in {".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg", ".webp"} else (".mp4" if is_video else ".jpg")
    filename = f"user_uploads/{uuid.uuid4().hex}{safe_ext}"

    storage = StorageService()
    asset_url = storage.upload_file(file_bytes, filename, content_type or "application/octet-stream")

    width = 0
    height = 0
    duration_seconds: Optional[float] = None
    if is_video:
        try:
            fd, temp_path = tempfile.mkstemp(suffix=safe_ext)
            with os.fdopen(fd, "wb") as handle:
                handle.write(file_bytes)
            generator = ReelGenerator()
            duration_seconds = await generator._get_audio_duration(temp_path)
            os.unlink(temp_path)
        except Exception:
            logger.exception("Failed to inspect uploaded video metadata")

    return UploadSceneAssetResponse(
        asset_source="user_video" if is_video else "user_image",
        asset_url=asset_url,
        thumbnail_url=asset_url if is_image else None,
        width=width,
        height=height,
        duration_seconds=duration_seconds,
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


class LocalLibraryAssetsResponse(BaseModel):
    assets: list[SceneAssetCandidate]


@router.get("/local-library-assets", response_model=LocalLibraryAssetsResponse)
async def local_library_assets(limit: int = Query(default=500, ge=1, le=5000)):
    """List local library assets for manual per-scene selection."""
    from app.services.local_media_library import LocalMediaLibraryService

    library = LocalMediaLibraryService()
    if not library.is_enabled():
        return LocalLibraryAssetsResponse(assets=[])

    rows = library.list_assets(limit=limit)
    return LocalLibraryAssetsResponse(
        assets=[SceneAssetCandidate(**row) for row in rows]
    )


class ResolveSceneCandidatesRequest(BaseModel):
    script: str = Field(..., description="Narration script or transcript backing the scenes")
    scenes: list[SceneTimelineItem]
    llm_rerank: bool = Field(default=True, description="Whether to apply whole-story LLM reranking on top of heuristic candidate scores")


class ResolveSceneCandidatesResponse(BaseModel):
    scenes: list[SceneTimelineItem]


@router.post("/resolve-scene-candidates", response_model=ResolveSceneCandidatesResponse)
async def resolve_scene_candidates(request: ResolveSceneCandidatesRequest):
    """Populate stock search queries and ranked stock candidates for each scene."""
    from app.services.visual_search import search_scene_candidates

    scenes_payload = []
    for scene in request.scenes:
        scenes_payload.append({
            "scene_id": scene.scene_id,
            "anchor_word": scene.anchor_word,
            "visual_focus_word": scene.visual_focus_word,
            "anchor_phrase": scene.anchor_phrase,
            "transcript_excerpt": scene.transcript_excerpt,
            "start_time_seconds": scene.start_time_seconds,
            "end_time_seconds": scene.end_time_seconds,
        })

    candidates_by_scene = await search_scene_candidates(
        scenes_payload,
        full_script=request.script,
        llm_rerank=request.llm_rerank,
        include_local_candidates=False,
    )
    updated_scenes: list[SceneTimelineItem] = []
    for scene in request.scenes:
        payload_match = next((item for item in scenes_payload if item["scene_id"] == scene.scene_id), None) or {}
        candidate_rows = candidates_by_scene.get(scene.scene_id, [])
        update_payload = {
            "search_queries": payload_match.get("search_queries", []),
            "stock_candidates": [SceneAssetCandidate(**candidate) for candidate in candidate_rows],
            "scene_state": scene.scene_state if scene.asset_source != "none" else "unresolved",
        }
        updated_scenes.append(scene.model_copy(update=update_payload))
    return ResolveSceneCandidatesResponse(scenes=updated_scenes)


class RefetchSceneCandidatesRequest(BaseModel):
    script: str = Field(..., description="Narration script or transcript backing the scene")
    scene: SceneTimelineItem
    queries: list[str] = Field(default_factory=list, description="Explicit stock search queries for this scene")
    llm_rerank: bool = Field(default=False, description="Whether to apply LLM reranking for this single-scene refetch")


class RefetchSceneCandidatesResponse(BaseModel):
    scene: SceneTimelineItem


@router.post("/refetch-scene-candidates", response_model=RefetchSceneCandidatesResponse)
async def refetch_scene_candidates(request: RefetchSceneCandidatesRequest):
    """Refetch stock candidates for a single scene using explicit user-provided queries."""
    from app.services.visual_search import search_scene_candidates

    cleaned_queries = [str(query).strip() for query in request.queries if str(query).strip()]
    if not cleaned_queries:
        raise HTTPException(status_code=400, detail="At least one non-empty search query is required")

    scene = request.scene
    scene_payload = {
        "scene_id": scene.scene_id,
        "anchor_word": scene.anchor_word,
        "visual_focus_word": scene.visual_focus_word,
        "anchor_phrase": scene.anchor_phrase,
        "transcript_excerpt": scene.transcript_excerpt,
        "start_time_seconds": scene.start_time_seconds,
        "end_time_seconds": scene.end_time_seconds,
        "search_queries": cleaned_queries,
    }

    candidates_by_scene = await search_scene_candidates(
        [scene_payload],
        full_script=request.script,
        llm_rerank=request.llm_rerank,
        include_local_candidates=False,
        max_queries_per_scene=max(len(cleaned_queries), 1),
        max_candidates_per_scene=10,
        explicit_queries_by_scene={scene.scene_id: cleaned_queries},
        video_results_per_query=5,
        image_results_per_query=4,
    )

    updated_scene = scene.model_copy(update={
        "search_queries": cleaned_queries,
        "stock_candidates": [SceneAssetCandidate(**candidate) for candidate in candidates_by_scene.get(scene.scene_id, [])],
        "scene_state": scene.scene_state if scene.asset_source != "none" else "unresolved",
    })
    return RefetchSceneCandidatesResponse(scene=updated_scene)


class GenerateSceneAIFallbacksRequest(BaseModel):
    script: str = Field(..., description="Narration script or transcript backing the scenes")
    scenes: list[SceneTimelineItem]
    max_ai_generated_scenes: int = Field(default=3, ge=0, le=20)


class GenerateSceneAIFallbacksResponse(BaseModel):
    scenes: list[SceneTimelineItem]


@router.post("/generate-scene-ai-fallbacks", response_model=GenerateSceneAIFallbacksResponse)
async def generate_scene_ai_fallbacks(request: GenerateSceneAIFallbacksRequest):
    """Generate AI prompts only for unresolved scenes, respecting the configured cap."""
    from app.services.anchor_selector import AnchorSelector

    unresolved = [
        scene for scene in request.scenes
        if scene.asset_source == "none" and not scene.ai_image_url
    ]
    unresolved.sort(key=lambda scene: scene.start_time_seconds)
    eligible_ids = {scene.scene_id for scene in unresolved[:request.max_ai_generated_scenes]}

    selector = AnchorSelector()
    anchors = [
        {
            "word": scene.anchor_word,
            "start": scene.start_time_seconds,
            "end": scene.end_time_seconds,
            "focus_word": scene.visual_focus_word or scene.anchor_word,
            "anchor_phrase": scene.anchor_phrase or scene.anchor_word,
        }
        for scene in unresolved[:request.max_ai_generated_scenes]
    ]
    prompt_rows = await selector.generate_prompts(request.script, anchors) if anchors else []
    prompt_map = {f"scene-{idx + 1}": row for idx, row in enumerate(prompt_rows)}
    start_map = {row["start_time_seconds"]: row for row in prompt_rows}

    updated_scenes: list[SceneTimelineItem] = []
    for idx, scene in enumerate(request.scenes):
        row = prompt_map.get(scene.scene_id) or start_map.get(scene.start_time_seconds)
        if scene.asset_source != "none":
            if scene.asset_source.startswith("local"):
                resolved_state = "resolved_by_library"
            elif scene.asset_source.startswith("stock"):
                resolved_state = "resolved_by_stock"
            elif scene.asset_source.startswith("user"):
                resolved_state = "resolved_by_user"
            else:
                resolved_state = "resolved_by_ai"
            updated_scenes.append(scene.model_copy(update={"scene_state": resolved_state}))
            continue
        if scene.scene_id in eligible_ids and row:
            updated_scenes.append(scene.model_copy(update={
                "ai_prompt": row["prompt"],
                "effect_transition_name": row.get("effect_transition_name") or scene.effect_transition_name,
                "scene_state": "ai_eligible",
            }))
        elif scene.scene_id in eligible_ids:
            updated_scenes.append(scene.model_copy(update={"scene_state": "ai_eligible"}))
        else:
            updated_scenes.append(scene.model_copy(update={"scene_state": "ai_blocked_by_cap"}))
    return GenerateSceneAIFallbacksResponse(scenes=updated_scenes)


class GenerateSingleSceneAIPromptRequest(BaseModel):
    script: str = Field(..., description="Narration script or transcript backing the scene")
    scene: SceneTimelineItem


class GenerateSingleSceneAIPromptResponse(BaseModel):
    prompt: str
    effect_transition_name: Optional[str] = None


@router.post("/generate-single-scene-ai-prompt", response_model=GenerateSingleSceneAIPromptResponse)
async def generate_single_scene_ai_prompt(request: GenerateSingleSceneAIPromptRequest):
    """Generate one scene-aware AI image prompt using full-script context plus the current scene."""
    from app.services.anchor_selector import AnchorSelector

    scene = request.scene
    selector = AnchorSelector()
    anchors = [{
        "word": scene.anchor_word,
        "start": scene.start_time_seconds,
        "end": scene.end_time_seconds,
        "focus_word": scene.visual_focus_word or scene.anchor_word,
        "anchor_phrase": scene.anchor_phrase or scene.transcript_excerpt or scene.anchor_word,
        "effect_transition_name": scene.effect_transition_name,
    }]
    prompt_rows = await selector.generate_prompts(request.script, anchors)
    if not prompt_rows:
        raise HTTPException(status_code=500, detail="Failed to generate scene AI prompt")

    row = prompt_rows[0]
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=500, detail="Generated scene AI prompt was empty")

    return GenerateSingleSceneAIPromptResponse(
        prompt=prompt,
        effect_transition_name=row.get("effect_transition_name") or scene.effect_transition_name,
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

    if not request.custom_text and not request.audio_url:
        raise HTTPException(
            status_code=400,
            detail="Either custom_text or audio_url is required for standalone paper reels.",
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
            scene_timeline=request.scene_timeline,
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

    if not request.custom_text and not request.audio_url:
        raise HTTPException(status_code=400, detail="Either custom_text or audio_url is required")

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
            scene_timeline=request.scene_timeline,
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
        {
            "word": a.word,
            "start": a.start_time_seconds,
            "end": a.end_time_seconds,
            "focus_word": a.focus_word or a.word,
            "anchor_phrase": a.anchor_phrase or a.word,
        }
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
