"""
Engine for intelligently selecting Anchor Words from a transcript, and subsequently generating prompts.
"""
import json
from pathlib import Path
from loguru import logger
from openai import AsyncOpenAI
from app.core.config import settings


EFFECT_GUIDANCE_PATH = Path(__file__).resolve().parents[2] / "static" / "AI_Director" / "effect_guidance.json"


class AnchorSelector:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.effect_guidance = self._load_effect_guidance()

    def _load_effect_guidance(self) -> list[dict]:
        """Load AI Director transition guidance from static JSON."""
        try:
            with open(EFFECT_GUIDANCE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return [item for item in data if isinstance(item, dict) and item.get("transition_name")]
        except Exception as e:
            logger.warning(f"Failed to load effect guidance ({EFFECT_GUIDANCE_PATH}): {e}")
        return []
        
    def _calculate_pacing(self, word_timestamps: list[dict]) -> int:
        """Calculate the required number of anchor words based on pacing rules."""
        if not word_timestamps: return 0
        total_duration = word_timestamps[-1]["end"] + 0.5
        num_prompts = 3  # The Hook
        remaining_duration = max(0, total_duration - 1.5)
        num_prompts += int(remaining_duration // 3.0)
        return min(num_prompts, 35) # Cap

    async def select_anchors(self, word_timestamps: list[dict]) -> list[dict]:
        """
        Phase 1: Analyzes the transcript to select highly visually evocative Anchor Words
        Returns a list of dicts: [{"word": "quantum", "start": 3.14, "end": 3.45}]
        """
        if not word_timestamps:
            raise ValueError("Cannot extract anchors without word timestamps")

        total_duration = word_timestamps[-1]["end"] + 0.5
        target_anchors_approx = max(3, int(total_duration / 3.0))
        logger.info(f"Selecting anchor words for {len(word_timestamps)} words. Target is roughly {target_anchors_approx}.")
        
        compact_transcript = [f"{w['word']} ({w['start']:.2f}s)" for w in word_timestamps]
        formatted_transcript = " ".join(compact_transcript)

        system_prompt = (
            "You are an elite cinematic pacing director for Instagram Reels. Your job is to select Anchor Words from an audio transcript. "
            "Each anchor triggers a visual scene change, so the word you pick MUST be something a camera can photograph.\n\n"

            "RULES FOR CHOOSING ANCHOR WORDS:\n"
            "1. You may pick Physical Nouns, Collective Nouns, OR powerful Abstract Concepts if they are the true subject of the sentence.\n"
            "   GOOD: 'Experiment', 'Free Will', 'neuroscientist', 'Volunteers', 'brain', 'universe', 'spaceship'\n"
            "   BAD: 'suggested', 'might', 'urge', 'something', 'simple', 'feel'\n"
            "   CRITICAL: NEVER pick body parts (e.g., 'finger', 'hands', 'eyes', 'face', 'head'). The AI image generator struggles with human anatomy.\n"
            "   If a multi-word concept is spoken (like 'Free Will' or 'Black Hole'), pick the most prominent word in that phrase as the anchor.\n"
            "2. NEVER pick: verbs of speech/suggestion ('suggested', 'told', 'said'), "
            "vague descriptors ('shocking', 'simple', 'fast'), emotional states ('urge', 'fear'), "
            "or grammatical filler ('the', 'a', 'and', 'something', 'they').\n"
            "3. Capitalize the word exactly as it would appear if it were the subject of the sentence (e.g. 'Volunteers', 'Experiment', 'Free Will').\n"
            "4. PREFER words that define the core theme or visual subject of that specific sentence.\n\n"

            "TIMING RULES:\n"
            f" - Choose a natural social media pacing. Aim for roughly {target_anchors_approx} anchors total (about 1 every 2.5 to 4 seconds), but YOU decide the final count based on where the strongest thematic words naturally appear.\n"
            " - Ensure anchors are reasonably spaced out so scenes have time to play.\n\n"

            "EXAMPLE — for the script 'This experiment suggested something shocking. Free will might be an illusion. "
            "Volunteers sat in front of a clock with a fast moving dot. They moved a lever whenever they felt the urge.':\n"
            " GOOD anchors: Experiment, Free Will, Volunteers, clock\n"
            " BAD anchors: suggested, something, might, urge, felt, finger, fast, moving\n\n"

            "Output ONLY a JSON object:\n"
            "{\"anchors\": [{\"word\": \"clock\", \"start\": 12.4}, ... list of selected anchors]}"
        )

        try:
            resp = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"TRANSCRIPT:\n{formatted_transcript}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=2500,
            )
            raw = resp.choices[0].message.content
            data = json.loads(raw)
            anchors_data = data.get("anchors", [])
            
            if not anchors_data:
                 raise ValueError("No 'anchors' array found in JSON.")
                 
            # Align with provided word timestamps to ensure exact floats and include ends
            final_anchors = []
            for item in anchors_data:
                # find closest match in real timestamps
                target_start = float(item["start"])
                closest = min(word_timestamps, key=lambda w: abs(w["start"] - target_start))
                final_anchors.append({
                    "word": closest["word"],
                    "start": closest["start"],
                    "end": closest["end"]
                })
                
            return final_anchors
        except Exception as e:
            logger.error(f"Anchor selection failed: {e}")
            # Fallback uniform selection
            fallback = []
            num_anchors = self._calculate_pacing(word_timestamps)
            for i in range(num_anchors):
                target = i * 3.0
                closest = min(word_timestamps, key=lambda w: abs(w["start"] - target))
                fallback.append({"word": closest["word"], "start": closest["start"], "end": closest["end"]})
            return fallback

    async def generate_prompts(self, script: str, anchors: list[dict]) -> list[dict]:
        """
        Phase 2: Given the full script and the exact pre-selected Anchor Words,
        generate descriptive AI Image (FLUX.1) prompts tailored to those specific points in the story.
        Returns the timeline format: [{"prompt": "...", "anchor_word": "...", "start_time_seconds": 1.23}]
        """
        if not anchors: return []
        num_prompts = len(anchors)
        
        # Build context string of anchors
        anchors_context = "\n".join([f"Target {i+1}: Word '{a['word']}' at {a['start']}s" for i, a in enumerate(anchors)])
        transitions = [item["transition_name"] for item in self.effect_guidance]
        transitions_context = "\n".join(
            [f"- {item['transition_name']}: {item.get('guidance', '').strip()}" for item in self.effect_guidance]
        )
        allowed_transition_names = ", ".join(transitions) if transitions else "fadecolor"

        system_prompt = (
            "You are an elite AI cinematic director and visual storyteller creating highly detailed image prompts "
            "for a FLUX.1 photorealistic AI image generator. These images will be rendered in 9:16 PORTRAIT format "
            "for Instagram Reels. Your prompts must be rich, vivid, and technically precise.\n\n"
            
            f"You MUST generate EXACTLY {num_prompts} prompts mapping exactly 1-to-1 to the provided Target list.\n"
            
            "CRITICAL RULES:\n"
            "1. Each prompt MUST be 80-120 WORDS LONG. Do not be brief — longer prompts produce better images.\n"
            "2. Write what we SEE, not the concept. Use visceral, physical descriptions of the scene.\n"
            "3. PORTRAIT COMPOSITION: describe the main subject in the CENTER-TO-UPPER portion of the frame, with negative space below. This is 9:16 vertical video.\n"
            "4. PHOTOREALISM is mandatory. Every prompt must end with: ', RAW photo, shot on cinema lens, 8k resolution, hyper-realistic, photojournalistic lighting, no CGI artifacts, highly detailed skin/texture, dramatic natural lighting, ultra-sharp focus.'\n"
            "5. Hook images (first 1-2): Use EXTREME close-ups, shocking textures, visceral reactions, lab tools — jarring, instantaneous visual impact. Remember, NEVER generate human body parts like hands/fingers/eyes.\n"
            "6. Body images (remaining): Cinematic wide establishing shots or deep environmental storytelling — evoke scale, wonder, and authenticity.\n"
            "7. NO text, logos, words, or watermarks in any image.\n"
            "8. For every target, choose one transition effect to trigger exactly when that anchor word is spoken. "
            "Use the full script context and neighboring anchors to decide the transition emotion.\n"
            f"9. You MUST pick effect_transition_name from this exact allowed set: {allowed_transition_names}.\n"
            "10. Output strictly a JSON object with a 'timeline' array containing 'prompt', 'anchor_word' (from the target), 'start_time_seconds', and 'effect_transition_name'.\n\n"
            f"TRANSITION GUIDANCE:\n{transitions_context}\n\n"
            
            f"OUTPUT FORMAT:\n{{\"timeline\": [\n  {{\"prompt\": \"Extreme close-up of a glowing petri dish pulsing with energy..., RAW photo, shot on cinema lens...\", \"anchor_word\": \"Welcome\", \"start_time_seconds\": 0.12, \"effect_transition_name\": \"CrossZoom\"}},\n... exactly {num_prompts} objects\n]}}"
        )

        try:
            resp = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"FULL SCRIPT:\n{script}\n\nTARGET ANCHOR WORDS:\n{anchors_context}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=6000,
            )
            raw = resp.choices[0].message.content
            data = json.loads(raw)
            timeline = data.get("timeline", [])
            
            if len(timeline) != num_prompts:
                 logger.warning(f"Generated {len(timeline)} prompts instead of {num_prompts}. Trusting LLM structure but truncating/padding.")
                 
            # Force alignment with exact anchor float values to avoid LLM drift
            final_timeline = []
            transition_set = set(transitions)
            for i in range(num_prompts):
                target_anchor = anchors[i]
                prompt_text = timeline[i]["prompt"] if i < len(timeline) else "Cinematic glowing sci-fi background, abstract 8k, hyper-realistic photography, 8k resolution, cinematic lighting"
                effect_name = timeline[i].get("effect_transition_name") if i < len(timeline) and isinstance(timeline[i], dict) else None
                if not effect_name or (transition_set and effect_name not in transition_set):
                    effect_name = "fadecolor" if "fadecolor" in transition_set else (transitions[0] if transitions else "fadecolor")
                
                final_timeline.append({
                    "prompt": prompt_text,
                    "anchor_word": target_anchor["word"],
                    "start_time_seconds": target_anchor["start"],
                    "effect_transition_name": effect_name,
                })
                
            return final_timeline
            
        except Exception as e:
            logger.error(f"Prompt generation from anchors failed: {e}")
            fallback = []
            for a in anchors:
                fallback.append({
                    "prompt": f"Dramatic cinematic background, {a['word']}, hyper-realistic photography, 8k resolution, cinematic lighting",
                    "anchor_word": a["word"],
                    "start_time_seconds": a["start"],
                    "effect_transition_name": "fadecolor",
                })
            return fallback
