"""
Carousel generator service.

Generates visually engaging, short-form Instagram carousel content
from scientific paper summaries on the fly.
"""
import json
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from loguru import logger

from app.core.config import settings
from app.models.paper import Paper


class CarouselGenerator:
    """
    Generates Instagram Carousel slides from paper summaries.
    
    Flow:
    1. Receive papers for an episode
    2. Prompt LLM to reframe academic takeaways into punchy "Hooks / How / Why" formats
    3. Return a structured JSON representation of the slides
    """
    
    SYSTEM_PROMPT = """You are an expert science communicator and social media strategist for 'The Eureka Feed'.
Your goal is to translate dry academic research into punchy, highly engaging Instagram carousel slides.

For each scientific paper provided, you must generate exactly ONE slide object containing:
1. `headline`: A very short, punchy hook (max 8 words). Make it sound like an intriguing discovery.
2. `takeaways`: Exactly 3 bullet points, following a 'Hook / Mechanism / Impact' structure.
   - Bullet 1 (The Hook): What did they discover? (Simple, surprising fact)
   - Bullet 2 (The Mechanism): How does it work? (Use a simple analogy, e.g., "Like a molecular zipper...")
   - Bullet 3 (The Impact): Why does this change things? (The big picture payoff)

Rules:
- DO NOT use academic jargon unless you immediately explain it with an analogy.
- Keep sentences extremely short. People are scrolling on phones.
- No clichés ("groundbreaking", "revolutionary").
- Return ONLY valid JSON matching the requested schema. No markdown formatting outside the JSON block.
"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
    def _format_papers_for_prompt(self, papers: List[Paper]) -> str:
        """Format papers into content for the LLM prompt."""
        sections = []
        for i, paper in enumerate(papers, 1):
            why_it_matters = paper.metrics.get("why_it_matters", "") if paper.metrics else ""
            takeaways = "\n".join(f"- {t}" for t in (paper.key_takeaways or []))
            
            section = f"""Paper {i}: {paper.title}
Original Takeaways:
{takeaways}
Why it matters: {why_it_matters}
"""
            sections.append(section)
            
        return "\n\n---\n\n".join(sections)

    async def generate_carousel_content(self, papers: List[Paper]) -> List[Dict[str, Any]]:
        """
        Takes a list of papers and generates the carousel slides formatting.
        Returns a list of dictionaries with 'headline' and 'takeaways'.
        """
        if not papers:
            return []
            
        papers_content = self._format_papers_for_prompt(papers)
        
        # Define the exact JSON schema we expect back
        schema = {
            "type": "object",
            "properties": {
                "slides": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "paper_id": {"type": "integer"},
                            "category": {"type": "string"},
                            "headline": {"type": "string"},
                            "takeaways": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 3,
                                "maxItems": 3
                            }
                        },
                        "required": ["paper_id", "category", "headline", "takeaways"]
                    }
                }
            },
            "required": ["slides"]
        }

        # Add instructions specifically linking our required paper_ids back
        id_mapping = "\n".join([f"Paper {i} ID = {p.id}, Category = {p.category or 'SCIENCE'}" for i, p in enumerate(papers, 1)])
        
        user_prompt = f"""Generate engaging Instagram slides for the following papers.
        
Use these exact IDs and Categories in your JSON output:
{id_mapping}

PAPER CONTENT:
{papers_content}
"""

        logger.info(f"Generating on-the-fly carousel content for {len(papers)} papers")
        
        try:
            response = await self.llm.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=2000,
            )
            
            result_str = response.choices[0].message.content
            result_json = json.loads(result_str)
            
            slides = result_json.get("slides", [])
            logger.info(f"Successfully generated {len(slides)} carousel slides")
            return slides
            
        except Exception as e:
            logger.error(f"Failed to generate carousel content: {e}")
            
            # Fallback securely to the raw database components if OpenAI fails
            logger.info("Falling back to raw database takeaways")
            fallback_slides = []
            for paper in papers:
                fallback_slides.append({
                    "paper_id": paper.id,
                    "category": paper.category or "SCIENCE",
                    "headline": paper.headline or paper.title,
                    "takeaways": paper.key_takeaways[:3] if paper.key_takeaways else ["No takeaways generated"] * 3
                })
            return fallback_slides
