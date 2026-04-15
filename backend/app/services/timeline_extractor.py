"""
Engine for extracting precise Anchor Word-driven timelines from generated Audio transcripts.
"""
import json
from loguru import logger
from app.services.llm_router import complete_text

async def extract_timeline_prompts(script: str, word_timestamps: list[dict]) -> list[dict]:
    """
    Analyzes a narration script with exact Whisper word-level timestamps.
    Extracts a list of visual prompts mapped to specific spoken Anchor Words.
    The pacing rules are:
    - 3 prompts in the first 1.5 seconds (0.5s each)
    - 1 prompt roughly every 3.0 seconds thereafter
    
    Returns a list of dictionaries:
    [
        {
            "prompt": "Cinematic visual description...",
            "anchor_word": "The exact spoken word",
            "start_time_seconds": 3.14
        }
    ]
    """
    if not word_timestamps:
        raise ValueError("Cannot extract timeline without word timestamps")

    # 1. Determine total duration from the last word
    total_duration = word_timestamps[-1]["end"] + 0.5
    
    # Calculate required number of prompts
    num_prompts = 3  # The Hook
    remaining_duration = max(0, total_duration - 1.5)
    
    # 1 prompt roughly every 3.0 seconds
    additional_prompts = int(remaining_duration // 3.0)
    num_prompts += additional_prompts
    
    # Cap to avoid API abuse
    num_prompts = min(num_prompts, 35)
    
    logger.info(f"Extracting {num_prompts} timeline prompts for {len(word_timestamps)} words ({total_duration:.1f}s audio)")
    
    # Dump the first 100 words with their timestamps to give context to the LLM
    # We don't need to dump the whole thing, just enough to show formatting
    compact_transcript = [
        f"{w['word']} ({w['start']:.2f}s)" for w in word_timestamps
    ]
    formatted_transcript = " ".join(compact_transcript)
    
    system_prompt = (
        "You are an elite AI cinematic director creating visual prompts for an AI image generator (FLUX.1). "
        "Your task is to break down the provided AUDIO TRANSCRIPT into a series of highly descriptive, striking visual prompts.\n\n"
        
        f"You MUST generate EXACTLY {num_prompts} prompts.\n"
        "The pacing rules are strict:\n"
        " - Prompts 1, 2, and 3 represents the first 1.5 seconds of the video (the hook). These 3 must be explosive, striking, and varied. Choose anchor words near 0.0s, 0.5s, and 1.0s.\n"
        " - The remaining prompts must be spaced out by roughly 3.0-second intervals based on the transcript timestamps.\n\n"
        
        "CRITICAL RULES for your visual prompts:\n"
        "1. Write what we SEE, not the concept. Do NOT use words like 'innovation' or 'progress'. Instead use 'glowing neon circuitry' or 'an astronaut'.\n"
        "2. You MUST append exactly ', hyper-realistic photography, 8k resolution, cinematic lighting' to the very end of EVERY prompt.\n"
        "3. Output strictly a JSON object with a 'timeline' array containing 'prompt', 'anchor_word' (the exact spoken word), and 'start_time_seconds' (the float matching exactly from the transcript).\n\n"
        
        f"OUTPUT FORMAT:\n{{\"timeline\": [\n  {{\"prompt\": \"Close up eye..., hyper-realistic photography...\", \"anchor_word\": \"Welcome\", \"start_time_seconds\": 0.12}},\n... exactly {num_prompts} objects\n]}}"
    )

    try:
        resp = await complete_text(
            capability="timeline_extraction",
            default_openai_model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"TRANSCRIPT:\n{formatted_transcript}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=2500,
        )
        raw = resp.text
        data = json.loads(raw)
        
        timeline = data.get("timeline", [])
        if not timeline:
            raise ValueError("No 'timeline' array found in JSON.")
            
        # Ensure we return exactly what was requested by slicing or padding
        if len(timeline) > num_prompts:
            timeline = timeline[:num_prompts]
        while len(timeline) < num_prompts:
            timeline.append({
                "prompt": timeline[-1]["prompt"] if timeline else "Cinematic glowing sci-fi background, abstract 8k, hyper-realistic photography, 8k resolution, cinematic lighting",
                "anchor_word": "the",
                "start_time_seconds": timeline[-1]["start_time_seconds"] + 3.0 if timeline else 0.0
            })
            
        logger.info(f"Successfully extracted {len(timeline)} exact timeline prompts.")
        return timeline
        
    except Exception as e:
        logger.error(f"Timeline extraction failed: {e}")
        # Fallback prompts if LLM fails
        fallback = []
        for i in range(num_prompts):
            fallback.append({
                "prompt": f"High-tech futuristic abstract background scene {i+1}, dramatic lighting 8k, hyper-realistic photography, 8k resolution, cinematic lighting",
                "anchor_word": "script",
                "start_time_seconds": 0.5 * i if i < 3 else (i - 2) * 3.0
            })
        return fallback
