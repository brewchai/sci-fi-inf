from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api import deps
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
def get_harvested_tweets(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Get all generated social media posts.
    Protected/Secret endpoint.
    """
    posts = (
        db.query(SocialPost, Paper.title.label("paper_title"))
        .join(Paper, SocialPost.paper_id == Paper.id)
        .order_by(desc(SocialPost.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        SocialPostResponse(
            id=post.SocialPost.id,
            content=post.SocialPost.content,
            paper_title=post.paper_title,
            created_at=post.SocialPost.created_at
        ) 
        for post in posts
    ]
