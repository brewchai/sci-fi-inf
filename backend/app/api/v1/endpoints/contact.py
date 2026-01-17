"""
Contact form API endpoint.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from app.db.session import get_async_session
from app.models.contact import ContactMessage

router = APIRouter()


class ContactRequest(BaseModel):
    email: str
    message: str


class ContactResponse(BaseModel):
    success: bool
    message: str


@router.post("/contact", response_model=ContactResponse)
async def submit_contact(request: ContactRequest):
    """Submit a contact form message."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    async with get_async_session() as db:
        contact = ContactMessage(
            email=request.email,
            message=request.message.strip()
        )
        db.add(contact)
        await db.commit()
    
    return ContactResponse(
        success=True,
        message="Thanks for reaching out! We'll get back to you soon."
    )
