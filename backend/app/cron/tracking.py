"""
Cron run logging utilities.

Provides a context manager to automatically track cron job executions.
"""
import traceback
from datetime import date, datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager
from loguru import logger

from app.db.session import get_async_session
from app.models.cron_run import CronRun


@asynccontextmanager
async def track_cron_run(job_name: str, run_date: Optional[date] = None):
    """
    Context manager to track a cron job execution.
    
    Usage:
        async with track_cron_run("podcast") as tracker:
            # do work
            tracker.set_result({"episode_id": 5})
            # or on error, exception is automatically captured
    """
    run_date = run_date or date.today()
    started_at = datetime.utcnow()
    
    tracker = CronRunTracker(job_name, run_date, started_at)
    
    try:
        yield tracker
        await tracker.finish("success")
    except Exception as e:
        await tracker.finish("failed", error=e)
        raise


class CronRunTracker:
    """Helper class to track cron run metadata."""
    
    def __init__(self, job_name: str, run_date: date, started_at: datetime):
        self.job_name = job_name
        self.run_date = run_date
        self.started_at = started_at
        self.result: Dict[str, Any] = {}
        self.status: Optional[str] = None
    
    def set_result(self, result: Dict[str, Any]):
        """Set the result data for this run."""
        self.result = result
    
    def set_status(self, status: str):
        """Override the status (e.g., 'skipped', 'no_papers')."""
        self.status = status
    
    async def finish(self, status: str, error: Optional[Exception] = None):
        """Save the cron run record to database."""
        finished_at = datetime.utcnow()
        duration = (finished_at - self.started_at).total_seconds()
        
        # Use override status if set
        final_status = self.status or status
        
        error_message = None
        if error:
            error_message = f"{type(error).__name__}: {str(error)}\n\n{traceback.format_exc()}"
        
        async with get_async_session() as db:
            cron_run = CronRun(
                job_name=self.job_name,
                run_date=self.run_date,
                started_at=self.started_at,
                finished_at=finished_at,
                duration_seconds=duration,
                status=final_status,
                result=self.result if self.result else None,
                error_message=error_message,
            )
            db.add(cron_run)
            await db.commit()
            
            logger.info(
                f"Cron run logged: {self.job_name} on {self.run_date} - "
                f"{final_status} ({duration:.2f}s)"
            )
