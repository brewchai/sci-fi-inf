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
    
    SYSTEM_PROMPT = """You are curating AI research for a tech-savvy audience in early 2026.

**Current AI Landscape (2026):**
- **Leading Models:** GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, DeepSeek V3, o1 (reasoning model)
- **Hot Topics:** AI agents, reasoning models, multimodal AI, AI safety/alignment, open-source LLMs
- **Major Players:** OpenAI, Anthropic, Google DeepMind, Meta AI, xAI, DeepSeek, Mistral
- **Trending:** Function calling, chain-of-thought reasoning, vision-language models, AI coding assistants

Your job: rank papers by VIRAL POTENTIAL and RELEVANCE to what people care about RIGHT NOW.

Prioritize papers about:
- **LLMs & Reasoning** (GPT-4o-level models, o1-style reasoning, chain-of-thought)
- **AI Agents** (autonomous agents, tool use, multi-step reasoning)
- **Multimodal AI** (vision-language models, video generation, audio)
- **AI Safety & Alignment** (RLHF, constitutional AI, interpretability, jailbreaks)
- **Open Source** (Llama 3+, DeepSeek, Mistral, democratizing AI)
- **Breakthrough Techniques** (new architectures, training efficiency, scaling laws)

Score each paper 1-10 on:
- **TRENDING**: Is this about what people are discussing NOW? (agents, reasoning, multimodal)
- **IMPACT**: Will this change how people build/use AI in 2026?
- **ACCESSIBLE**: Can a tech-savvy person (not just researchers) understand this?
- **VIRAL**: Would this get shared on Twitter/HN/Reddit TODAY?

Be harsh. Ignore incremental improvements. Only high scores for papers that will make people say "wow, this is the future.\""""

    RANKING_TEMPLATE = """Rank these AI research papers by VIRAL POTENTIAL for a tech audience.

Papers:
{papers_content}

Prioritize:
1. Papers about LLMs (GPT, Claude, Gemini, DeepSeek, Llama, Kimi, xAI)
2. Breakthrough techniques that will trend on social media
3. Papers that non-researchers can understand and get excited about
4. Research from top labs (OpenAI, Google, Anthropic, Meta, etc.)

Return ONLY a JSON array of paper IDs sorted from MOST to LEAST viral:
[
  {{"id": <paper_id>, "score": <1-10>, "reason": "<why this will trend>"}},
  ...
]

No other text. Just valid JSON."""

    def __init__(self, model: str = "gpt-4o-mini"):
        self.llm = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = model
    
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
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": self.RANKING_TEMPLATE.format(
                        papers_content=papers_content
                    )},
                ],
                temperature=0.3,
                max_tokens=1500,  # Increased for longer responses
            )
            
            result_text = response.choices[0].message.content.strip()
            logger.debug(f"Raw LLM response: {result_text[:500]}...")
            
            # Parse JSON response - handle markdown code blocks
            import json
            import re
            
            # Strip markdown code blocks if present
            if result_text.startswith("```"):
                # Remove ```json and ``` 
                result_text = re.sub(r'^```(?:json)?\s*', '', result_text)
                result_text = re.sub(r'\s*```$', '', result_text)
            
            # Try to parse JSON
            try:
                rankings = json.loads(result_text)
            except json.JSONDecodeError:
                # Try to extract JSON array from text
                json_match = re.search(r'\[[\s\S]*\]', result_text)
                if json_match:
                    rankings = json.loads(json_match.group())
                else:
                    logger.warning("Could not parse LLM response as JSON")
                    return papers[:max_select]
            
            # Map IDs to papers
            paper_map = {p.id: p for p in papers}
            ranked_papers = []
            
            for item in rankings[:max_select]:
                paper_id = item.get("id")
                if paper_id in paper_map:
                    ranked_papers.append(paper_map[paper_id])
                    logger.info(f"  Score {item.get('score')}: {paper_map[paper_id].title[:50]}... - {item.get('reason', '')}")
            
            if ranked_papers:
                logger.info(f"LLM selected {len(ranked_papers)} papers for podcast pool")
                return ranked_papers
            else:
                logger.warning("No valid paper IDs in LLM response, falling back")
                return papers[:max_select]
            
        except Exception as e:
            logger.error(f"LLM ranking failed: {e}, falling back to all papers")
            return papers[:max_select]

