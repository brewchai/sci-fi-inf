from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from loguru import logger
import json
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.paper import Paper
from app.services.fetcher import FullTextFetcher

class EditorEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
        self.fetcher = FullTextFetcher()

    async def generate_summary(self, paper: Paper) -> bool:
        """
        Generate ELI5 summary using LLM with rich context.
        """
        if not self.client:
            logger.warning("OpenAI API Key missing. Skipping summarization.")
            return False

        # 1. Try to fetch full text for richer context
        # We use pdf_url (which stores the OA URL) or landing_page_url
        full_text = None
        target_url = paper.pdf_url or paper.landing_page_url
        if target_url:
            logger.info(f"Attempting to fetch full text for paper {paper.id} from {target_url}")
            full_text = await self.fetcher.fetch_full_text(target_url)
            if full_text:
                logger.info(f"Successfully fetched full text for paper {paper.id} ({len(full_text)} chars)")
                paper.full_text = full_text
            else:
                logger.warning(f"Could not extract full text for paper {paper.id}, falling back to abstract")

        # Extract metadata for richer context
        authors = paper.authors_metadata or []
        author_names = ", ".join([a.get("author", {}).get("display_name", "Unknown") for a in authors[:3]])
        if len(authors) > 3:
            author_names += f" and {len(authors) - 3} others"
        
        topics = paper.topics_metadata or []
        topic_names = ", ".join([t.get("display_name", "") for t in topics[:3]])
        
        metrics = paper.metrics or {}
        citations = metrics.get("cited_by_count") or 0
        fwci = metrics.get("fwci") or 0
        impact_note = ""
        if fwci and fwci > 1.5:
            impact_note = f"This paper has {fwci:.1f}x the average impact in its field."
        elif citations > 50:
            impact_note = f"This paper has been cited {citations} times."

        system_prompt = """You are a science writer for The Eureka Feed, explaining research to curious people who have NO science background.

Your goal is to make complex research EASY TO UNDERSTAND, like explaining to a smart 10-year-old.

Rules:
1. Use SIMPLE words - if a 5th grader wouldn't understand it, rephrase it
2. Use ANALOGIES - compare complex concepts to everyday things ("It's like when you...")
3. Explain the PROBLEM first - what question were scientists trying to answer?
4. Then explain WHAT they found - in plain English. BE SPECIFIC if you have the full text (results/conclusions).
5. End with WHY this matters to regular people
6. NO jargon - if you must use a technical term, explain it immediately in parentheses
7. Be conversational and friendly, not formal

Output valid JSON with:
{
  "headline": "A clear, engaging headline (avoid clickbait)",
  "eli5_summary": "3-4 short paragraphs: What's the problem? What did they find? How did they do it? Why should I care? Use simple analogies.",
  "key_takeaways": ["3-4 bullet points in simple language"],
  "why_it_matters": "One sentence explaining real-world impact in everyday terms",
  "field": "The field of research (e.g., 'Medicine', 'AI', 'Climate')"
}"""

        # Build context from full text or abstract
        context_label = "Full Text (Results/Conclusions):" if full_text else "Abstract:"
        context_content = full_text if full_text else (paper.abstract or 'No abstract available')

        user_prompt = f"""Paper Details:
- Title: {paper.title}
- Authors: {author_names or 'Not specified'}
- Research Field: {topic_names or 'Not specified'}
- Publication Date: {paper.publication_date}
{impact_note}

{context_label}
{context_content}

Transform this into an engaging story for curious non-experts. Make sure to highlight the actual results and real-world implications."""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            data = json.loads(content)
            
            paper.headline = data.get("headline", paper.title)
            paper.eli5_summary = data.get("eli5_summary", "Summary generation failed.")
            paper.key_takeaways = data.get("key_takeaways", [])
            
            # Store extra fields in metrics for now (or add to model later)
            paper.metrics = paper.metrics or {}
            paper.metrics["why_it_matters"] = data.get("why_it_matters", "")
            paper.metrics["field"] = data.get("field", "")
            
            await self.db.flush()
            return True
            
        except Exception as e:
            logger.error(f"LLM Generation failed for paper {paper.id}: {e}")
            return False

    async def publish_edition(self):
        """
        Generate content for all selected papers that lack a summary.
        """
        stmt = select(Paper).where(Paper.is_selected.is_(True), Paper.eli5_summary.is_(None))
        result = await self.db.execute(stmt)
        papers_to_edit = result.scalars().all()
        
        count = 0
        for paper in papers_to_edit:
            success = await self.generate_summary(paper)
            if success:
                count += 1
                
        return count
