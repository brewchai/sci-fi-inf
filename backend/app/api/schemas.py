"""
API request and response schemas.

This module defines Pydantic models for API request validation
and response serialization to ensure type safety and documentation.
"""
from __future__ import annotations

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class CategoryResponse(BaseModel):
    """Response schema for a category."""
    slug: str = Field(..., description="URL-safe category identifier")
    display_name: str = Field(..., description="Human-readable category name")
    emoji: str = Field(..., description="Category icon emoji")
    description: str = Field(..., description="Brief category description")
    
    class Config:
        json_schema_extra = {
            "example": {
                "slug": "ai_tech",
                "display_name": "AI & Technology",
                "emoji": "🤖",
                "description": "Artificial intelligence, machine learning, and computer science research"
            }
        }


class PaperSummary(BaseModel):
    """Response schema for a paper in list views."""
    id: int = Field(..., description="Database ID")
    title: str = Field(..., description="Paper title")
    headline: Optional[str] = Field(None, description="AI-generated catchy headline")
    publication_date: date = Field(..., description="Publication date")
    is_selected: bool = Field(False, description="Whether curated for the edition")
    has_summary: bool = Field(False, description="Whether ELI5 summary exists")
    curation_score: Optional[float] = Field(None, description="Curation ranking score")


class PaperDetail(BaseModel):
    """Response schema for full paper details."""
    id: int = Field(..., description="Database ID")
    title: str = Field(..., description="Paper title")
    headline: Optional[str] = Field(None, description="AI-generated catchy headline")
    eli5_summary: Optional[str] = Field(None, description="ELI5 summary of the paper")
    key_takeaways: list[str] = Field(default_factory=list, description="Key points from the paper")
    publication_date: date = Field(..., description="Publication date")
    curation_score: Optional[float] = Field(None, description="Curation ranking score")
    doi: Optional[str] = Field(None, description="Digital Object Identifier URL")
    pdf_url: Optional[str] = Field(None, description="Direct link to PDF if available")
    why_it_matters: str = Field("", description="Real-world impact statement")
    field: str = Field("", description="Research field categorization")
    category: Optional[str] = Field(None, description="Category slug if assigned")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 42,
                "title": "Large Language Models for Scientific Discovery",
                "headline": "AI Models Are Now Writing Research Papers — Here's Why That Matters",
                "eli5_summary": "Scientists trained a computer to read millions of papers...",
                "key_takeaways": ["LLMs can summarize papers", "Accuracy is 87%"],
                "publication_date": "2025-01-10",
                "curation_score": 8.5,
                "doi": "https://doi.org/10.1234/example",
                "pdf_url": "https://arxiv.org/pdf/...",
                "why_it_matters": "Could accelerate drug discovery by 10x",
                "field": "Computer Science",
                "category": "ai_tech"
            }
        }


class PipelineRequest(BaseModel):
    """Request schema for triggering the pipeline."""
    category: Optional[str] = Field(
        None,
        description="Category slug to filter papers. If not provided, fetches all categories.",
        example="ai_tech",
    )
    from_days_ago: int = Field(
        1,
        ge=1,
        le=30,
        description="How many days back to fetch papers (1-30)",
    )
    harvest_limit: int = Field(
        50,
        ge=10,
        le=200,
        description="Max papers to fetch from OpenAlex (10-200)",
    )
    select_limit: int = Field(
        5,
        ge=1,
        le=20,
        description="Number of top papers to select for curation (1-20)",
    )


class PipelineResponse(BaseModel):
    """Response schema for pipeline execution."""
    status: str = Field(..., description="Pipeline execution status")
    category: Optional[str] = Field(None, description="Category that was processed")
    harvested: int = Field(..., description="Number of papers fetched from OpenAlex")
    selected: int = Field(..., description="Number of papers selected for edition")
    edited: int = Field(..., description="Number of papers with generated summaries")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "category": "ai_tech",
                "harvested": 50,
                "selected": 5,
                "edited": 5
            }
        }


class RegenerateSummaryResponse(BaseModel):
    """Response schema for summary regeneration."""
    status: str = Field(..., description="Operation status")
    paper: PaperDetail = Field(..., description="Updated paper with new summary")
