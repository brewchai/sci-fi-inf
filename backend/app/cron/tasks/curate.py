"""
Curation cron task.

Harvests papers from OpenAlex for all 10 categories in parallel,
scores them in-memory, and stores only the top 1 per category.
"""
import asyncio
import argparse
from datetime import date, timedelta
from typing import Optional
from loguru import logger

from app.db.session import get_async_session
from app.domain.categories import get_category_registry, Category
from app.services.harvester import OpenAlexHarvester


# Category weights for podcast selection (also used in curate for reference)
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


async def harvest_and_curate_category(
    category: Category,
    lookback_days: int = 7,
    dry_run: bool = False,
) -> Optional[int]:
    """
    Harvest papers for a single category, score in-memory, store top 1.
    
    Args:
        category: The category to harvest for
        lookback_days: How many days back to search
        dry_run: If True, don't write to DB
        
    Returns:
        Paper ID if stored, None if no papers found or dry run
    """
    async with get_async_session() as db:
        harvester = OpenAlexHarvester(db)
        
        from_date = date.today() - timedelta(days=lookback_days)
        
        # Fetch papers (not stored yet)
        raw_papers = await harvester.fetch_papers(
            from_date=from_date,
            category=category,
            per_page=50,  # Fetch enough to have options
        )
        
        if not raw_papers:
            logger.warning(f"No papers found for {category.slug}")
            return None
        
        logger.info(f"Fetched {len(raw_papers)} papers for {category.slug}")
        
        # Score papers in-memory
        scored = []
        for paper in raw_papers:
            score = calculate_paper_score(paper)
            scored.append((score, paper))
        
        # Sort by score descending
        scored.sort(key=lambda x: x[0], reverse=True)
        
        # Get top 2 papers (soft limit - may be fewer if category has limited papers)
        top_papers = [paper for _, paper in scored[:2]]
        for i, (score, paper) in enumerate(scored[:2]):
            logger.info(f"  #{i+1} for {category.slug}: score={score:.2f}, title={paper.get('title', 'Unknown')[:60]}...")
        
        if dry_run:
            logger.info(f"[DRY RUN] Would store {len(top_papers)} papers for {category.slug}")
            return None
        
        # Store top 2
        stored_count = await harvester.process_and_store(
            top_papers, 
            category_slug=category.slug
        )
        
        await db.commit()
        
        if stored_count > 0:
            logger.info(f"Stored {stored_count} paper(s) for {category.slug}")
            return stored_count
        else:
            logger.info(f"Papers for {category.slug} already exist (deduped)")
            return 0


def calculate_paper_score(paper: dict) -> float:
    """
    Calculate curation score for a paper using multi-signal approach.
    
    Signals:
    - cited_by_count (25%): Raw citation count
    - fwci (25%): Field-Weighted Citation Impact
    - indexed_in (5%): PubMed/Scopus indexing bonus
    - is_oa (5%): Open access bonus
    - recency (25%): Newer papers get boost
    """
    # Citations (25%)
    cited_by = paper.get("cited_by_count") or 0
    citation_score = min(cited_by / 100, 1.0) * 25  # Normalize to 0-25
    
    # FWCI (25%)
    fwci = paper.get("fwci") or 0
    fwci_score = min(fwci / 5, 1.0) * 25  # FWCI of 5+ is exceptional
    
    # Indexed In (5%) - Papers in curated databases are higher quality
    indexed_in = paper.get("indexed_in", []) or []
    indexed_score = 0
    if "pubmed" in indexed_in:
        indexed_score = 5  # PubMed = rigorous curation
    elif "scopus" in indexed_in or "crossref" in indexed_in:
        indexed_score = 3
    
    # Open Access (5%)
    oa = paper.get("open_access", {}) or {}
    oa_score = 5 if oa.get("is_oa") else 0
    
    # Recency (25%) - papers from last 48 hours get full bonus
    pub_date_str = paper.get("publication_date")
    recency_score = 0
    if pub_date_str:
        try:
            pub_date = date.fromisoformat(pub_date_str)
            days_ago = (date.today() - pub_date).days
            if days_ago <= 2:
                recency_score = 25
            elif days_ago <= 7:
                recency_score = 25 * (1 - (days_ago - 2) / 5)
        except ValueError:
            pass
    
    total = citation_score + fwci_score + indexed_score + oa_score + recency_score
    return round(total, 2)


async def run_curation_job(dry_run: bool = False) -> dict:
    """
    Run curation for all categories in parallel.
    
    Returns:
        Dict with results per category
    """
    logger.info("Starting daily curation job...")
    
    registry = get_category_registry()
    categories = registry.list_active()
    
    # Run all harvests in parallel
    tasks = [
        harvest_and_curate_category(cat, dry_run=dry_run)
        for cat in categories
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Build summary
    summary = {}
    for category, result in zip(categories, results):
        if isinstance(result, Exception):
            logger.error(f"Curation failed for {category.slug}: {result}")
            summary[category.slug] = {"status": "error", "error": str(result)}
        elif result is None:
            summary[category.slug] = {"status": "no_papers"}
        else:
            summary[category.slug] = {"status": "ok", "stored": result}
    
    success_count = sum(1 for r in results if isinstance(r, int) and r > 0)
    logger.info(f"Curation complete: {success_count}/{len(categories)} categories had new papers")
    
    return summary


# CLI entry point
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run curation cron manually")
    parser.add_argument("--run-now", action="store_true", help="Run immediately")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    args = parser.parse_args()
    
    if args.run_now or args.dry_run:
        asyncio.run(run_curation_job(dry_run=args.dry_run))
    else:
        print("Use --run-now to execute, or --dry-run to preview")
