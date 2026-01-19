"""
API endpoints for triggering and monitoring cron jobs.

Provides manual trigger endpoints and status checking for:
- Curation job
- Podcast generation job
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from datetime import date
from typing import Optional
from loguru import logger

from sqlalchemy import select, desc
from app.db.session import get_async_session
from app.models.cron_run import CronRun

router = APIRouter(prefix="/cron", tags=["cron"])


@router.post("/curation/trigger")
async def trigger_curation(background_tasks: BackgroundTasks, dry_run: bool = False):
    """
    Manually trigger the curation job.
    
    Runs in background and returns immediately.
    Check /cron/status for results.
    """
    from app.cron.tasks.curate import run_curation_job
    
    logger.info(f"Manual curation trigger requested (dry_run={dry_run})")
    
    # Run in background
    background_tasks.add_task(run_curation_job, dry_run=dry_run)
    
    return {
        "status": "triggered",
        "job": "curation",
        "dry_run": dry_run,
        "message": "Curation job started in background. Check /cron/status for results."
    }


@router.post("/podcast/trigger")
async def trigger_podcast(background_tasks: BackgroundTasks, dry_run: bool = False):
    """
    Manually trigger the podcast generation job.
    
    Runs in background and returns immediately.
    Check /cron/status for results.
    """
    from app.cron.tasks.podcast import run_podcast_job
    
    logger.info(f"Manual podcast trigger requested (dry_run={dry_run})")
    
    # Run in background
    background_tasks.add_task(run_podcast_job, dry_run=dry_run)
    
    return {
        "status": "triggered",
        "job": "podcast",
        "dry_run": dry_run,
        "message": "Podcast job started in background. Check /cron/status for results."
    }


@router.get("/status")
async def get_cron_status(limit: int = 10, job_name: Optional[str] = None):
    """
    Get recent cron job run history.
    
    Args:
        limit: Max number of runs to return (default 10)
        job_name: Filter by job name ('curation' or 'podcast')
    """
    async with get_async_session() as db:
        stmt = select(CronRun).order_by(desc(CronRun.started_at)).limit(limit)
        
        if job_name:
            stmt = stmt.where(CronRun.job_name == job_name)
        
        result = await db.execute(stmt)
        runs = result.scalars().all()
        
        return {
            "runs": [
                {
                    "id": run.id,
                    "job_name": run.job_name,
                    "run_date": run.run_date.isoformat() if run.run_date else None,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                    "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                    "duration_seconds": run.duration_seconds,
                    "status": run.status,
                    "result": run.result,
                    "error_message": run.error_message[:500] if run.error_message else None,
                }
                for run in runs
            ]
        }


@router.get("/status/latest")
async def get_latest_cron_status():
    """
    Get the latest run for each job type.
    Quick overview of current state.
    """
    async with get_async_session() as db:
        latest = {}
        
        for job_name in ["curation", "podcast"]:
            stmt = (
                select(CronRun)
                .where(CronRun.job_name == job_name)
                .order_by(desc(CronRun.started_at))
                .limit(1)
            )
            result = await db.execute(stmt)
            run = result.scalar_one_or_none()
            
            if run:
                latest[job_name] = {
                    "run_date": run.run_date.isoformat() if run.run_date else None,
                    "status": run.status,
                    "duration_seconds": run.duration_seconds,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                }
            else:
                latest[job_name] = None
        
        return latest
