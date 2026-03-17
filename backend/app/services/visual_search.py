"""
Visual search service for auto-matching stock visuals to reel scenes.

Uses Pexels photo + video APIs and GPT-4o-mini to produce concrete,
portrait-safe search terms and ranked candidates per scene.
"""
import json
import os
import tempfile
from dataclasses import dataclass
from typing import Literal

import httpx
from loguru import logger
from openai import AsyncOpenAI

from app.core.config import settings

PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search"
PEXELS_IMAGE_SEARCH_URL = "https://api.pexels.com/v1/search"


@dataclass
class StockClip:
    url: str
    keyword: str
    duration: float
    width: int
    height: int


@dataclass
class StockAssetCandidate:
    candidate_id: str
    type: Literal["stock_image", "stock_video"]
    asset_url: str
    thumbnail_url: str
    source_provider: str
    width: int
    height: int
    duration_seconds: float | None
    query: str
    score: float


async def extract_visual_keywords(
    headline: str,
    script: str,
    num_keywords: int = 4,
) -> list[str]:
    """Use GPT-4o-mini to extract concrete, visually-searchable terms from content."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    prompt = (
        "You are a visual researcher for a science video production team.\n"
        "Given the headline and narration script below, return exactly "
        f"{num_keywords} concrete stock-footage search terms.\n\n"
        "Rules:\n"
        "- Each term must describe something a camera could actually film "
        "(e.g. 'electron microscope close-up', 'solar panel array', 'laboratory pipette').\n"
        "- Avoid abstract concepts that won't return good footage "
        "(e.g. 'innovation', 'discovery', 'breakthrough').\n"
        "- Order them as a visual story arc: "
        "opening/context → specific subject → detail/process → impact/future.\n"
        "- Keep each term 2-5 words.\n\n"
        f"Headline: {headline}\n\n"
        f"Script: {script}\n\n"
        f'Return a JSON object: {{"keywords": ["term1", "term2", ...]}} with exactly {num_keywords} strings. Nothing else.'
    )

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=300,
        )
        raw = resp.choices[0].message.content
        data = json.loads(raw)
        # GPT may return {"keywords": [...]}, {"terms": [...]}, or a bare array
        if isinstance(data, list):
            keywords = data
        else:
            keywords = (
                data.get("keywords")
                or data.get("terms")
                or data.get("search_terms")
                or data.get("result")
                or []
            )
        keywords = [str(k).strip() for k in keywords if k][:num_keywords]
        logger.info(f"Extracted visual keywords: {keywords}")
        return keywords
    except Exception as e:
        logger.error(f"Visual keyword extraction failed: {e}")
        fallback = headline.split()[:3]
        return [" ".join(fallback)]


async def extract_scene_search_queries(
    scenes: list[dict],
    full_script: str = "",
    max_queries: int = 3,
) -> dict[str, list[str]]:
    """Generate stock-searchable queries per scene from transcript slices."""
    if not scenes:
        return {}

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    normalized_story = " ".join((full_script or "").split()).strip()
    if len(normalized_story) > 7000:
        normalized_story = normalized_story[:7000] + "..."

    scene_prompt = []
    for scene in scenes:
        scene_prompt.append(
            {
                "scene_id": scene["scene_id"],
                "anchor_word": scene.get("anchor_word", ""),
                "visual_focus_word": scene.get("visual_focus_word", ""),
                "anchor_phrase": scene.get("anchor_phrase", ""),
                "transcript_excerpt": scene.get("transcript_excerpt", ""),
            }
        )

    prompt = (
        "You are the most viral AI video reel director on the internet.\n"
        "You are planning stock footage searches for a vertical science reel.\n"
        "Use the full narration for story context, but write search terms only for the specific current scene.\n"
        "For each scene, produce exactly "
        f"{max_queries} short search queries that work well on Pexels video search.\n"
        "Rules:\n"
        "- Queries must be concrete visual things a camera can capture.\n"
        "- Keep every query simple, punchy, and not too compound.\n"
        "- Prefer 1-3 words. 4 words maximum only when absolutely necessary.\n"
        "- Use visual_focus_word and anchor_phrase as semantic source of truth when anchor_word is too generic.\n"
        "- Favor human emotion, scientific apparatus, observable motion, and strong portrait framing.\n"
        "- Prioritize terms likely to return dynamic video, not static concepts.\n"
        "- Avoid abstract concepts and academic phrasing.\n"
        "- Avoid stacking multiple nouns into one long search phrase.\n"
        "- Return broad-enough search terms that stock libraries are likely to have results for.\n"
        "- Return JSON: {\"scenes\": [{\"scene_id\": \"...\", \"queries\": [\"...\", ...]}]}\n\n"
        f"FULL NARRATION:\n{normalized_story}\n\n"
        f"SCENES:\n{json.dumps(scene_prompt, ensure_ascii=False)}"
    )

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=1800,
        )
        data = json.loads(resp.choices[0].message.content)
        results: dict[str, list[str]] = {}
        for item in data.get("scenes", []):
            scene_id = str(item.get("scene_id", "")).strip()
            raw_queries = [str(q).strip() for q in item.get("queries", []) if str(q).strip()]
            queries: list[str] = []
            for query in raw_queries:
                words = [word for word in query.split() if word]
                simplified = " ".join(words[:4]).strip()
                if simplified and simplified not in queries:
                    queries.append(simplified)
            if scene_id:
                results[scene_id] = queries[:max_queries]
        return results
    except Exception as exc:
        logger.warning(f"Scene query extraction failed, using heuristic fallback: {exc}")
        fallback: dict[str, list[str]] = {}
        for scene in scenes:
            anchor = str(scene.get("anchor_word", "")).strip()
            focus = str(scene.get("visual_focus_word", "")).strip()
            phrase = str(scene.get("anchor_phrase", "")).strip()
            excerpt = str(scene.get("transcript_excerpt", "")).strip()
            semantic_seed = " ".join(part for part in [focus, phrase, excerpt] if part)
            seed_words = [word for word in semantic_seed.split() if len(word) > 3][:7]
            query = " ".join(seed_words[:2]).strip() or focus or anchor or "science lab"
            fallback[scene["scene_id"]] = [query, focus or query, "scientist", "lab closeup"][:max_queries]
        return fallback


async def search_stock_clips(
    keywords: list[str],
    clips_per_keyword: int = 1,
    min_duration: int = 5,
    orientation: str = "portrait",
) -> list[StockClip]:
    """Search Pexels for stock video clips matching each keyword."""
    api_key = settings.PEXELS_API_KEY
    if not api_key:
        logger.warning("PEXELS_API_KEY not set — skipping stock footage search")
        return []

    headers = {"Authorization": api_key}
    clips: list[StockClip] = []
    params_base: dict = {"per_page": 5, "size": "medium"}
    if orientation:
        params_base["orientation"] = orientation

    async with httpx.AsyncClient(timeout=20) as client:
        for kw in keywords:
            try:
                params = {**params_base, "query": kw}
                resp = await client.get(PEXELS_VIDEO_SEARCH_URL, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                found = 0
                for video in data.get("videos", []):
                    if video.get("duration", 0) < min_duration:
                        continue
                    best_file = _pick_best_video_file(video.get("video_files", []))
                    if not best_file:
                        continue
                    clips.append(StockClip(
                        url=best_file["link"],
                        keyword=kw,
                        duration=video["duration"],
                        width=best_file.get("width", 0),
                        height=best_file.get("height", 0),
                    ))
                    found += 1
                    if found >= clips_per_keyword:
                        break

                if found == 0 and orientation == "portrait":
                    # Fallback: portrait can be sparse, try without orientation
                    try:
                        resp2 = await client.get(
                            PEXELS_VIDEO_SEARCH_URL,
                            params={"query": kw, "per_page": 5, "size": "medium"},
                            headers=headers,
                        )
                        resp2.raise_for_status()
                        data2 = resp2.json()
                        for video in data2.get("videos", []):
                            if video.get("duration", 0) < min_duration:
                                continue
                            best_file = _pick_best_video_file(video.get("video_files", []))
                            if best_file:
                                clips.append(StockClip(
                                    url=best_file["link"],
                                    keyword=kw,
                                    duration=video["duration"],
                                    width=best_file.get("width", 0),
                                    height=best_file.get("height", 0),
                                ))
                                found = 1
                                break
                    except Exception:
                        pass

                if found == 0:
                    logger.warning(f"No Pexels clips found for '{kw}'")
            except Exception as e:
                logger.error(f"Pexels search failed for '{kw}': {e}")

    logger.info(f"Found {len(clips)} stock clips for {len(keywords)} keywords")
    return clips


async def search_stock_clips_metadata(
    headline: str,
    script: str,
    num_keywords: int = 4,
    orientation: str = "portrait",
) -> list[dict]:
    """
    Extract keywords, search Pexels, return clip metadata (url, thumbnail, keyword, duration).
    No download — used for user approval flow.
    """
    keywords = await extract_visual_keywords(headline, script, num_keywords=num_keywords)
    if not keywords:
        return []

    api_key = settings.PEXELS_API_KEY
    if not api_key:
        logger.warning("PEXELS_API_KEY not set — skipping stock footage search")
        return []

    headers = {"Authorization": api_key}
    results: list[dict] = []
    params_base: dict = {"per_page": 5, "size": "medium"}
    if orientation:
        params_base["orientation"] = orientation

    async with httpx.AsyncClient(timeout=20) as client:
        for kw in keywords:
            try:
                params = {**params_base, "query": kw}
                resp = await client.get(PEXELS_VIDEO_SEARCH_URL, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                for video in data.get("videos", []):
                    if video.get("duration", 0) < 5:
                        continue
                    best_file = _pick_best_video_file(video.get("video_files", []))
                    if not best_file:
                        continue
                    # Pexels: video_pictures array with {picture: url} or image field
                    pics = video.get("video_pictures", [])
                    thumbnail = pics[0].get("picture", "") if pics else video.get("image", "")
                    results.append({
                        "url": best_file["link"],
                        "thumbnail": thumbnail or best_file["link"],
                        "keyword": kw,
                        "duration": video.get("duration", 0),
                    })
                    break

                if not any(r["keyword"] == kw for r in results) and orientation == "portrait":
                    resp2 = await client.get(
                        PEXELS_VIDEO_SEARCH_URL,
                        params={"query": kw, "per_page": 5, "size": "medium"},
                        headers=headers,
                    )
                    resp2.raise_for_status()
                    data2 = resp2.json()
                    for video in data2.get("videos", []):
                        if video.get("duration", 0) < 5:
                            continue
                        best_file = _pick_best_video_file(video.get("video_files", []))
                        if best_file:
                            pics = video.get("video_pictures", [])
                            thumbnail = pics[0].get("picture", "") if pics else video.get("image", "")
                            results.append({
                                "url": best_file["link"],
                                "thumbnail": thumbnail or best_file["link"],
                                "keyword": kw,
                                "duration": video.get("duration", 0),
                            })
                            break
            except Exception as e:
                logger.error(f"Pexels search failed for '{kw}': {e}")

    logger.info(f"Fetch visuals: found {len(results)} clips for {len(keywords)} keywords")
    return results


def _pick_best_video_file(files: list[dict]) -> dict | None:
    """Pick the best quality file that's HD but not excessively large."""
    ranked = sorted(
        [f for f in files if f.get("width") and f.get("height")],
        key=lambda f: f["width"] * f["height"],
        reverse=True,
    )
    for f in ranked:
        if f["width"] <= 1920 and f["height"] <= 1920:
            return f
    return ranked[-1] if ranked else None


