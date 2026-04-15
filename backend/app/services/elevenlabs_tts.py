"""
ElevenLabs TTS service.

Uses the ElevenLabs API for high-quality, expressive text-to-speech.
"""
import asyncio
import os
import re
import tempfile

import httpx
from loguru import logger

from app.core.config import settings


# ElevenLabs voice IDs — these are the built-in voices
ELEVENLABS_VOICES = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",      # Female, calm
    "drew": "29vD33N1CtxCmqQRPOHJ",         # Male, well-rounded
    "clyde": "2EiwWnXFnvU5JabPnv8n",        # Male, war veteran
    "paul": "5Q0t7uMcjvnagumLfvZi",         # Male, news anchor
    "domi": "AZnzlk1XvdvUeBnXmlld",         # Female, strong
    "dave": "CYw3kZ02Hs0563khs1Fj",         # Male, British, conversational
    "fin": "D38z5RcWu1voky8WS1ja",          # Male, Irish
    "sarah": "EXAVITQu4vr4xnSDxMaL",        # Female, soft news
    "antoni": "ErXwobaYiN019PkySvjV",       # Male, well-rounded
    "thomas": "GBv7mTt0atIp3Br8iCZE",       # Male, calm
    "charlie": "IKne3meq5aSn9XLyUdCD",      # Male, casual Australian
    "emily": "LcfcDJNUP1GQjkzn1xUU",        # Female, calm
    "elli": "MF3mGyEYCl7XYWbV9V6O",         # Female, emotional
    "callum": "N2lVS1w4EtoT3dr4eOWO",       # Male, transatlantic
    "patrick": "ODq5zmih8GrVes37Dizd",       # Male, shouty
    "harry": "SOYHLrjzK2X1ezoPC6cr",        # Male, anxious
    "liam": "TX3LPaxmHKxFdv7VOQHJ",         # Male, articulate
    "dorothy": "ThT5KcBeYPX3keUQqHPh",      # Female, pleasant
    "josh": "TxGEqnHWrfWFTfGW9XjX",         # Male, deep
    "arnold": "VR6AewLTigWG4xSOukaG",       # Male, crispy
    "charlotte": "XB0fDUnXU5powFXDhCwa",    # Female, seductive
    "matilda": "XrExE9yKIg1WjnnlVkGX",      # Female, warm
    "matthew": "Yko7PKHZNXotIFUBG7I9",      # Male, audiobook
    "james": "ZQe5CZNOzWyzPSCn5a3c",        # Male, calm
    "joseph": "Zlb1dXrM653N07WRdFW3",       # Male British
    "jeremy": "bVMeCyTHy58xNoL34h3p",       # Male, excited Irish
    "michael": "flq6f7yk4E4fJM5XTYuZ",      # Male, audiobook
    "ethan": "g5CIjZEefAph4nQFvHAz",        # Male, narrator
    "chris": "iP95p4xoKVk53GoZ742B",        # Male, casual
    "gigi": "jBpfuIE2acCO8z3wKNLl",         # Female, childish
    "freya": "jsCqWAovK2LkecY7zXl4",        # Female, overperforming
    "brian": "nPczCjzI2devNBz1zQrb",        # Male, narrator deep
    "grace": "oWAxZDx7w5VEj9dCyTzz",        # Female, Southern
    "daniel": "onwK4e9ZLuTAKqWW03F9",       # Male, deep news
    "lily": "pFZP5JQG7iQjIQuC4Bku",         # Female, narrator
    "serena": "pMsXgVXv3BLzUgSXRplE",       # Female, pleasant
    "adam": "pNInz6obpgDQGcFmaJgB",         # Male, deep
    "nicole": "piTKgcLEGmPE4e6mEKli",       # Female, whisper
    "jessie": "t0jbNlBVZ17f02VDIeMI",       # Male, raspy
    "ryan": "wViXBPUzp2ZZixB1xQuM",         # Male, soldier
    "sam": "yoZ06aMxZJJ28mfd3POQ",           # Male, raspy
    "glinda": "z9fAnlkpzviPz146aGWa",       # Female, witch
    "giovanni": "zcAOhNBS3c14rBihAFp1",     # Male, foreigner
    "mimi": "zrHiDhphv9ZnVXBqCLjz",         # Female, childish
}

