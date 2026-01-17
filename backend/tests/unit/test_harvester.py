"""
Unit tests for OpenAlexHarvester service.

Tests cover:
- Filter string building
- Abstract reconstruction
- API response handling with mocked HTTP
"""
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from app.services.harvester import OpenAlexHarvester
from app.domain.categories import Category, OpenAlexFieldId


class TestFilterStringBuilding:
    """Tests for _build_filter_string method."""
    
    @pytest.fixture
    def harvester(self):
        """Create harvester with mocked DB session."""
        mock_db = AsyncMock()
        return OpenAlexHarvester(mock_db)
    
    def test_basic_filter_without_category(self, harvester):
        """Should build filter with date, type, and has_abstract."""
        from_date = date(2025, 1, 10)
        result = harvester._build_filter_string(from_date, category=None)
        
        assert "from_publication_date:2025-01-10" in result
        assert "type:article" in result
        assert "has_abstract:true" in result
        assert "topics.field.id" not in result
    
    def test_filter_with_single_field_category(self, harvester):
        """Should include field ID filter for single-field category."""
        from_date = date(2025, 1, 10)
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test category",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
        )
        
        result = harvester._build_filter_string(from_date, category=category)
        
        assert "topics.field.id:17" in result
    
    def test_filter_with_multiple_field_category(self, harvester):
        """Should use pipe-separated field IDs for multi-field category."""
        from_date = date(2025, 1, 10)
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test category",
            field_ids=[OpenAlexFieldId.NEUROSCIENCE, OpenAlexFieldId.PSYCHOLOGY],
        )
        
        result = harvester._build_filter_string(from_date, category=category)
        
        assert "topics.field.id:28|32" in result


class TestAbstractReconstruction:
    """Tests for reconstruct_abstract static method."""
    
    def test_empty_inverted_index(self):
        """Should return empty string for None or empty input."""
        assert OpenAlexHarvester.reconstruct_abstract(None) == ""
        assert OpenAlexHarvester.reconstruct_abstract({}) == ""
    
    def test_simple_abstract(self):
        """Should reconstruct simple abstract correctly."""
        inverted_index = {
            "This": [0],
            "is": [1],
            "a": [2],
            "test": [3],
        }
        
        result = OpenAlexHarvester.reconstruct_abstract(inverted_index)
        
        assert result == "This is a test"
    
    def test_abstract_with_gaps(self):
        """Should handle gaps in word positions."""
        inverted_index = {
            "Hello": [0],
            "world": [2],  # Gap at position 1
        }
        
        result = OpenAlexHarvester.reconstruct_abstract(inverted_index)
        
        # Position 1 should be empty string
        assert result == "Hello  world"
    
    def test_abstract_with_repeated_words(self):
        """Should handle words appearing multiple times."""
        inverted_index = {
            "the": [0, 4],
            "quick": [1],
            "brown": [2],
            "fox": [3],
        }
        
        result = OpenAlexHarvester.reconstruct_abstract(inverted_index)
        
        assert result == "the quick brown fox the"


class TestMetricsExtraction:
    """Tests for _extract_metrics method."""
    
    @pytest.fixture
    def harvester(self):
        """Create harvester with mocked DB session."""
        mock_db = AsyncMock()
        return OpenAlexHarvester(mock_db)
    
    def test_extract_with_all_fields(self, harvester):
        """Should extract both cited_by_count and fwci."""
        raw_paper = {
            "cited_by_count": 100,
            "fwci": 2.5,
        }
        
        metrics = harvester._extract_metrics(raw_paper)
        
        assert metrics["cited_by_count"] == 100
        assert metrics["fwci"] == 2.5
    
    def test_extract_with_missing_fwci(self, harvester):
        """Should keep fwci as None if not present."""
        raw_paper = {
            "cited_by_count": 50,
        }
        
        metrics = harvester._extract_metrics(raw_paper)
        
        assert metrics["cited_by_count"] == 50
        assert metrics["fwci"] is None
    
    def test_extract_with_null_values(self, harvester):
        """Should handle explicit null values."""
        raw_paper = {
            "cited_by_count": None,
            "fwci": None,
        }
        
        metrics = harvester._extract_metrics(raw_paper)
        
        assert metrics["cited_by_count"] == 0  # Defaults to 0
        assert metrics["fwci"] is None


class TestUrlExtraction:
    """Tests for _extract_urls method."""
    
    @pytest.fixture
    def harvester(self):
        """Create harvester with mocked DB session."""
        mock_db = AsyncMock()
        return OpenAlexHarvester(mock_db)
    
    def test_extract_open_access_urls(self, harvester):
        """Should extract URL when paper is open access."""
        raw_paper = {
            "doi": "https://doi.org/10.1234/test",
            "open_access": {
                "is_oa": True,
                "oa_url": "https://arxiv.org/pdf/123.pdf",
            }
        }
        
        pdf_url, landing_url = harvester._extract_urls(raw_paper)
        
        assert pdf_url == "https://arxiv.org/pdf/123.pdf"
        assert landing_url == "https://doi.org/10.1234/test"
    
    def test_extract_non_open_access(self, harvester):
        """Should return None for PDF when not open access."""
        raw_paper = {
            "doi": "https://doi.org/10.1234/closed",
            "open_access": {
                "is_oa": False,
                "oa_url": None,
            }
        }
        
        pdf_url, landing_url = harvester._extract_urls(raw_paper)
        
        assert pdf_url is None
        assert landing_url == "https://doi.org/10.1234/closed"
    
    def test_extract_missing_open_access(self, harvester):
        """Should handle missing open_access field."""
        raw_paper = {
            "doi": "https://doi.org/10.1234/test",
        }
        
        pdf_url, landing_url = harvester._extract_urls(raw_paper)
        
        assert pdf_url is None
        assert landing_url == "https://doi.org/10.1234/test"
