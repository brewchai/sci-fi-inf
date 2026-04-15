"""
Carousel generator service.

Generates visually engaging, short-form Instagram carousel content
from scientific paper summaries on the fly.
"""
import json
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.paper import Paper
from app.services.llm_router import complete_text


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
        
    def _format_papers_for_prompt(self, papers: List[Paper]) -> str:
        """Format papers into content for the LLM prompt."""
        sections = []
        for i, paper in enumerate(papers, 1):
            why_it_matters = paper.metrics.get("why_it_matters", "") if paper.metrics else ""
            if paper.key_takeaways:
                takeaways = "\n".join(f"- {t}" for t in paper.key_takeaways)
                core_content = f"Original Takeaways:\n{takeaways}"
            else:
                core_content = f"Abstract:\n{paper.abstract or 'No details provided.'}"
                
            section = f"""Paper {i}: {paper.title}
{core_content}
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
        id_mapping = "\n".join([f"Paper {i} ID = {p.id}, Category = {p.category_slug or 'SCIENCE'}" for i, p in enumerate(papers, 1)])
        
        user_prompt = f"""Generate engaging Instagram slides for the following papers.
        
Use these exact IDs and Categories in your JSON output:
{id_mapping}

Ensure your response is a valid JSON object with a single root key 'slides' containing an array of slide objects.
Example output format:
{{
  "slides": [
    {{
      "paper_id": 123,
      "category": "SPACE",
      "headline": "A punchy hook here",
      "takeaways": ["Hook...", "Mechanism...", "Impact..."]
    }}
  ]
}}

PAPER CONTENT:
{papers_content}
"""

        logger.info(f"Generating on-the-fly carousel content for {len(papers)} papers")
        
        try:
            response = await complete_text(
                capability="carousel_copy",
                default_openai_model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=2000,
            )
            
            result_str = response.text
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
                    "category": paper.category_slug or "SCIENCE",
                    "headline": paper.headline or paper.title,
                    "takeaways": paper.key_takeaways[:3] if paper.key_takeaways else ["No takeaways generated"] * 3
                })
            return fallback_slides

    async def generate_paper_carousel_content(self, paper: Paper, content_type: str = "latest") -> Dict[str, Any]:
        """
        Takes a SINGLE paper and generates the carousel slides formatting.
        Creates meatier content with customized framing based on content_type.
        """
        paper_content = f"Title: {paper.title}\n"
        if paper.key_takeaways:
            paper_content += "Takeaways:\n"
            paper_content += "\n".join(f"- {t}" for t in paper.key_takeaways)
        else:
            paper_content += f"Abstract: {paper.abstract or 'No details provided.'}\n"
            
        if paper.metrics and "why_it_matters" in paper.metrics:
            paper_content += f"\nWhy it matters: {paper.metrics['why_it_matters']}"

        cited_by_count = (paper.metrics or {}).get("cited_by_count", 0)

        if content_type in ("top-papers", "daily-science"):
            paper_content += f"\nCitation count: {cited_by_count:,}"
            paper_content += f"\nPublication year: {paper.publication_date.year if paper.publication_date else 'Unknown'}"

        schema = {
            "type": "object",
            "properties": {
                "paper_id": {"type": "integer"},
                "category": {"type": "string"},
                "headline": {"type": "string"},
                "takeaways": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 3,
                    "maxItems": 5
                },
                "caption": {"type": "string"}
            },
            "required": ["paper_id", "category", "headline", "takeaways", "caption"]
        }

        fwci = (paper.metrics or {}).get("fwci")
        fwci_str = f" Its FWCI is {fwci:.1f} (field-normalised impact)." if fwci else ""

        framing_instructions = "Create a highly engaging, slightly clickbaity hook specifically about this paper."
        if content_type == "top-papers":
            framing_instructions = (
                "This is a PAPER HIGHLIGHT — a landmark, highly-cited paper, NOT breaking news. "
                f"It has been cited {cited_by_count:,} times.{fwci_str} "
                "Write a dramatic, specific headline that names what this paper actually changed. "
                "Use patterns like: 'The paper that rewrote [specific thing]', "
                "'The study that shook [field]', 'How one paper changed [specific real-world thing]'. "
                "Be SPECIFIC to what this paper did — reference the actual discovery, method, or paradigm shift. "
                "Do NOT write generic headlines like 'One of the most influential papers in physics'. "
                "Do NOT say 'new research just dropped' or treat it as recent."
            )
        elif content_type == "top-scientists":
            framing_instructions = "Create a hook that focuses on the scientist's legacy, their groundbreaking contribution in this paper, or the biography of the discovery."
        elif content_type == "daily-science":
            framing_instructions = (
                "The headline is about the CONCEPT, not the paper. "
                "Write a short (max 8 words), punchy headline about the underlying science concept "
                "that a normal person can immediately relate to. "
                "GOOD: 'Floors that harvest your footsteps', 'Why walking generates electricity'. "
                "BAD: 'Cymbal transducers generate 50 mW per step' (too paper-specific). "
                "BAD: 'A review of piezoelectric tile designs' (boring, academic). "
                "Lead with the CONCEPT. Make it feel like a science fact people want to share."
            )

        caption_extra = ""
        if content_type == "top-papers":
            caption_extra = (
                f"\n   - This is a PAPER HIGHLIGHT with {cited_by_count:,} citations. "
                "Frame the caption accordingly: explain why this paper became so influential, "
                "what paradigm it shifted, and its lasting impact on the field. "
                "Do NOT frame it as breaking or recent news."
            )

        takeaway_instructions = (
            "2. `takeaways`: Create exactly 3 distinct, robust paragraphs that break down the paper's methodology, findings, and implications. \n"
            "   CRITICAL CONSTRAINT: Each takeaway MUST be an absolute maximum of 2 sentences long. \n"
            "   Do not use emojis. Explain the concept clearly but in a compelling way."
        )

        caption_instructions = (
            "3. `caption`: Write a 250-300+ word Instagram caption that explains exactly what is happening in the academic paper provided.\n"
            "   - Clearly unpack the core argument, the mechanism being proposed, the methodology used, and the main conclusions drawn.\n"
            "   - Clearly state the research question, explain how the authors approach it, describe the key findings and clarify why those findings matter.\n"
            "   - Briefly address any assumptions, limitations, or implications discussed in the paper.\n"
            "   - Be precise. Use technical language where necessary, but explain it in a way that an intelligent non-expert can follow.\n"
            "   - Avoid fluff, emotional language, or inspirational framing. This is about intellectual transparency. No emojis. Write in coherent, well-developed paragraphs."
            f"{caption_extra}"
        )

        if content_type == "daily-science":
            takeaway_instructions = (
                "2. `takeaways`: Create exactly 3 slides. Each is MAX 2 sentences. Short, dense, specific.\n"
                "   This is a CONCEPT EXPLAINER, not a paper summary. The paper is just your source.\n"
                "   - Slide 1: DEFINE the concept. What IS [the thing]? How does it work at a basic level? "
                "     Write as if the reader has never heard of it. (e.g., 'Piezoelectricity is the ability of "
                "     certain materials to generate an electric charge when squeezed or pressed. Every step you take "
                "     can create a tiny burst of voltage.')\n"
                "   - Slide 2: Give the origin or foundational context. When was this discovered? Who started it? "
                "     Or: what's the key insight that makes it interesting? Use the paper as evidence, but frame it "
                "     as part of a bigger story. (e.g., 'First observed by the Curie brothers in 1880, piezoelectricity "
                "     is now being engineered into floor tiles that capture the energy from footsteps in busy stations.')\n"
                "   - Slide 3: What's the frontier now? What's the cutting edge or unsolved challenge? "
                "     Reference what this paper specifically contributes. (e.g., 'This 2022 review shows that cymbal-type "
                "     transducers outperform flat designs — but efficiency is still below 5%%, leaving huge room to improve.')\n"
                "   BAN: Do NOT just summarise what the paper did. TEACH the concept. The paper is a citation, not the story.\n"
                "   No emojis."
            )

            caption_instructions = (
                "3. `caption`: Write a 250-300+ word Instagram caption structured as a CONCEPT EXPLAINER.\n"
                "   Structure it like a mini-article:\n"
                "   - Paragraph 1: What is [the concept]? Define it clearly for someone who's never heard of it. "
                "     Give the 'aha' moment — the surprising or counterintuitive thing about it.\n"
                "   - Paragraph 2: Brief history or foundational context. When was this discovered? "
                "     What made it possible? Who were the key figures?\n"
                "   - Paragraph 3: What does THIS paper contribute? Now reference the specific paper — "
                "     authors, year, what they found. This is where the paper earns its place as the scientific anchor.\n"
                "   - Paragraph 4: Where is this going? What are the open questions, real-world applications, "
                "     or unsolved challenges?\n"
                "   Balance: ~60%% concept explanation, ~40%% paper-specific content.\n"
                "   No emojis. No fluff. Write clearly and precisely."
            )
            
        user_prompt = f"""{"Generate a concept-explainer post using the following paper as a scientific reference." if content_type == "daily-science" else "Generate engaging Instagram slides for the following paper."}
        
