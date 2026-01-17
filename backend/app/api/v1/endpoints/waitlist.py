"""
Waitlist API endpoint for early access signups.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.db.session import get_async_session
from app.models.waitlist import WaitlistEmail

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str


class WaitlistResponse(BaseModel):
    success: bool
    message: str


@router.post("/waitlist", response_model=WaitlistResponse)
async def join_waitlist(request: WaitlistRequest):
    """Join the early access waitlist."""
    email = request.email.strip().lower()
    
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email")
    
    async with get_async_session() as db:
        # Check if already exists
        stmt = select(WaitlistEmail).where(WaitlistEmail.email == email)
        result = await db.execute(stmt)
        existing = result.scalar()
        
        if existing:
            return WaitlistResponse(
                success=True,
                message="You're already on the list! We'll let you know when we launch."
            )
        
        # Add to waitlist
        entry = WaitlistEmail(email=email)
        db.add(entry)
        
        try:
            await db.commit()
        except IntegrityError:
            return WaitlistResponse(
                success=True,
                message="You're already on the list!"
            )
    
    return WaitlistResponse(
        success=True,
        message="You're in! We'll notify you when we launch."
    )
