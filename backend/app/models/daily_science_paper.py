from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import String, Date, Integer, JSON, Text, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class DailySciencePaper(Base):
    """Ephemeral table for Daily Science content engine results.

    Completely isolated from the main `papers` table so rows can be
    fetched, used for carousel/reel generation, and deleted freely
    without affecting the daily curation pipeline.
    """
    __tablename__ = "daily_science_papers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    openalex_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(Text)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publication_date: Mapped[date] = mapped_column(Date)

    metrics: Mapped[dict] = mapped_column(JSON, default={})
    authors_metadata: Mapped[List[dict]] = mapped_column(JSON, default=[])
    topics_metadata: Mapped[List[dict]] = mapped_column(JSON, default=[])

    pdf_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    landing_page_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category_slug: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    headline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    eli5_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_takeaways: Mapped[List[str]] = mapped_column(JSON, default=[])

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
