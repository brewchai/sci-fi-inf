"""
Engine for extracting precise timed scene prompts from narration scripts.
Used exclusively for generating FLUX.1 images for the advanced Custom Reel generator.
"""
import json
import math
from loguru import logger
from openai import AsyncOpenAI
from app.core.config import settings

async def extract_scene_prompts(script: str) -> list[str]:
    """
    Analyzes a narration script and extracts a strict list of visual prompts
    timed exactly to the 0.5s/2.0s pacing rule.
    """
    # 1. Calculate required number of prompts based on TTS heuristic (150 WPM)
    words = len([w for w in script.split() if w.strip()])
    duration_seconds = words / 2.5
    
    # 3 prompts for the first 1.5 seconds (0.5s each)
    num_prompts = 3
    remaining_duration = max(0, duration_seconds - 1.5)
    
    # 1 prompt per 2.0 seconds thereafter
    additional_prompts = math.ceil(remaining_duration / 2.0)
    num_prompts += additional_prompts
    
    # Cap at a reasonable maximum to prevent massive API bills on accident
    num_prompts = min(num_prompts, 35)
    
    logger.info(f"Extracting {num_prompts} scene prompts for {words} words (~{duration_seconds:.1f}s)")
    
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    prompt = (
        "You are an elite AI cinematic director creating visual prompts for an AI image generator (FLUX.1). "
        "Your task is to break down the provided narration script into a series of highly descriptive, striking visual prompts.\n\n"
        f"You MUST generate EXACTLY {num_prompts} prompts.\n"
        "The pacing is extremely fast:\n"
        " - Prompts 1, 2, and 3 represents the first 1.5 seconds of the video (the hook). These 3 must be explosive, striking, and varied.\n"
        " - The remaining prompts represent roughly 2.0 seconds of narration each.\n\n"
        
        "CRITICAL RULES for your visual prompts:\n"
        "1. Write what we SEE, not the concept. Do NOT use words like 'innovation', 'technology', or 'progress'. Instead use 'glowing neon circuitry', 'close up of a silver microscope', 'an astronaut looking at Mars'.\n"
        "2. Make them highly cinematic and literal. Use terms like 'cinematic lighting, 8k resolution, photorealistic, extreme close up'.\n"
        "3. Ensure variety. Do not repeat the exact same subjects in consecutive prompts.\n"
        "4. Output strictly a JSON object with a single 'prompts' array of strings.\n\n"
        
        f"NARRATION SCRIPT:\n{script}\n\n"
        
        f"OUTPUT FORMAT:\n{{\"prompts\": [\n\"Prompt 1 description\",\n... exactly {num_prompts} strings\n]}}"
    )

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=2000,
        )
        raw = resp.choices[0].message.content
        data = json.loads(raw)
        
        prompts = data.get("prompts", [])
        if not prompts:
            raise ValueError("No 'prompts' array found in JSON.")
            
        # Ensure we return exactly what was requested by slicing or padding
        if len(prompts) > num_prompts:
            prompts = prompts[:num_prompts]
        while len(prompts) < num_prompts:
            prompts.append(prompts[-1] if prompts else "Cinematic glowing sci-fi background, abstract 8k")
            
        logger.info(f"Successfully extracted {len(prompts)} exact prompts.")
        return prompts
        
    except Exception as e:
        logger.error(f"Scene extraction failed: {e}")
        # Fallback prompts if LLM fails
        fallback = []
        for i in range(num_prompts):
            fallback.append(f"High-tech futuristic abstract background scene {i+1}, dramatic lighting 8k")
        return fallback
