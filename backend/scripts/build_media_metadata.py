#!/usr/bin/env python3
"""
Build AI metadata for a local media library used by custom reel generation.

Expected library layout:
  <library_root>/
    images/
    videos/

Outputs:
  <output_dir>/library_manifest.json
  <output_dir>/assets/<images|videos>/.../*.json
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

# Add backend directory to path so "app.core.config" imports work.
sys.path.append(str(Path(__file__).parent.parent))

from app.core.config import settings

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze images/videos with AI and generate per-asset metadata JSON."
    )
    parser.add_argument(
        "--library-root",
        required=True,
        help="Folder containing images/ and videos/ subfolders.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output folder for metadata files (default: <library-root>/metadata).",
    )
    parser.add_argument(
        "--model",
        default="gpt-4.1-mini",
        help="OpenAI multimodal model used for metadata extraction.",
    )
    parser.add_argument(
        "--frame-count",
        type=int,
        default=3,
        help="How many frames to sample per video for analysis.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=3,
        help="Number of assets analyzed in parallel.",
    )
    parser.add_argument(
        "--skip-ai",
        action="store_true",
        help="Only build technical metadata (no OpenAI semantic analysis).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing metadata files if present.",
    )
    parser.add_argument(
        "--rename-files",
        action="store_true",
        help="Rename media files using 2-3 descriptive words with unique stems.",
    )
    parser.add_argument(
        "--dry-run-renames",
        action="store_true",
        help="Show planned renames without touching files.",
    )
    return parser.parse_args()


def run_command(command: list[str]) -> str:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n{result.stderr.strip()}"
        )
    return result.stdout.strip()


def parse_ratio(value: str | None) -> float | None:
    if not value:
        return None
    if "/" in value:
        num, den = value.split("/", 1)
        try:
            n = float(num)
            d = float(den)
            if d == 0:
                return None
            return n / d
        except Exception:
            return None
    try:
        return float(value)
    except Exception:
        return None


def classify_orientation(width: int | None, height: int | None) -> str:
    if not width or not height:
        return "unknown"
    ratio = width / height
    if ratio < 0.8:
        return "portrait"
    if ratio > 1.2:
        return "landscape"
    return "square"


def ffprobe_media(path: Path) -> dict[str, Any]:
    stdout = run_command(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ]
    )
    data = json.loads(stdout)
    streams = data.get("streams", [])
    format_info = data.get("format", {})
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})

    width = int(video_stream.get("width") or 0) or None
    height = int(video_stream.get("height") or 0) or None
    duration = (
        float(video_stream.get("duration"))
        if video_stream.get("duration")
        else float(format_info.get("duration") or 0) or None
    )
    fps = parse_ratio(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"))

    aspect_ratio = round((width / height), 4) if width and height else None
    return {
        "width": width,
        "height": height,
        "duration_seconds": duration,
        "fps": fps,
        "aspect_ratio": aspect_ratio,
        "orientation": classify_orientation(width, height),
        "codec_name": video_stream.get("codec_name"),
        "bit_rate": int(format_info.get("bit_rate")) if format_info.get("bit_rate") else None,
        "size_bytes": int(format_info.get("size")) if format_info.get("size") else path.stat().st_size,
    }


def sample_video_frames(video_path: Path, duration_seconds: float | None, frame_count: int, temp_dir: Path) -> list[Path]:
    frame_count = max(frame_count, 1)
    if duration_seconds and duration_seconds > 0.3:
        timestamps = [duration_seconds * (idx + 1) / (frame_count + 1) for idx in range(frame_count)]
    else:
        timestamps = [0.0]

    sampled: list[Path] = []
    for idx, ts in enumerate(timestamps, start=1):
        frame_path = temp_dir / f"{video_path.stem}_f{idx}.jpg"
        command = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{max(ts, 0.0):.3f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(1280,iw)':-2",
            "-q:v",
            "3",
            str(frame_path),
        ]
        try:
            run_command(command)
            if frame_path.exists() and frame_path.stat().st_size > 0:
                sampled.append(frame_path)
        except Exception:
            continue
    return sampled


def prepare_image_frame(image_path: Path, temp_dir: Path) -> Path:
    frame_path = temp_dir / f"{image_path.stem}_analyze.jpg"
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(image_path),
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-q:v",
        "3",
        str(frame_path),
    ]
    run_command(command)
    return frame_path


def file_sha256(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            sha.update(chunk)
    return sha.hexdigest()


def to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def normalize_scores(raw: dict[str, Any]) -> dict[str, float]:
    keys = ["hook_strength", "science_relevance", "clarity_for_mobile"]
    normalized: dict[str, float] = {}
    for key in keys:
        try:
            value = float(raw.get(key, 0.5))
        except Exception:
            value = 0.5
        normalized[key] = max(0.0, min(1.0, value))
    return normalized


def normalize_semantics(raw: dict[str, Any]) -> dict[str, Any]:
    timing = raw.get("timing_recommendation") or {}
    scores = normalize_scores(raw.get("scores") or {})
    return {
        "where": str(raw.get("where") or "unknown"),
        "setting": str(raw.get("setting") or "unknown"),
        "subject": str(raw.get("subject") or "unknown"),
        "secondary_subjects": [str(item) for item in (raw.get("secondary_subjects") or [])][:8],
        "when": {
            "time_of_day": str((raw.get("when") or {}).get("time_of_day") or "unknown"),
            "era": str((raw.get("when") or {}).get("era") or "unknown"),
            "season": str((raw.get("when") or {}).get("season") or "unknown"),
            "certainty": max(0.0, min(1.0, float((raw.get("when") or {}).get("certainty") or 0.4))),
        },
        "mood": str(raw.get("mood") or "neutral"),
        "action": str(raw.get("action") or "unknown"),
        "shot_type": str(raw.get("shot_type") or "unknown"),
        "timing_recommendation": {
            "best_use": str(timing.get("best_use") or "body"),
            "pace": str(timing.get("pace") or "medium"),
            "suggested_scene_duration_seconds": max(0.8, float(timing.get("suggested_scene_duration_seconds") or 2.0)),
        },
        "tags": [str(item) for item in (raw.get("tags") or [])][:16],
        "safety": {
            "contains_text_overlay_risk": bool((raw.get("safety") or {}).get("contains_text_overlay_risk", False)),
            "faces_visible": bool((raw.get("safety") or {}).get("faces_visible", False)),
            "nsfw_risk": str((raw.get("safety") or {}).get("nsfw_risk") or "low"),
        },
        "scores": scores,
        "reason": str(raw.get("reason") or ""),
    }


def _tokenize_slug_text(text: str) -> list[str]:
    cleaned = []
    word = []
    for char in text.lower():
        if char.isalnum():
            word.append(char)
        else:
            if word:
                cleaned.append("".join(word))
                word = []
    if word:
        cleaned.append("".join(word))
    stopwords = {
        "the", "and", "with", "from", "into", "that", "this", "there",
        "their", "while", "under", "over", "near", "inside", "outside",
        "very", "just", "only", "into", "onto", "about", "around", "through",
        "unknown", "scene", "shot", "view", "image", "video",
    }
    output: list[str] = []
    for token in cleaned:
        if len(token) < 3 or token in stopwords:
            continue
        if token not in output:
            output.append(token)
    return output


def _number_token(index: int) -> str:
    words = [
        "one", "two", "three", "four", "five", "six", "seven", "eight",
        "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
    ]
    if index <= len(words):
        return words[index - 1]
    return f"n{index}"


def _build_name_pool(meta: dict[str, Any], media_type: str) -> list[str]:
    semantic = meta.get("semantic", {})
    technical = meta.get("technical", {})
    text_parts = [
        str(semantic.get("subject") or ""),
        str(semantic.get("action") or ""),
        str(semantic.get("setting") or ""),
        str(semantic.get("mood") or ""),
        str(semantic.get("shot_type") or ""),
        str((semantic.get("when") or {}).get("time_of_day") or ""),
        str((semantic.get("timing_recommendation") or {}).get("best_use") or ""),
        str(technical.get("orientation") or ""),
        " ".join(str(item) for item in (semantic.get("tags") or [])[:8]),
        " ".join(str(item) for item in (semantic.get("secondary_subjects") or [])[:4]),
    ]
    pool: list[str] = []
    for part in text_parts:
        for token in _tokenize_slug_text(part):
            if token not in pool:
                pool.append(token)
    if len(pool) < 2:
        pool.extend([media_type, "scene"])
    deduped: list[str] = []
    for token in pool:
        if token not in deduped:
            deduped.append(token)
    return deduped


def _pick_unique_stem(name_pool: list[str], used_stems: set[str]) -> str:
    candidates: list[str] = []
    for size in (2, 3):
        if len(name_pool) < size:
            continue
        for start in range(0, len(name_pool) - size + 1):
            chunk = name_pool[start:start + size]
            if len(chunk) == len(set(chunk)):
                candidates.append("-".join(chunk))

    for candidate in candidates:
        if candidate not in used_stems:
            used_stems.add(candidate)
            return candidate

    base = "-".join(name_pool[:2]) if len(name_pool) >= 2 else "media-scene"
    attempt = 1
    while True:
        numbered = f"{base}-{_number_token(attempt)}"
        if numbered not in used_stems:
            used_stems.add(numbered)
            return numbered
        attempt += 1


async def analyze_semantics_with_ai(
    client: AsyncOpenAI,
    model: str,
    relative_path: str,
    media_type: str,
    technical: dict[str, Any],
    frame_paths: list[Path],
) -> dict[str, Any]:
    system_prompt = (
        "You are annotating media assets for a reel-generation engine.\n"
        "Return strict JSON only. Be concrete. Do not invent unavailable facts.\n"
        "If uncertain, use 'unknown' and lower certainty/scores."
    )
    user_text = (
        f"Analyze this {media_type} asset and produce metadata for selection.\n"
        f"Relative path: {relative_path}\n"
        f"Technical metadata: {json.dumps(technical)}\n\n"
        "Return JSON with keys:\n"
        "{\n"
        '  "where": string,\n'
        '  "setting": string,\n'
        '  "subject": string,\n'
        '  "secondary_subjects": string[],\n'
        '  "when": {"time_of_day": string, "era": string, "season": string, "certainty": number 0..1},\n'
        '  "mood": string,\n'
        '  "action": string,\n'
        '  "shot_type": string,\n'
        '  "timing_recommendation": {"best_use": "hook|body|outro", "pace": "slow|medium|fast", "suggested_scene_duration_seconds": number},\n'
        '  "tags": string[],\n'
        '  "safety": {"contains_text_overlay_risk": boolean, "faces_visible": boolean, "nsfw_risk": "low|medium|high"},\n'
        '  "scores": {"hook_strength": number 0..1, "science_relevance": number 0..1, "clarity_for_mobile": number 0..1},\n'
        '  "reason": string\n'
        "}\n"
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
    for frame_path in frame_paths:
        content.append({"type": "image_url", "image_url": {"url": to_data_url(frame_path)}})

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_object"},
        temperature=0.15,
        max_tokens=1400,
    )
    raw_content = response.choices[0].message.content or "{}"
    parsed = json.loads(raw_content)
    return normalize_semantics(parsed)


def discover_media_files(library_root: Path) -> list[tuple[Path, str]]:
    assets: list[tuple[Path, str]] = []
    images_dir = library_root / "images"
    videos_dir = library_root / "videos"

    if images_dir.exists():
        for path in sorted(images_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                assets.append((path, "image"))
    if videos_dir.exists():
        for path in sorted(videos_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS:
                assets.append((path, "video"))
    return assets


async def process_asset(
    client: AsyncOpenAI | None,
    model: str,
    library_root: Path,
    output_dir: Path,
    path: Path,
    media_type: str,
    frame_count: int,
    overwrite: bool,
) -> dict[str, Any]:
    relative_path = path.relative_to(library_root).as_posix()
    metadata_path = output_dir / "assets" / Path(relative_path).with_suffix(".json")
    metadata_path.parent.mkdir(parents=True, exist_ok=True)

    if metadata_path.exists() and not overwrite:
        return {
            "relative_path": relative_path,
            "metadata_path": metadata_path.relative_to(output_dir).as_posix(),
            "status": "skipped_exists",
        }

    technical = ffprobe_media(path)
    file_stat = path.stat()
    technical["size_bytes"] = file_stat.st_size
    technical["last_modified_utc"] = datetime.fromtimestamp(file_stat.st_mtime, tz=timezone.utc).isoformat()

    semantics: dict[str, Any]
    with tempfile.TemporaryDirectory(prefix="media_meta_") as tmp:
        tmp_dir = Path(tmp)
        if media_type == "video":
            frames = sample_video_frames(path, technical.get("duration_seconds"), frame_count, tmp_dir)
        else:
            frames = [prepare_image_frame(path, tmp_dir)]

        if client and frames:
            semantics = await analyze_semantics_with_ai(
                client=client,
                model=model,
                relative_path=relative_path,
                media_type=media_type,
                technical=technical,
                frame_paths=frames,
            )
        else:
            semantics = normalize_semantics({})

    asset_id = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:16]
    metadata: dict[str, Any] = {
        "schema_version": "1.0",
        "asset_id": asset_id,
        "relative_path": relative_path,
        "media_type": media_type,
        "technical": technical,
        "semantic": semantics,
        "selection_features": {
            "portrait_safe": technical.get("orientation") == "portrait",
            "recommended_for_hook": semantics["scores"]["hook_strength"] >= 0.7,
            "recommended_for_body": semantics["timing_recommendation"]["best_use"] in {"body", "outro"},
        },
        "hash_sha256": file_sha256(path),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return {
        "relative_path": relative_path,
        "metadata_path": metadata_path.relative_to(output_dir).as_posix(),
        "status": "ok",
        "asset_id": asset_id,
        "media_type": media_type,
        "hook_strength": semantics["scores"]["hook_strength"],
        "best_use": semantics["timing_recommendation"]["best_use"],
        "tags": semantics["tags"][:6],
    }


def rename_assets_from_metadata(
    library_root: Path,
    output_dir: Path,
    results: list[dict[str, Any]],
    dry_run: bool = False,
) -> tuple[list[dict[str, Any]], int, list[dict[str, str]]]:
    updated_results: list[dict[str, Any]] = []
    rename_errors: list[dict[str, str]] = []
    used_stems: set[str] = set()
    rename_count = 0

    for item in sorted(results, key=lambda row: row.get("relative_path", "")):
        metadata_rel = item.get("metadata_path")
        if not metadata_rel:
            updated_results.append(item)
            continue

        metadata_path = output_dir / metadata_rel
        if not metadata_path.exists():
            updated_results.append(item)
            continue

        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            old_relative = str(metadata.get("relative_path") or item.get("relative_path") or "").strip()
            if not old_relative:
                updated_results.append(item)
                continue
            source_path = library_root / old_relative
            if not source_path.exists():
                rename_errors.append({
                    "relative_path": old_relative,
                    "error": "source file missing during rename pass",
                })
                updated_results.append(item)
                continue

            pool = _build_name_pool(metadata, str(metadata.get("media_type") or "media"))
            new_stem = _pick_unique_stem(pool, used_stems)
            if source_path.stem == new_stem:
                used_stems.add(new_stem)
                updated_results.append(item)
                continue

            target_path = source_path.with_name(f"{new_stem}{source_path.suffix.lower()}")
            if target_path.exists():
                # Resolve unexpected collision while still keeping unique names.
                extra = 1
                while True:
                    candidate_stem = f"{new_stem}-{_number_token(extra)}"
                    candidate_path = source_path.with_name(f"{candidate_stem}{source_path.suffix.lower()}")
                    if not candidate_path.exists():
                        target_path = candidate_path
                        used_stems.add(candidate_stem)
                        break
                    extra += 1

            new_relative = target_path.relative_to(library_root).as_posix()
            new_metadata_path = output_dir / "assets" / Path(new_relative).with_suffix(".json")
            new_metadata_path.parent.mkdir(parents=True, exist_ok=True)

            metadata["original_relative_path"] = old_relative
            metadata["relative_path"] = new_relative
            metadata["renamed_at_utc"] = datetime.now(timezone.utc).isoformat()

            if not dry_run:
                source_path.rename(target_path)
                new_metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                if metadata_path.resolve() != new_metadata_path.resolve():
                    metadata_path.unlink(missing_ok=True)

            updated_item = dict(item)
            updated_item["relative_path"] = new_relative
            updated_item["metadata_path"] = new_metadata_path.relative_to(output_dir).as_posix()
            updated_item["renamed_from"] = old_relative
            updated_item["status"] = "rename_planned" if dry_run else "ok_renamed"
            updated_results.append(updated_item)
            rename_count += 1
        except Exception as exc:
            rename_errors.append({
                "relative_path": str(item.get("relative_path", "")),
                "error": str(exc),
            })
            updated_results.append(item)

    return updated_results, rename_count, rename_errors


async def run() -> None:
    args = parse_args()
    library_root = Path(args.library_root).expanduser().resolve()
    if not library_root.exists():
        raise RuntimeError(f"Library root does not exist: {library_root}")

    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else (library_root / "metadata").resolve()
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    assets = discover_media_files(library_root)
    if not assets:
        raise RuntimeError(
            f"No assets found under {library_root}. Expected files inside images/ and videos/."
        )

    api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
    if not args.skip_ai and not api_key:
        raise RuntimeError("OPENAI_API_KEY is required unless --skip-ai is used.")

    client = None if args.skip_ai else AsyncOpenAI(api_key=api_key)
    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    async def worker(path: Path, media_type: str) -> None:
        relative = path.relative_to(library_root).as_posix()
        async with semaphore:
            try:
                result = await process_asset(
                    client=client,
                    model=args.model,
                    library_root=library_root,
                    output_dir=output_dir,
                    path=path,
                    media_type=media_type,
                    frame_count=max(1, args.frame_count),
                    overwrite=args.overwrite,
                )
                results.append(result)
                print(f"[OK] {relative}")
            except Exception as exc:
                errors.append({"relative_path": relative, "error": str(exc)})
                print(f"[ERR] {relative}: {exc}")

    await asyncio.gather(*(worker(path, media_type) for path, media_type in assets))

    rename_count = 0
    rename_errors: list[dict[str, str]] = []
    if args.rename_files:
        results, rename_count, rename_errors = rename_assets_from_metadata(
            library_root=library_root,
            output_dir=output_dir,
            results=results,
            dry_run=args.dry_run_renames,
        )

    ok_results = [
        item for item in results
        if item.get("status") in {"ok", "ok_renamed", "rename_planned"}
    ]
    manifest = {
        "schema_version": "1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "library_root": str(library_root),
        "output_dir": str(output_dir),
        "analysis_model": None if args.skip_ai else args.model,
        "rename_files_enabled": args.rename_files,
        "dry_run_renames": args.dry_run_renames,
        "counts": {
            "total_assets_discovered": len(assets),
            "metadata_generated": len(ok_results),
            "metadata_skipped_existing": sum(1 for item in results if item.get("status") == "skipped_exists"),
            "files_renamed": rename_count,
            "errors": len(errors) + len(rename_errors),
            "images": sum(1 for _, media_type in assets if media_type == "image"),
            "videos": sum(1 for _, media_type in assets if media_type == "video"),
        },
        "assets": sorted(results, key=lambda item: item.get("relative_path", "")),
        "errors": errors + rename_errors,
    }
    manifest_path = output_dir / "library_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"- Assets discovered: {len(assets)}")
    print(f"- Metadata generated: {len(ok_results)}")
    if args.rename_files:
        suffix = " (dry run)" if args.dry_run_renames else ""
        print(f"- Files renamed: {rename_count}{suffix}")
    print(f"- Errors: {len(errors) + len(rename_errors)}")
    print(f"- Manifest: {manifest_path}")


if __name__ == "__main__":
    asyncio.run(run())