Paper ID = {paper.id}
Category = {paper.category_slug or 'SCIENCE'}
Content Type Context = {content_type}

Your task:
1. `headline`: {framing_instructions} This goes on Slide 1.
{takeaway_instructions}
{caption_instructions}

Ensure your response is a valid JSON object matching this schema:
{{
  "paper_id": 123,
  "category": "SPACE",
  "headline": "A highly engaging hook here",
  "takeaways": ["Slide 1 (max 2 sentences).", "Slide 2 (max 2 sentences).", "Slide 3 (max 2 sentences)."],
  "caption": "Your 250-300+ word caption here..."
}}

PAPER CONTENT:
{paper_content}
"""

        logger.info(f"Generating on-the-fly carousel content for paper {paper.id}")
        
        model = "gpt-4o" if content_type == "daily-science" else "gpt-4o-mini"

        try:
            response = await complete_text(
                capability="carousel_copy",
                default_openai_model=model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=3000,
            )
            
            result_str = response.text
            slide = json.loads(result_str)
            
            logger.info(
                f"Successfully generated carousel for paper {paper.id} "
                f"(provider={response.provider}, model={response.model})"
            )
            return slide
            
        except Exception as e:
            logger.error(f"Failed to generate carousel content for paper: {e}")
            
            # Fallback
            return {
                "paper_id": paper.id,
                "category": paper.category_slug or "SCIENCE",
                "headline": paper.headline or paper.title,
                "takeaways": [
                    "Failed to generate text. Listen to the episode.",
                    "Failed to generate text.",
                    "Failed to generate text."
                ],
                "caption": "Failed to generate AI caption for this paper."
            }