async def fetch_visual_clips(
    keywords: list[str],
) -> list[dict]:
    """
    Search Pexels using provided keywords, and return clip metadata (no download).
    Returns list of {url, thumbnail, keyword, duration} for frontend preview/approval.
    """
    if not keywords:
        return []

    api_key = settings.PEXELS_API_KEY
    if not api_key:
        logger.warning("PEXELS_API_KEY not set — skipping stock footage search")
        return []

    headers = {"Authorization": api_key}
    results: list[dict] = []
    params_base: dict = {"per_page": 5, "size": "medium", "orientation": "portrait"}

    async with httpx.AsyncClient(timeout=20) as client:
        for kw in keywords:
            try:
                params = {**params_base, "query": kw}
                resp = await client.get(PEXELS_VIDEO_SEARCH_URL, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                for video in data.get("videos", []):
                    if video.get("duration", 0) < 5:
                        continue
                    best_file = _pick_best_video_file(video.get("video_files", []))
                    if not best_file:
                        continue
                    # Pexels: video_pictures array with {id, picture, nr}
                    thumb = ""
                    for pic in video.get("video_pictures", [])[:1]:
                        thumb = pic.get("picture", pic.get("image", ""))
                        break
                    if not thumb and video.get("image"):
                        thumb = video["image"]
                    results.append({
                        "url": best_file["link"],
                        "thumbnail": thumb,
                        "keyword": kw,
                        "duration": video.get("duration", 0),
                    })
                    break  # one clip per keyword

                if not any(r["keyword"] == kw for r in results):
                    # Fallback: try without orientation
                    try:
                        resp2 = await client.get(
                            PEXELS_VIDEO_SEARCH_URL,
                            params={"query": kw, "per_page": 5, "size": "medium"},
                            headers=headers,
                        )
                        resp2.raise_for_status()
                        data2 = resp2.json()
                        for video in data2.get("videos", []):
                            if video.get("duration", 0) < 5:
                                continue
                            best_file = _pick_best_video_file(video.get("video_files", []))
                            if best_file:
                                thumb = ""
                                for pic in video.get("video_pictures", [])[:1]:
                                    thumb = pic.get("picture", pic.get("image", ""))
                                    break
                                results.append({
                                    "url": best_file["link"],
                                    "thumbnail": thumb,
                                    "keyword": kw,
                                    "duration": video.get("duration", 0),
                                })
                                break
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"Pexels search failed for '{kw}': {e}")

    logger.info(f"Fetched {len(results)} visual clips for preview")
    return results


