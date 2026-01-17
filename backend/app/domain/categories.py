"""
Category domain models for The Daily Discovery.

This module defines the core category types and registry used throughout
the application for filtering research papers by topic.
"""
from enum import IntEnum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class OpenAlexFieldId(IntEnum):
    """
    OpenAlex Field IDs mapped to human-readable names.
    
    These IDs correspond to the 'field' level in OpenAlex's topic hierarchy:
    Domain (4) → Field (26) → Subfield (~250) → Topic (~4,500)
    
    Reference: https://docs.openalex.org/api-entities/topics
    """
    # Life Sciences Domain
    BIOCHEMISTRY_GENETICS = 13
    NEUROSCIENCE = 28
    AGRICULTURAL_SCIENCES = 11
    PHARMACOLOGY = 30
    IMMUNOLOGY = 24
    
    # Physical Sciences Domain
    CHEMISTRY = 16
    PHYSICS_ASTRONOMY = 31
    ENGINEERING = 22
    COMPUTER_SCIENCE = 17
    EARTH_SCIENCES = 19
    MATHEMATICS = 26
    MATERIALS_SCIENCE = 25
    ENERGY = 21
    ENVIRONMENTAL_SCIENCE = 23
    CHEMICAL_ENGINEERING = 15
    
    # Social Sciences Domain
    ARTS_HUMANITIES = 12
    ECONOMICS = 20
    BUSINESS = 14
    PSYCHOLOGY = 32
    SOCIAL_SCIENCES = 33
    DECISION_SCIENCES = 18
    
    # Health Sciences Domain
    MEDICINE = 27
    NURSING = 29
    HEALTH_PROFESSIONS = 36
    DENTISTRY = 35
    VETERINARY = 34


class CategorySlug(str):
    """Type alias for category slugs to improve code readability."""
    pass


class Category(BaseModel):
    """
    A user-facing category that maps to one or more OpenAlex fields.
    
    Attributes:
        slug: URL-safe identifier (e.g., 'ai_tech')
        display_name: Human-readable name (e.g., 'AI & Technology')
        emoji: Visual icon for the category
        description: Brief description for users
        field_ids: List of OpenAlex field IDs this category maps to
        is_active: Whether this category is available to users
    """
    slug: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', max_length=50)
    display_name: str = Field(..., max_length=100)
    emoji: str = Field(..., max_length=10)
    description: str = Field(..., max_length=500)
    field_ids: list[OpenAlexFieldId] = Field(..., min_length=1)
    is_active: bool = Field(default=True)
    
    @property
    def openalex_filter_value(self) -> str:
        """
        Generate the OpenAlex API filter value for this category.
        
        Returns:
            Filter string like "17" or "17|28" for multiple fields.
        """
        return "|".join(str(fid.value) for fid in self.field_ids)
    
    
    model_config = ConfigDict(frozen=True)  # Categories are immutable


