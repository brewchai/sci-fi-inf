import asyncio
import json
import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

from app.core.config import settings
from app.services.reel_generator import ReelGenerator
from app.services.scene_planner import normalize_scene_fx_name, normalize_scene_fx_strength
from app.services.storage import StorageService


PREMIUM_RENDERER_NAME = "premium"
PREMIUM_TRANSITIONS = {
    "hard_cut_blur",
    "masked_push",
    "light_sweep_dissolve",
    "scale_through_zoom",
    "depth_blur_handoff",
    "vertical_reveal",
    "horizontal_reveal",
    "soft_flash_cut",
    "glass_warp",
    "radial_focus_pull",
    "split_panel_wipe",
    "film_burn_edge",
    "depth_parallax_snap",
    "ghost_trail_crossfade",
    "iris_close_open",
}

PREMIUM_SCENE_FX = {
    "none",
    "paper_tear_reveal",
    "paper_crumble_transition",
    "zoom_through_handoff",
}


class PremiumReelRenderer:
    """Render reels via a self-hosted Remotion worker."""

    def __init__(self) -> None:
        try:
            self.storage = StorageService()
        except Exception:
            logger.exception("Premium reel storage client unavailable; local render fallback only")
            self.storage = None
        self.reel_generator = ReelGenerator()

    def _save_local_render(self, output_filename: str, video_bytes: bytes) -> str:
        relative_dir = "reels"
        basename = os.path.basename(output_filename)
        static_root = os.path.join(os.getcwd(), "static")
        render_dir = os.path.join(static_root, relative_dir)
        os.makedirs(render_dir, exist_ok=True)
        local_path = os.path.join(render_dir, basename)
        with open(local_path, "wb") as handle:
            handle.write(video_bytes)
        return f"/static/{relative_dir}/{basename}"

    async def generate(
        self,
        episode_id: int | None = None,
        paper_id: int | None = None,
        audio_url: str | None = None,
        headline: str = "",
        brand_name: str = "THE EUREKA FEED",
        start_seconds: float = 0,
        duration_seconds: float = 30,
        custom_text: str | None = None,
        transcript_text: str | None = None,
        closing_statement: str | None = None,
        background_video_url: str | None = None,
        overlay_video_url: str | None = None,
        background_clip_paths: list[str] | None = None,
        anchor_timeline: list | None = None,
        scene_timeline: list | None = None,
        word_timestamps: list[dict] | None = None,
        sfx_timeline: list | None = None,
        voice: str = "nova",
        speed: float = 1.0,
        elevenlabs_stability: float = 0.65,
        elevenlabs_similarity_boost: float = 0.85,
        elevenlabs_style: float = 0.1,
        tts_provider: str = "openai",
        include_waveform: bool = True,
    ) -> str:
        temp_files: list[str] = []

        try:
            if audio_url:
                audio_path = await self.reel_generator._download_audio_clip(
                    audio_url,
                    start_seconds,
                    duration_seconds,
                )
            elif custom_text:
                audio_path = await self.reel_generator._generate_tts_audio(
                    custom_text,
                    voice=voice,
                    speed=speed,
                    provider=tts_provider,
                    elevenlabs_stability=elevenlabs_stability,
                    elevenlabs_similarity_boost=elevenlabs_similarity_boost,
                    elevenlabs_style=elevenlabs_style,
                )
            else:
                raise ValueError("Must provide either audio_url or custom_text")
            temp_files.append(audio_path)

            actual_duration = await self.reel_generator._get_audio_duration(audio_path)
            if actual_duration:
                duration_seconds = actual_duration
            main_duration = duration_seconds

            if not word_timestamps:
                word_timestamps = await self.reel_generator._get_word_timestamps(audio_path)
                restore_text = custom_text or transcript_text
                if restore_text:
                    word_timestamps = self.reel_generator._restore_punctuation(word_timestamps, restore_text)

            cta_word_timestamps: list[dict] = []
            silence_gap = 0.5

            if closing_statement:
                cta_audio_path = await self.reel_generator._generate_tts_audio(
                    closing_statement,
                    voice=voice,
                    speed=speed,
                    provider=tts_provider,
                    elevenlabs_stability=elevenlabs_stability,
                    elevenlabs_similarity_boost=elevenlabs_similarity_boost,
                    elevenlabs_style=elevenlabs_style,
                )
                temp_files.append(cta_audio_path)

                cta_duration = await self.reel_generator._get_audio_duration(cta_audio_path) or 5.0
                cta_word_timestamps = await self.reel_generator._get_word_timestamps(cta_audio_path)
                cta_word_timestamps = self.reel_generator._restore_punctuation(cta_word_timestamps, closing_statement)

                cta_offset = main_duration + silence_gap
                for word in cta_word_timestamps:
                    word["start"] += cta_offset
                    word["end"] += cta_offset

                combined_path = await self.reel_generator._concatenate_audio(audio_path, cta_audio_path, silence_gap)
                temp_files.append(combined_path)
                audio_path = combined_path
                duration_seconds = main_duration + silence_gap + cta_duration

            overlay_video_path = None
            if overlay_video_url:
                overlay_video_path = await self.reel_generator._download_background_video(overlay_video_url)
                temp_files.append(overlay_video_path)

            if scene_timeline:
                scene_timeline = await self._apply_scene_planner_defaults(
                    script=(custom_text or transcript_text or ""),
                    scene_timeline=scene_timeline,
                )

            scene_specs = await self._build_scene_specs(
                duration_seconds=duration_seconds,
                scene_timeline=scene_timeline,
                anchor_timeline=anchor_timeline,
                background_clip_paths=background_clip_paths,
                background_video_url=background_video_url,
                overlay_video_path=overlay_video_path,
                temp_files=temp_files,
            )

            if not scene_specs:
                scene_specs = [{
                    "id": "scene-1",
                    "start_time_seconds": 0,
                    "end_time_seconds": duration_seconds,
                    "transition": "depth_blur_handoff",
                    "motion_preset": "slow_push",
                    "scene_fx_name": "none",
                    "scene_fx_strength": 0.0,
                    "caption_text": headline or "The Eureka Feed",
                    "asset_type": "solid",
                    "asset_path": None,
                }]

            render_spec = {
                "headline": headline,
                "brand_name": brand_name,
                "audio_path": audio_path,
                "duration_seconds": duration_seconds,
                "main_duration_seconds": main_duration,
                "closing_statement": closing_statement,
                "include_waveform": include_waveform,
                "scenes": scene_specs,
                "word_timestamps": word_timestamps or [],
                "cta_word_timestamps": cta_word_timestamps,
                "overlay_video_path": overlay_video_path,
                "sfx_timeline": self._resolve_sfx_timeline(sfx_timeline),
            }

            spec_fd, spec_path = tempfile.mkstemp(suffix=".json")
            with os.fdopen(spec_fd, "w", encoding="utf-8") as f:
                json.dump(render_spec, f)
            temp_files.append(spec_path)

            out_fd, output_path = tempfile.mkstemp(suffix=".mp4")
            os.close(out_fd)
            temp_files.append(output_path)

            await self._render_with_remotion(spec_path, output_path)

            if episode_id:
                output_filename = f"reels/reel-ep-{episode_id}-premium.mp4"
            elif paper_id:
                output_filename = f"reels/reel-paper-{paper_id}-premium.mp4"
            else:
                output_filename = f"reels/reel-custom-premium-{uuid.uuid4().hex[:8]}.mp4"

            with open(output_path, "rb") as f:
                video_bytes = f.read()

            local_url = self._save_local_render(output_filename, video_bytes)

            public_url = local_url
            if self.storage:
                try:
                    public_url = self.storage.upload_file(
                        file_bytes=video_bytes,
                        filename=output_filename,
                        content_type="video/mp4",
                    )
                except Exception:
                    logger.exception("Premium reel upload failed; returning local static render instead")

            return public_url
        finally:
            for path in temp_files:
                try:
                    os.unlink(path)
                except OSError:
                    pass

    async def _apply_scene_planner_defaults(self, script: str, scene_timeline: list | None) -> list | None:
        if not scene_timeline or not script.strip():
            return scene_timeline

        try:
            from app.services.scene_planner import build_scene_plan

            raw_scenes = [
                scene if isinstance(scene, dict) else scene.model_dump()
                for scene in scene_timeline
            ]
            scene_plan = await build_scene_plan(script, raw_scenes)
            updated = []
            for scene in raw_scenes:
                context = scene_plan.get(str(scene.get("scene_id", "")), {})
                next_scene = dict(scene)
                if next_scene.get("scene_role") is None:
                    next_scene["scene_role"] = context.get("scene_role")
                if next_scene.get("asset_bias") is None:
                    next_scene["asset_bias"] = context.get("asset_bias")
                if next_scene.get("stock_match_rationale") is None:
                    next_scene["stock_match_rationale"] = context.get("stock_match_rationale")
                if next_scene.get("fx_rationale") is None:
                    next_scene["fx_rationale"] = context.get("fx_rationale")
                if next_scene.get("planning_confidence") is None:
                    next_scene["planning_confidence"] = context.get("planning_confidence")
                if next_scene.get("scene_fx_name") is None:
                    next_scene["scene_fx_name"] = context.get("scene_fx_name")
                if next_scene.get("scene_fx_strength") is None:
                    next_scene["scene_fx_strength"] = context.get("scene_fx_strength")
                updated.append(next_scene)
            return updated
        except Exception:
            logger.exception("Failed to apply scene planner defaults before premium render")
            return scene_timeline

    async def _build_scene_specs(
        self,
        duration_seconds: float,
        scene_timeline: list | None,
        anchor_timeline: list | None,
        background_clip_paths: list[str] | None,
        background_video_url: str | None,
        overlay_video_path: str | None,
        temp_files: list[str],
    ) -> list[dict]:
        def get_field(item, key, default=None):
            if isinstance(item, dict):
                return item.get(key, default)
            return getattr(item, key, default)

        if scene_timeline:
            raw_specs = await self.reel_generator._download_scene_assets(scene_timeline)
            for spec in raw_specs:
                if spec.get("is_temp_file") and spec.get("path"):
                    temp_files.append(spec["path"])
            return [self._scene_spec_from_resolved(spec, None, duration_seconds) for spec in raw_specs]

        if anchor_timeline:
            image_paths = await self.reel_generator._download_ai_images([get_field(event, "image_url", "") for event in anchor_timeline])
            for path in image_paths:
                if "static/carousel_images" not in path:
                    temp_files.append(path)

            specs: list[dict] = []
            for idx, event in enumerate(anchor_timeline):
                start_time = float(get_field(event, "start_time_seconds", 0))
                next_start = None
                if idx < len(anchor_timeline) - 1:
                    next_start = float(get_field(anchor_timeline[idx + 1], "start_time_seconds", 0))
                end_time = max(next_start if next_start is not None else duration_seconds, start_time + 0.4)
                effect_name = get_field(event, "effect_transition_name")
                specs.append({
                    "id": f"scene-{idx + 1}",
                    "start_time_seconds": start_time,
                    "end_time_seconds": end_time,
                    "transition": self._normalize_transition(effect_name),
                    "motion_preset": self._normalize_motion(effect_name),
                    "scene_fx_name": "none",
                    "scene_fx_strength": 0.0,
                    "caption_text": f"Scene {idx + 1}",
                    "asset_type": "image",
                    "asset_path": image_paths[idx],
                })
            return specs

        if background_clip_paths:
            n = max(len(background_clip_paths), 1)
            segment = duration_seconds / n
            specs = []
            for idx, clip_path in enumerate(background_clip_paths):
                start_time = idx * segment
                end_time = duration_seconds if idx == n - 1 else (idx + 1) * segment
                specs.append({
                    "id": f"scene-{idx + 1}",
                    "start_time_seconds": start_time,
                    "end_time_seconds": end_time,
                    "transition": "light_sweep_dissolve" if idx > 0 else "hard_cut_blur",
                    "motion_preset": "tracking_drift",
                    "scene_fx_name": "none",
                    "scene_fx_strength": 0.0,
                    "caption_text": "",
                    "asset_type": "video",
                    "asset_path": clip_path,
                })
            return specs

        if background_video_url:
            bg_path = await self.reel_generator._download_background_video(background_video_url)
            temp_files.append(bg_path)
            return [{
                "id": "scene-1",
                "start_time_seconds": 0,
                "end_time_seconds": duration_seconds,
                "transition": "depth_blur_handoff",
                "motion_preset": "tracking_drift",
                "scene_fx_name": "none",
                "scene_fx_strength": 0.0,
                "caption_text": "",
                "asset_type": "video",
                "asset_path": bg_path,
            }]

        if overlay_video_path:
            return [{
                "id": "scene-1",
                "start_time_seconds": 0,
                "end_time_seconds": duration_seconds,
                "transition": "depth_blur_handoff",
                "motion_preset": "tracking_drift",
                "scene_fx_name": "none",
                "scene_fx_strength": 0.0,
                "caption_text": "",
                "asset_type": "solid",
                "asset_path": None,
            }]

        return []

    def _scene_spec_from_resolved(self, spec: dict, default_caption: str | None, duration_seconds: float) -> dict:
        start_time = float(spec.get("start_time_seconds", 0))
        end_time = min(duration_seconds, start_time + float(spec.get("duration", 1.0)))
        asset_type = spec.get("asset_type") or "none"
        path = spec.get("path")
        if asset_type.endswith("video"):
            normalized_asset_type = "video"
        elif asset_type == "none" or not path:
            normalized_asset_type = "solid"
        else:
            normalized_asset_type = "image"

        effect_name = spec.get("effect_transition_name")
        explicit_caption = spec.get("caption_text")
        scene_fx_name = self._normalize_scene_fx_name(spec.get("scene_fx_name"))
        return {
            "id": spec.get("scene_id", f"scene-{int(start_time)}"),
            "start_time_seconds": start_time,
            "end_time_seconds": max(end_time, start_time + 0.4),
            "transition": self._normalize_transition(effect_name),
            "motion_preset": self._normalize_motion(effect_name),
            "scene_fx_name": scene_fx_name,
            "scene_fx_strength": self._normalize_scene_fx_strength(scene_fx_name, spec.get("scene_fx_strength")),
            "caption_text": (
                explicit_caption
                if explicit_caption is not None
                else (default_caption or spec.get("anchor_word", ""))
            ),
            "asset_type": normalized_asset_type,
            "asset_path": path,
        }

    def _normalize_transition(self, effect_name: str | None) -> str:
        if effect_name in PREMIUM_TRANSITIONS:
            return effect_name
        mapping = {
            "LinearBlur": "hard_cut_blur",
            "directionalwarp": "masked_push",
            "displacement": "masked_push",
            "CrossZoom": "scale_through_zoom",
            "Dreamy": "light_sweep_dissolve",
            "fadecolor": "light_sweep_dissolve",
            "Burn": "film_burn_edge",
            "SimpleZoom": "scale_through_zoom",
            "GlitchMemories": "ghost_trail_crossfade",
            "luminance_melt": "glass_warp",
            "squeeze": "split_panel_wipe",
        }
        return mapping.get(effect_name or "", "depth_blur_handoff")

    def _normalize_motion(self, effect_name: str | None) -> str:
        if effect_name == "hard_cut_blur":
            return "micro_jolt"
        if effect_name == "masked_push":
            return "parallax_rise"
        if effect_name == "light_sweep_dissolve":
            return "tracking_drift"
        if effect_name == "scale_through_zoom":
            return "hero_push"
        if effect_name == "depth_blur_handoff":
            return "slow_push"
        if effect_name == "vertical_reveal":
            return "parallax_rise"
        if effect_name == "horizontal_reveal":
            return "tracking_drift"
        if effect_name == "soft_flash_cut":
            return "micro_jolt"
        if effect_name == "glass_warp":
            return "tracking_drift"
        if effect_name == "radial_focus_pull":
            return "hero_push"
        if effect_name == "split_panel_wipe":
            return "parallax_rise"
        if effect_name == "film_burn_edge":
            return "tracking_drift"
        if effect_name == "depth_parallax_snap":
            return "parallax_rise"
        if effect_name == "ghost_trail_crossfade":
            return "slow_push"
        if effect_name == "iris_close_open":
            return "hero_push"
        mapping = {
            "LinearBlur": "micro_jolt",
            "directionalwarp": "parallax_rise",
            "displacement": "parallax_rise",
            "CrossZoom": "hero_push",
            "SimpleZoom": "hero_push",
            "Dreamy": "tracking_drift",
            "Burn": "tracking_drift",
            "GlitchMemories": "slow_push",
            "luminance_melt": "tracking_drift",
            "squeeze": "parallax_rise",
        }
        return mapping.get(effect_name or "", "slow_push")

    def _normalize_scene_fx_name(self, fx_name: str | None) -> str:
        normalized = normalize_scene_fx_name(fx_name)
        if normalized in PREMIUM_SCENE_FX:
            return normalized
        return "none"

    def _normalize_scene_fx_strength(self, fx_name: str | None, value: float | None) -> float:
        if fx_name in {None, "", "none"}:
            return 0.0
        return normalize_scene_fx_strength(value)

    def _resolve_sfx_timeline(self, sfx_timeline: list | None) -> list[dict]:
        if not sfx_timeline:
            return []

        renderer_dir = Path(
            settings.PREMIUM_REEL_RENDERER_DIR
            or (Path(__file__).resolve().parents[2] / "premium_renderer")
        )
        sfx_dir = renderer_dir / "public" / "sfx"
        if not sfx_dir.exists():
            return []

        available_files = [item for item in sfx_dir.iterdir() if item.is_file()]
        resolved: list[dict] = []

        def get_field(item, key, default=None):
            if isinstance(item, dict):
                return item.get(key, default)
            return getattr(item, key, default)

        for idx, cue in enumerate(sfx_timeline):
            sound_id = str(get_field(cue, "sound_id", "") or "").strip()
            if not sound_id:
                continue
            match = next(
                (
                    asset for asset in available_files
                    if asset.stem == sound_id or asset.name == sound_id
                ),
                None,
            )
            if not match:
                logger.warning(f"Skipping unresolved premium SFX cue: {sound_id}")
                continue

            start_time_seconds = float(get_field(cue, "start_time_seconds", 0) or 0)
            volume = float(get_field(cue, "volume", 0.45) or 0.45)
            resolved.append({
                "id": str(get_field(cue, "id", f"sfx-{idx + 1}") or f"sfx-{idx + 1}"),
                "sound_id": sound_id,
                "asset_path": str(match),
                "start_time_seconds": max(0.0, start_time_seconds),
                "volume": min(max(volume, 0.0), 1.0),
            })

        return sorted(resolved, key=lambda cue: cue["start_time_seconds"])

    async def _render_with_remotion(self, spec_path: str, output_path: str) -> None:
        renderer_dir = Path(
            settings.PREMIUM_REEL_RENDERER_DIR
            or (Path(__file__).resolve().parents[2] / "premium_renderer")
        )
        script_path = renderer_dir / "render.mjs"
        if not script_path.exists():
            raise RuntimeError(f"Premium renderer entrypoint not found: {script_path}")

        cmd = [
            settings.NODE_BINARY,
            str(script_path),
            spec_path,
            output_path,
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(renderer_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            error_output = stderr.decode(errors="ignore")[-1600:] or stdout.decode(errors="ignore")[-1600:]
            raise RuntimeError(
                "Premium Remotion render failed. Install renderer dependencies in backend/premium_renderer "
                f"and verify `{settings.NODE_BINARY}` is available. Details: {error_output}"
            )
        logger.info(f"Premium reel rendered successfully: {output_path}")
