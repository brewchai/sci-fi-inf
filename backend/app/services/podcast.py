"""
Podcast generator service.

Combines multiple paper summaries into a single podcast script,
then generates audio using TTS.
"""
from datetime import date
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI
from loguru import logger

from app.core.config import settings
from app.models.paper import Paper
from app.models.podcast import PodcastEpisode
from app.services.tts import TTSGenerator


class PodcastGenerator:
    """
    Generates podcast episodes from paper summaries.
    
    Flow:
    1. Fetch papers by IDs
    2. Generate combined podcast script via LLM
    3. Convert script to audio via TTS
    4. Save episode record
    """
    
    SCRIPT_SYSTEM_PROMPT = """You are the host of The Eureka Feed, a beloved daily science podcast for the genuinely curious.

Your style:
- Warm and genuinely excited about discoveries (not fake-enthusiastic)
- Uses vivid analogies and relatable comparisons to make complex ideas click
- Varies sentence rhythm — short punchy lines for impact, longer flowing ones for explanation
- Occasionally uses rhetorical questions to hook listeners
- Sounds like a curious friend who stayed up late reading papers and can't wait to share

When explaining complex concepts:
- Give the interesting bit first, then briefly explain the science behind it
- Use the "like/unlike" pattern: "It's like [familiar thing], except [key difference]"
- If there's jargon, translate it immediately: "CRISPR — basically molecular scissors for DNA"
- Add one sentence of context when needed so the discovery makes sense

Trust your listeners' curiosity. Not everything needs to be personally relevant — sometimes a discovery is just wonderfully strange or elegant, and that's enough."""

    SCRIPT_USER_TEMPLATE = """Create a podcast script combining these research discoveries into a cohesive 3-minute briefing for The Eureka Feed.

{papers_content}

Requirements:
- Open with: "Welcome. You're listening to The Eureka Feed, where we bridge the gap between publication and podcast in record time." (Never say "Welcome back")
- Lead each story with a hook — a surprising fact, a "what if," or an intriguing question
- Explain tough concepts clearly using analogies or simple comparisons
- Transition smoothly between papers — find thematic links where possible
- Vary the energy: build excitement for one story, let another breathe with a moment of wonder
- Close warmly, leaving listeners curious about what's next
- Target length: 400-500 words (roughly 3 minutes spoken)

Avoid:
- Clichés like "groundbreaking," "revolutionary," or "scientists have discovered"
- Forced personal relevance ("this could change YOUR life!")
- Generic sign-offs

Write the script as a single block of flowing text, ready to be read aloud."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.tts = TTSGenerator()
    
    async def fetch_papers(self, paper_ids: List[int]) -> List[Paper]:
        """Fetch papers by their IDs."""
        result = await self.db.execute(
            select(Paper).where(Paper.id.in_(paper_ids))
        )
        papers = result.scalars().all()
        
        if len(papers) != len(paper_ids):
            found_ids = {p.id for p in papers}
            missing = set(paper_ids) - found_ids
            logger.warning(f"Some papers not found: {missing}")
        
        return list(papers)
    
    def _format_papers_for_prompt(self, papers: List[Paper]) -> str:
        """Format papers into content for the LLM prompt."""
        sections = []
        for i, paper in enumerate(papers, 1):
            # Extract why_it_matters from metrics if available
            why_it_matters = paper.metrics.get("why_it_matters", "") if paper.metrics else ""
            field = paper.metrics.get("field", "") if paper.metrics else ""
            
            section = f"""Paper {i}: {paper.title}
Field: {field}
Summary: {paper.eli5_summary or paper.abstract[:500] if paper.abstract else 'No summary available'}
Why it matters: {why_it_matters}"""
            sections.append(section)
        
        return "\n\n---\n\n".join(sections)
    
    async def generate_script(self, papers: List[Paper]) -> str:
        """Generate podcast script using LLM."""
        papers_content = self._format_papers_for_prompt(papers)
        
        logger.info(f"Generating podcast script for {len(papers)} papers")
        
        response = await self.llm.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": self.SCRIPT_SYSTEM_PROMPT},
                {"role": "user", "content": self.SCRIPT_USER_TEMPLATE.format(
                    papers_content=papers_content
                )},
            ],
            temperature=0.7,
            max_tokens=1000,
        )
        
        script = response.choices[0].message.content
        logger.info(f"Generated script: {len(script)} chars")
        
        return script
    
    async def generate_episode(
        self,
        paper_ids: List[int],
        episode_date: Optional[date] = None,
        title: Optional[str] = None,
        voice: str = "nova",
    ) -> PodcastEpisode:
        """
        Generate a complete podcast episode.
        
        Args:
            paper_ids: List of paper IDs to include
            episode_date: Date for the episode (defaults to today)
            title: Episode title (auto-generated if not provided)
            voice: TTS voice to use
            
        Returns:
            PodcastEpisode record (saved to DB)
        """
        from app.services.storage import StorageService
        
        episode_date = episode_date or date.today()
        title = title or f"The Eureka Feed - {episode_date.strftime('%b %d')}"
        
        # Create episode record with pending status
        episode = PodcastEpisode(
            episode_date=episode_date,
            title=title,
            paper_ids=paper_ids,
            status="generating",
        )
        self.db.add(episode)
        await self.db.flush()
        
        try:
            # Fetch papers
            papers = await self.fetch_papers(paper_ids)
            if not papers:
                raise ValueError("No papers found with the given IDs")
            
            # Generate script
            script = await self.generate_script(papers)
            episode.script = script
            
            # Generate audio
            audio_bytes = await self.tts.generate_audio(script, voice=voice)
            
            # Upload to Supabase Storage
            audio_filename = f"podcast_{episode.id}_{episode_date.isoformat()}.mp3"
            
            try:
                storage = StorageService()
                audio_url = storage.upload_audio(audio_bytes, audio_filename)
                episode.audio_url = audio_url
            except Exception as storage_error:
                logger.warning(f"Failed to upload to Supabase Storage, saving locally: {storage_error}")
                # Fallback to local storage if Supabase fails
                audio_path = f"/tmp/{audio_filename}"
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)
                episode.audio_url = audio_path
            
            episode.duration_seconds = TTSGenerator.estimate_duration(script)
            episode.status = "ready"
            
            await self.db.flush()
            logger.info(f"Episode {episode.id} generated successfully")
            
        except Exception as e:
            logger.error(f"Failed to generate episode: {e}")
            episode.status = "failed"
            await self.db.flush()
            raise
        
        return episode

