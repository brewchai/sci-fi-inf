"""
Audiogram generator service.

Creates a 1080x1080 video "Slide 1" for Instagram carousels:
  - Dark background matching carousel styling (#0a0a0f)
  - Animated audio waveform (gold accent, pulsing with the audio)
  - Title text (headline)
  - Brand header
  - Actual podcast audio embedded

Output: An MP4 uploaded to Supabase Storage, URL returned.
"""
import asyncio
import os
import tempfile
import httpx
from pathlib import Path
from loguru import logger

from app.services.storage import StorageService


# Video specs — must match carousel slide dimensions
WIDTH = 1080
HEIGHT = 1080
FPS = 30

# Styling — match brand
BG_COLOR = "0a0a0f"  # #0a0a0f
ACCENT_COLOR = "d4a853"  # Brand gold #d4a853

# Timing
DEFAULT_CLIP_DURATION = 8  # seconds for Slide 1 video


class AudiogramGenerator:
    """Generates audiogram video for carousel Slide 1."""

    def __init__(self):
        self.storage = StorageService()

    async def generate(
        self,
        episode_id: int,
        audio_url: str,
        headline: str,
        category: str = "NEW RESEARCH",
        brand_name: str = "THE EUREKA FEED",
        start_seconds: float = 0,
        duration_seconds: float = DEFAULT_CLIP_DURATION,
    ) -> str:
        """
        Generate an audiogram video slide.

        Args:
            episode_id: Episode ID for naming
            audio_url: URL to the full podcast audio (Supabase)
            headline: The carousel headline text
            category: Paper category label
            brand_name: Brand name shown at top
            start_seconds: Where to start the audio clip
            duration_seconds: Length of the clip

        Returns:
            Public URL path to the generated video
        """
        # 1. Download the audio clip
        audio_path = await self._download_audio_clip(
            audio_url, start_seconds, duration_seconds
        )

        # 2. Generate ASS subtitle file for text
        ass_content = self._generate_ass(headline, category, brand_name)
        ass_fd, ass_path = tempfile.mkstemp(suffix='.ass')
        with os.fdopen(ass_fd, 'w', encoding='utf-8') as f:
            f.write(ass_content)

        # 3. Build FFmpeg command — write to temp file, then upload
        output_filename = f"audiograms/audiogram-{episode_id}.mp4"
        output_fd, output_path = tempfile.mkstemp(suffix='.mp4')
        os.close(output_fd)

        ass_escaped = ass_path.replace(":", "\\:")

        # filter_complex:
        # [0:a] = audio → generates waveform
        # Background = solid color
        # Overlay waveform on background, then burn ASS subtitles
        waveform_h = 350
        waveform_y = (HEIGHT - waveform_h) // 2 - 40  # Slightly above center
        filter_complex = (
            # Create dark background
            f"color=c=#{BG_COLOR}:s={WIDTH}x{HEIGHT}:r={FPS}:d={duration_seconds}[bg];"
            # Generate a prominent animated waveform from audio
            f"[0:a]showwaves=s={WIDTH - 160}x{waveform_h}:mode=p2p:rate={FPS}"
            f":colors=#{ACCENT_COLOR}:scale=sqrt:draw=full[wave_raw];"
            # Pad waveform to position it on screen (centered horizontally with 80px margins)
            f"[wave_raw]pad={WIDTH}:{HEIGHT}:80:{waveform_y}:color=#{BG_COLOR}@0.0[wave];"
            # Overlay waveform on background
            f"[bg][wave]overlay=0:0:format=auto[with_wave];"
            # Burn in text
            f"[with_wave]ass={ass_escaped}[out]"
        )

        try:
            cmd = [
                "ffmpeg", "-y",
                "-i", str(audio_path),
                "-t", str(duration_seconds),
                "-filter_complex", filter_complex,
                "-af", f"afade=t=out:st={duration_seconds - 1.5}:d=1.5",
                "-map", "[out]",
                "-map", "0:a",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                "-r", str(FPS),
                "-pix_fmt", "yuv420p",
                "-shortest",
                "-movflags", "+faststart",
                output_path,
            ]

            logger.info(f"🎙️ Generating audiogram for episode {episode_id}")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode()[-1000:] if stderr else "Unknown error"
                logger.error(f"FFmpeg failed: {error_msg}")
                raise RuntimeError(f"FFmpeg failed: {error_msg}")

            # Upload to Supabase Storage (delete old one if re-generating)
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            try:
                public_url = self.storage.upload_audio(
                    file_bytes=video_bytes,
                    filename=output_filename,
                    content_type="video/mp4",
                )
            except Exception:
                # File probably already exists — delete and retry
                self.storage.delete_audio(output_filename)
                public_url = self.storage.upload_audio(
                    file_bytes=video_bytes,
                    filename=output_filename,
                    content_type="video/mp4",
                )

            logger.info(f"✅ Audiogram uploaded: {public_url}")
            return public_url

        finally:
            # Clean up all temp files
            for p in [audio_path, ass_path, output_path]:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    async def _download_audio_clip(
        self,
        audio_url: str,
        start_seconds: float,
        duration_seconds: float,
    ) -> str:
        """Download audio from URL and extract a clip."""
        # Download full audio to temp file
        logger.info(f"Downloading audio from {audio_url[:80]}...")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(audio_url)
            resp.raise_for_status()

        raw_fd, raw_path = tempfile.mkstemp(suffix='.mp3')
        with os.fdopen(raw_fd, 'wb') as f:
            f.write(resp.content)

        # If we need to slice, use FFmpeg
        if start_seconds > 0:
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
            os.unlink(raw_path)
            return clip_path

        return raw_path

    def _generate_ass(
        self,
        headline: str,
        category: str,
        brand_name: str,
    ) -> str:
        """
        Generate ASS subtitles for audiogram:
        - Brand name at top-left (gold, letter-spaced)
        - Big bold headline text in the lower portion
        - CTA handle at bottom
        """
        gold_abgr = "0053A8D4"  # #d4a853 in &HAABBGGRR

        escaped_headline = headline.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        escaped_brand = brand_name.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

        return f"""[Script Info]
Title: Eureka Feed Audiogram
ScriptType: v4.00+
WrapStyle: 0
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Brand,Avenir Next,32,&H{gold_abgr},&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,10,0,1,0,0,7,80,80,80,1
Style: Headline,Avenir Next,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,4,2,1,80,80,300,1
Style: Handle,Avenir Next,28,&H20FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,0,0,7,80,80,130,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:01:00.00,Brand,,0,0,0,,{escaped_brand}
Dialogue: 0,0:00:01.00,0:01:00.00,Headline,,0,0,0,,{{\\fad(600,0)}}{escaped_headline}
Dialogue: 0,0:00:00.00,0:01:00.00,Handle,,0,0,0,,Link to full audio available in description!
"""
