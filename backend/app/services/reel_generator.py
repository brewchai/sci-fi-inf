"""
Reel generator service.

Creates a 1080x1920 (9:16) vertical Instagram Reel from podcast audio:
  - Dark background (#0a0a0f)
  - Animated audio waveform (gold accent, middle band)
  - Brand header with zoom-in headline (top)
  - Word-by-word captions synced via Whisper timestamps (bottom)
  - CTA outro slide-in
  - Audio with fade-out

Output: An MP4 uploaded to Supabase Storage.
"""
import asyncio
import io
import os
import tempfile
from pathlib import Path

import httpx
from loguru import logger
from openai import AsyncOpenAI

from app.core.config import settings
from app.services.storage import StorageService
from app.services.tts import TTSGenerator


# Video specs — vertical reel
WIDTH = 1080
HEIGHT = 1920
FPS = 30

# Styling
BG_COLOR = "0a0a0f"
ACCENT_COLOR = "d4a853"  # Brand gold
GOLD_ABGR = "0053A8D4"   # #d4a853 in &HAABBGGRR

# Defaults
DEFAULT_REEL_DURATION = 30
CAPTION_MARGIN_BOTTOM = HEIGHT - int(HEIGHT * 0.70)


class ReelGenerator:
    """Generates vertical waveform reels for Instagram."""

    def __init__(self):
        self.storage = StorageService()
        self.openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def generate(
        self,
        episode_id: int | None = None,
        paper_id: int | None = None,
        audio_url: str | None = None,
        headline: str = "",
        brand_name: str = "THE EUREKA FEED",
        start_seconds: float = 0,
        duration_seconds: float = DEFAULT_REEL_DURATION,
        custom_text: str | None = None,
        transcript_text: str | None = None,
        closing_statement: str | None = None,
        background_video_url: str | None = None,
        overlay_video_url: str | None = None,
        background_clip_paths: list[str] | None = None,
        anchor_timeline: list | None = None,
        word_timestamps: list[dict] | None = None,
        voice: str = "nova",
        speed: float = 1.0,
        elevenlabs_stability: float = 0.3,
        elevenlabs_similarity_boost: float = 0.75,
        elevenlabs_style: float = 0.4,
        tts_provider: str = "openai",
        include_waveform: bool = True,
    ) -> str:
        """
        Generate a vertical reel video.

        Returns:
            Public URL of the uploaded video.
        """
        temp_files = []

        try:
            # 1. Get main audio
            if audio_url:
                audio_path = await self._download_audio_clip(
                    audio_url, start_seconds, duration_seconds
                )
            elif custom_text:
                audio_path = await self._generate_tts_audio(
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

            # 2. Get actual audio duration
            actual_duration = await self._get_audio_duration(audio_path)
            if actual_duration:
                duration_seconds = actual_duration
            main_duration = duration_seconds

            # 3. Get word-level timestamps from Whisper
            if not word_timestamps:
                word_timestamps = await self._get_word_timestamps(audio_path)
                restore_text = custom_text or transcript_text
                if restore_text:
                    word_timestamps = self._restore_punctuation(word_timestamps, restore_text)

            # 4. Handle closing statement (CTA)
            cta_duration = 0.0
            cta_word_timestamps = []
            silence_gap = 0.5

            if closing_statement:
                # Generate CTA TTS audio
                cta_audio_path = await self._generate_tts_audio(
                    closing_statement,
                    voice=voice,
                    speed=speed,
                    provider=tts_provider,
                    elevenlabs_stability=elevenlabs_stability,
                    elevenlabs_similarity_boost=elevenlabs_similarity_boost,
                    elevenlabs_style=elevenlabs_style,
                )
                temp_files.append(cta_audio_path)

                cta_duration_raw = await self._get_audio_duration(cta_audio_path) or 5.0
                cta_duration = cta_duration_raw

                # Get word timestamps for CTA
                cta_word_timestamps = await self._get_word_timestamps(cta_audio_path)
                cta_word_timestamps = self._restore_punctuation(cta_word_timestamps, closing_statement)

                # Offset CTA timestamps to start after main audio + silence gap
                cta_offset = main_duration + silence_gap
                for w in cta_word_timestamps:
                    w["start"] += cta_offset
                    w["end"] += cta_offset

                # Concatenate: main audio + 0.5s silence + CTA audio
                combined_path = await self._concatenate_audio(
                    audio_path, cta_audio_path, silence_gap
                )
                temp_files.append(combined_path)
                audio_path = combined_path

            # Total duration
            total_duration = main_duration + (silence_gap + cta_duration if closing_statement else 0)

            # 5. Generate ASS subtitle file
            ass_content = self._generate_ass(
                headline=headline,
                brand_name=brand_name,
                word_timestamps=word_timestamps,
                duration=total_duration,
                main_duration=main_duration,
                cta_word_timestamps=cta_word_timestamps,
                closing_statement=closing_statement,
            )
            ass_fd, ass_path = tempfile.mkstemp(suffix='.ass')
            with os.fdopen(ass_fd, 'w', encoding='utf-8') as f:
                f.write(ass_content)
            temp_files.append(ass_path)

            # 5b. Resolve background source: multi-clip, single video URL, or solid color
            bg_video_path = None
            multi_clip_paths: list[str] = []

            if background_clip_paths and len(background_clip_paths) > 0:
                multi_clip_paths = background_clip_paths
            elif background_video_url:
                bg_video_path = await self._download_background_video(background_video_url)
                temp_files.append(bg_video_path)

            overlay_video_path = None
            if overlay_video_url:
                overlay_video_path = await self._download_background_video(overlay_video_url)
                temp_files.append(overlay_video_path)

            anchor_timeline_events = anchor_timeline or []
            if anchor_timeline_events:
                effect_debug = []
                for idx, ev in enumerate(anchor_timeline_events):
                    effect_name = self._get_timeline_effect(anchor_timeline_events, idx) or "None"
                    start_ts = getattr(ev, "start_time_seconds", None)
                    if start_ts is None and isinstance(ev, dict):
                        start_ts = ev.get("start_time_seconds")
                    effect_debug.append(f"{idx}:{start_ts}s->{effect_name}")
                logger.info(f"Anchor timeline received ({len(anchor_timeline_events)} events): {' | '.join(effect_debug)}")
            
            ai_image_paths: list[str] = []
            if anchor_timeline_events:
                ai_image_paths = await self._download_ai_images([ev.image_url for ev in anchor_timeline_events])
                logger.info(f"AI image timeline mode active: downloaded {len(ai_image_paths)} images")
                
            for p in ai_image_paths:
                if "static/carousel_images" not in p:
                    temp_files.append(p)

            # 6. Build FFmpeg command
            if episode_id:
                output_filename = f"reels/reel-ep-{episode_id}.mp4"
            elif paper_id:
                output_filename = f"reels/reel-paper-{paper_id}.mp4"
            else:
                import uuid as _uuid
                output_filename = f"reels/reel-custom-{_uuid.uuid4().hex[:8]}.mp4"
                
            out_fd, output_path = tempfile.mkstemp(suffix='.mp4')
            os.close(out_fd)
            temp_files.append(output_path)

            ass_escaped = ass_path.replace(":", "\\:")

            waveform_h = 300
            waveform_y = (HEIGHT // 2) - (waveform_h // 2) + 50
            margin_x = 60

            if ai_image_paths and len(ai_image_paths) > 0:
                filter_complex, extra_inputs = self._build_ai_images_filter(
                    ai_image_paths, total_duration, ass_escaped,
                    waveform_h, waveform_y, margin_x, anchor_timeline_events, include_waveform
                )
            elif multi_clip_paths and len(multi_clip_paths) >= 2:
                filter_complex, extra_inputs = self._build_multi_clip_filter(
                    multi_clip_paths, total_duration, ass_escaped,
                    waveform_h, waveform_y, margin_x, overlay_video_path, include_waveform
                )
            elif multi_clip_paths and len(multi_clip_paths) == 1:
                bg_video_path = multi_clip_paths[0]
                filter_complex, extra_inputs = self._build_single_bg_filter(
                    total_duration, ass_escaped,
                    waveform_h, waveform_y, margin_x, overlay_video_path, include_waveform
                ), []
            elif bg_video_path:
                filter_complex, extra_inputs = self._build_single_bg_filter(
                    total_duration, ass_escaped,
                    waveform_h, waveform_y, margin_x, overlay_video_path, include_waveform
                ), []
            else:
                base_bg = f"color=c=#{BG_COLOR}:s={WIDTH}x{HEIGHT}:r={FPS}:d={total_duration}[bg];"
                if overlay_video_path:
                    # Black background removal via colorkey and overlay
                    base_bg += (
                        f"[2:v]loop=-1:size=32767:start=0,setpts=N/({FPS}*TB),"
                        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
                        f"crop={WIDTH}:{HEIGHT},"
                        f"trim=duration={total_duration},setpts=PTS-STARTPTS,"
                        f"colorkey=0x000000:0.1:0.1[ovl];"
                        f"[bg][ovl]overlay=0:0[bg_ovl];"
                    )
                    bg_out = "bg_ovl"
                else:
                    bg_out = "bg"

                filter_complex = base_bg + self._build_overlay_chain(
                    bg_out, ass_escaped, waveform_h, waveform_y, margin_x, include_waveform
                )
                extra_inputs = []

            # Removed fade to keep audio sharp until the end
            audio_filter = "anull"

            cmd = [
                "ffmpeg", "-y",
                "-i", str(audio_path),
            ]
            
            if ai_image_paths and len(ai_image_paths) > 0:
                for cp in ai_image_paths:
                    cmd.extend(["-i", cp])
            elif multi_clip_paths and len(multi_clip_paths) >= 2:
                for cp in multi_clip_paths:
                    cmd.extend(["-i", cp])
            elif bg_video_path:
                cmd.extend(["-i", bg_video_path])
            
            if overlay_video_path:
                cmd.extend(["-i", overlay_video_path])
                
            cmd.extend([
                "-t", str(total_duration),
                "-filter_complex", filter_complex,
                "-af", audio_filter,
                "-map", "[out]",
                "-map", "0:a",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-r", str(FPS),
                "-pix_fmt", "yuv420p",
                "-shortest",
                "-movflags", "+faststart",
                output_path,
            ])

            logger.info(f"🎬 Generating reel for {output_filename} ({total_duration:.1f}s)")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode()[-1500:] if stderr else "Unknown error"
                logger.error(f"FFmpeg failed: {error_msg}")
                raise RuntimeError(f"FFmpeg failed: {error_msg}")

            # Upload to Supabase
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            try:
                public_url = self.storage.upload_audio(
                    file_bytes=video_bytes,
                    filename=output_filename,
                    content_type="video/mp4",
                )
            except Exception:
                self.storage.delete_audio(output_filename)
                public_url = self.storage.upload_audio(
                    file_bytes=video_bytes,
                    filename=output_filename,
                    content_type="video/mp4",
                )

            logger.info(f"✅ Reel uploaded: {public_url}")
            return public_url

        finally:
            for p in temp_files:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    # -------------------------------------------------------------------------
    # Multi-clip background helpers
    # -------------------------------------------------------------------------

    def _build_single_bg_filter(
        self,
        total_duration: float,
        ass_escaped: str,
        waveform_h: int,
        waveform_y: int,
        margin_x: int,
        overlay_video_path: str | None = None,
        include_waveform: bool = True,
    ) -> str:
        """Build FFmpeg filter_complex for a single looped background video."""
        
        # Determine the input index for overlay video
        # In this flow, inputs are: [0]=Audio, [1]=BgVideo. 
        # So overlay video will be at index [2].
        ovl_idx = 2
        
        bg_part = (
            f"[1:v]loop=-1:size=32767:start=0,setpts=N/({FPS}*TB),"
            f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
            f"crop={WIDTH}:{HEIGHT},"
            f"trim=duration={total_duration},setpts=PTS-STARTPTS,"
            f"eq=brightness=-0.15:saturation=0.6[bg_base]"
        )
        
        if overlay_video_path:
            bg_part += (
                f";[{ovl_idx}:v]loop=-1:size=32767:start=0,setpts=N/({FPS}*TB),"
                f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={WIDTH}:{HEIGHT},"
                f"trim=duration={total_duration},setpts=PTS-STARTPTS,"
                f"colorkey=0x000000:0.1:0.1[ovl];"
                f"[bg_base][ovl]overlay=0:0[bg]"
            )
        else:
            bg_part += ";[bg_base]copy[bg]"

        return f"{bg_part};{self._build_overlay_chain('bg', ass_escaped, waveform_h, waveform_y, margin_x, include_waveform)}"

    def _build_multi_clip_filter(
        self,
        clip_paths: list[str],
        total_duration: float,
        ass_escaped: str,
        waveform_h: int,
        waveform_y: int,
        margin_x: int,
        overlay_video_path: str | None = None,
        include_waveform: bool = True,
    ) -> tuple[str, list[str]]:
        """
        Build FFmpeg filter_complex that stitches multiple clips with crossfade
        transitions, then overlays waveform + ASS.

        Returns (filter_complex_str, extra_input_paths).
        FFmpeg inputs: [0] = audio, [1..N] = video clips.
        """
        n = len(clip_paths)
        xfade_dur = 0.5
        segment_dur = total_duration / n + xfade_dur * (n - 1) / n
        segment_dur = max(segment_dur, 2.0)

        parts = []

        # Prepare each clip: scale, crop, trim, darken
        for i in range(n):
            inp_idx = i + 1  # [0] is audio
            parts.append(
                f"[{inp_idx}:v]setpts=PTS-STARTPTS,"
                f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={WIDTH}:{HEIGHT},"
                f"trim=duration={segment_dur:.2f},setpts=PTS-STARTPTS,"
                f"eq=brightness=-0.15:saturation=0.6,"
                f"fps={FPS}[c{i}]"
            )

        # Chain xfade transitions
        if n == 1:
            parts.append(f"[c0]null[bg]")
        else:
            prev = "c0"
            offset = segment_dur - xfade_dur
            for i in range(1, n):
                out_label = "bg" if i == n - 1 else f"x{i}"
                parts.append(
                    f"[{prev}][c{i}]xfade=transition=fade:duration={xfade_dur}:offset={offset:.2f}[{out_label}]"
                )
                prev = out_label
                if i < n - 1:
                    offset += segment_dur - xfade_dur

        bg_out = "bg"
        if overlay_video_path:
            # For multi-clip, the next available input index is n + 1 (since audio is 0, video clips are 1..n)
            ovl_idx = n + 1
            parts.append(
                f"[{ovl_idx}:v]loop=-1:size=32767:start=0,setpts=N/({FPS}*TB),"
                f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={WIDTH}:{HEIGHT},"
                f"trim=duration={total_duration},setpts=PTS-STARTPTS,"
                f"colorkey=0x000000:0.1:0.1[ovl]"
            )
            parts.append(f"[bg][ovl]overlay=0:0[bg_ovl]")
            bg_out = "bg_ovl"

        # Waveform overlay + ASS
        parts.append(self._build_overlay_chain(bg_out, ass_escaped, waveform_h, waveform_y, margin_x, include_waveform, with_semicolons=False))

        filter_complex = ";\n".join(parts)
        return filter_complex, clip_paths

    def _build_ai_images_filter(
        self,
        image_paths: list[str],
        total_duration: float,
        ass_escaped: str,
        waveform_h: int,
        waveform_y: int,
        margin_x: int,
        anchor_timeline_events: list | None = None,
        include_waveform: bool = True,
    ) -> tuple[str, list[str]]:
        """
        Build FFmpeg filter_complex for sequence of AI images.
        Hook images (first 3): Graphic shock effects — shake, slam-zoom, strobe glitch.
        Body images (rest): Smooth cinematic Ken Burns.
        Inputs: [0]=Audio, [1..N]=Images
        """
        import random
        parts = []
        n = len(image_paths)
        hook_xfade_dur = 0.05   # Near-instant hard cut between hook frames
        body_xfade_dur = 0.2    # Smooth crossfade for body frames
        
        # Build individual clips
        for i in range(n):
            # Determine if this clip is part of the fast-paced "hook" (first ~2.5 seconds)
            is_hook = False
            if anchor_timeline_events:
                is_hook = anchor_timeline_events[i].start_time_seconds <= 2.5
            else:
                is_hook = i < 2

            inp_idx = i + 1
            xfade_dur = hook_xfade_dur if is_hook else body_xfade_dur
            
            # Duration logic
            if anchor_timeline_events:
                # Calculate exact duration bounded by the next event's start time
                if i == 0:
                    # First clip always starts at stream time 0
                    if n > 1:
                        next_start = anchor_timeline_events[i+1].start_time_seconds
                        dur = next_start + xfade_dur
                    else:
                        dur = total_duration
                else:
                    current_start = anchor_timeline_events[i].start_time_seconds
                    if i < n - 1:
                        next_start = anchor_timeline_events[i+1].start_time_seconds
                        dur = next_start - current_start
                    else: # Final image plays until the end of the video
                        dur = total_duration - current_start
            else:
                if i < 3:
                    dur = 0.5
                else:
                    dur = 2.0
            
            # Make sure last frame holds until total_duration if needed (fallback for non-timeline flow)
            if not anchor_timeline_events and i == n - 1:
                time_so_far = sum(0.5 for j in range(min(3, i))) + sum(2.0 for j in range(3, i))
                dur = max(dur, total_duration - time_so_far + xfade_dur)
            
            # Apply padding for xfade
            if i > 0 and i < n - 1:
                dur += xfade_dur
            elif i == n - 1 and n > 1:
                dur += xfade_dur
            
            frames_to_zoom = int((dur + 2.0) * FPS)
            selected_effect = self._get_timeline_effect(anchor_timeline_events, i)
            
            if is_hook:
                # ─── HOOK: Graphic shock & fast cinematic effects ────────────────────
                effect_type = self._map_transition_to_hook_effect(selected_effect) or random.choice(
                    ["slam_zoom_in", "slam_zoom_out", "shake", "strobe", "fast_pan_left", "fast_pan_right"]
                )
                
                if effect_type == "slam_zoom_in":
                    # Rapid punch-in
                    motion = "z='min(zoom+0.05,1.8)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1"
                    eq_filter = "eq=brightness='0.35*exp(-6*t)':saturation=1.4:contrast=1.2"
                elif effect_type == "slam_zoom_out":
                    # Start punched in, rapidly zoom out to 1.0
                    motion = "z='max(1.5 - 0.5*time, 1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1"
                    eq_filter = "eq=brightness='0.35*exp(-6*t)':saturation=1.4:contrast=1.2"
                elif effect_type == "shake":
                    # Camera shake: implemented via zoompan for matching timebase.
                    motion = f"z='1.05':x='iw/2-(iw/zoom/2)+15*sin(time*25)':y='ih/2-(ih/zoom/2)+15*cos(time*17)':d=1"
                    eq_filter = "eq=brightness='0.15*exp(-5*t)':saturation=1.2:contrast=1.1"
                elif effect_type == "fast_pan_left":
                    # Start tight right, rip left
                    motion = "z='1.2':x='max(0, (iw-iw/zoom) - 500*time)':y='ih/2-(ih/zoom/2)':d=1"
                    eq_filter = "eq=brightness='0.2*exp(-4*t)':saturation=1.3:contrast=1.1"
                elif effect_type == "fast_pan_right":
                    # Start tight left, rip right
                    motion = "z='1.2':x='min(iw-iw/zoom, 500*time)':y='ih/2-(ih/zoom/2)':d=1"
                    eq_filter = "eq=brightness='0.2*exp(-4*t)':saturation=1.3:contrast=1.1"
                else:  # strobe
                    motion = "z='min(zoom+0.03,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1"
                    eq_filter = "eq=brightness='0.4*sin(t*38)':saturation=1.6:contrast=1.5"
                    
                parts.append(
                    f"[{inp_idx}:v]loop=-1:size=1:start=0,setpts=N/({FPS}*TB),"
                    f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},"
                    f"zoompan={motion}:s={WIDTH}x{HEIGHT}:fps={FPS}:d={frames_to_zoom},"
                    f"trim=duration={dur:.2f},setpts=PTS-STARTPTS,"
                    f"{eq_filter},"
                    f"format=yuv420p[c{i}]"
                )
            else:
                # ─── BODY: Smooth cinematic Ken Burns ──────────────────────────────
                motions = [
                    "z='min(max(zoom,1.2)+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1",  # zoom in center
                    "z='1.2':x='max(0,x-0.5)':y='ih/2-(ih/zoom/2)':d=1",   # pan left
                    "z='1.2':x='min(iw-iw/zoom,x+0.5)':y='ih/2-(ih/zoom/2)':d=1",  # pan right
                    "z='1.2':x='iw/2-(iw/zoom/2)':y='max(0,y-0.5)':d=1",   # pan up
                    "z='1.2':x='iw/2-(iw/zoom/2)':y='min(ih-ih/zoom,y+0.5)':d=1",  # pan down
                ]
                mapped_motion = self._map_transition_to_body_motion(selected_effect)
                motion = mapped_motion if mapped_motion else random.choice(motions)
                eq_filter = "eq=brightness=-0.1:saturation=1.1"
                
                parts.append(
                    f"[{inp_idx}:v]loop=-1:size=1:start=0,setpts=N/({FPS}*TB),"
                    f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},"
                    f"zoompan={motion}:s={WIDTH}x{HEIGHT}:fps={FPS}:d={frames_to_zoom},"
                    f"trim=duration={dur:.2f},setpts=PTS-STARTPTS,"
                    f"{eq_filter},"
                    f"format=yuv420p[c{i}]"
                )
        
        # Chain transitions: near-instant cut for hook, smooth xfade for body
        if n == 1:
            parts.append(f"[c0]null[bg]")
        else:
            prev = "c0"
            for i in range(1, n):
                is_hook = False
                if anchor_timeline_events:
                    is_hook = anchor_timeline_events[i].start_time_seconds <= 2.5
                else:
                    is_hook = i < 2
                    
                xfade_dur = hook_xfade_dur if is_hook else body_xfade_dur
                selected_effect = self._get_timeline_effect(anchor_timeline_events, i)
                transition = self._map_transition_to_xfade(selected_effect, is_hook)
                
                if anchor_timeline_events:
                    offset = anchor_timeline_events[i].start_time_seconds - xfade_dur
                else:
                    if i == 1:
                        current_time = 0.5
                    elif i == 2:
                        current_time = 1.0
                    elif i == 3:
                        current_time = 1.5
                    else:
                        current_time = 1.5 + (i - 3) * 2.0
                    offset = current_time - xfade_dur
                
                # Prevent negative offsets causing filter graph crashes
                offset = max(0.01, offset)
                
                out_label = "bg" if i == n - 1 else f"x{i}"
                parts.append(
                    f"[{prev}][c{i}]xfade=transition={transition}:duration={xfade_dur}:offset={offset:.2f}[{out_label}]"
                )
                prev = out_label
                
        # Waveform + ASS
        parts.append(self._build_overlay_chain("bg", ass_escaped, waveform_h, waveform_y, margin_x, include_waveform, with_semicolons=False))
        
        return ";\n".join(parts), image_paths

    def _build_overlay_chain(
        self,
        bg_label: str,
        ass_escaped: str,
        waveform_h: int,
        waveform_y: int,
        margin_x: int,
        include_waveform: bool,
        with_semicolons: bool = True,
    ) -> str:
        if not include_waveform:
            chain = f"[{bg_label}]ass={ass_escaped}[out]"
            return chain if not with_semicolons else chain

        parts = [
            f"[0:a]showwaves=s={WIDTH - margin_x * 2}x{waveform_h}:mode=p2p:rate={FPS}:colors=#{ACCENT_COLOR}:scale=sqrt:draw=full[wave_raw]",
            f"[wave_raw]pad={WIDTH}:{HEIGHT}:{margin_x}:{waveform_y}:color=#{BG_COLOR}@0.0[wave]",
            f"[{bg_label}][wave]overlay=0:0:format=auto[with_wave]",
            f"[with_wave]ass={ass_escaped}[out]",
        ]
        separator = ";\n" if not with_semicolons else ";"
        return separator.join(parts)

    def _get_timeline_effect(self, anchor_timeline_events: list | None, idx: int) -> str | None:
        if not anchor_timeline_events or idx >= len(anchor_timeline_events):
            return None
        event = anchor_timeline_events[idx]
        if hasattr(event, "effect_transition_name"):
            return getattr(event, "effect_transition_name")
        if isinstance(event, dict):
            return event.get("effect_transition_name")
        return None

    def _map_transition_to_hook_effect(self, effect_name: str | None) -> str | None:
        mapping = {
            "displacement": "shake",
            "SimpleZoom": "slam_zoom_in",
            "LinearBlur": "fast_pan_left",
            "GlitchMemories": "strobe",
            "luminance_melt": "slam_zoom_out",
            "directionalwarp": "fast_pan_right",
            "CrossZoom": "slam_zoom_out",
            "Dreamy": "slam_zoom_out",
            "undulatingBurnOut": "shake",
            "Burn": "strobe",
            "colorphase": "slam_zoom_in",
            "fadecolor": "slam_zoom_out",
            "squeeze": "slam_zoom_in",
        }
        return mapping.get(effect_name or "")

    def _map_transition_to_body_motion(self, effect_name: str | None) -> str | None:
        mapping = {
            "displacement": "z='1.15':x='iw/2-(iw/zoom/2)+8*sin(time*8)':y='ih/2-(ih/zoom/2)+8*cos(time*6)':d=1",
            "SimpleZoom": "z='min(max(zoom,1.2)+0.002,1.55)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1",
            "LinearBlur": "z='1.2':x='max(0,x-1.0)':y='ih/2-(ih/zoom/2)':d=1",
            "GlitchMemories": "z='1.22':x='iw/2-(iw/zoom/2)+4*sin(time*18)':y='ih/2-(ih/zoom/2)':d=1",
            "luminance_melt": "z='1.15':x='iw/2-(iw/zoom/2)':y='min(ih-ih/zoom,y+0.4)':d=1",
            "directionalwarp": "z='1.2':x='min(iw-iw/zoom,x+1.0)':y='ih/2-(ih/zoom/2)':d=1",
            "CrossZoom": "z='min(max(zoom,1.25)+0.0025,1.6)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1",
            "Dreamy": "z='1.18':x='iw/2-(iw/zoom/2)':y='max(0,y-0.3)':d=1",
            "undulatingBurnOut": "z='1.2':x='iw/2-(iw/zoom/2)+6*sin(time*10)':y='ih/2-(ih/zoom/2)+6*cos(time*8)':d=1",
            "Burn": "z='1.25':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1",
            "colorphase": "z='1.2':x='iw/2-(iw/zoom/2)':y='max(0,y-0.5)':d=1",
            "fadecolor": "z='1.2':x='min(iw-iw/zoom,x+0.5)':y='ih/2-(ih/zoom/2)':d=1",
            "squeeze": "z='min(max(zoom,1.25)+0.002,1.6)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1",
        }
        return mapping.get(effect_name or "")

    def _map_transition_to_xfade(self, effect_name: str | None, is_hook: bool) -> str:
        mapping = {
            "displacement": "dissolve",
            "SimpleZoom": "fade",
            "LinearBlur": "slideleft",
            "GlitchMemories": "fadeblack",
            "luminance_melt": "dissolve",
            "directionalwarp": "slideright",
            "CrossZoom": "fade",
            "Dreamy": "dissolve",
            "undulatingBurnOut": "fadeblack",
            "Burn": "fadewhite",
            "colorphase": "dissolve",
            "fadecolor": "fade",
            "squeeze": "fade",
        }
        if is_hook:
            hook_mapping = {
                "LinearBlur": "slideleft",
                "directionalwarp": "slideright",
                "Burn": "fadewhite",
                "GlitchMemories": "fadeblack",
                "displacement": "dissolve",
                "colorphase": "dissolve",
            }
            return hook_mapping.get(effect_name or "", "fadeblack")
        return mapping.get(effect_name or "", "fade")

    # -------------------------------------------------------------------------
    # Whisper word timestamps
    # -------------------------------------------------------------------------

    async def _get_word_timestamps(self, audio_path: str) -> list[dict]:
        """Get word-level timestamps from Whisper API."""
        logger.info("Getting word-level timestamps from Whisper...")

        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        response = await self.openai.audio.transcriptions.create(
            model="whisper-1",
            file=("audio.mp3", audio_bytes, "audio/mpeg"),
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

        words = response.words if hasattr(response, 'words') and response.words else []
        logger.info(f"Whisper returned {len(words)} word timestamps")
        return [{"word": w.word, "start": w.start, "end": w.end} for w in words]

    def _restore_punctuation(self, word_timestamps: list[dict], original_text: str) -> list[dict]:
        """
        Restore punctuation by mapping Whisper words back to the original text.
        Handles Whisper splitting compound words (e.g. 'theeurekafeed.com' -> multiple tokens).
        """
        import re
        
        original_tokens = re.findall(r'\S+', original_text)
        
        timed_words = []
        token_idx = 0
        # Track how much of the current original token we've consumed
        consumed_chars = ""
        
        for w_data in word_timestamps:
            whisper_word = w_data["word"].strip()
            whisper_word_clean = re.sub(r'[^\w]', '', whisper_word).lower()
            
            if not whisper_word_clean:
                timed_words.append(w_data)
                continue

            found = False
            
            # If we're mid-way through consuming a split token, keep going
            if consumed_chars and token_idx > 0:
                orig_token = original_tokens[token_idx - 1]
                orig_clean = re.sub(r'[^\w]', '', orig_token).lower()
                new_consumed = consumed_chars + whisper_word_clean
                
                if orig_clean.startswith(new_consumed):
                    # Still consuming this token
                    consumed_chars = new_consumed
                    timed_words.append(w_data)  # Use whisper word as-is
                    if new_consumed == orig_clean:
                        # Finished consuming — apply original token's trailing punct
                        # to the last word
                        trailing = re.search(r'[\W]+$', orig_token)
                        if trailing and timed_words:
                            timed_words[-1]["word"] = whisper_word + trailing.group()
                        consumed_chars = ""
                    found = True
                else:
                    consumed_chars = ""  # Mismatch, reset
            
            if not found:
                # Try exact match in upcoming original tokens
                for i in range(token_idx, min(token_idx + 15, len(original_tokens))):
                    orig_token = original_tokens[i]
                    orig_clean = re.sub(r'[^\w]', '', orig_token).lower()
                    
                    if whisper_word_clean == orig_clean:
                        # Exact match — use original (with punctuation)
                        timed_words.append({
                            "word": orig_token,
                            "start": w_data["start"],
                            "end": w_data["end"]
                        })
                        token_idx = i + 1
                        consumed_chars = ""
                        found = True
                        break
                    elif orig_clean.startswith(whisper_word_clean) and len(orig_clean) > len(whisper_word_clean):
                        # Whisper split a compound token — start consuming
                        consumed_chars = whisper_word_clean
                        timed_words.append(w_data)  # Use whisper word as-is for now
                        token_idx = i + 1
                        found = True
                        break
            
            if not found:
                timed_words.append(w_data)
                
        return timed_words

    # -------------------------------------------------------------------------
    # ASS subtitle generation with transitions
    # -------------------------------------------------------------------------

    def _generate_ass(
        self,
        headline: str,
        brand_name: str,
        word_timestamps: list[dict],
        duration: float,
        main_duration: float | None = None,
        cta_word_timestamps: list[dict] | None = None,
        closing_statement: str | None = None,
    ) -> str:
        """Generate ASS subtitles with animated transitions for the reel."""

        # Build word-by-word caption dialogues
        caption_dialogues = self._build_caption_dialogues(word_timestamps, duration)

        return f"""[Script Info]
Title: Eureka Feed Reel
ScriptType: v4.00+
WrapStyle: 0
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Avenir Next,120,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,1,0,1,3,2,2,60,60,{CAPTION_MARGIN_BOTTOM},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{caption_dialogues}"""

    def _build_caption_dialogues(self, word_timestamps: list[dict], duration: float) -> str:
        """Build caption dialogues grouped into ~3 words per screen, with a subtle pop."""
        if not word_timestamps:
            return ""

        lines = []
        chunk_size = 3
        
        for i in range(0, len(word_timestamps), chunk_size):
            chunk = word_timestamps[i:i+chunk_size]
            start_time = chunk[0]["start"]
            
            # The end time is the start of the next word if available, else the end of the last word in chunk + padding
            if i + chunk_size < len(word_timestamps):
                end_time = min(word_timestamps[i+chunk_size]["start"], duration)
            else:
                end_time = min(chunk[-1]["end"] + 0.5, duration)
                
            start_ts = self._secs_to_ts(start_time)
            end_ts = self._secs_to_ts(end_time)

            word_text = " ".join([w["word"].strip() for w in chunk if w["word"].strip()])
            if not word_text:
                continue

            # Apply a quick bouncing scale effect and tight fade for each chunk
            lines.append(
                f"Dialogue: 1,{start_ts},{end_ts},Caption,,0,0,0,,"
                f"{{\\fad(50,50)\\t(0,100,\\fscx110\\fscy110)\\t(100,200,\\fscx100\\fscy100)}}{word_text}"
            )

        return "\n".join(lines) + "\n"

    @staticmethod
    def _secs_to_ts(seconds: float) -> str:
        """Convert seconds to ASS timestamp format H:MM:SS.CC"""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        cs = int((seconds % 1) * 100)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    # -------------------------------------------------------------------------
    # Audio helpers (same as audiogram_generator)
    # -------------------------------------------------------------------------

    async def _get_audio_duration(self, audio_path: str) -> float | None:
        """Get the duration of an audio file using ffprobe."""
        try:
            cmd = [
                "ffprobe", "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()
            if process.returncode == 0 and stdout:
                return float(stdout.decode().strip())
        except Exception as e:
            logger.warning(f"Could not get audio duration: {e}")
        return None

    async def _download_audio_clip(
        self,
        audio_url: str,
        start_seconds: float,
        duration_seconds: float,
    ) -> str:
        """Download audio from URL and extract a clip. Supports local /static/ files."""
        if audio_url.startswith("/static/"):
            # It's a local static file generated previously
            raw_path = os.path.abspath(audio_url.lstrip("/"))
            logger.info(f"Using local pre-compiled audio: {raw_path}")
            is_local = True
        else:
            logger.info(f"Downloading audio from {audio_url[:80]}...")
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(audio_url)
                resp.raise_for_status()

            raw_fd, raw_path_temp = tempfile.mkstemp(suffix='.mp3')
            with os.fdopen(raw_fd, 'wb') as f:
                f.write(resp.content)
            raw_path = raw_path_temp
            is_local = False

        # Always extract the requested clip (start + duration)
        clip_fd, clip_path = tempfile.mkstemp(suffix='.mp3')
        os.close(clip_fd)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_seconds),
            "-i", raw_path,
            "-t", str(duration_seconds),
            "-c", "copy",
            clip_path,
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        
        if not is_local:
            os.unlink(raw_path)
            
        return clip_path

    async def _generate_tts_audio(
        self,
        text: str,
        voice: str = "nova",
        speed: float = 1.0,
        provider: str = "openai",
        elevenlabs_stability: float = 0.3,
        elevenlabs_similarity_boost: float = 0.75,
        elevenlabs_style: float = 0.4,
    ) -> str:
        """Generate TTS audio using the specified provider."""
        logger.info(
            f"Generating TTS audio: provider={provider}, voice={voice}, speed={speed}, "
            f"text_chars={len(text)}"
        )

        if provider == "elevenlabs":
            from app.services.elevenlabs_tts import ElevenLabsTTS
            tts = ElevenLabsTTS()
            audio_bytes = await tts.generate_audio(
                text,
                voice=voice,
                speed=speed,
                stability=elevenlabs_stability,
                similarity_boost=elevenlabs_similarity_boost,
                style=elevenlabs_style,
            )
        else:
            tts = TTSGenerator()
            audio_bytes = await tts.generate_audio(text, voice=voice, speed=speed)

        audio_fd, audio_path = tempfile.mkstemp(suffix='.mp3')
        with os.fdopen(audio_fd, 'wb') as f:
            f.write(audio_bytes)

        return audio_path

    async def _concatenate_audio(
        self,
        main_path: str,
        cta_path: str,
        silence_gap: float = 0.5,
    ) -> str:
        """Concatenate main audio + silence gap + CTA audio."""
        combined_fd, combined_path = tempfile.mkstemp(suffix='.mp3')
        os.close(combined_fd)

        # Get main audio duration
        main_dur = await self._get_audio_duration(main_path) or 10.0

        # Apply fade-out to main audio, generate silence, then concatenate
        cmd = [
            "ffmpeg", "-y",
            "-i", main_path,
            "-i", cta_path,
            "-filter_complex",
            (
                f"[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0];"
                f"aevalsrc=0:d={silence_gap}:s=48000:c=stereo[silence];"
                f"[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];"
                f"[a0][silence][a1]concat=n=3:v=0:a=1[out]"
            ),
            "-map", "[out]",
            "-c:a", "libmp3lame",
            "-b:a", "320k",
            combined_path,
        ]

        logger.info(f"Concatenating audio with {silence_gap}s silence gap")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode()[-1000:] if stderr else "Unknown error"
            logger.error(f"Audio concat failed: {error_msg}")
            raise RuntimeError(f"Audio concat failed: {error_msg}")

        return combined_path

    async def _download_background_video(self, video_url: str) -> str:
        """Download background video from a URL to a temporary file."""
        logger.info(f"Downloading background video from {video_url[:80]}...")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(video_url)
            resp.raise_for_status()

        # Try to infer extension
        ext = '.mp4'
        if '.mov' in video_url.lower():
            ext = '.mov'
            
        video_fd, video_path = tempfile.mkstemp(suffix=ext)
        with os.fdopen(video_fd, 'wb') as f:
            f.write(resp.content)
            
        return video_path

    async def _download_ai_images(self, image_urls: list[str]) -> list[str]:
        """Download list of image URLs concurrently to temp files."""
        logger.info(f"Downloading {len(image_urls)} AI images...")
        paths = []
        
        async def fetch_img(idx: int, url: str) -> str:
            if url.startswith("/static/"):
                return os.path.join(os.getcwd(), url.lstrip("/"))
                
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            fd, path = tempfile.mkstemp(suffix=f'_frame_{idx}.png')
            with os.fdopen(fd, 'wb') as f:
                f.write(resp.content)
            return path
            
        tasks = [fetch_img(i, url) for i, url in enumerate(image_urls)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Failed to download AI image: {r}")
                raise r
            paths.append(r)
            
        return paths
