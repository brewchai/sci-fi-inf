"""
Engine for intelligently selecting Anchor Words from a transcript, and subsequently generating prompts.
"""
import json
import re
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

    def _allowed_transitions(self) -> list[str]:
        return [item["transition_name"] for item in self.effect_guidance if item.get("transition_name")]

    def _default_transition(self, transitions: list[str] | None = None) -> str:
        transitions = transitions or self._allowed_transitions()
        if "fadecolor" in transitions:
            return "fadecolor"
        return transitions[0] if transitions else "fadecolor"

    def _token_is_phrase_boundary(self, token: str) -> bool:
        return bool(re.search(r"[.!?:;,]$", token.strip()))

    def _phrase_window(
        self,
        word_timestamps: list[dict],
        focus_idx: int,
        max_back_words: int = 4,
        max_forward_words: int = 6,
        pause_gap_seconds: float = 0.35,
    ) -> tuple[int, int]:
        start_idx = focus_idx
        back_steps = 0
        while start_idx > 0 and back_steps < max_back_words:
            prev_word = word_timestamps[start_idx - 1]
            curr_word = word_timestamps[start_idx]
            gap = float(curr_word["start"]) - float(prev_word["end"])
            if gap >= pause_gap_seconds or self._token_is_phrase_boundary(str(prev_word["word"])):
                break
            start_idx -= 1
            back_steps += 1

        end_idx = focus_idx
        forward_steps = 0
        while end_idx < len(word_timestamps) - 1 and forward_steps < max_forward_words:
            curr_word = word_timestamps[end_idx]
            next_word = word_timestamps[end_idx + 1]
            gap = float(next_word["start"]) - float(curr_word["end"])
            if gap >= pause_gap_seconds or self._token_is_phrase_boundary(str(curr_word["word"])):
                break
            end_idx += 1
            forward_steps += 1

        return start_idx, end_idx

    def _align_anchors_to_phrase_starts(
        self,
        anchors: list[dict],
        word_timestamps: list[dict],
    ) -> list[dict]:
        """
        Keep semantic anchor intent (`focus_word`) but shift trigger timing to phrase starts.
        """
        if not anchors:
            return []
        if not word_timestamps:
            return anchors

        enriched: list[dict] = []
        for anchor in anchors:
            target_start = float(anchor["start"])
            focus_idx = min(
                range(len(word_timestamps)),
                key=lambda idx: abs(float(word_timestamps[idx]["start"]) - target_start),
            )
            start_idx, end_idx = self._phrase_window(word_timestamps, focus_idx)
            trigger_word = word_timestamps[start_idx]
            focus_word = word_timestamps[focus_idx]
            phrase_text = " ".join(
                str(item["word"]).strip()
                for item in word_timestamps[start_idx:end_idx + 1]
                if str(item["word"]).strip()
            )
            enriched.append(
                {
                    "word": str(trigger_word["word"]).strip(),
                    "start": float(trigger_word["start"]),
                    "end": float(trigger_word["end"]),
                    "focus_word": str(focus_word["word"]).strip(),
                    "focus_start": float(focus_word["start"]),
                    "focus_end": float(focus_word["end"]),
                    "anchor_phrase": phrase_text or str(trigger_word["word"]).strip(),
                    "phrase_start": float(trigger_word["start"]),
                    "phrase_end": float(word_timestamps[end_idx]["end"]),
                    "_trigger_idx": start_idx,
                }
            )

        # If multiple semantic anchors collapse to the same phrase-start trigger,
        # keep only one for stable scene switching.
        deduped: list[dict] = []
        seen_trigger_indices: set[int] = set()
        for item in sorted(enriched, key=lambda row: row["start"]):
            trigger_idx = int(item.get("_trigger_idx", -1))
            if trigger_idx in seen_trigger_indices:
                continue
            seen_trigger_indices.add(trigger_idx)
            item.pop("_trigger_idx", None)
            deduped.append(item)

        return deduped

    async def select_anchors(self, word_timestamps: list[dict]) -> list[dict]:
        """
        Phase 1: Select visual anchor points and align trigger timing to phrase starts.
        Returns dicts like:
        {
          "word": "I",
          "start": 3.14,
          "end": 3.30,
          "focus_word": "settle",
          "anchor_phrase": "I want to settle"
        }
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
                
            return self._align_anchors_to_phrase_starts(final_anchors, word_timestamps)
        except Exception as e:
            logger.error(f"Anchor selection failed: {e}")
            # Fallback uniform selection
            fallback = []
            num_anchors = self._calculate_pacing(word_timestamps)
            for i in range(num_anchors):
                target = i * 3.0
                closest = min(word_timestamps, key=lambda w: abs(w["start"] - target))
                fallback.append({"word": closest["word"], "start": closest["start"], "end": closest["end"]})
            return self._align_anchors_to_phrase_starts(fallback, word_timestamps)

    async def assign_effects(self, script: str, anchors: list[dict]) -> list[dict]:
        """
        Assign one AI Director transition effect to each existing anchor.

        Returns the same anchor list shape with effect_transition_name populated.
        """
        if not anchors:
            return []

        transitions = self._allowed_transitions()
        default_transition = self._default_transition(transitions)
        transitions_context = "\n".join(
            [f"- {item['transition_name']}: {item.get('guidance', '').strip()}" for item in self.effect_guidance]
        )
        anchors_context = "\n".join(
            [
                f"Target {i+1}: trigger_word='{anchor['word']}'"
                f", focus_word='{anchor.get('focus_word', anchor['word'])}'"
                f", phrase='{anchor.get('anchor_phrase', anchor['word'])}'"
                f" at {anchor['start']:.2f}s"
                for i, anchor in enumerate(anchors)
            ]
        )
        allowed_transition_names = ", ".join(transitions) if transitions else default_transition

        system_prompt = (
            "You are an elite reel editing director. Your only task is to assign one editing transition "
            "effect to each existing anchor point in a narration timeline.\n\n"
            "RULES:\n"
            "1. Do not rewrite, remove, or reorder anchors.\n"
            "2. Return exactly one transition per target anchor.\n"
            "3. Pick transitions based on the emotional change, scale change, or pacing shift around that anchor.\n"
            f"4. You MUST choose effect_transition_name from this exact set: {allowed_transition_names}.\n"
            "5. Output ONLY JSON in the shape {\"timeline\": [{\"anchor_word\": \"...\", \"start_time_seconds\": 1.23, "
            "\"effect_transition_name\": \"...\"}]}.\n\n"
            f"TRANSITION GUIDANCE:\n{transitions_context}"
        )

        try:
            resp = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"FULL SCRIPT:\n{script}\n\nTARGET ANCHORS:\n{anchors_context}"},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=2500,
            )
            raw = resp.choices[0].message.content
            data = json.loads(raw)
            timeline = data.get("timeline", [])
            transition_set = set(transitions)

            enriched_anchors = []
            for idx, anchor in enumerate(anchors):
                row = timeline[idx] if idx < len(timeline) and isinstance(timeline[idx], dict) else {}
                effect_name = row.get("effect_transition_name")
                if not effect_name or (transition_set and effect_name not in transition_set):
                    effect_name = default_transition
                enriched_anchors.append({
                    **anchor,
                    "effect_transition_name": effect_name,
                })
            return enriched_anchors
        except Exception as e:
            logger.error(f"Effect assignment failed: {e}")
            return [
                {
                    **anchor,
                    "effect_transition_name": default_transition,
                }
                for anchor in anchors
            ]

    async def generate_prompts(self, script: str, anchors: list[dict]) -> list[dict]:
        """
        Phase 2: Given the full script and the exact pre-selected Anchor Words,
        generate descriptive AI Image (FLUX.1) prompts tailored to those specific points in the story.
        Returns the timeline format: [{"prompt": "...", "anchor_word": "...", "start_time_seconds": 1.23}]
        """
        if not anchors: return []
        num_prompts = len(anchors)
        
        # Build context string of anchors
        anchors_context = "\n".join(
            [
                f"Target {i+1}: Trigger '{a['word']}' at {a['start']}s"
                f" | Focus '{a.get('focus_word', a['word'])}'"
                f" | Phrase '{a.get('anchor_phrase', a['word'])}'"
                for i, a in enumerate(anchors)
            ]
        )
        transitions = self._allowed_transitions()
        transitions_context = "\n".join(
            [f"- {item['transition_name']}: {item.get('guidance', '').strip()}" for item in self.effect_guidance]
        )
        allowed_transition_names = ", ".join(transitions) if transitions else self._default_transition(transitions)

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
            "9. Use the Focus/Phrase semantics for visual concept, not just the Trigger word.\n"
            f"10. You MUST pick effect_transition_name from this exact allowed set: {allowed_transition_names}.\n"
            "11. Output strictly a JSON object with a 'timeline' array containing 'prompt', 'anchor_word' (from the target), 'start_time_seconds', and 'effect_transition_name'.\n\n"
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
            default_transition = self._default_transition(transitions)
            for i in range(num_prompts):
                target_anchor = anchors[i]
                prompt_text = timeline[i]["prompt"] if i < len(timeline) else "Cinematic glowing sci-fi background, abstract 8k, hyper-realistic photography, 8k resolution, cinematic lighting"
                effect_name = timeline[i].get("effect_transition_name") if i < len(timeline) and isinstance(timeline[i], dict) else None
                if not effect_name or (transition_set and effect_name not in transition_set):
                    effect_name = default_transition
                
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
            default_transition = self._default_transition(transitions)
            for a in anchors:
                visual_seed = a.get("focus_word") or a["word"]
                fallback.append({
                    "prompt": f"Dramatic cinematic background, {visual_seed}, hyper-realistic photography, 8k resolution, cinematic lighting",
                    "anchor_word": a["word"],
                    "start_time_seconds": a["start"],
                    "effect_transition_name": default_transition,
                })
            return fallback
