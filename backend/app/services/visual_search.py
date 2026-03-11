"""
Visual search service for auto-matching stock footage to content.

Uses the Pexels Video API (free, no watermarks) to find relevant clips,
and GPT-4o-mini to extract concrete visual search terms from content.
"""
import json
import os
import tempfile
from dataclasses import dataclass

import httpx
from loguru import logger
from openai import AsyncOpenAI

from app.core.config import settings

PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search"


@dataclass
class StockClip:
    url: str
    keyword: str
    duration: float
    width: int
    height: int


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
