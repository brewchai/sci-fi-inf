import asyncio
import json
import os
import shutil
import tempfile
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.db.session import get_db
from app.api.v1.endpoints.podcast import GenerateReelRequest, ReelResponse
from app.services.harvester import OpenAlexHarvester
from app.services.llm_router import complete_text
from app.models.paper import Paper
from app.models.top_paper import TopPaper
from app.models.daily_science_paper import DailySciencePaper
from app.domain.categories import get_category_registry

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_static_asset_path(asset_url: str) -> Path:
    cleaned = str(asset_url or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="asset_url is required")
    if not cleaned.startswith("/static/"):
        raise HTTPException(status_code=400, detail="asset_url must point to a local /static asset")
    relative = cleaned.removeprefix("/static/").lstrip("/")
    resolved = (Path(os.getcwd()) / "static" / relative).resolve()
    static_root = (Path(os.getcwd()) / "static").resolve()
    if static_root not in resolved.parents and resolved != static_root:
        raise HTTPException(status_code=400, detail="asset_url points outside the static directory")
    if not resolved.exists():
        raise HTTPException(status_code=404, detail="Referenced asset was not found")
    return resolved


async def _extract_audio_from_video(video_path: Path) -> str:
    fd, temp_audio_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    logger.info("Extracting audio from uploaded video", video_path=str(video_path), temp_audio_path=temp_audio_path)
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        temp_audio_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Failed to extract audio from uploaded video: {stderr.decode(errors='ignore')[-500:]}")
    logger.info("Extracted audio from uploaded video", video_path=str(video_path), temp_audio_path=temp_audio_path)
    return temp_audio_path


async def _create_render_safe_video_proxy(video_path: Path, duration_seconds: float) -> str:
    fd, temp_video_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    safe_duration = max(1.0, float(duration_seconds or 0.0))
    logger.info(
        "Creating render-safe proxy for uploaded video",
        video_path=str(video_path),
        temp_video_path=temp_video_path,
        duration_seconds=safe_duration,
    )
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_path),
        "-t",
        f"{safe_duration:.2f}",
        "-vf",
        "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        temp_video_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Failed to create render-safe video proxy: {stderr.decode(errors='ignore')[-500:]}")
    logger.info(
        "Created render-safe proxy for uploaded video",
        video_path=str(video_path),
        temp_video_path=temp_video_path,
        duration_seconds=safe_duration,
    )
    return temp_video_path


async def _render_uploaded_video_text_fx_spec(spec: dict, output_relative_path: str) -> str:
    renderer_dir = Path(
        settings.PREMIUM_REEL_RENDERER_DIR
        or (Path(__file__).resolve().parents[4] / "premium_renderer")
    )
    script_path = renderer_dir / "render.mjs"
    if not script_path.exists():
        raise RuntimeError(f"Remotion renderer entrypoint not found: {script_path}")

    output_path = Path(os.getcwd()) / "static" / output_relative_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    spec_fd, spec_path = tempfile.mkstemp(suffix=".json")
    os.close(spec_fd)
    Path(spec_path).write_text(json.dumps(spec), encoding="utf-8")
    logger.info(
        "Starting uploaded video text FX render",
        renderer_dir=str(renderer_dir),
        script_path=str(script_path),
        spec_path=spec_path,
        output_path=str(output_path),
        duration_seconds=spec.get("duration_seconds"),
        beat_count=len(((spec.get("video_text_fx") or {}).get("beats") or [])),
    )
    try:
        process = await asyncio.create_subprocess_exec(
            settings.NODE_BINARY,
            str(script_path),
            spec_path,
            str(output_path),
            cwd=str(renderer_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
        except asyncio.TimeoutError:
            process.kill()
            stdout, stderr = await process.communicate()
            timeout_stdout = stdout.decode(errors="ignore")[-2000:]
            timeout_stderr = stderr.decode(errors="ignore")[-2000:]
            logger.error(
                f"Uploaded video text FX render timed out | output_path={output_path} | stderr={timeout_stderr or 'none'} | stdout={timeout_stdout or 'none'}",
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "Uploaded video text FX render timed out after 120 seconds. "
                    f"stderr: {timeout_stderr or 'none'} stdout: {timeout_stdout or 'none'}"
                ),
            )
        if process.returncode != 0:
            error_output = stderr.decode(errors="ignore")[-2000:] or stdout.decode(errors="ignore")[-2000:]
            logger.error(f"Uploaded video text FX render failed | output_path={output_path} | error_output={error_output or 'none'}")
            raise HTTPException(status_code=500, detail=f"Uploaded video text FX render failed: {error_output}")
        logger.info(
            f"Uploaded video text FX render finished | output_path={output_path} | stdout={stdout.decode(errors='ignore')[-500:] or 'none'} | stderr={stderr.decode(errors='ignore')[-500:] or 'none'}",
        )
        return f"/static/{output_relative_path.replace(os.sep, '/')}"
    finally:
        try:
            os.unlink(spec_path)
        except OSError:
            pass

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
            caption_text="",
            caption_is_custom=False,
            effect_transition_name=anchor.get("effect_transition_name"),
            asset_source="none",
            scene_state="unresolved",
        ))
    return scenes


def _build_sentence_scene_timeline(
    word_timestamps: list[dict],
    total_duration: float,
) -> list["SceneTimelineItem"]:
    if not word_timestamps:
        return []

    scenes: list[SceneTimelineItem] = []
    current_words: list[dict] = []
    sentence_break_chars = (".", "!", "?")

    def flush_scene() -> None:
        nonlocal current_words
        if not current_words:
            return

        first_word = current_words[0]
        last_word = current_words[-1]
        excerpt = " ".join(
            str(word.get("word", "")).strip()
            for word in current_words
            if str(word.get("word", "")).strip()
        ).strip()
        anchor_word = str(first_word.get("word", "")).strip(" ,.!?;:\"'()[]{}") or "Scene"
        visual_focus_word = anchor_word

        scenes.append(SceneTimelineItem(
            scene_id=f"scene-{len(scenes) + 1}",
            anchor_word=anchor_word,
            visual_focus_word=visual_focus_word,
            anchor_phrase=excerpt,
            start_time_seconds=float(first_word.get("start", 0.0) or 0.0),
            end_time_seconds=max(float(last_word.get("end", 0.0) or 0.0), float(first_word.get("start", 0.0) or 0.0) + 0.05),
            transcript_excerpt=excerpt,
            caption_text="",
            caption_is_custom=False,
            asset_source="none",
            scene_state="unresolved",
        ))
        current_words = []

    for idx, word in enumerate(word_timestamps):
        current_words.append(word)
        word_text = str(word.get("word", "")).strip()
        is_last_word = idx == len(word_timestamps) - 1
        if is_last_word or word_text.endswith(sentence_break_chars):
            flush_scene()

    if not scenes:
        return scenes

    for idx, scene in enumerate(scenes):
        next_start = scenes[idx + 1].start_time_seconds if idx < len(scenes) - 1 else total_duration
        scene.end_time_seconds = max(next_start, scene.start_time_seconds + 0.05)

    return scenes


