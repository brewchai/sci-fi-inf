"""
Admin API endpoints for manual cron triggers.

Protected with X-Admin-Key header.
"""
from fastapi import APIRouter, HTTPException, Header
from loguru import logger

from app.core.config import settings
from app.cron.tasks.curate import run_curation_job
from app.cron.tasks.podcast import run_podcast_job
from app.cron.pipeline import run_full_pipeline


router = APIRouter(prefix="/admin/cron", tags=["admin"])


def verify_admin_key(x_admin_key: str = Header(None)) -> bool:
    """Verify the admin API key."""
    expected_key = getattr(settings, 'ADMIN_API_KEY', None)
    
    if not expected_key:
        raise HTTPException(
            status_code=500,
            detail="ADMIN_API_KEY not configured"
        )
    
    if x_admin_key != expected_key:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin key"
        )
    
    return True


@router.post("/curate")
async def trigger_curation(x_admin_key: str = Header(...)):
    """Manually trigger the curation cron job."""
    verify_admin_key(x_admin_key)
    
    logger.info("Manual curation trigger via API")
    result = await run_curation_job(dry_run=False)
    
    return {"status": "ok", "result": result}


@router.post("/podcast")
async def trigger_podcast(x_admin_key: str = Header(...)):
    """Manually trigger the podcast generation cron job."""
    verify_admin_key(x_admin_key)
    
    logger.info("Manual podcast trigger via API")
    result = await run_podcast_job(dry_run=False)
    
    return {"status": "ok", "result": result}


@router.post("/pipeline")
async def trigger_full_pipeline(x_admin_key: str = Header(...), dry_run: bool = False):
    """Manually trigger the full pipeline (curation + podcast)."""
    verify_admin_key(x_admin_key)
    
    logger.info(f"Manual pipeline trigger via API (dry_run={dry_run})")
    result = await run_full_pipeline(dry_run=dry_run)
    
    return {"status": "ok", "result": result}
