from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.session import get_db
from app.models.social import SocialPost
from app.models.paper import Paper
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class SocialPostResponse(BaseModel):
    id: int
    content: str
    paper_title: str
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.get("/harvest", response_model=List[SocialPostResponse])
async def get_harvested_tweets(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Get all generated social media posts.
    Protected/Secret endpoint.
    """
    result = await db.execute(
        select(SocialPost, Paper.title.label("paper_title"))
        .join(Paper, SocialPost.paper_id == Paper.id)
        .order_by(desc(SocialPost.created_at))
        .offset(skip)
        .limit(limit)
    )
    
    posts = result.all()
    
    return [
        SocialPostResponse(
            id=post.SocialPost.id,
            content=post.SocialPost.content,
            paper_title=post.paper_title,
            created_at=post.SocialPost.created_at
        ) 
        for post in posts
    ]