def _score_visual_candidate(
    *,
    query: str,
    width: int,
    height: int,
    duration_seconds: float | None,
    is_hook: bool = False,
    asset_type: str,
) -> float:
    portrait_ratio = height / max(width, 1)
    portrait_bonus = 2.0 if portrait_ratio >= 1.3 else 0.0
    close_up_bonus = 1.5 if any(term in query.lower() for term in ["close", "scientist", "microscope", "lab"]) else 0.0
    # Prefer video motion over static images for reels.
    motion_bonus = 2.5 if asset_type == "stock_video" else 0.0
    duration_bonus = 0.0
    if duration_seconds is not None:
        duration_bonus = 1.2 if 4 <= duration_seconds <= 12 else 0.4
    hook_bonus = 1.0 if is_hook and any(term in query.lower() for term in ["close", "dramatic", "reaction", "experiment"]) else 0.0
    return portrait_bonus + close_up_bonus + motion_bonus + duration_bonus + hook_bonus


async def search_scene_candidates(
    scenes: list[dict],
    full_script: str = "",
    llm_rerank: bool = True,
    include_local_candidates: bool = True,
    max_queries_per_scene: int = 3,
    max_candidates_per_scene: int = 7,
) -> dict[str, list[dict]]:
    """Return ranked stock image/video candidates keyed by scene id."""
    if not scenes:
        return {}

    local_candidates_by_scene: dict[str, list[dict]] = {scene["scene_id"]: [] for scene in scenes}
    if include_local_candidates:
        try:
            from app.services.local_media_library import LocalMediaLibraryService

            local_library = LocalMediaLibraryService()
            if local_library.is_enabled():
                local_candidates_by_scene = local_library.get_scene_candidates(
                    scenes,
                    max_candidates_per_scene=min(4, max_candidates_per_scene),
                )
            else:
                logger.info("Local media library not enabled; falling back to stock-first resolver.")
        except Exception as exc:
            logger.warning(f"Local media library resolution skipped: {exc}")

    api_key = settings.PEXELS_API_KEY

    queries_by_scene = await extract_scene_search_queries(
        scenes,
        full_script=full_script,
        max_queries=max_queries_per_scene,
    )
    results: dict[str, list[dict]] = {scene["scene_id"]: [] for scene in scenes}

    if not api_key:
        logger.warning("PEXELS_API_KEY not set — returning no stock candidates")
        for scene in scenes:
            scene_id = scene["scene_id"]
            scene["search_queries"] = queries_by_scene.get(scene_id, [])[:max_queries_per_scene]
            if include_local_candidates:
                results[scene_id] = local_candidates_by_scene.get(scene_id, [])[:max_candidates_per_scene]
            else:
                results[scene_id] = []
        return results

    headers = {"Authorization": api_key}

    async with httpx.AsyncClient(timeout=20) as client:
        for scene in scenes:
            scene_id = scene["scene_id"]
            is_hook = False
            video_candidates: list[StockAssetCandidate] = []
            image_candidates: list[StockAssetCandidate] = []
            queries = queries_by_scene.get(scene_id, [])[:max_queries_per_scene]

            for q_idx, query in enumerate(queries):
                if not query:
                    continue
                try:
                    video_resp = await client.get(
                        PEXELS_VIDEO_SEARCH_URL,
                        params={"query": query, "per_page": 5, "orientation": "portrait", "size": "medium"},
                        headers=headers,
                    )
                    video_resp.raise_for_status()
                    video_data = video_resp.json()
                    for idx, video in enumerate(video_data.get("videos", [])[:3]):
                        best_file = _pick_best_video_file(video.get("video_files", []))
                        if not best_file:
                            continue
                        pics = video.get("video_pictures", [])
                        thumb = pics[0].get("picture", "") if pics else video.get("image", "")
                        score = _score_visual_candidate(
                            query=query,
                            width=best_file.get("width", 0),
                            height=best_file.get("height", 0),
                            duration_seconds=video.get("duration"),
                            is_hook=is_hook,
                            asset_type="stock_video",
                        )
                        video_candidates.append(StockAssetCandidate(
                            candidate_id=f"{scene_id}-vid-{q_idx}-{idx}",
                            type="stock_video",
                            asset_url=best_file["link"],
                            thumbnail_url=thumb or best_file["link"],
                            source_provider="pexels",
                            width=best_file.get("width", 0),
                            height=best_file.get("height", 0),
                            duration_seconds=video.get("duration"),
                            query=query,
                            score=score,
                        ))
                except Exception as exc:
                    logger.warning(f"Pexels video search failed for '{query}': {exc}")

            # Only fall back to images when no usable videos were found for the scene.
            if not video_candidates:
                for q_idx, query in enumerate(queries):
                    if not query:
                        continue
                    try:
                        image_resp = await client.get(
                            PEXELS_IMAGE_SEARCH_URL,
                            params={"query": query, "per_page": 5, "orientation": "portrait", "size": "medium"},
                            headers=headers,
                        )
                        image_resp.raise_for_status()
                        image_data = image_resp.json()
                        for idx, photo in enumerate(image_data.get("photos", [])[:3]):
                            src = photo.get("src", {}) or {}
                            asset_url = src.get("large2x") or src.get("large") or src.get("original")
                            thumbnail_url = src.get("medium") or src.get("small") or asset_url
                            if not asset_url:
                                continue
                            score = _score_visual_candidate(
                                query=query,
                                width=photo.get("width", 0),
                                height=photo.get("height", 0),
                                duration_seconds=None,
                                is_hook=is_hook,
                                asset_type="stock_image",
                            )
                            image_candidates.append(StockAssetCandidate(
                                candidate_id=f"{scene_id}-img-{q_idx}-{idx}",
                                type="stock_image",
                                asset_url=asset_url,
                                thumbnail_url=thumbnail_url,
                                source_provider="pexels",
                                width=photo.get("width", 0),
                                height=photo.get("height", 0),
                                duration_seconds=None,
                                query=query,
                                score=score,
                            ))
                    except Exception as exc:
                        logger.warning(f"Pexels image search failed for '{query}': {exc}")

            scene_candidates = video_candidates if video_candidates else image_candidates
            deduped: dict[str, StockAssetCandidate] = {}
            for candidate in scene_candidates:
                deduped.setdefault(candidate.asset_url, candidate)
            ranked_stock = sorted(deduped.values(), key=lambda item: item.score, reverse=True)
            if include_local_candidates:
                local_ranked = local_candidates_by_scene.get(scene_id, [])
                local_take = min(len(local_ranked), max_candidates_per_scene)
                stock_take = max(max_candidates_per_scene - local_take, 0)
                merged = local_ranked[:local_take] + [candidate.__dict__ for candidate in ranked_stock[:stock_take]]
                results[scene_id] = merged
            else:
                results[scene_id] = [candidate.__dict__ for candidate in ranked_stock[:max_candidates_per_scene]]

            if not queries:
                if include_local_candidates:
                    results[scene_id] = local_candidates_by_scene.get(scene_id, [])[:max_candidates_per_scene]
                else:
                    results[scene_id] = []
            scene["search_queries"] = queries

    if llm_rerank and settings.OPENAI_API_KEY:
        results = await _rerank_scene_candidates_with_story(
            full_script=full_script,
            scenes=scenes,
            candidates_by_scene=results,
            max_candidates_per_scene=max_candidates_per_scene,
        )

    return results


