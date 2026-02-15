from datetime import date
from typing import Optional, List
from sqlalchemy import String, Date, Integer, JSON, Text, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base

class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    openalex_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(Text)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publication_date: Mapped[date] = mapped_column(Date)
    
    # Metrics stored as JSON to allow evolving logic
    # e.g. {"citation_count": 10, "citation_velocity": 0.5, "impact_factor": 2.1}
    metrics: Mapped[dict] = mapped_column(JSON, default={})
    
    # Store raw authors/topics metadata
    authors_metadata: Mapped[List[dict]] = mapped_column(JSON, default=[])
    topics_metadata: Mapped[List[dict]] = mapped_column(JSON, default=[])
    
    # URLs
    pdf_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    landing_page_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Curation Fields
    curation_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True, index=True)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)
    is_used_in_episode: Mapped[bool] = mapped_column(Boolean, default=False)
    category_slug: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    # AI Curation Fields (NEW)
    has_full_text: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    full_text_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'openalex_pdf', 'arxiv', etc.
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True, index=True)  # 0-100 quality score
    llm_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # LLM-assigned rank (1-5)

    # Editorial Content (LLM Generated)
    headline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    eli5_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_takeaways: Mapped[List[str]] = mapped_column(JSON, default=[])
    
    # Premium Content (AI Category Only)
    deep_analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    code_walkthrough: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    practical_applications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