# Good voices for science narration reels
REEL_VOICES = {
    "science_narrator": "ZgQ9Q1rzzZ07VUObGgOC",  # Custom ElevenLabs voice for science narration
    "brian": ELEVENLABS_VOICES["brian"],     # Deep narrator — great for authority
    "matilda": ELEVENLABS_VOICES["matilda"], # Warm female — engaging
    "charlie": ELEVENLABS_VOICES["charlie"], # Casual Aussie — relatable
    "dave": ELEVENLABS_VOICES["dave"],       # British conversational
    "lily": ELEVENLABS_VOICES["lily"],       # Female narrator
    "adam": ELEVENLABS_VOICES["adam"],        # Deep male
}

DEFAULT_VOICE = "brian"
DEFAULT_MODEL = "eleven_multilingual_v2"
DEFAULT_STABILITY = 0.65
DEFAULT_SIMILARITY_BOOST = 0.85
DEFAULT_STYLE = 0.10
PARALLEL_TTS_MIN_CHARS = 280
MAX_PARALLEL_TTS_REQUESTS = 2
MAX_TTS_RETRIES = 4
BASE_RETRY_DELAY_SECONDS = 1.5


class ElevenLabsTTS:
    """High-quality, expressive TTS using ElevenLabs API."""

    def __init__(self):
        self.api_key = settings.ELEVENLABS_API_KEY
        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY not set in environment")

    async def generate_audio(
        self,
        text: str,
        voice: str = DEFAULT_VOICE,
        stability: float = DEFAULT_STABILITY,
        similarity_boost: float = DEFAULT_SIMILARITY_BOOST,
        style: float = DEFAULT_STYLE,
        speed: float = 1.0,
    ) -> bytes:
        """
        Generate expressive TTS audio via ElevenLabs.

        Args:
            text: Text to convert to speech
            voice: Voice name (brian, matilda, charlie, dave, lily, adam)
            stability: 0.0 = max variation/emotion, 1.0 = max stability
            similarity_boost: How closely to match the original voice (0.0–1.0)
            style: Style exaggeration (0.0–1.0, higher = more dramatic)
            speed: Speaking speed (0.5–2.0)

        Returns:
            Audio bytes (MP3 format)
        """
        logger.info(
            f"ElevenLabs TTS: {len(text)} chars, voice={voice}, speed={speed}, "
            f"stability={stability}, similarity_boost={similarity_boost}, style={style}"
        )

        sentences = self._split_into_sentences(text)
        should_parallelize = len(text) >= PARALLEL_TTS_MIN_CHARS and len(sentences) > 1

        if should_parallelize:
            logger.info(
                f"Chunking ElevenLabs request into {len(sentences)} sentence segments "
                f"with concurrency={MAX_PARALLEL_TTS_REQUESTS}"
            )
            try:
                audio_bytes = await self._generate_parallel_audio(
                    sentences,
                    voice=voice,
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response is not None and exc.response.status_code == 429:
                    logger.warning(
                        "ElevenLabs rate limited parallel chunk generation; "
                        "falling back to sequential sentence generation"
                    )
                    audio_bytes = await self._generate_sequential_audio(
                        sentences,
                        voice=voice,
                        stability=stability,
                        similarity_boost=similarity_boost,
                        style=style,
                    )
                else:
                    raise
        else:
            audio_bytes = await self._generate_audio_chunk(
                text,
                voice=voice,
                stability=stability,
                similarity_boost=similarity_boost,
                style=style,
            )

        if abs(speed - 1.0) > 0.001:
            audio_bytes = await self._apply_speed(audio_bytes, speed)
        logger.info(f"ElevenLabs generated audio: {len(audio_bytes)} bytes")
        return audio_bytes

    def _split_into_sentences(self, text: str) -> list[str]:
        cleaned_text = re.sub(r"\s+", " ", text).strip()
        if not cleaned_text:
            return []

        parts = re.split(r"(?<=[.!?])\s+", cleaned_text)
        sentences = [part.strip() for part in parts if part.strip()]
        return sentences or [cleaned_text]

    async def _generate_parallel_audio(
        self,
        sentences: list[str],
        voice: str,
        stability: float,
        similarity_boost: float,
        style: float,
    ) -> bytes:
        semaphore = asyncio.Semaphore(MAX_PARALLEL_TTS_REQUESTS)

        async def generate_segment(sentence: str) -> bytes:
            async with semaphore:
                return await self._generate_audio_chunk(
                    sentence,
                    voice=voice,
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                )

        segments = await asyncio.gather(*(generate_segment(sentence) for sentence in sentences))
        return await self._concatenate_segments(segments)

    async def _generate_sequential_audio(
        self,
        sentences: list[str],
        voice: str,
        stability: float,
        similarity_boost: float,
        style: float,
    ) -> bytes:
        segments: list[bytes] = []
        for sentence in sentences:
            segments.append(
                await self._generate_audio_chunk(
                    sentence,
                    voice=voice,
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                )
            )
        return await self._concatenate_segments(segments)

    async def _generate_audio_chunk(
        self,
        text: str,
        voice: str,
        stability: float,
        similarity_boost: float,
        style: float,
    ) -> bytes:
        # Accept either a known alias from REEL_VOICES or a raw ElevenLabs voice ID.
        voice_id = REEL_VOICES.get(voice, voice or REEL_VOICES[DEFAULT_VOICE])
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

        payload = {
            "text": text,
            "model_id": DEFAULT_MODEL,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
                "style": style,
                "use_speaker_boost": True,
            },
        }

        async with httpx.AsyncClient(timeout=60) as client:
            for attempt in range(1, MAX_TTS_RETRIES + 1):
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 429:
                    resp.raise_for_status()
                    return resp.content

                retry_after_header = resp.headers.get("retry-after")
                try:
                    retry_after = float(retry_after_header) if retry_after_header else 0.0
                except ValueError:
                    retry_after = 0.0

                if attempt == MAX_TTS_RETRIES:
                    resp.raise_for_status()

                delay_seconds = max(retry_after, BASE_RETRY_DELAY_SECONDS * attempt)
                logger.warning(
                    f"ElevenLabs rate limit hit for chunk ({len(text)} chars). "
                    f"Retrying in {delay_seconds:.1f}s (attempt {attempt}/{MAX_TTS_RETRIES})"
                )
                await asyncio.sleep(delay_seconds)
        raise RuntimeError("ElevenLabs TTS retry loop exited unexpectedly")

    async def _concatenate_segments(self, segments: list[bytes]) -> bytes:
        if not segments:
            return b""
        if len(segments) == 1:
            return segments[0]

        segment_paths: list[str] = []
        list_fd, list_path = tempfile.mkstemp(suffix=".txt")
        output_fd, output_path = tempfile.mkstemp(suffix=".mp3")

        try:
            for segment in segments:
                segment_fd, segment_path = tempfile.mkstemp(suffix=".mp3")
                segment_paths.append(segment_path)
                with os.fdopen(segment_fd, "wb") as handle:
                    handle.write(segment)

            with os.fdopen(list_fd, "w") as handle:
                for segment_path in segment_paths:
                    handle.write(f"file '{segment_path}'\n")

            os.close(output_fd)

            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-c:a", "libmp3lame",
                "-b:a", "192k",
                output_path,
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            if process.returncode != 0:
                raise RuntimeError(
                    "Failed to concatenate ElevenLabs sentence segments: "
                    f"{stderr.decode(errors='ignore')}"
                )

            with open(output_path, "rb") as handle:
                return handle.read()
        finally:
            if os.path.exists(list_path):
                os.unlink(list_path)
            if os.path.exists(output_path):
                os.unlink(output_path)
            for segment_path in segment_paths:
                if os.path.exists(segment_path):
                    os.unlink(segment_path)

    async def _apply_speed(self, audio_bytes: bytes, speed: float) -> bytes:
        """Apply speed locally so ElevenLabs voice output respects the UI slider."""
        clamped_speed = min(max(speed, 0.5), 2.0)
        if abs(clamped_speed - 1.0) <= 0.001:
            return audio_bytes

        input_fd, input_path = tempfile.mkstemp(suffix=".mp3")
        output_fd, output_path = tempfile.mkstemp(suffix=".mp3")
        try:
            with os.fdopen(input_fd, "wb") as handle:
                handle.write(audio_bytes)
            os.close(output_fd)

            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-filter:a", f"atempo={clamped_speed}",
                output_path,
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            if process.returncode != 0:
                logger.warning(
                    f"Failed to apply ElevenLabs speed={clamped_speed}; returning original audio. "
                    f"ffmpeg stderr={stderr.decode(errors='ignore')}"
                )
                return audio_bytes

            with open(output_path, "rb") as handle:
                return handle.read()
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)
            if os.path.exists(output_path):
                os.unlink(output_path)
