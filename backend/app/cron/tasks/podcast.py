"""
Podcast generation cron task.

Queries curated papers not yet used in episodes,
applies weighted random selection (3-4 papers),
generates script + audio, marks papers as used.
"""
import asyncio
import argparse
import random
from datetime import date
from typing import List
from loguru import logger

from sqlalchemy import select, and_
from app.db.session import get_async_session
from app.models.paper import Paper
from app.services.podcast import PodcastGenerator
from app.services.curator import PaperCurator


# Category weights - higher = more likely to appear in podcast
CATEGORY_WEIGHTS = {
    "ai_tech": 0.15,
    "health_medicine": 0.15,
    "brain_mind": 0.12,
    "climate_environment": 0.12,
    "physics": 0.10,
    "biology": 0.10,
    "energy": 0.08,
    "economics": 0.08,
    "chemistry": 0.05,
    "food_agriculture": 0.05,
}

PAPERS_PER_EPISODE = 3  # 3 papers (~3-4 min podcast)


async def get_unused_curated_papers() -> List[Paper]:
    """
    Get all curated papers that haven't been used in an episode yet.
    """
    async with get_async_session() as db:
        stmt = select(Paper).where(
            and_(
                Paper.is_selected == True,
                Paper.is_used_in_episode == False,
            )
        ).order_by(Paper.publication_date.desc())
        
        result = await db.execute(stmt)
        papers = result.scalars().all()
        return list(papers)


def weighted_select(papers: List[Paper], count: int = PAPERS_PER_EPISODE) -> List[Paper]:
    """
    Select papers using weighted random sampling based on category popularity.
    
    Args:
        papers: List of available papers
        count: How many to select
        
    Returns:
        Selected papers (may be fewer if not enough available)
    """
    if len(papers) <= count:
        return papers
    
    # Get category for each paper
    weights = []
    for paper in papers:
        category = paper.metrics.get("category", "") if paper.metrics else ""
        weight = CATEGORY_WEIGHTS.get(category, 0.05)
        
        # Prioritize papers with full text (2.0x boost)
        if paper.full_text:
            weight *= 2.0
            
        weights.append(weight)
    
    # Weighted random selection without replacement
    selected = []
    remaining_papers = list(papers)
    remaining_weights = list(weights)
    
    for _ in range(count):
        if not remaining_papers:
            break
        
        # Normalize weights
        total = sum(remaining_weights)
        if total == 0:
            break
        
        normalized = [w / total for w in remaining_weights]
        
        # Pick one
        chosen_idx = random.choices(range(len(remaining_papers)), weights=normalized, k=1)[0]
        selected.append(remaining_papers[chosen_idx])
        
        # Remove from remaining
        remaining_papers.pop(chosen_idx)
        remaining_weights.pop(chosen_idx)
    
    return selected


async def mark_papers_used(paper_ids: List[int]) -> None:
    """Mark papers as used in an episode."""
    async with get_async_session() as db:
        stmt = select(Paper).where(Paper.id.in_(paper_ids))
        result = await db.execute(stmt)
        papers = result.scalars().all()
        
        for paper in papers:
            paper.is_used_in_episode = True
        
        await db.commit()
        logger.info(f"Marked {len(papers)} papers as used")


async def run_podcast_job(dry_run: bool = False) -> dict:
    """
    Generate daily podcast from curated papers.
    
    Returns:
        Dict with episode info or error
    """
    logger.info("Starting daily podcast generation...")
    
    # Get available papers
    papers = await get_unused_curated_papers()
    
    if not papers:
        logger.warning("No unused curated papers available for podcast")
        return {"status": "no_papers"}
    
    logger.info(f"Found {len(papers)} unused curated papers")
    
    # LLM ranks papers and selects top 10 for podcast pool
    curator = PaperCurator()
    curated_pool = await curator.rank_papers(papers, max_select=10)
    logger.info(f"LLM curated pool: {len(curated_pool)} papers")
    
    # Select papers for this episode from curated pool
    selected = weighted_select(curated_pool, PAPERS_PER_EPISODE)
    logger.info(f"Selected {len(selected)} papers for episode")
    
    for p in selected:
        category = p.metrics.get("category", "unknown") if p.metrics else "unknown"
        logger.info(f"  - [{category}] {p.title[:60]}...")
    
    if dry_run:
        logger.info("[DRY RUN] Would generate podcast with above papers")
        return {"status": "dry_run", "papers": len(selected)}
    
    # Generate episode
    async with get_async_session() as db:
        generator = PodcastGenerator(db)
        
        try:
            episode = await generator.generate_episode(
                paper_ids=[p.id for p in selected],
                episode_date=date.today(),
            )
            
            await db.commit()
            
            # Mark papers as used
            await mark_papers_used([p.id for p in selected])
            
            logger.info(f"Generated episode {episode.id}: {episode.title}")
            
            return {
                "status": "ok",
                "episode_id": episode.id,
                "title": episode.title,
                "papers": len(selected),
                "audio_url": episode.audio_url,
            }
            
        except Exception as e:
            logger.error(f"Failed to generate podcast: {e}")
            return {"status": "error", "error": str(e)}


# CLI entry point
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run podcast generation manually")
    parser.add_argument("--run-now", action="store_true", help="Run immediately")
    parser.add_argument("--dry-run", action="store_true", help="Preview without generating")
    args = parser.parse_args()
    
    if args.run_now or args.dry_run:
        asyncio.run(run_podcast_job(dry_run=args.dry_run))
    else:
        print("Use --run-now to execute, or --dry-run to preview")
