"""
Full cron pipeline - runs both curation and podcast in sequence.

Can be triggered manually via CLI.
"""
import asyncio
import argparse
from loguru import logger

from app.db.session import get_async_session
from app.services.editor import EditorEngine
from app.cron.tasks.curate import run_curation_job
from app.cron.tasks.podcast import run_podcast_job


async def run_full_pipeline(dry_run: bool = False) -> dict:
    """
    Run the complete daily pipeline: curation, summarization, then podcast.
    
    Args:
        dry_run: If True, preview without writing to DB
        
    Returns:
        Combined results from all jobs
    """
    logger.info("=" * 60)
    logger.info("EUREKA BRIEF - DAILY PIPELINE")
    logger.info("=" * 60)
    
    # Step 1: Curation
    logger.info("\n[STEP 1/3] Running curation...")
    curation_result = await run_curation_job(dry_run=dry_run)
    
    # Step 2: Summarization (New!)
    # We need summaries generated (with full text) before the podcast script is written
    summarization_result = {}
    if not dry_run:
        logger.info("\n[STEP 2/3] Generating ELI5 summaries (with full-text scraping)...")
        async with get_async_session() as db:
            editor = EditorEngine(db)
            count = await editor.publish_edition()
            summarization_result = {"status": "ok", "summaries_generated": count}
            await db.commit()
            logger.info(f"Summarized {count} papers")
    else:
        logger.info("\n[STEP 2/3] [DRY RUN] Would generate ELI5 summaries")
        summarization_result = {"status": "dry_run"}
    
    # Step 3: Podcast (only if curation found papers)
    logger.info("\n[STEP 3/3] Running podcast generation...")
    podcast_result = await run_podcast_job(dry_run=dry_run)
    
    logger.info("\n" + "=" * 60)
    logger.info("PIPELINE COMPLETE")
    logger.info("=" * 60)
    
    return {
        "curation": curation_result,
        "summarization": summarization_result,
        "podcast": podcast_result,
    }


# CLI entry point
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run full daily pipeline")
    parser.add_argument("--run-now", action="store_true", help="Run immediately")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    args = parser.parse_args()
    
    if args.run_now or args.dry_run:
        asyncio.run(run_full_pipeline(dry_run=args.dry_run))
    else:
        print("Use --run-now to execute, or --dry-run to preview")
        print("\nUsage:")
        print("  python -m app.cron.pipeline --run-now    # Run full pipeline")
        print("  python -m app.cron.pipeline --dry-run    # Preview only")
