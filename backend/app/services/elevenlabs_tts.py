"""
ElevenLabs TTS service.

Uses the ElevenLabs API for high-quality, expressive text-to-speech.
"""
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
        stability: float = 0.3,
        similarity_boost: float = 0.75,
        style: float = 0.4,
        speed: float = 1.0,
    ) -> bytes:
        """
        Generate expressive TTS audio via ElevenLabs.

        Args:
            text: Text to convert to speech
            voice: Voice name (brian, matilda, charlie, dave, lily, adam)
            stability: 0.0 = max variation/emotion, 1.0 = max stability (default 0.3 for expressiveness)
            similarity_boost: How closely to match the original voice (0.0–1.0)
            style: Style exaggeration (0.0–1.0, higher = more dramatic)
            speed: Speaking speed (0.5–2.0)

        Returns:
            Audio bytes (MP3 format)
        """
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

        logger.info(f"ElevenLabs TTS: {len(text)} chars, voice={voice}, stability={stability}, style={style}")

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()

        audio_bytes = resp.content
        logger.info(f"ElevenLabs generated audio: {len(audio_bytes)} bytes")
        return audio_bytes
