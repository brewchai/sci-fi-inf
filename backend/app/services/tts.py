"""
Text-to-Speech service using OpenAI TTS.

This service is pluggable and can be used independently of the main pipeline.
"""
import os
import tempfile
from typing import Optional
from openai import AsyncOpenAI
from loguru import logger

from app.core.config import settings


class TTSGenerator:
    """
    Generates audio from text using OpenAI's TTS API.
    
    Voices available:
        - alloy: Neutral
        - echo: Male, warm
        - fable: British, expressive
        - nova: Female, friendly (recommended)
        - onyx: Male, authoritative
        - shimmer: Female, soft
    """
    
    DEFAULT_VOICE = "nova"
    DEFAULT_MODEL = "tts-1"  # Use "tts-1-hd" for higher quality
    
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    
    async def generate_audio(
        self,
        text: str,
        voice: str = DEFAULT_VOICE,
        model: str = DEFAULT_MODEL,
    ) -> bytes:
        """
        Generate audio from text.
        
        Args:
            text: The text to convert to speech
            voice: Voice to use (nova, alloy, echo, fable, onyx, shimmer)
            model: TTS model (tts-1 or tts-1-hd)
            
        Returns:
            Audio bytes (MP3 format)
        """
        logger.info(f"Generating TTS audio: {len(text)} chars, voice={voice}")
        
        response = await self.client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
        )
        
        # Get audio bytes
        audio_bytes = response.content
        logger.info(f"Generated audio: {len(audio_bytes)} bytes")
        
        return audio_bytes
    
    async def generate_to_file(
        self,
        text: str,
        output_path: str,
        voice: str = DEFAULT_VOICE,
        model: str = DEFAULT_MODEL,
    ) -> str:
        """
        Generate audio and save to file.
        
        Args:
            text: The text to convert to speech
            output_path: Path to save the audio file
            voice: Voice to use
            model: TTS model
            
        Returns:
            Path to the saved audio file
        """
        audio_bytes = await self.generate_audio(text, voice, model)
        
        with open(output_path, "wb") as f:
            f.write(audio_bytes)
        
        logger.info(f"Saved audio to {output_path}")
        return output_path
    
    @staticmethod
    def estimate_duration(text: str) -> int:
        """
        Estimate audio duration in seconds based on text length.
        
        Average speaking rate is ~150 words per minute.
        """
        word_count = len(text.split())
        duration_minutes = word_count / 150
        return int(duration_minutes * 60)
