"""
CronRun model for tracking cron job executions.

Provides observability into scheduled task runs, including
timing, status, results, and error messages.
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Date, DateTime, Float, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.db.session import Base


class CronRun(Base):
    """
    Tracks each execution of a scheduled cron job.
    
    Attributes:
        job_name: Name of the job ('curation' or 'podcast')
        run_date: The date this run was for
        started_at: When the job started
        finished_at: When the job completed
        duration_seconds: How long the job took
        status: Result status ('success', 'failed', 'skipped', 'no_papers')
        result: JSON with job-specific results
        error_message: Full error traceback if failed
    """
    __tablename__ = "cron_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(50), nullable=False, index=True)
    run_date = Column(Date, nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(20), nullable=False, default="running")
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
