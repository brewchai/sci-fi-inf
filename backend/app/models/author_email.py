"""
AuthorEmail model for tracking outreach to scientists whose papers are featured.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class AuthorEmail(Base):
    """
    Tracks emails sent (or pending) to paper authors after their work is featured.

    Attributes:
        paper_id: FK to the featured paper
        episode_id: FK to the podcast episode that featured it
        author_name: Author display name
        author_openalex_id: OpenAlex author ID (e.g. "https://openalex.org/A123...")
        email_address: Resolved email (null if not found yet)
        episode_slug: Episode slug for building the episode URL
        status: "pending" | "sent" | "failed" | "no_email"
        resend_message_id: Resend tracking ID after send
        sent_at: When the email was actually sent
        created_at: When this record was created
    """
    __tablename__ = "author_emails"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    episode_id: Mapped[int] = mapped_column(Integer, ForeignKey("podcast_episodes.id"), nullable=False, index=True)
    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    author_openalex_id: Mapped[str] = mapped_column(String(500), nullable=False)
    email_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    episode_slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    resend_message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    paper = relationship("Paper", backref="author_emails")
    episode = relationship("PodcastEpisode", backref="author_emails")
