"""
OpenAlex Harvester Service.

This module handles fetching and storing research papers from the OpenAlex API.
Supports filtering by category and proper error handling.
"""
from __future__ import annotations

import httpx
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from loguru import logger

from app.core.config import settings
from app.models.paper import Paper
from app.domain.categories import Category


class OpenAlexHarvester:
    """
    Service for harvesting research papers from OpenAlex.
    
    Attributes:
        db: Async database session for storing papers.
        api_url: Base URL for OpenAlex API.
        
    Example:
        >>> async with AsyncSession() as session:
        ...     harvester = OpenAlexHarvester(session)
        ...     papers = await harvester.fetch_papers(category=ai_category)
        ...     count = await harvester.process_and_store(papers)
    """
    
    DEFAULT_LOOKBACK_DAYS: int = 1
    DEFAULT_PER_PAGE: int = 50
    REQUEST_TIMEOUT_SECONDS: float = 30.0
    
    def __init__(self, db: AsyncSession) -> None:
        """
        Initialize the harvester.
        
        Args:
            db: Async database session for storing papers.
        """
        self.db = db
        self.api_url = settings.OPENALEX_API_URL
    
    def _build_filter_string(
        self,
        from_date: date,
        category: Optional[Category] = None,
    ) -> str:
        """
        Build the OpenAlex filter parameter string.
        
        Args:
            from_date: Start date for publication filter.
            category: Optional category to filter by field IDs.
            
        Returns:
            Filter string for OpenAlex API.
        """
        filters = [
            f"from_publication_date:{from_date}",
            "type:article|review",  # Only peer-reviewed articles and reviews
            "has_abstract:true",
            "primary_location.version:publishedVersion",  # Final published only
        ]
        
        if category is not None:
            # Use topics.field.id for field-level filtering
            field_filter = f"topics.field.id:{category.openalex_filter_value}"
            filters.append(field_filter)
        
        return ",".join(filters)
    
    def _build_request_headers(self) -> dict[str, str]:
        """
        Build request headers including polite pool identification.
        
        Returns:
            Headers dict for HTTP request.
        """
        headers = {}
        if settings.OPENALEX_MAILTO:
            # OpenAlex Polite Pool requires mailto in User-Agent
            headers["User-Agent"] = f"mailto:{settings.OPENALEX_MAILTO}"
        return headers

    async def fetch_papers(
        self,
        from_date: Optional[date] = None,
        category: Optional[Category] = None,
        per_page: int = DEFAULT_PER_PAGE,
    ) -> list[dict]:
        """
        Fetch papers from OpenAlex API.
        
        Args:
            from_date: Start date for papers. Defaults to yesterday.
            category: Optional category to filter papers by topic.
            per_page: Number of results per request (max 200).
            
        Returns:
            List of raw paper dictionaries from OpenAlex.
            
        Raises:
            Does not raise - returns empty list on error.
        """
        if from_date is None:
            from_date = date.today() - timedelta(days=self.DEFAULT_LOOKBACK_DAYS)
        
        filter_string = self._build_filter_string(from_date, category)
        
        params = {
            "filter": filter_string,
            "sort": "cited_by_count:desc",
            "per_page": min(per_page, 200),  # OpenAlex max is 200
        }
        
        headers = self._build_request_headers()
        
        logger.info(
            f"Fetching papers from OpenAlex: filter={filter_string}, "
            f"category={category.slug if category else 'none'}"
        )
        
        async with httpx.AsyncClient(
            headers=headers,
            timeout=self.REQUEST_TIMEOUT_SECONDS,
        ) as client:
            try:
                response = await client.get(f"{self.api_url}/works", params=params)
                response.raise_for_status()
                data = response.json()
                
                results = data.get("results", [])
                logger.info(f"Fetched {len(results)} papers from OpenAlex")
                return results
                
            except httpx.TimeoutException:
                logger.error("OpenAlex request timed out")
                return []
            except httpx.HTTPStatusError as e:
                logger.error(f"OpenAlex returned error: {e.response.status_code}")
                return []
            except Exception as e:
                logger.error(f"Failed to fetch from OpenAlex: {e}")
                return []

    @staticmethod
    def reconstruct_abstract(inverted_index: Optional[dict[str, list[int]]]) -> str:
        """
        Reconstruct abstract text from OpenAlex inverted index format.
        
        OpenAlex stores abstracts as inverted indices for compression:
        {"word": [position1, position2], ...}
        
        Args:
            inverted_index: OpenAlex abstract_inverted_index field.
            
        Returns:
            Reconstructed abstract as plain text.
        """
        if not inverted_index:
            return ""
        
        # Build position -> word mapping
        word_map: dict[int, str] = {}
        max_position = 0
        
        for word, positions in inverted_index.items():
            for pos in positions:
                word_map[pos] = word
                max_position = max(max_position, pos)
        
        # Reconstruct in order
        words = [word_map.get(i, "") for i in range(max_position + 1)]
        return " ".join(words)
    
    def _extract_metrics(self, raw_paper: dict) -> dict:
        """
        Extract normalized metrics from raw paper data.
        
        Args:
            raw_paper: Raw paper dict from OpenAlex.
            
        Returns:
            Metrics dict with cited_by_count and fwci.
        """
        return {
            "cited_by_count": raw_paper.get("cited_by_count") or 0,
            "fwci": raw_paper.get("fwci"),  # Keep None if not present
        }
    
    def _extract_urls(self, raw_paper: dict) -> tuple[Optional[str], Optional[str]]:
        """
        Extract PDF and landing page URLs.
        
        Args:
            raw_paper: Raw paper dict from OpenAlex.
            
        Returns:
            Tuple of (pdf_url, landing_page_url).
        """
        oa = raw_paper.get("open_access", {}) or {}
        pdf_url = oa.get("oa_url") if oa.get("is_oa") else None
        landing_url = raw_paper.get("doi")
        return pdf_url, landing_url

    async def process_and_store(
        self,
        raw_papers: list[dict],
        category_slug: Optional[str] = None,
    ) -> int:
        """
        Process raw papers and store new ones in database.
        
        Deduplicates by OpenAlex ID - only stores papers not already in DB.
        
        Args:
            raw_papers: List of raw paper dicts from OpenAlex.
            category_slug: Optional category slug to tag papers with.
            
        Returns:
            Count of newly stored papers.
        """
        new_count = 0
        
        for item in raw_papers:
            openalex_id = item.get("id")
            if not openalex_id:
                logger.warning("Paper missing OpenAlex ID, skipping")
                continue
            
            # Check for duplicates
            stmt = select(Paper).where(Paper.openalex_id == openalex_id)
            result = await self.db.execute(stmt)
            if result.scalar() is not None:
                continue
            
            # Parse publication date
            pub_date_str = item.get("publication_date")
            if not pub_date_str:
                logger.warning(f"Paper {openalex_id} missing publication_date, skipping")
                continue
            
            try:
                pub_date = date.fromisoformat(pub_date_str)
            except ValueError:
                logger.warning(f"Invalid date format for {openalex_id}: {pub_date_str}")
                continue
            
            # Extract data
            abstract = self.reconstruct_abstract(item.get("abstract_inverted_index"))
            metrics = self._extract_metrics(item)
            pdf_url, landing_url = self._extract_urls(item)
            
            # Add category to metrics for backward compatibility
            if category_slug:
                metrics["category"] = category_slug
            
            paper = Paper(
                openalex_id=openalex_id,
                doi=item.get("doi"),
                title=item.get("title") or "Untitled",
                abstract=abstract or None,
                publication_date=pub_date,
                metrics=metrics,
                authors_metadata=item.get("authorships") or [],
                topics_metadata=item.get("topics") or [],
                pdf_url=pdf_url,
                landing_page_url=landing_url,
                category_slug=category_slug,  # Proper column
                is_selected=True if category_slug else False,  # Mark as curated
            )
            
            self.db.add(paper)
            new_count += 1
        
        # Flush but don't commit - let caller control transaction
        await self.db.flush()
        
        logger.info(f"Stored {new_count} new papers (skipped {len(raw_papers) - new_count} duplicates)")
        return new_count