async def _rerank_scene_candidates_with_story(
    *,
    full_script: str,
    scenes: list[dict],
    candidates_by_scene: dict[str, list[dict]],
    max_candidates_per_scene: int,
) -> dict[str, list[dict]]:
    """LLM rerank pass: choose candidates using whole-story narrative context."""
    story_text = " ".join((full_script or "").split()).strip()
    if not story_text:
        return candidates_by_scene

    payload_scenes: list[dict] = []
    for idx, scene in enumerate(scenes):
        scene_id = scene["scene_id"]
        candidates = candidates_by_scene.get(scene_id, [])
        if not candidates:
            continue
        limited = []
        for candidate in candidates[:max(8, max_candidates_per_scene)]:
            limited.append({
                "candidate_id": candidate.get("candidate_id"),
                "type": candidate.get("type"),
                "source_provider": candidate.get("source_provider"),
                "query": candidate.get("query"),
                "duration_seconds": candidate.get("duration_seconds"),
                "base_score": round(float(candidate.get("score", 0.0)), 3),
            })
        payload_scenes.append({
            "scene_id": scene_id,
            "scene_index": idx + 1,
            "total_scenes": len(scenes),
            "anchor_word": scene.get("anchor_word", ""),
            "visual_focus_word": scene.get("visual_focus_word", ""),
            "anchor_phrase": scene.get("anchor_phrase", ""),
            "transcript_excerpt": scene.get("transcript_excerpt", ""),
            "start_time_seconds": scene.get("start_time_seconds", 0),
            "end_time_seconds": scene.get("end_time_seconds", 0),
            "candidates": limited,
        })

    if not payload_scenes:
        return candidates_by_scene

    # Keep context bounded for cost/latency.
    if len(story_text) > 7000:
        story_text = story_text[:7000] + "..."

    prompt = (
        "You are a reel creative director reranking scene visual candidates.\n"
        "Goal: choose the most narratively fitting candidate order for EACH scene using the WHOLE story, not isolated words.\n"
        "Rules:\n"
        "1) Match meaning and progression of the script (past -> conflict -> growth -> resolution).\n"
        "2) Prefer motion assets (video) when fit is comparable.\n"
        "3) Avoid repetitive picks across adjacent scenes unless repetition is intentional.\n"
        "4) Use visual_focus_word and anchor_phrase semantics over generic trigger anchor_word when needed.\n"
        "5) Use transcript_excerpt + scene position.\n"
        "6) Return strict JSON only.\n\n"
        f"STORY:\n{story_text}\n\n"
        f"SCENES:\n{json.dumps(payload_scenes, ensure_ascii=False)}\n\n"
        'Return JSON: {"ranked_scenes":[{"scene_id":"...","candidate_ids":["best","second","third"]}]}'
    )

    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=2500,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        ranked_rows = data.get("ranked_scenes", [])
        ranked_map: dict[str, list[str]] = {}
        for row in ranked_rows:
            scene_id = str(row.get("scene_id", "")).strip()
            candidate_ids = [str(cid).strip() for cid in row.get("candidate_ids", []) if str(cid).strip()]
            if scene_id and candidate_ids:
                ranked_map[scene_id] = candidate_ids

        reranked: dict[str, list[dict]] = {}
        for scene in scenes:
            scene_id = scene["scene_id"]
            candidates = candidates_by_scene.get(scene_id, [])
            if not candidates:
                reranked[scene_id] = []
                continue
            order = ranked_map.get(scene_id)
            if not order:
                reranked[scene_id] = candidates[:max_candidates_per_scene]
                continue
            order_idx = {candidate_id: idx for idx, candidate_id in enumerate(order)}
            sorted_candidates = sorted(
                candidates,
                key=lambda candidate: (
                    order_idx.get(str(candidate.get("candidate_id", "")), 9999),
                    -float(candidate.get("score", 0.0)),
                ),
            )
            reranked[scene_id] = sorted_candidates[:max_candidates_per_scene]
        logger.info("Applied LLM narrative rerank across scene candidates")
        return reranked
    except Exception as exc:
        logger.warning(f"LLM narrative rerank failed; using heuristic order: {exc}")
        return candidates_by_scene


