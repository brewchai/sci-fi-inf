"""
Reel script generator service.

Uses GPT-4o-mini to generate a tight, hook-driven narration script
from a paper's metadata, optimised for ~30-second Instagram Reels.
"""
import json
from loguru import logger

from app.models.paper import Paper
from app.services.llm_router import complete_text


SYSTEM_PROMPT = """You are a world-class science communicator and short-form video scriptwriter.
Your job is to turn academic research papers into punchy, captivating 30-second reel narrations.

Rules:
- Open with a bold hook: a provocative question, surprising stat, or counterintuitive claim.
- Explain the core finding clearly — no jargon unless you immediately define it.
- End with a "why it matters" beat that creates intrigue and drives the viewer to learn more.
- Target 75-100 words (≈ 30 seconds at natural speaking pace).

CRITICAL — Write conversationally so TTS sounds natural and human:
- Use contractions always: "it's", "you'd", "they've", "doesn't", "can't", "won't"
- Use em-dashes for dramatic pauses: "And here's the thing — nobody saw it coming."
- Mix short punchy sentences with longer flowing ones for rhythm variety.
- Use direct address: "Think about this...", "Here's what's wild...", "You know what's crazy?"
- Write as if you're telling a friend something mind-blowing over coffee.
- NEVER write in formal academic prose. No "furthermore", "moreover", "it is noteworthy".
- No emojis. No hashtags. No "subscribe" calls-to-action — those go in the closing statement.
"""


class ReelScriptGenerator:
    """Generates reel narration scripts from paper metadata using LLM."""

    def __init__(self):
        pass

    async def generate(self, paper: Paper, content_type: str = "latest") -> dict:
        """
        Generate a reel narration script and headline for a paper.

        Returns:
            dict with keys: script (str), headline (str)
        """
        # Build rich context from the paper
        paper_context = f"Title: {paper.title}\n"
        if paper.abstract:
            paper_context += f"Abstract: {paper.abstract}\n"
        if paper.eli5_summary:
            paper_context += f"ELI5 Summary: {paper.eli5_summary}\n"
        if paper.key_takeaways:
            paper_context += "Key Takeaways:\n"
            paper_context += "\n".join(f"- {t}" for t in paper.key_takeaways)
            paper_context += "\n"
        if paper.headline:
            paper_context += f"Headline: {paper.headline}\n"
        if paper.metrics and paper.metrics.get("why_it_matters"):
            paper_context += f"Why it matters: {paper.metrics['why_it_matters']}\n"
        if paper.deep_analysis:
            paper_context += f"Deep Analysis: {paper.deep_analysis[:500]}\n"

        framing_instructions = "1. Open with a hook that makes someone stop scrolling\n2. Deliver the core finding in clear, compelling language\n3. End with an intriguing beat that makes them want to hear the full episode"
        if content_type == "top-scientists":
            framing_instructions = "1. Open with a hook about the incredible legacy or quirky background of the scientist behind this work\n2. Explain their core discovery in simple terms\n3. End with why their work changed the world forever"
        elif content_type == "daily-science":
            framing_instructions = (
                "1. Open with a hook about the CONCEPT — define it in one jaw-dropping sentence "
                "(e.g., 'Did you know certain crystals generate electricity when you step on them?')\n"
                "2. Give a quick origin or 'aha' moment — when was this discovered, or what makes it counterintuitive?\n"
                "3. Reference what the paper found, but keep the concept as the star. "
                "End with a forward-looking beat — what could this enable?"
            )

        user_prompt = f"""Generate a reel narration script for the following paper.

Return a JSON object with exactly two keys:
- "headline": A short, punchy hook headline (max 10 words) for the video overlay.
- "script": The full narration script (75-100 words). This will be spoken aloud via TTS.

The script should:
{framing_instructions}

PAPER:
{paper_context}
"""

        logger.info(f"Generating reel script for paper {paper.id}: {paper.title[:60]}")

        try:
            response = await complete_text(
                capability="reel_script",
                default_openai_model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.8,
                max_tokens=500,
            )

            result = json.loads(response.text)
            logger.info(f"Generated reel script for paper {paper.id} ({len(result.get('script', ''))} chars)")
            return {
                "script": result.get("script", ""),
                "headline": result.get("headline", paper.headline or paper.title),
            }

        except Exception as e:
            logger.error(f"Failed to generate reel script for paper {paper.id}: {e}")
            # Fallback to existing paper content
            fallback_script = paper.eli5_summary or " ".join(paper.key_takeaways or [])
            return {
                "script": fallback_script[:400] if fallback_script else "Script generation failed.",
                "headline": paper.headline or paper.title,
            }
