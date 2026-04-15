"""
Rewrite narration text into a TTS-friendly documentary voiceover script.
"""
import json

from loguru import logger

from app.services.llm_router import complete_text


VOICE_REWRITE_SYSTEM_PROMPT = """You rewrite science narration so it sounds exceptional when spoken aloud by an AI voice.

Narration style requirements:
- Voice style: confident science narrator
- Tone: calm, intelligent, slightly curious
- Pacing: medium-slow with clear articulation
- Pause briefly before surprising facts
- Avoid sounding robotic
- Speak naturally like a documentary narrator

Rewrite rules:
- Preserve the original facts, meaning, and overall sequence.
- Make the wording more speakable and cinematic.
- Break dense academic sentences into shorter spoken beats.
- Use line breaks, ellipses, dashes, and short standalone sentences when they improve narration.
- Introduce a question only when it clarifies the idea and remains faithful to the source.
- Do not add new facts, claims, numbers, or hype that are not supported by the source.
- Avoid formal academic phrasing.
- Keep it concise and natural for short-form voice-over.

Return JSON with:
- rewritten_script: the improved voice-over script only
"""


class VoiceScriptRewriter:
    """Rewrites narration text for more natural, documentary-style TTS."""

    def __init__(self):
        pass

    async def rewrite(self, script: str) -> str:
        script = (script or "").strip()
        if not script:
            return script

        try:
            response = await complete_text(
                capability="voice_script_rewrite",
                default_openai_model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": VOICE_REWRITE_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Rewrite this narration for voice-over:\n\n{script}"},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=700,
            )
            payload = json.loads(response.text)
            rewritten = (payload.get("rewritten_script") or "").strip()
            if rewritten:
                return rewritten
        except Exception as exc:
            logger.warning(f"Voice script rewrite failed, using original script: {exc}")

        return script