async def download_clip_from_url(url: str, keyword: str = "clip") -> str:
    """Download a video from URL to a temporary file. Returns the file path."""
    logger.info(f"Downloading clip from URL ({url[:60]}...)")
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    ext = ".mp4"
    fd, path = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, "wb") as f:
        f.write(resp.content)
    logger.info(f"Downloaded clip to {path} ({len(resp.content) / 1024 / 1024:.1f} MB)")
    return path


async def download_clips_from_urls(urls: list[str]) -> list[str]:
    """Download multiple clips from URLs. Returns list of temp file paths."""
    paths = []
    for i, url in enumerate(urls):
        try:
            path = await download_clip_from_url(url, keyword=f"clip-{i}")
            paths.append(path)
        except Exception as e:
            logger.error(f"Failed to download clip {i} from {url[:50]}...: {e}")
    return paths


async def download_clip(clip: StockClip) -> str:
    """Download a stock clip to a temporary file. Returns the file path."""
    logger.info(f"Downloading stock clip: {clip.keyword} ({clip.url[:60]}...)")
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
        resp = await client.get(clip.url)
        resp.raise_for_status()

    ext = ".mp4"
    fd, path = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, "wb") as f:
        f.write(resp.content)

    logger.info(f"Downloaded clip to {path} ({len(resp.content) / 1024 / 1024:.1f} MB)")
    return path
