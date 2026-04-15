import os
import uuid
import logging
import base64
from typing import List, Optional
import httpx
from app.core.config import settings
from app.services.llm_router import complete_text

logger = logging.getLogger(__name__)

# Visual style presets — appended to raw prompts at generation time.
# Prompts themselves are style-neutral; style is chosen by the user in the UI.
STYLE_PRESETS: dict[str, str] = {
    "archival_bw": (
        ", shot on Kodak Tri-X 400, black and white, heavy authentic film grain, "
        "high contrast monochrome, Magnum Photos documentary aesthetic, "
        "slightly off-centre composition, no digital smoothing, no AI artifacts"
    ),
    "photojournalism": (
        ", shot on Leica M6 35mm f/1.4, muted desaturated colour palette, "
        "shallow depth of field, authentic photojournalistic lighting, "
        "slight vignette, slight chromatic aberration, handheld feel, "
        "imperfect natural light, no oversaturation, no AI artifacts"
    ),
    "cinematic_moody": (
        ", anamorphic lens flare, cinematic colour grade, deep shadows, "
        "teal and orange tones, dramatic chiaroscuro lighting, "
        "film look, 35mm motion picture grain, no AI artifacts"
    ),
    "cold_scifi": (
        ", clinical cold blue-white light, National Geographic documentary photography, "
        "ultra-sharp foreground soft background, sterile laboratory aesthetic, "
        "slightly overexposed highlights, no AI artifacts"
    ),
    "raw_documentary": (
        ", handheld documentary photography, motion blur, available light only, "
        "gritty authentic texture, imperfect exposure, BBC documentary style, "
        "film grain, no studio lighting, no AI artifacts"
    ),
    "vintage_sepia": (
        ", 1970s archival photography, warm sepia tones, faded authentic film, "
        "Kodachrome colour cast, soft vignette, dust and scratches texture, "
        "authentic period-correct photo, no AI artifacts"
    ),
}

DEFAULT_STYLE = "photojournalism"

class ImageGenerationEngine:
    def __init__(self):
        # Allow multiple API keys separated by commas for free-tier churning
        keys_str = settings.TOGETHER_API_KEYS or ""
        self.api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        self.current_key_idx = 0
        
    def _get_current_key(self) -> Optional[str]:
        if not self.api_keys:
            return None
        return self.api_keys[self.current_key_idx]

    def _rotate_key(self):
        if not self.api_keys:
            return
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        logger.warning(f"Rotated Together API Key to index {self.current_key_idx}")

    async def generate_prompt_from_text(self, text: str) -> str:
        """Use LLM to generate an optimized image generation prompt from plain text."""
        try:
            response = await complete_text(
                capability="image_prompt",
                default_openai_model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert prompt engineer for cutting-edge photorealistic AI image generators (like Midjourney v6 or FLUX). Given a slide headline and takeaway text, generate a single, highly detailed prompt (90 to 140 words). The image must not be generic mood photography. It must visually explain the concept in a concrete, story-first way so a viewer instantly understands what is new, surprising, or important. Prefer explainer-style editorial imagery: a real device in use, a scientific mechanism becoming visible, a before-and-after effect, a human interacting with a new material, or a dramatic macro detail that clarifies the breakthrough. If the concept involves a product, interface, treatment, biomaterial, robot, implant, or lab method, show it actively doing something specific in the scene. Small inset magnified details, ghosted overlays, or layered editorial callouts are allowed if they help explain the idea, but the image should still feel like one coherent premium social-media visual, not a comic panel. CRITICAL COMPOSITION REQUIREMENT: the single most important foreground subject or attention-grabbing explanatory element must sit in the upper portion of the frame, above the center line, so the middle and lower area remain usable for overlaid headline text. Do this with natural composition, not by creating a literal top section and bottom section. Keep the image continuous, immersive, and organic from top to bottom. Humans are allowed when they strengthen the story, but prefer hands using a device, over-the-shoulder interaction, documentary distance, or body-context framing rather than glamour portraits. Avoid extreme facial beauty close-ups, isolated skin texture, and generic stock-photo smiling people. The image should feel premium, novel, and immediately legible as a scientific or technological concept explainer. Include specific photographic terminology such as lens choice, lighting, texture, depth of field, macro detail, editorial product photography, cinematic realism, highly detailed, 8k, raw photo. Do NOT include cartoony, stylized, surreal, or abstract concepts. Do NOT ask the AI to generate text, letters, captions, UI words, or readable labels in the image. Do not wrap in quotes."},
                    {"role": "user", "content": text}
                ],
                temperature=0.8,
                max_tokens=220
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Failed to generate prompt: {str(e)}")
            # Fallback to just using the text truncated
            return text[:200]

    async def generate_image(self, prompt: str, style: str = None, aspect: str | None = None) -> str:
        """Call Together AI (FLUX.1 Schnell) to generate an image and save it locally."""
        if not self.api_keys:
            raise ValueError("No Together API keys configured. Set TOGETHER_API_KEYS in .env")

        # Apply the chosen style suffix (or fallback to default)
        style_key = style if style in STYLE_PRESETS else DEFAULT_STYLE
        suffix = STYLE_PRESETS[style_key]
        full_prompt = f"{prompt}{suffix}"
        aspect_key = aspect or "portrait_9_16"
        if aspect_key == "square_1_1":
            width, height = 1024, 1024
        else:
            width, height = 768, 1344
        
        # Try each key, allow at least 3 attempts for single keys to handle rate limits
        max_attempts = max(len(self.api_keys), 3)
        for _ in range(max_attempts):
            current_key = self._get_current_key()
            headers = {
                "Authorization": f"Bearer {current_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "black-forest-labs/FLUX.1-schnell",
                "prompt": full_prompt,
                "width": width,
                "height": height,
                "steps": 4,
                "n": 1,
                "response_format": "b64_json"
            }

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        "https://api.together.xyz/v1/images/generations",
                        headers=headers,
                        json=payload
                    )

                    if response.status_code in [429, 402]:
                        if len(self.api_keys) == 1:
                            logger.warning("Together API rate limited (429) on single key. Waiting 2s before retry...")
                            import asyncio
                            await asyncio.sleep(2.0)
                            # We don't continue here, we let the loop try again if we want, 
                            # but original logic just does one pass over all keys.
                            # Let's just fix the loop or add a retry count.
                        
                        logger.warning(f"Together API key {self.current_key_idx} exhausted or rate limited. Rotating...")
                        self._rotate_key()
                        continue
                    
                    response.raise_for_status()
                    data = response.json()
                    
                    b64_image = data["data"][0]["b64_json"]
                    
                    # Save to static directory
                    img_id = str(uuid.uuid4())
                    filename = f"{img_id}.png"
                    
                    # Ensure static directory exists
                    # We store it in backend/static so it's served by the backend
                    save_dir = os.path.join(os.getcwd(), "static", "carousel_images")
                    os.makedirs(save_dir, exist_ok=True)
                    
                    filepath = os.path.join(save_dir, filename)
                    
                    with open(filepath, "wb") as f:
                        f.write(base64.b64decode(b64_image))
                        
                    return f"/static/carousel_images/{filename}"

            except Exception as e:
                logger.error(f"Error calling Together AI: {str(e)}")
                # Try rotating on other errors too
                self._rotate_key()

        raise RuntimeError("Failed to generate image after exhausting all API keys.")

image_generation_engine = ImageGenerationEngine()