def _apply_scene_planner_defaults(script: str, scenes: list["SceneTimelineItem"]) -> list["SceneTimelineItem"]:
    if not scenes:
        return scenes

    from app.services.scene_planner import build_fallback_scene_plan

    planned = build_fallback_scene_plan(
        script,
        [scene.model_dump() if hasattr(scene, "model_dump") else scene for scene in scenes],
    )
    updated: list[SceneTimelineItem] = []
    for scene in scenes:
        scene_plan = planned.get(scene.scene_id, {})
        updated.append(scene.model_copy(update={
            "scene_role": scene_plan.get("scene_role"),
            "asset_bias": scene_plan.get("asset_bias"),
            "scene_fx_name": scene.scene_fx_name,
            "scene_fx_strength": scene.scene_fx_strength,
            "stock_match_rationale": scene_plan.get("stock_match_rationale"),
            "fx_rationale": scene_plan.get("fx_rationale"),
            "planning_confidence": scene_plan.get("planning_confidence"),
        }))
    return updated


def _save_audio_preview(audio_path: str, suffix: str = ".mp3") -> tuple[str, str]:
    audio_id = str(uuid.uuid4())
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    audio_filename = f"preview_{audio_id}{suffix}"
    save_dir = os.path.join(os.getcwd(), "static", "audio_previews")
    os.makedirs(save_dir, exist_ok=True)
    final_audio_path = os.path.join(save_dir, audio_filename)
    shutil.move(audio_path, final_audio_path)
    return final_audio_path, f"/static/audio_previews/{audio_filename}"


class PremiumSfxAsset(BaseModel):
    sound_id: str
    label: str
    filename: str


class PremiumSfxLibraryResponse(BaseModel):
    sounds: list[PremiumSfxAsset]


_ALLOWED_SFX_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}


def _list_premium_sfx_assets() -> list[PremiumSfxAsset]:
    renderer_dir = Path(
        settings.PREMIUM_REEL_RENDERER_DIR
        or (Path(__file__).resolve().parents[4] / "premium_renderer")
    )
    sfx_dir = renderer_dir / "public" / "sfx"
    sounds: list[PremiumSfxAsset] = []

    if not sfx_dir.exists():
        return sounds

    for asset in sorted(sfx_dir.iterdir(), key=lambda item: item.name.lower()):
        if not asset.is_file():
            continue
        if asset.name.startswith("."):
            continue
        if asset.suffix.lower() not in _ALLOWED_SFX_EXTENSIONS:
            continue
        stem = asset.stem.strip()
        if not stem:
            continue
        label = stem.replace("_", " ").replace("-", " ").strip().title()
        sounds.append(PremiumSfxAsset(sound_id=stem, label=label, filename=asset.name))
    return sounds


@router.get("/premium-sfx-library", response_model=PremiumSfxLibraryResponse)
async def get_premium_sfx_library() -> PremiumSfxLibraryResponse:
    return PremiumSfxLibraryResponse(sounds=_list_premium_sfx_assets())


@router.get("/premium-sfx/{filename}")
async def get_premium_sfx_file(filename: str):
    renderer_dir = Path(
        settings.PREMIUM_REEL_RENDERER_DIR
        or (Path(__file__).resolve().parents[4] / "premium_renderer")
    )
    sfx_dir = renderer_dir / "public" / "sfx"
    asset_path = (sfx_dir / filename).resolve()

    if not sfx_dir.exists() or not asset_path.exists():
        raise HTTPException(status_code=404, detail="SFX asset not found")
    if sfx_dir.resolve() not in asset_path.parents:
        raise HTTPException(status_code=400, detail="Invalid SFX asset path")

    return FileResponse(asset_path)

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
        resp = await complete_text(
            capability="title_translation",
            default_openai_model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=4000,
        )
        translations = json.loads(resp.text)

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
        resp = await complete_text(
            capability="top_papers_analysis",
            default_openai_model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1500,
        )
        analysis = json.loads(resp.text)
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
        resp = await complete_text(
            capability="daily_science_analysis",
            default_openai_model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1500,
        )
        analysis = json.loads(resp.text)
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
    aspect: Optional[str] = Field(None, description="Image aspect preset: portrait_9_16 or square_1_1")

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
        aspect=request.aspect,
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
        resp = await complete_text(
            capability="transcript_punctuation",
            default_openai_model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=2500,
        )
        cleaned = (resp.text or "").strip()
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
    split_scenes_by_sentence: bool = Field(default=True, description="When true, scenes are split directly on sentence boundaries instead of AI anchor planning")

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
    rationale: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


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
    scene_role: Optional[str] = None
    asset_bias: Optional[str] = None
    scene_fx_name: Optional[str] = None
    scene_fx_strength: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stock_match_rationale: Optional[str] = None
    fx_rationale: Optional[str] = None
    planning_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
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


class SuggestedSfxCue(BaseModel):
    sound_id: str
    start_time_seconds: float
    volume: float = Field(default=0.12, ge=0.0, le=1.0)
    reason: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class AutoPlaceSfxRequest(BaseModel):
    headline: str = ""
    script: str = ""
    duration_seconds: float = Field(default=0.0, ge=0.0)
    word_timestamps: list[WordTimestamp] = Field(default_factory=list)
    scenes: list[SceneTimelineItem] = Field(default_factory=list)
    max_cues: int = Field(default=12, ge=1, le=24)


class AutoPlaceSfxResponse(BaseModel):
    cues: list[SuggestedSfxCue]
    mode: str = "fallback"


def _normalise_sfx_token(text: str) -> str:
    return "".join(char.lower() for char in str(text or "") if char.isalnum())


def _choose_available_sfx(preferred_ids: list[str], available_ids: set[str]) -> Optional[str]:
    for sound_id in preferred_ids:
        if sound_id in available_ids:
            return sound_id
    return next(iter(sorted(available_ids)), None)