class CategoryRegistry:
    """
    Central registry of all available categories.
    
    This class provides O(1) lookup by slug and ensures category uniqueness.
    In the future, this could be backed by a database table.
    """
    
    def __init__(self) -> None:
        self._categories: dict[str, Category] = {}
        self._setup_default_categories()
    
    def _setup_default_categories(self) -> None:
        """Initialize the registry with default categories."""
        default_categories = [
            Category(
                slug="ai_tech",
                display_name="AI & Technology",
                emoji="🤖",
                description="Artificial intelligence, machine learning, and computer science research",
                field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
            ),
            Category(
                slug="health_medicine",
                display_name="Health & Medicine",
                emoji="💊",
                description="Medical research, clinical studies, and healthcare innovations",
                field_ids=[OpenAlexFieldId.MEDICINE, OpenAlexFieldId.HEALTH_PROFESSIONS],
            ),
            Category(
                slug="brain_mind",
                display_name="Brain & Mind",
                emoji="🧠",
                description="Neuroscience, psychology, and cognitive research",
                field_ids=[OpenAlexFieldId.NEUROSCIENCE, OpenAlexFieldId.PSYCHOLOGY],
            ),
            Category(
                slug="climate_environment",
                display_name="Climate & Environment",
                emoji="🌍",
                description="Climate science, environmental research, and sustainability",
                field_ids=[OpenAlexFieldId.ENVIRONMENTAL_SCIENCE, OpenAlexFieldId.EARTH_SCIENCES],
            ),
            Category(
                slug="biology",
                display_name="Biology & Genetics",
                emoji="🧬",
                description="Biochemistry, genetics, molecular biology, and life sciences",
                field_ids=[OpenAlexFieldId.BIOCHEMISTRY_GENETICS, OpenAlexFieldId.IMMUNOLOGY],
            ),
            Category(
                slug="physics",
                display_name="Physics & Space",
                emoji="⚛️",
                description="Physics, astronomy, and fundamental science discoveries",
                field_ids=[OpenAlexFieldId.PHYSICS_ASTRONOMY],
            ),
            Category(
                slug="economics",
                display_name="Economics & Finance",
                emoji="💰",
                description="Economic research, financial studies, and market analysis",
                field_ids=[OpenAlexFieldId.ECONOMICS],
            ),
            Category(
                slug="business",
                display_name="Business & Management",
                emoji="📊",
                description="Business strategy, management research, and organizational studies",
                field_ids=[OpenAlexFieldId.BUSINESS, OpenAlexFieldId.DECISION_SCIENCES],
            ),
            Category(
                slug="arts_culture",
                display_name="Arts & Culture",
                emoji="🎨",
                description="Arts, humanities, history, and cultural studies",
                field_ids=[OpenAlexFieldId.ARTS_HUMANITIES],
            ),
            Category(
                slug="food_agriculture",
                display_name="Food & Agriculture",
                emoji="🌾",
                description="Agricultural science, food technology, and nutrition research",
                field_ids=[OpenAlexFieldId.AGRICULTURAL_SCIENCES],
            ),
            Category(
                slug="energy",
                display_name="Energy & Sustainability",
                emoji="⚡",
                description="Energy research, renewable technologies, and sustainability",
                field_ids=[OpenAlexFieldId.ENERGY, OpenAlexFieldId.CHEMICAL_ENGINEERING],
            ),
            Category(
                slug="chemistry",
                display_name="Chemistry & Materials",
                emoji="🔬",
                description="Chemistry, materials science, and chemical engineering",
                field_ids=[OpenAlexFieldId.CHEMISTRY, OpenAlexFieldId.MATERIALS_SCIENCE],
            ),
        ]
        
        for category in default_categories:
            self.register(category)
    
    def register(self, category: Category) -> None:
        """
        Register a new category.
        
        Args:
            category: The category to register.
            
        Raises:
            ValueError: If a category with the same slug already exists.
        """
        if category.slug in self._categories:
            raise ValueError(f"Category with slug '{category.slug}' already exists")
        self._categories[category.slug] = category
    
    def get(self, slug: str) -> Optional[Category]:
        """
        Get a category by its slug.
        
        Args:
            slug: The category slug to look up.
            
        Returns:
            The category if found, None otherwise.
        """
        return self._categories.get(slug)
    
    def get_or_raise(self, slug: str) -> Category:
        """
        Get a category by slug, raising an error if not found.
        
        Args:
            slug: The category slug to look up.
            
        Returns:
            The category.
            
        Raises:
            KeyError: If the category is not found.
        """
        category = self.get(slug)
        if category is None:
            raise KeyError(f"Category '{slug}' not found")
        return category
    
    def list_active(self) -> list[Category]:
        """
        Get all active categories.
        
        Returns:
            List of active categories, sorted by display name.
        """
        return sorted(
            [c for c in self._categories.values() if c.is_active],
            key=lambda c: c.display_name
        )
    
    def list_all(self) -> list[Category]:
        """
        Get all categories (including inactive).
        
        Returns:
            List of all categories, sorted by display name.
        """
        return sorted(self._categories.values(), key=lambda c: c.display_name)
    
    def slugs(self) -> list[str]:
        """
        Get all category slugs.
        
        Returns:
            List of all category slugs.
        """
        return list(self._categories.keys())


# Global registry instance - singleton pattern
_registry: Optional[CategoryRegistry] = None


def get_category_registry() -> CategoryRegistry:
    """
    Get the global category registry instance.
    
    Uses lazy initialization for the singleton.
    
    Returns:
        The global CategoryRegistry instance.
    """
    global _registry
    if _registry is None:
        _registry = CategoryRegistry()
    return _registry
