"""
PodcastEpisode model for storing daily audio briefings.
"""
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import String, Date, Integer, JSON, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class PodcastEpisode(Base):
    """
    Represents a daily podcast episode combining multiple paper summaries.
    
    Attributes:
        id: Unique episode ID
        episode_date: The date this episode represents
        title: Episode title (e.g., "Your Daily Discovery - Jan 13")
        paper_ids: List of paper IDs included in this episode
        script: LLM-generated podcast script (text format)
        audio_url: URL to the audio file in storage
        duration_seconds: Length of audio in seconds
        status: Generation status (pending, generating, ready, failed)
        created_at: When the episode was created
    """
    __tablename__ = "podcast_episodes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    episode_date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(255))
    paper_ids: Mapped[List[int]] = mapped_column(JSON, default=[])
    script: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slug: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