def _effective_sfx_cue_budget(requested_max_cues: int, duration_seconds: float) -> int:
    safe_duration = max(0.0, float(duration_seconds or 0.0))
    if safe_duration <= 12:
        recommended_floor = 4
    else:
        recommended_floor = int(safe_duration // 2.8) + 1
    return min(24, max(1, requested_max_cues, recommended_floor))


def _cap_sfx_candidates_by_timeline(
    candidates: list[dict],
    duration_seconds: float,
    max_candidates: int = 64,
) -> list[dict]:
    if len(candidates) <= max_candidates:
        return sorted(candidates, key=lambda item: float(item["time"]))

    safe_duration = max(0.1, float(duration_seconds or 0.0))
    bucket_count = max(8, min(max_candidates // 2, int(safe_duration // 2.5) + 1))
    bucket_width = max(0.6, safe_duration / bucket_count)

    buckets: dict[int, list[dict]] = {}
    for candidate in candidates:
        bucket_index = min(bucket_count - 1, max(0, int(float(candidate["time"]) // bucket_width)))
        buckets.setdefault(bucket_index, []).append(candidate)

    for bucket_items in buckets.values():
        bucket_items.sort(key=lambda item: (-float(item["priority"]), float(item["time"])))

    selected: list[dict] = []
    selected_ids: set[str] = set()

    def add_candidate(candidate: dict) -> None:
        candidate_id = str(candidate.get("id") or "")
        if not candidate_id or candidate_id in selected_ids or len(selected) >= max_candidates:
            return
        selected.append(candidate)
        selected_ids.add(candidate_id)

    hook_candidate = next((item for item in candidates if str(item.get("kind") or "") == "hook_riser"), None)
    if hook_candidate:
        add_candidate(hook_candidate)

    while len(selected) < max_candidates:
        made_progress = False
        for bucket_index in sorted(buckets):
            bucket_items = buckets[bucket_index]
            while bucket_items and str(bucket_items[0].get("id") or "") in selected_ids:
                bucket_items.pop(0)
            if not bucket_items:
                continue
            add_candidate(bucket_items.pop(0))
            made_progress = True
            if len(selected) >= max_candidates:
                break
        if not made_progress:
            break

    if len(selected) < max_candidates:
        for candidate in sorted(candidates, key=lambda item: (-float(item["priority"]), float(item["time"]))):
            add_candidate(candidate)
            if len(selected) >= max_candidates:
                break

    return sorted(selected, key=lambda item: float(item["time"]))


def _build_auto_sfx_candidates(
    scenes: list[SceneTimelineItem],
    word_timestamps: list[WordTimestamp],
    duration_seconds: float,
) -> list[dict]:
    candidates: list[dict] = []
    safe_duration = max(duration_seconds, word_timestamps[-1].end if word_timestamps else 0.0)

    reveal_terms = {
        "breakthrough", "discover", "discovered", "discovery", "finally", "however",
        "instead", "means", "result", "revealed", "reveals", "suddenly", "turns",
    }
    impact_terms = {
        "all", "big", "boost", "burst", "drop", "fast", "first", "huge", "instant",
        "key", "main", "major", "new", "sharp", "small", "spike", "tiny",
    }
    visual_terms = {
        "capture", "captured", "image", "images", "imagine", "look", "photo", "picture",
        "see", "show", "watch",
    }

    def hook_riser_window(time_seconds: float) -> bool:
        earliest = min(0.55, max(0.18, safe_duration * 0.03))
        latest = min(3.2, max(1.4, safe_duration * 0.16))
        return earliest <= time_seconds <= latest

    def riser_window(time_seconds: float) -> bool:
        early_cutoff = min(4.5, max(2.4, safe_duration * 0.2))
        middle_half_window = min(2.0, max(1.0, safe_duration * 0.08))
        end_window_start = max(safe_duration * 0.72, safe_duration - 5.0)
        return (
            time_seconds <= early_cutoff or
            abs(time_seconds - (safe_duration / 2.0)) <= middle_half_window or
            time_seconds >= end_window_start
        )

    hook_word = None
    for word in word_timestamps:
        word_time = float(word.start or 0.0)
        if hook_riser_window(word_time):
            hook_word = word
            if _normalise_sfx_token(word.word) in reveal_terms | impact_terms | visual_terms:
                break
    if hook_word:
        hook_time = max(0.0, min(float(hook_word.start or 0.0), safe_duration))
    else:
        hook_time = min(max(0.7, safe_duration * 0.07), max(0.7, safe_duration * 0.16))
    candidates.append({
        "id": "hook-riser",
        "time": hook_time,
        "kind": "hook_riser",
        "priority": 1.25,
        "recommended_sounds": ["riser", "woosh", "click"],
        "note": "Opening hook lift. The first cue should be a riser near the hook.",
    })

    ordered_scenes = sorted(scenes, key=lambda scene: scene.start_time_seconds)
    for idx, scene in enumerate(ordered_scenes):
        start_time = max(0.0, min(float(scene.start_time_seconds or 0.0), safe_duration))
        scene_label = (
            scene.anchor_phrase
            or scene.transcript_excerpt
            or scene.caption_text
            or scene.anchor_word
        )
        transition_name = str(scene.effect_transition_name or "").strip()
        transition_key = _normalise_sfx_token(transition_name)

        if idx > 0:
            if any(token in transition_key for token in ("snap", "cut", "flash", "split")):
                transition_sounds = ["pop", "camera_click", "click", "woosh"]
            elif any(token in transition_key for token in ("warp", "push", "parallax", "reveal", "iris", "wipe")):
                transition_sounds = ["woosh", "camera_click", "pop", "click"]
            elif idx % 2 == 0:
                transition_sounds = ["camera_click", "pop", "woosh", "click"]
            else:
                transition_sounds = ["pop", "click", "camera_click", "woosh"]
            candidates.append({
                "id": f"scene-{idx + 1}-transition",
                "time": start_time,
                "kind": "scene_transition",
                "priority": 0.95,
                "recommended_sounds": transition_sounds,
                "note": f"Scene change into '{scene_label}' using transition '{transition_name or 'default'}'.",
            })

        scene_tokens = {
            _normalise_sfx_token(token)
            for token in str(scene_label or "").split()
            if _normalise_sfx_token(token)
        }
        if scene_tokens & reveal_terms:
            reveal_sounds = ["riser", "pop", "woosh", "click"] if riser_window(start_time) else ["pop", "woosh", "click", "camera_click"]
            candidates.append({
                "id": f"scene-{idx + 1}-lift",
                "time": max(0.0, start_time - 0.16 if idx > 0 else start_time),
                "kind": "reveal_lift",
                "priority": 0.88,
                "recommended_sounds": reveal_sounds,
                "note": f"Reveal or escalation around '{scene_label}'.",
            })

    for idx, word in enumerate(word_timestamps):
        token = _normalise_sfx_token(word.word)
        if not token:
            continue

        if token in impact_terms:
            candidates.append({
                "id": f"word-{idx + 1}-impact",
                "time": max(0.0, min(float(word.start or 0.0), safe_duration)),
                "kind": "impact_word",
                "priority": 0.72,
                "recommended_sounds": ["pop", "click", "camera_click"],
                "note": f"Impact word '{word.word}'.",
            })
        elif token in visual_terms:
            candidates.append({
                "id": f"word-{idx + 1}-visual",
                "time": max(0.0, min(float(word.start or 0.0), safe_duration)),
                "kind": "visual_lock",
                "priority": 0.66,
                "recommended_sounds": ["camera_click", "click", "pop"],
                "note": f"Visual emphasis word '{word.word}'.",
            })

        if idx >= len(word_timestamps) - 1:
            continue
        next_word = word_timestamps[idx + 1]
        gap = float(next_word.start or 0.0) - float(word.end or 0.0)
        if gap >= 0.32:
            candidates.append({
                "id": f"gap-{idx + 1}",
                "time": max(0.0, min(float(next_word.start or 0.0), safe_duration)),
                "kind": "pause_reentry",
                "priority": min(0.8, 0.58 + gap / 2.0),
                "recommended_sounds": ["click", "pop", "camera_click", "woosh"],
                "note": f"Pause of {gap:.2f}s before '{next_word.word}'.",
            })

    cadence_targets: list[float] = []
    cursor = 2.6
    while cursor < max(safe_duration - 0.55, 0):
        cadence_targets.append(cursor)
        cursor += 2.8

    for idx, target_time in enumerate(cadence_targets):
        nearest = None
        if word_timestamps:
            nearest = min(word_timestamps, key=lambda word: abs(float(word.start or 0.0) - target_time))
        cadence_time = max(0.0, min(float(nearest.start if nearest else target_time), safe_duration))
        token = str(nearest.word).strip() if nearest else "beat"
        candidates.append({
            "id": f"cadence-{idx + 1}",
            "time": cadence_time,
            "kind": "cadence_pulse",
            "priority": 0.61,
            "recommended_sounds": ["click", "camera_click", "pop", "woosh"],
            "note": f"Cadence support near '{token}' to keep SFX energy moving with the voice.",
        })

    candidates.sort(key=lambda item: (-item["priority"], item["time"]))
    deduped: list[dict] = []
    for candidate in candidates:
        if any(abs(candidate["time"] - existing["time"]) < 0.18 and candidate["kind"] == existing["kind"] for existing in deduped):
            continue
        deduped.append(candidate)

    return _cap_sfx_candidates_by_timeline(deduped, safe_duration)


def _is_valid_riser_time(start_time_seconds: float, duration_seconds: float) -> bool:
    safe_duration = max(0.0, duration_seconds)
    if safe_duration <= 0:
        return False
    early_cutoff = min(4.5, max(2.4, safe_duration * 0.2))
    middle_half_window = min(2.0, max(1.0, safe_duration * 0.08))
    return (
        start_time_seconds <= early_cutoff or
        abs(start_time_seconds - (safe_duration / 2.0)) <= middle_half_window or
        start_time_seconds >= max(safe_duration * 0.72, safe_duration - 5.0)
    )


def _is_valid_initial_riser_time(start_time_seconds: float, duration_seconds: float) -> bool:
    safe_duration = max(0.0, duration_seconds)
    if safe_duration <= 0:
        return False
    earliest = min(0.55, max(0.18, safe_duration * 0.03))
    latest = min(3.2, max(1.4, safe_duration * 0.16))
    return earliest <= start_time_seconds <= latest


def _select_balanced_sfx_sound(
    requested_sound_id: str,
    preferred_sounds: list[str],
    available_ids: set[str],
    usage_counts: dict[str, int],
    start_time_seconds: float,
    duration_seconds: float,
    cue_kind: str,
) -> Optional[str]:
    ordered = []
    for sound_id in [requested_sound_id, *preferred_sounds]:
        sound_key = str(sound_id or "").strip()
        if sound_key and sound_key not in ordered and sound_key in available_ids:
            ordered.append(sound_key)

    if not ordered:
        return None

    max_wooshes = 3 if duration_seconds <= 45 else 4
    precise_kinds = {"impact_word", "visual_lock", "pause_reentry", "cadence_pulse"}

    for sound_id in ordered:
        if sound_id == "riser":
            if cue_kind == "hook_riser":
                if usage_counts.get("riser", 0) >= 1:
                    continue
                if not _is_valid_initial_riser_time(start_time_seconds, duration_seconds):
                    continue
            else:
                if usage_counts.get("riser", 0) >= 2:
                    continue
                if not _is_valid_riser_time(start_time_seconds, duration_seconds):
                    continue
        if sound_id == "woosh":
            if usage_counts.get("woosh", 0) >= max_wooshes:
                continue
            if cue_kind in precise_kinds and any(
                alt in available_ids for alt in ordered if alt in {"click", "camera_click", "pop"}
            ):
                if cue_kind != "cadence_pulse":
                    continue
        return sound_id

    for sound_id in ordered:
        if sound_id == "riser":
            if cue_kind == "hook_riser":
                if not _is_valid_initial_riser_time(start_time_seconds, duration_seconds):
                    continue
                if usage_counts.get("riser", 0) >= 1:
                    continue
            else:
                if not _is_valid_riser_time(start_time_seconds, duration_seconds):
                    continue
                if usage_counts.get("riser", 0) >= 2:
                    continue
        return sound_id

    return None


def _finalise_sfx_cues(
    raw_cues: list[dict],
    available_ids: set[str],
    max_cues: int,
    duration_seconds: float,
    candidate_pool: Optional[list[dict]] = None,
) -> list[SuggestedSfxCue]:
    final_cues: list[SuggestedSfxCue] = []
    safe_duration = max(0.0, duration_seconds)
    usage_counts: dict[str, int] = {}
    min_spacing_seconds = 1.0
    desired_gap_seconds = 2.6
    if safe_duration <= 12:
        density_target = 4
    else:
        density_target = int(safe_duration // desired_gap_seconds) + 1
    target_cue_count = min(max_cues, max(1, density_target))

    hook_cue = None
    for cue in sorted(raw_cues, key=lambda item: (item.get("kind") != "hook_riser", float(item.get("start_time_seconds", 0.0) or 0.0))):
        if str(cue.get("kind", "") or "").strip() != "hook_riser":
            continue
        start_time = max(0.0, min(float(cue.get("start_time_seconds", 0.0) or 0.0), safe_duration))
        sound_id = _select_balanced_sfx_sound(
            str(cue.get("sound_id", "") or "").strip(),
            [str(sound_id).strip() for sound_id in cue.get("preferred_sounds", []) if str(sound_id).strip()],
            available_ids,
            usage_counts,
            start_time,
            safe_duration,
            "hook_riser",
        )
        if not sound_id:
            continue
        hook_cue = SuggestedSfxCue(
            sound_id=sound_id,
            start_time_seconds=round(start_time, 2),
            volume=round(min(max(float(cue.get("volume", 0.16) or 0.16), 0.08), 0.45), 2),
            reason=str(cue.get("reason", "") or "").strip() or "Opening hook riser.",
            confidence=min(max(float(cue.get("confidence", 0.92) or 0.92), 0.0), 1.0),
        )
        final_cues.append(hook_cue)
        usage_counts[sound_id] = usage_counts.get(sound_id, 0) + 1
        break

    for cue in sorted(raw_cues, key=lambda item: float(item.get("start_time_seconds", 0.0) or 0.0)):
        requested_sound_id = str(cue.get("sound_id", "") or "").strip()
        preferred_sounds = [
            str(sound_id).strip()
            for sound_id in cue.get("preferred_sounds", [])
            if str(sound_id).strip()
        ]
        cue_kind = str(cue.get("kind", "") or "").strip()
        if requested_sound_id not in available_ids and not preferred_sounds:
            continue

        start_time = max(0.0, min(float(cue.get("start_time_seconds", 0.0) or 0.0), safe_duration))
        if hook_cue and start_time < hook_cue.start_time_seconds - 0.02:
            continue
        if any(abs(start_time - existing.start_time_seconds) < min_spacing_seconds for existing in final_cues):
            continue

        sound_id = _select_balanced_sfx_sound(
            requested_sound_id,
            preferred_sounds,
            available_ids,
            usage_counts,
            start_time,
            safe_duration,
            cue_kind,
        )
        if not sound_id:
            continue

        volume = min(max(float(cue.get("volume", 0.12) or 0.12), 0.05), 0.45)
        reason = str(cue.get("reason", "") or "").strip() or None
        confidence_raw = cue.get("confidence")
        confidence = None
        if confidence_raw is not None:
            try:
                confidence = min(max(float(confidence_raw), 0.0), 1.0)
            except (TypeError, ValueError):
                confidence = None

        final_cues.append(SuggestedSfxCue(
            sound_id=sound_id,
            start_time_seconds=round(start_time, 2),
            volume=round(volume, 2),
            reason=reason,
            confidence=confidence,
        ))
        usage_counts[sound_id] = usage_counts.get(sound_id, 0) + 1
        if len(final_cues) >= target_cue_count:
            break

    if candidate_pool and len(final_cues) < target_cue_count:
        candidate_by_time = sorted(candidate_pool, key=lambda item: float(item.get("time", 0.0) or 0.0))
        while len(final_cues) < target_cue_count:
            all_points = [0.0, *[cue.start_time_seconds for cue in sorted(final_cues, key=lambda cue: cue.start_time_seconds)], safe_duration]
            widest_gap = 0.0
            gap_bounds: tuple[float, float] | None = None
            for left, right in zip(all_points, all_points[1:]):
                if right - left > widest_gap:
                    widest_gap = right - left
                    gap_bounds = (left, right)
            if not gap_bounds or widest_gap <= 3.0:
                break

            left, right = gap_bounds
            target_time = left + min(desired_gap_seconds, max(1.1, (right - left) / 2.0))
            chosen_candidate = None
            for candidate in candidate_by_time:
                candidate_time = float(candidate.get("time", 0.0) or 0.0)
                if candidate_time <= left + min_spacing_seconds or candidate_time >= right - min_spacing_seconds:
                    continue
                if abs(candidate_time - target_time) > max(0.9, (right - left) / 2.0):
                    continue
                if any(abs(candidate_time - existing.start_time_seconds) < min_spacing_seconds for existing in final_cues):
                    continue
                chosen_candidate = candidate
                break
            if not chosen_candidate:
                break

            start_time = max(0.0, min(float(chosen_candidate.get("time", 0.0) or 0.0), safe_duration))
            sound_id = _select_balanced_sfx_sound(
                "",
                [str(sound_id).strip() for sound_id in chosen_candidate.get("recommended_sounds", []) if str(sound_id).strip()],
                available_ids,
                usage_counts,
                start_time,
                safe_duration,
                str(chosen_candidate.get("kind", "") or "").strip(),
            )
            if not sound_id:
                candidate_by_time.remove(chosen_candidate)
                continue

            final_cues.append(SuggestedSfxCue(
                sound_id=sound_id,
                start_time_seconds=round(start_time, 2),
                volume=0.11 if sound_id in {"click", "camera_click"} else 0.12,
                reason=str(chosen_candidate.get("note", "") or "Cadence support cue.").strip() or None,
                confidence=min(0.88, max(0.5, float(chosen_candidate.get("priority", 0.6) or 0.6))),
            ))
            usage_counts[sound_id] = usage_counts.get(sound_id, 0) + 1
            candidate_by_time.remove(chosen_candidate)

    while len(final_cues) < target_cue_count:
        all_points = [0.0, *[cue.start_time_seconds for cue in sorted(final_cues, key=lambda cue: cue.start_time_seconds)], safe_duration]
        widest_gap = 0.0
        gap_bounds: tuple[float, float] | None = None
        for left, right in zip(all_points, all_points[1:]):
            if right - left > widest_gap:
                widest_gap = right - left
                gap_bounds = (left, right)
        if not gap_bounds or widest_gap <= 3.0:
            break

        left, right = gap_bounds
        synthetic_time = round(left + min(desired_gap_seconds, max(1.1, (right - left) / 2.0)), 2)
        if any(abs(synthetic_time - existing.start_time_seconds) < min_spacing_seconds for existing in final_cues):
            break

        if synthetic_time <= min_spacing_seconds and "riser" in available_ids and usage_counts.get("riser", 0) == 0:
            fallback_preferences = ["riser", "woosh", "click"]
            cue_kind = "hook_riser"
            reason = "Synthetic hook riser inserted to maintain opening energy."
        else:
            gap_index = len(final_cues)
            if gap_index % 4 == 0:
                fallback_preferences = ["woosh", "click", "camera_click", "pop"]
            elif gap_index % 4 == 1:
                fallback_preferences = ["click", "camera_click", "pop", "woosh"]
            elif gap_index % 4 == 2:
                fallback_preferences = ["camera_click", "click", "woosh", "pop"]
            else:
                fallback_preferences = ["pop", "click", "camera_click", "woosh"]
            cue_kind = "cadence_pulse"
            reason = "Synthetic cadence cue inserted to avoid a dead stretch."

        sound_id = _select_balanced_sfx_sound(
            "",
            fallback_preferences,
            available_ids,
            usage_counts,
            synthetic_time,
            safe_duration,
            cue_kind,
        )
        if not sound_id:
            break

        final_cues.append(SuggestedSfxCue(
            sound_id=sound_id,
            start_time_seconds=synthetic_time,
            volume=0.11 if sound_id in {"click", "camera_click"} else 0.12,
            reason=reason,
            confidence=0.52,
        ))
        usage_counts[sound_id] = usage_counts.get(sound_id, 0) + 1

    final_cues.sort(key=lambda cue: cue.start_time_seconds)

    return final_cues


def _fallback_auto_sfx_cues(
    candidates: list[dict],
    available_ids: set[str],
    max_cues: int,
    duration_seconds: float,
) -> list[SuggestedSfxCue]:
    fallback_raw: list[dict] = []
    kind_priority = {
        "scene_transition": 0,
        "reveal_lift": 1,
        "impact_word": 2,
        "visual_lock": 3,
        "pause_reentry": 4,
    }

    for candidate in sorted(
        candidates,
        key=lambda item: (kind_priority.get(item["kind"], 99), -item["priority"], item["time"]),
    ):
        sound_id = _choose_available_sfx(candidate["recommended_sounds"], available_ids)
        if not sound_id:
            continue

        volume_by_kind = {
            "scene_transition": 0.16,
            "reveal_lift": 0.18,
            "impact_word": 0.12,
            "visual_lock": 0.11,
            "pause_reentry": 0.10,
        }
        fallback_raw.append({
            "sound_id": sound_id,
            "start_time_seconds": candidate["time"],
            "volume": volume_by_kind.get(candidate["kind"], 0.12),
            "reason": candidate["note"],
            "confidence": min(0.9, max(0.45, candidate["priority"])),
            "preferred_sounds": candidate["recommended_sounds"],
            "kind": candidate["kind"],
        })

    return _finalise_sfx_cues(
        fallback_raw,
        available_ids,
        max_cues,
        duration_seconds,
        candidate_pool=candidates,
    )


async def _ai_auto_place_sfx(
    request: AutoPlaceSfxRequest,
    available_sounds: list[PremiumSfxAsset],
    candidates: list[dict],
) -> list[SuggestedSfxCue]:
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        raise RuntimeError("Missing text LLM API key")

    available_ids = {sound.sound_id for sound in available_sounds}
    if not available_ids:
        return []

    available_context = "\n".join(
        f"- {sound.sound_id}: {sound.label}"
        for sound in available_sounds
    )
    scene_context = "\n".join(
        f"- {scene.start_time_seconds:.2f}s to {scene.end_time_seconds:.2f}s | {scene.anchor_phrase or scene.transcript_excerpt or scene.anchor_word} | transition={scene.effect_transition_name or 'none'}"
        for scene in sorted(request.scenes, key=lambda item: item.start_time_seconds)[:10]
    ) or "- No explicit scene timeline available"
    candidate_context = "\n".join(
        f"- {candidate['id']} | t={candidate['time']:.2f}s | kind={candidate['kind']} | prefers={', '.join(candidate['recommended_sounds'])} | note={candidate['note']}"
        for candidate in candidates
    )
    script_context = (request.script or "").strip()
    if len(script_context) > 3500:
        script_context = f"{script_context[:3500]}..."

    system_prompt = (
        "You are a meticulous short-form reel sound designer.\n"
        "Choose an aggressive but tasteful premium SFX pass for a narrated science reel.\n"
        "You must only place cues using the provided candidate moments. Do not invent new sound IDs.\n"
        "Prioritize scene transitions, reveals, meaningful pauses, intonation shifts, and impact words.\n"
        "Keep the reel energized. Aim for cues roughly every 2 to 3 seconds when strong candidate beats exist.\n"
        "The FIRST cue must be a riser at the hook. After that, riser may appear only one more time, only near the middle or the ending.\n"
        "Use woosh liberally on scene motion and handoffs.\n"
        "Use click and camera_click liberally for precise vocal and visual emphasis.\n"
        "Use pop on punch words and hard beats.\n"
        "Do not leave dead stretches longer than about 3 seconds without a cue unless there are truly no good candidates.\n"
        "Do not place multiple cues closer than 0.28 seconds unless absolutely necessary.\n"
        "Return strict JSON only in the shape:\n"
        "{\"cues\":[{\"candidate_id\":\"scene-2-transition\",\"sound_id\":\"woosh\",\"offset_seconds\":0.0,\"volume\":0.16,\"reason\":\"Brief reason\",\"confidence\":0.82}]}"
    )
    user_prompt = (
        f"HEADLINE:\n{request.headline or 'Untitled reel'}\n\n"
        f"SCRIPT:\n{script_context or '(No script provided)'}\n\n"
        f"DURATION:\n{request.duration_seconds:.2f}s\n\n"
        f"AVAILABLE SFX:\n{available_context}\n\n"
        f"SCENE SUMMARY:\n{scene_context}\n\n"
        f"CANDIDATE MOMENTS:\n{candidate_context}\n\n"
        f"Select at most {request.max_cues} cues."
    )

    response = await complete_text(
        capability="sfx_placement",
        default_openai_model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1600,
    )

    content = (response.text or "").strip()
    payload = json.loads(content) if content else {}
    raw_cues = payload.get("cues", []) if isinstance(payload, dict) else []
    if not isinstance(raw_cues, list):
        raw_cues = []

    candidate_by_id = {candidate["id"]: candidate for candidate in candidates}
    resolved_raw: list[dict] = []
    used_candidate_ids: set[str] = set()

    for item in raw_cues:
        if not isinstance(item, dict):
            continue
        candidate_id = str(item.get("candidate_id", "") or "").strip()
        candidate = candidate_by_id.get(candidate_id)
        if not candidate or candidate_id in used_candidate_ids:
            continue
        used_candidate_ids.add(candidate_id)

        sound_id = str(item.get("sound_id", "") or "").strip()
        if sound_id not in available_ids:
            sound_id = _choose_available_sfx(candidate["recommended_sounds"], available_ids)
        if not sound_id:
            continue

        try:
            offset_seconds = float(item.get("offset_seconds", 0.0) or 0.0)
        except (TypeError, ValueError):
            offset_seconds = 0.0
        offset_seconds = max(-0.18, min(0.18, offset_seconds))

        resolved_raw.append({
            "sound_id": sound_id,
            "start_time_seconds": candidate["time"] + offset_seconds,
            "volume": item.get("volume", 0.12),
            "reason": item.get("reason") or candidate["note"],
            "confidence": item.get("confidence"),
            "preferred_sounds": candidate["recommended_sounds"],
            "kind": candidate["kind"],
        })

    return _finalise_sfx_cues(
        resolved_raw,
        available_ids,
        request.max_cues,
        request.duration_seconds,
        candidate_pool=candidates,
    )


@router.post("/auto-place-sfx", response_model=AutoPlaceSfxResponse)
async def auto_place_sfx(request: AutoPlaceSfxRequest):
    if not request.word_timestamps and not request.scenes:
        raise HTTPException(status_code=400, detail="word_timestamps or scenes are required")

    available_sounds = _list_premium_sfx_assets()
    if not available_sounds:
        raise HTTPException(status_code=400, detail="No premium SFX assets are available")

    available_ids = {sound.sound_id for sound in available_sounds}
    inferred_duration = request.duration_seconds
    if request.word_timestamps:
        inferred_duration = max(inferred_duration, max(word.end for word in request.word_timestamps))
    if request.scenes:
        inferred_duration = max(inferred_duration, max(scene.end_time_seconds for scene in request.scenes))
    effective_max_cues = _effective_sfx_cue_budget(request.max_cues, inferred_duration)

    candidates = _build_auto_sfx_candidates(
        request.scenes,
        request.word_timestamps,
        inferred_duration,
    )
    logger.info(
        "Auto SFX placement: requested_max_cues=%s effective_max_cues=%s duration=%.2fs candidates=%s scenes=%s words=%s",
        request.max_cues,
        effective_max_cues,
        inferred_duration,
        len(candidates),
        len(request.scenes),
        len(request.word_timestamps),
    )
    if not candidates:
        return AutoPlaceSfxResponse(cues=[], mode="fallback")

    try:
        ai_cues = await _ai_auto_place_sfx(
            AutoPlaceSfxRequest(
                headline=request.headline,
                script=request.script,
                duration_seconds=inferred_duration,
                word_timestamps=request.word_timestamps,
                scenes=request.scenes,
                max_cues=effective_max_cues,
            ),
            available_sounds,
            candidates,
        )
        if ai_cues:
            logger.info("Auto SFX placement returned %s AI cues", len(ai_cues))
            return AutoPlaceSfxResponse(cues=ai_cues, mode="ai")
    except Exception:
        logger.exception("AI SFX auto-placement failed; falling back to rule-based placement")

    fallback_cues = _fallback_auto_sfx_cues(
        candidates,
        available_ids,
        effective_max_cues,
        inferred_duration,
    )
    logger.info("Auto SFX placement returned %s fallback cues", len(fallback_cues))
    return AutoPlaceSfxResponse(cues=fallback_cues, mode="fallback")


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
    scenes = (
        _build_sentence_scene_timeline(word_timestamps, duration)
        if request.split_scenes_by_sentence
        else _build_scene_timeline(anchors, word_timestamps, duration)
    )
    scenes = _apply_scene_planner_defaults(final_script, scenes)
        
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
    split_scenes_by_sentence: bool = Form(default=True),
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

        if display_script:
            word_timestamps = generator._restore_punctuation(raw_words, display_script)

        duration = word_timestamps[-1]["end"] + 0.5 if word_timestamps else 0.0
        selector = AnchorSelector()
        anchors = await selector.select_anchors(word_timestamps)
        anchors = await selector.assign_effects(display_script, anchors)
        scenes = (
            _build_sentence_scene_timeline(word_timestamps, duration)
            if split_scenes_by_sentence
            else _build_scene_timeline(anchors, word_timestamps, duration)
        )
        scenes = _apply_scene_planner_defaults(display_script, scenes)
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


class UploadedVideoTranscriptRequest(BaseModel):
    asset_url: str


class UploadedVideoTranscriptResponse(BaseModel):
    transcript_text: str
    duration_seconds: float = 0.0
    word_timestamps: list[WordTimestamp] = Field(default_factory=list)


class VideoTextFxBeatRequest(BaseModel):
    id: str
    text: str
    start_time_seconds: float = Field(ge=0.0)
    end_time_seconds: float = Field(ge=0.0)
    layer: str
    style: str
    notes: str = ""


class RenderUploadedVideoTextFxRequest(BaseModel):
    source_video_url: str
    transcript_text: str
    style_preset: str = "ali-abdal"
    duration_seconds: float = Field(default=0.0, ge=0.0)
    beats: list[VideoTextFxBeatRequest] = Field(default_factory=list)


class RenderUploadedVideoTextFxResponse(BaseModel):
    preview_url: str
    duration_seconds: float


@router.post("/upload-scene-asset", response_model=UploadSceneAssetResponse)
async def upload_scene_asset(file: UploadFile = File(...)):
    """Upload a user image/video for scene assignment."""
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
    relative_dir = os.path.join("user_uploads")
    filename = f"{uuid.uuid4().hex}{safe_ext}"
    static_root = os.path.join(os.getcwd(), "static")
    upload_dir = os.path.join(static_root, relative_dir)
    os.makedirs(upload_dir, exist_ok=True)
    local_path = os.path.join(upload_dir, filename)
    with open(local_path, "wb") as handle:
        handle.write(file_bytes)
    asset_url = f"/static/{relative_dir}/{filename}"

    width = 0
    height = 0
    duration_seconds: Optional[float] = None
    if is_video:
        try:
            generator = ReelGenerator()
            duration_seconds = await generator._get_audio_duration(local_path)
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


@router.post("/extract-uploaded-video-transcript", response_model=UploadedVideoTranscriptResponse)
async def extract_uploaded_video_transcript(request: UploadedVideoTranscriptRequest):
    from app.services.reel_generator import ReelGenerator

    logger.info("Received uploaded video transcript request", asset_url=request.asset_url)
    video_path = _resolve_static_asset_path(request.asset_url)
    generator = ReelGenerator()
    temp_audio_path = ""
    try:
        temp_audio_path = await _extract_audio_from_video(video_path)
        raw_words = await generator._get_word_timestamps(temp_audio_path)
        transcript_text = await _punctuate_display_transcript(" ".join(w["word"] for w in raw_words).strip(), strict=True)
        word_timestamps = generator._restore_punctuation(raw_words, transcript_text) if transcript_text else raw_words
        duration_seconds = word_timestamps[-1]["end"] + 0.5 if word_timestamps else 0.0
        logger.info(
            "Uploaded video transcript extraction finished",
            asset_url=request.asset_url,
            raw_word_count=len(raw_words),
            transcript_length=len(transcript_text),
            duration_seconds=duration_seconds,
        )
        return UploadedVideoTranscriptResponse(
            transcript_text=transcript_text,
            duration_seconds=duration_seconds,
            word_timestamps=[WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in word_timestamps],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Uploaded video transcript extraction failed")
        raise HTTPException(status_code=500, detail=f"Uploaded video transcript extraction failed: {exc}") from exc
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.unlink(temp_audio_path)
            except OSError:
                pass


@router.post("/render-uploaded-video-text-fx", response_model=RenderUploadedVideoTextFxResponse)
async def render_uploaded_video_text_fx(request: RenderUploadedVideoTextFxRequest):
    logger.info(
        "Received uploaded video text FX render request",
        source_video_url=request.source_video_url,
        style_preset=request.style_preset,
        transcript_length=len(request.transcript_text or ""),
        beat_count=len(request.beats),
        requested_duration_seconds=request.duration_seconds,
    )
    source_video_path = _resolve_static_asset_path(request.source_video_url)
    proxy_video_path = ""
    resolved_duration = 15.0
    try:
        proxy_video_path = await _create_render_safe_video_proxy(source_video_path, resolved_duration)
        spec = {
            "composition_id": "UploadedVideoTextFx",
            "duration_seconds": resolved_duration,
            "video_text_fx": {
                "source_video_path": proxy_video_path,
                "transcript_text": request.transcript_text.strip(),
                "style_preset": request.style_preset.strip() or "ali-abdal",
                "beats": [beat.model_dump() for beat in request.beats],
            },
        }
        output_name = f"video_text_fx/uploaded-video-text-fx-{uuid.uuid4().hex[:8]}.mp4"
        preview_url = await _render_uploaded_video_text_fx_spec(spec, output_name)
        logger.info("Uploaded video text FX render succeeded", preview_url=preview_url, duration_seconds=resolved_duration)
        return RenderUploadedVideoTextFxResponse(preview_url=preview_url, duration_seconds=resolved_duration)
    finally:
        if proxy_video_path and os.path.exists(proxy_video_path):
            try:
                os.unlink(proxy_video_path)
            except OSError:
                pass

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
            "scene_role": scene.scene_role,
            "asset_bias": scene.asset_bias,
            "scene_fx_name": scene.scene_fx_name,
            "scene_fx_strength": scene.scene_fx_strength,
            "stock_match_rationale": scene.stock_match_rationale,
            "fx_rationale": scene.fx_rationale,
            "planning_confidence": scene.planning_confidence,
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
            "scene_role": payload_match.get("scene_role") or scene.scene_role,
            "asset_bias": payload_match.get("asset_bias") or scene.asset_bias,
            "scene_fx_name": scene.scene_fx_name,
            "scene_fx_strength": scene.scene_fx_strength,
            "stock_match_rationale": payload_match.get("stock_match_rationale") or scene.stock_match_rationale,
            "fx_rationale": payload_match.get("fx_rationale") or scene.fx_rationale,
            "planning_confidence": payload_match.get("planning_confidence") if payload_match.get("planning_confidence") is not None else scene.planning_confidence,
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
        "scene_role": scene.scene_role,
        "asset_bias": scene.asset_bias,
        "scene_fx_name": scene.scene_fx_name,
        "scene_fx_strength": scene.scene_fx_strength,
        "stock_match_rationale": scene.stock_match_rationale,
        "fx_rationale": scene.fx_rationale,
        "planning_confidence": scene.planning_confidence,
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
        "scene_role": scene_payload.get("scene_role") or scene.scene_role,
        "asset_bias": scene_payload.get("asset_bias") or scene.asset_bias,
        "scene_fx_name": scene.scene_fx_name,
        "scene_fx_strength": scene.scene_fx_strength,
        "stock_match_rationale": scene_payload.get("stock_match_rationale") or scene.stock_match_rationale,
        "fx_rationale": scene_payload.get("fx_rationale") or scene.fx_rationale,
        "planning_confidence": scene_payload.get("planning_confidence") if scene_payload.get("planning_confidence") is not None else scene.planning_confidence,
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
    from app.services.scene_planner import build_scene_plan

    unresolved = [
        scene for scene in request.scenes
        if scene.asset_source == "none" and not scene.ai_image_url
    ]
    unresolved.sort(key=lambda scene: scene.start_time_seconds)
    eligible_ids = {scene.scene_id for scene in unresolved[:request.max_ai_generated_scenes]}

    selector = AnchorSelector()
    eligible_scenes = unresolved[:request.max_ai_generated_scenes]
    anchors = [
        {
            "word": scene.anchor_word,
            "start": scene.start_time_seconds,
            "end": scene.end_time_seconds,
            "focus_word": scene.visual_focus_word or scene.anchor_word,
            "anchor_phrase": scene.anchor_phrase or scene.anchor_word,
        }
        for scene in eligible_scenes
    ]
    scene_plan = await build_scene_plan(
        request.script,
        [scene.model_dump() if hasattr(scene, "model_dump") else scene for scene in request.scenes],
    )
    scene_contexts = [scene_plan.get(scene.scene_id, {}) for scene in eligible_scenes]
    prompt_rows = await selector.generate_prompts(request.script, anchors, scene_contexts=scene_contexts) if anchors else []
    prompt_map = {scene.scene_id: row for scene, row in zip(eligible_scenes, prompt_rows)}
    start_map = {row["start_time_seconds"]: row for row in prompt_rows}

    updated_scenes: list[SceneTimelineItem] = []
    for scene in request.scenes:
        row = prompt_map.get(scene.scene_id) or start_map.get(scene.start_time_seconds)
        context = scene_plan.get(scene.scene_id, {})
        context_update = {
            "scene_role": context.get("scene_role") or scene.scene_role,
            "asset_bias": context.get("asset_bias") or scene.asset_bias,
            "scene_fx_name": scene.scene_fx_name,
            "scene_fx_strength": scene.scene_fx_strength,
            "stock_match_rationale": context.get("stock_match_rationale") or scene.stock_match_rationale,
            "fx_rationale": context.get("fx_rationale") or scene.fx_rationale,
            "planning_confidence": context.get("planning_confidence") if context.get("planning_confidence") is not None else scene.planning_confidence,
        }
        if scene.asset_source != "none":
            if scene.asset_source.startswith("local"):
                resolved_state = "resolved_by_library"
            elif scene.asset_source.startswith("stock"):
                resolved_state = "resolved_by_stock"
            elif scene.asset_source.startswith("user"):
                resolved_state = "resolved_by_user"
            else:
                resolved_state = "resolved_by_ai"
            updated_scenes.append(scene.model_copy(update={**context_update, "scene_state": resolved_state}))
            continue
        if scene.scene_id in eligible_ids and row:
            updated_scenes.append(scene.model_copy(update={
                **context_update,
                "ai_prompt": row["prompt"],
                "effect_transition_name": row.get("effect_transition_name") or scene.effect_transition_name,
                "scene_state": "ai_eligible",
            }))
        elif scene.scene_id in eligible_ids:
            updated_scenes.append(scene.model_copy(update={**context_update, "scene_state": "ai_eligible"}))
        else:
            updated_scenes.append(scene.model_copy(update={**context_update, "scene_state": "ai_blocked_by_cap"}))
    return GenerateSceneAIFallbacksResponse(scenes=updated_scenes)


class GenerateSingleSceneAIPromptRequest(BaseModel):
    script: str = Field(..., description="Narration script or transcript backing the scene")
    scene: SceneTimelineItem
    scenes: list[SceneTimelineItem] = Field(default_factory=list)


class GenerateSingleSceneAIPromptResponse(BaseModel):
    prompt: str
    effect_transition_name: Optional[str] = None
    scene_role: Optional[str] = None
    asset_bias: Optional[str] = None
    scene_fx_name: Optional[str] = None
    scene_fx_strength: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stock_match_rationale: Optional[str] = None
    fx_rationale: Optional[str] = None
    planning_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


@router.post("/generate-single-scene-ai-prompt", response_model=GenerateSingleSceneAIPromptResponse)
async def generate_single_scene_ai_prompt(request: GenerateSingleSceneAIPromptRequest):
    """Generate one scene-aware AI image prompt using full-script context plus the current scene."""
    from app.services.anchor_selector import AnchorSelector
    from app.services.scene_planner import build_scene_plan

    scene = request.scene
    all_scenes = request.scenes or [scene]
    scene_plan = await build_scene_plan(
        request.script,
        [item.model_dump() if hasattr(item, "model_dump") else item for item in all_scenes],
    )
    scene_context = scene_plan.get(scene.scene_id, {})
    selector = AnchorSelector()
    anchors = [{
        "word": scene.anchor_word,
        "start": scene.start_time_seconds,
        "end": scene.end_time_seconds,
        "focus_word": scene.visual_focus_word or scene.anchor_word,
        "anchor_phrase": scene.anchor_phrase or scene.transcript_excerpt or scene.anchor_word,
        "effect_transition_name": scene.effect_transition_name,
    }]
    prompt_rows = await selector.generate_prompts(request.script, anchors, scene_contexts=[scene_context])
    if not prompt_rows:
        raise HTTPException(status_code=500, detail="Failed to generate scene AI prompt")

    row = prompt_rows[0]
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=500, detail="Generated scene AI prompt was empty")

    return GenerateSingleSceneAIPromptResponse(
        prompt=prompt,
        effect_transition_name=row.get("effect_transition_name") or scene.effect_transition_name,
        scene_role=scene_context.get("scene_role") or scene.scene_role,
        asset_bias=scene_context.get("asset_bias") or scene.asset_bias,
        scene_fx_name=scene.scene_fx_name,
        scene_fx_strength=scene.scene_fx_strength,
        stock_match_rationale=scene_context.get("stock_match_rationale") or scene.stock_match_rationale,
        fx_rationale=scene_context.get("fx_rationale") or scene.fx_rationale,
        planning_confidence=scene_context.get("planning_confidence") if scene_context.get("planning_confidence") is not None else scene.planning_confidence,
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
            sfx_timeline=request.sfx_timeline,
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
        renderer="classic",
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
            sfx_timeline=request.sfx_timeline,
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
        renderer="classic",
    )


@router.post("/paper/{paper_id}/generate-premium-reel", response_model=ReelResponse)
async def generate_premium_reel_from_paper(
    paper_id: int,
    request: GenerateReelRequest,
    content_type: str = Query("latest", description="Controls generation framing"),
    db: AsyncSession = Depends(get_db),
):
    from app.services.premium_reel_renderer import PremiumReelRenderer
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
    temp_clip_paths = clip_paths or []

    try:
        renderer = PremiumReelRenderer()
        video_url = await renderer.generate(
            episode_id=None,
            paper_id=paper_id,
            audio_url=request.audio_url,
            headline=request.headline,
            start_seconds=request.start_seconds,
            duration_seconds=request.duration_seconds,
            custom_text=request.custom_text,
            transcript_text=request.custom_text,
            closing_statement=request.closing_statement,
            background_video_url=request.background_video_url if not clip_paths else None,
            overlay_video_url=request.overlay_video_url,
            background_clip_paths=clip_paths,
            anchor_timeline=request.anchor_timeline,
            scene_timeline=request.scene_timeline,
            word_timestamps=request.word_timestamps,
            sfx_timeline=request.sfx_timeline,
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
        renderer="premium",
    )


@router.post("/custom/generate-premium-reel", response_model=ReelResponse)
async def generate_custom_premium_reel(
    request: GenerateReelRequest,
):
    from app.services.premium_reel_renderer import PremiumReelRenderer

    if not request.custom_text and not request.audio_url:
        raise HTTPException(status_code=400, detail="Either custom_text or audio_url is required")

    clip_paths = None
    if request.background_clip_urls and len(request.background_clip_urls) > 0:
        clip_paths = await _download_clip_urls(request.background_clip_urls)
    temp_clip_paths = clip_paths or []

    try:
        renderer = PremiumReelRenderer()
        video_url = await renderer.generate(
            episode_id=None,
            paper_id=None,
            audio_url=request.audio_url,
            headline=request.headline,
            start_seconds=0,
            duration_seconds=request.duration_seconds,
            custom_text=request.custom_text,
            transcript_text=request.custom_text,
            closing_statement=request.closing_statement,
            background_video_url=request.background_video_url if not clip_paths else None,
            overlay_video_url=request.overlay_video_url,
            background_clip_paths=clip_paths,
            anchor_timeline=request.anchor_timeline,
            scene_timeline=request.scene_timeline,
            word_timestamps=request.word_timestamps,
            sfx_timeline=request.sfx_timeline,
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
        renderer="premium",
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
