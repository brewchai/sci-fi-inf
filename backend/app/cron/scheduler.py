"""
APScheduler configuration for The Eureka Feed cron jobs.

Two scheduled jobs:
1. Curation: Runs at 4:00 AM UTC daily
2. Podcast: Runs at 6:00 AM UTC daily

Both can be triggered manually via CLI or API.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

# Global scheduler instance
scheduler = AsyncIOScheduler()


def setup_scheduler() -> AsyncIOScheduler:
    """
    Configure and return the scheduler with all jobs.
    
    Call this during app startup, then call scheduler.start()
    """
    from app.cron.tasks.curate import run_curation_job
    from app.cron.tasks.podcast import run_podcast_job
    
    # Curation job - 4:00 AM UTC daily
    scheduler.add_job(
        run_curation_job,
        CronTrigger(hour=4, minute=0, timezone="UTC"),
        id="daily_curation",
        name="Daily Paper Curation",
        replace_existing=True,
    )
    
    # Podcast job - 6:00 AM UTC daily
    scheduler.add_job(
        run_podcast_job,
        CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="daily_podcast",
        name="Daily Podcast Generation",
        replace_existing=True,
    )
    
    logger.info("Scheduler configured with curation (4 AM UTC) and podcast (6 AM UTC) jobs")
    return scheduler


def get_scheduler() -> AsyncIOScheduler:
    """Get the global scheduler instance."""
    return scheduler
