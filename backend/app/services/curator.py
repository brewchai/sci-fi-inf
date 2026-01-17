"""
Paper Curator Service.

Uses LLM to rank papers by podcast-worthiness and select the best ones.
"""
from typing import List
from openai import AsyncOpenAI
from loguru import logger

from app.core.config import settings
from app.models.paper import Paper


class PaperCurator:
    """
    LLM-powered curator that ranks papers for podcast selection.
    
    Evaluates papers on:
    - Conclusiveness: Clear findings, not just "we investigated"
    - Novelty: Genuinely new vs. incremental
    - Accessibility: Understandable to general audience
    - Storytelling: Makes a good podcast segment
    """
    
    SYSTEM_PROMPT = """You are a science podcast producer selecting papers for a daily briefing.

Your job: rank papers by how good they'd be for a general-audience podcast.

Score each paper 1-10 on:
- CONCLUSIVE: Does it have clear findings? (Not "we studied X" but "we found that Y")
- NOVEL: Is this genuinely surprising or new?
- ACCESSIBLE: Can a non-scientist understand and care about this?
- STORY: Does it make a good 1-minute podcast segment?

Be harsh. Most papers are incremental or too niche. Only high scores for truly podcast-worthy papers."""

    RANKING_TEMPLATE = """Rank these papers for a science podcast. Return ONLY a JSON array of paper IDs sorted from best to worst, with scores.

Papers:
{papers_content}

Return format (no other text):
[
  {{"id": <paper_id>, "score": <1-10>, "reason": "<1 sentence>"}},
  ...
]"""

    def __init__(self):
        self.llm = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    
    def _format_papers(self, papers: List[Paper]) -> str:
        """Format papers for the LLM prompt."""
        sections = []
        for paper in papers:
            abstract = paper.abstract[:500] if paper.abstract else "No abstract"
            section = f"""ID: {paper.id}
Title: {paper.title}
Abstract: {abstract}..."""
            sections.append(section)
        return "\n\n---\n\n".join(sections)
    
    async def rank_papers(
        self, 
        papers: List[Paper], 
        max_select: int = 10
    ) -> List[Paper]:
        """
        Rank papers by podcast-worthiness and return the best ones.
        
        Args:
            papers: List of candidate papers
            max_select: Maximum number to return
            
        Returns:
            Top papers sorted by LLM ranking
        """
        if not papers:
            return []
        
        if len(papers) <= max_select:
            # Not enough papers to filter, just return all
            logger.info(f"Only {len(papers)} papers, skipping LLM ranking")
            return papers
        
        papers_content = self._format_papers(papers)
        
        logger.info(f"LLM ranking {len(papers)} papers for podcast selection")
        
        try:
            response = await self.llm.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": self.RANKING_TEMPLATE.format(
                        papers_content=papers_content
                    )},
                ],
                temperature=0.3,  # Lower temp for more consistent ranking
                max_tokens=500,
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON response
            import json
            rankings = json.loads(result_text)
            
            # Map IDs to papers
            paper_map = {p.id: p for p in papers}
            ranked_papers = []
            
            for item in rankings[:max_select]:
                paper_id = item.get("id")
                if paper_id in paper_map:
                    ranked_papers.append(paper_map[paper_id])
                    logger.info(f"  Score {item.get('score')}: {paper_map[paper_id].title[:50]}... - {item.get('reason', '')}")
            
            logger.info(f"LLM selected {len(ranked_papers)} papers for podcast pool")
            return ranked_papers
            
        except Exception as e:
            logger.error(f"LLM ranking failed: {e}, falling back to all papers")
            return papers[:max_select]
