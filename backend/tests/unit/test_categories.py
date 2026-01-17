"""
Unit tests for category domain models.

Tests cover:
- OpenAlexFieldId enum values
- Category model validation
- CategoryRegistry operations
"""
import pytest
from app.domain.categories import (
    OpenAlexFieldId,
    Category,
    CategoryRegistry,
    get_category_registry,
)


class TestOpenAlexFieldId:
    """Tests for OpenAlexFieldId enum."""
    
    def test_enum_values_are_integers(self):
        """Field IDs should be integers matching OpenAlex API."""
        assert OpenAlexFieldId.COMPUTER_SCIENCE == 17
        assert OpenAlexFieldId.MEDICINE == 27
        assert OpenAlexFieldId.ECONOMICS == 20
    
    def test_enum_is_iterable(self):
        """Should be able to iterate over all field IDs."""
        all_ids = list(OpenAlexFieldId)
        assert len(all_ids) > 20  # We have at least 26 fields
        assert all(isinstance(fid.value, int) for fid in all_ids)


class TestCategory:
    """Tests for Category model."""
    
    def test_valid_category_creation(self):
        """Should create a valid category with all fields."""
        category = Category(
            slug="test_category",
            display_name="Test Category",
            emoji="🧪",
            description="A test category for unit tests",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
        )
        assert category.slug == "test_category"
        assert category.is_active is True  # Default
    
    def test_slug_validation_lowercase(self):
        """Slug must start with lowercase letter."""
        with pytest.raises(ValueError):
            Category(
                slug="123invalid",  # Can't start with number
                display_name="Test",
                emoji="🧪",
                description="Test",
                field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
            )
    
    def test_slug_validation_no_special_chars(self):
        """Slug can only contain lowercase letters, numbers, and underscores."""
        with pytest.raises(ValueError):
            Category(
                slug="test-category",  # Hyphens not allowed
                display_name="Test",
                emoji="🧪",
                description="Test",
                field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
            )
    
    def test_field_ids_required(self):
        """At least one field ID is required."""
        with pytest.raises(ValueError):
            Category(
                slug="test",
                display_name="Test",
                emoji="🧪",
                description="Test",
                field_ids=[],  # Empty not allowed
            )
    
    def test_openalex_filter_value_single(self):
        """Single field should produce simple filter value."""
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
        )
        assert category.openalex_filter_value == "17"
    
    def test_openalex_filter_value_multiple(self):
        """Multiple fields should produce OR-joined filter value."""
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE, OpenAlexFieldId.MEDICINE],
        )
        assert category.openalex_filter_value == "17|27"
    
    def test_category_is_immutable(self):
        """Category should be frozen/immutable."""
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
        )
        with pytest.raises(Exception):  # Pydantic raises ValidationError for frozen
            category.slug = "modified"


class TestCategoryRegistry:
    """Tests for CategoryRegistry."""
    
    @pytest.fixture
    def empty_registry(self):
        """Create an empty registry for testing."""
        registry = CategoryRegistry.__new__(CategoryRegistry)
        registry._categories = {}
        return registry
    
    def test_default_categories_loaded(self):
        """Global registry should have default categories."""
        registry = get_category_registry()
        categories = registry.list_all()
        assert len(categories) == 12
    
    def test_get_existing_category(self):
        """Should return category by slug."""
        registry = get_category_registry()
        category = registry.get("ai_tech")
        assert category is not None
        assert category.display_name == "AI & Technology"
    
    def test_get_nonexistent_category(self):
        """Should return None for unknown slug."""
        registry = get_category_registry()
        category = registry.get("nonexistent")
        assert category is None
    
    def test_get_or_raise_existing(self):
        """Should return category when exists."""
        registry = get_category_registry()
        category = registry.get_or_raise("ai_tech")
        assert category.slug == "ai_tech"
    
    def test_get_or_raise_nonexistent(self):
        """Should raise KeyError for unknown slug."""
        registry = get_category_registry()
        with pytest.raises(KeyError) as exc_info:
            registry.get_or_raise("nonexistent")
        assert "nonexistent" in str(exc_info.value)
    
    def test_register_duplicate_raises(self, empty_registry):
        """Registering duplicate slug should raise ValueError."""
        category = Category(
            slug="test",
            display_name="Test",
            emoji="🧪",
            description="Test",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
        )
        empty_registry.register(category)
        
        with pytest.raises(ValueError) as exc_info:
            empty_registry.register(category)
        assert "already exists" in str(exc_info.value)
    
    def test_list_active_excludes_inactive(self, empty_registry):
        """list_active should not include inactive categories."""
        active = Category(
            slug="active",
            display_name="Active",
            emoji="✅",
            description="Active category",
            field_ids=[OpenAlexFieldId.COMPUTER_SCIENCE],
            is_active=True,
        )
        inactive = Category(
            slug="inactive",
            display_name="Inactive",
            emoji="❌",
            description="Inactive category",
            field_ids=[OpenAlexFieldId.MEDICINE],
            is_active=False,
        )
        empty_registry.register(active)
        empty_registry.register(inactive)
        
        active_list = empty_registry.list_active()
        assert len(active_list) == 1
        assert active_list[0].slug == "active"
    
    def test_list_all_sorted_by_display_name(self):
        """Categories should be sorted alphabetically by display name."""
        registry = get_category_registry()
        categories = registry.list_all()
        display_names = [c.display_name for c in categories]
        assert display_names == sorted(display_names)
    
    def test_slugs_returns_all_slugs(self):
        """slugs() should return all registered slugs."""
        registry = get_category_registry()
        slugs = registry.slugs()
        assert "ai_tech" in slugs
        assert "health_medicine" in slugs
        assert len(slugs) == 12
