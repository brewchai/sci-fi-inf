"""
AI-specific curation pipeline.

Differences from regular curation:
- Full-text requirement (no abstract-only papers)
- Smaller batch (50 papers instead of 200)
- GPT-4o-mini ranking for final selection
- Generates premium content (deep analysis, code walkthrough)
"""
import asyncio
import argparse
from datetime import date, timedelta
from typing import List, Optional
from loguru import logger
import pymupdf  # PyMuPDF for PDF text extraction

from app.db.session import get_async_session
from app.services.harvester import OpenAlexHarvester
from app.services.curator import PaperCurator
from app.services.premium_generator import PremiumContentGenerator
from app.models.paper import Paper


# AI/ML keywords for filtering papers
AI_KEYWORDS = [
    # Core AI/ML terms
    "llm", "large language model", "gpt", "transformer", "neural network",
    "deep learning", "machine learning", "artificial intelligence",
    # Specific models/architectures
    "bert", "attention mechanism", "diffusion model", "generative ai",
    "language model", "foundation model", "multimodal", "vision language",
    # Techniques
    "fine-tuning", "fine tuning", "rlhf", "reinforcement learning",
    "prompt", "embedding", "tokenizer", "inference", "training",
    # Applications
    "chatbot", "text generation", "image generation", "code generation",
    "summarization", "translation", "sentiment", "classification",
    # Companies/models
    "openai", "anthropic", "claude", "gemini", "llama", "mistral",
    "deepseek", "stable diffusion", "midjourney",
    # AI concepts
    "agent", "reasoning", "chain of thought", "in-context learning",
    "few-shot", "zero-shot", "retrieval augmented", "rag",
]


def filter_ai_papers(papers: List[dict]) -> List[dict]:
    """
    Filter papers to only include those with AI/ML keywords.
    
    Args:
        papers: Raw paper dicts from OpenAlex
        
    Returns:
        Filtered list of papers with AI/ML keywords
    """
    ai_papers = []
    
    for paper in papers:
        title = (paper.get("title") or "").lower()
        abstract_index = paper.get("abstract_inverted_index") or {}
        
        # Reconstruct abstract for keyword matching
        abstract_words = list(abstract_index.keys()) if abstract_index else []
        abstract_text = " ".join(abstract_words).lower()
        
        # Check if any AI keyword is in title or abstract
        text_to_search = f"{title} {abstract_text}"
        
        for keyword in AI_KEYWORDS:
            if keyword in text_to_search:
                ai_papers.append(paper)
                break  # Found a match, no need to check more keywords
    
    return ai_papers


async def curate_ai_papers(
    lookback_days: int = 2,
    dry_run: bool = False,
    max_papers: int = 50
) -> Optional[dict]:
    """
    Curate AI papers with full-text requirement.
    
    Args:
        lookback_days: How many days back to search (default: 2)
        dry_run: If True, don't write to DB
        max_papers: Max papers to fetch initially (default: 50)
    
    Returns:
        Dict with selected paper info if found, None otherwise
    """
    logger.info(f"🤖 Starting AI curation (lookback={lookback_days} days, dry_run={dry_run})")
    
    async with get_async_session() as db:
        harvester = OpenAlexHarvester(db)
        
        # 1. Fetch AI papers from last N days
        from_date = date.today() - timedelta(days=lookback_days)
        
        logger.info(f"📥 Fetching up to {max_papers} AI papers from {from_date}...")
        
        # Create AI category object for filtering
        from app.domain.categories import get_category_registry
        category_registry = get_category_registry()
        ai_category = category_registry.get("ai_tech")
        
        if not ai_category:
            logger.error("AI category not found in registry!")
            return None
        
        # Fetch from OpenAlex
        raw_papers = await harvester.fetch_papers(
            from_date=from_date,
            category=ai_category,
            per_page=max_papers
        )
        
        logger.info(f"Found {len(raw_papers)} Computer Science papers")
        
        if not raw_papers:
            logger.warning("No papers found!")
            return None
        
        # 1.5 Filter for AI-specific keywords (LLMs, transformers, neural nets, etc.)
        logger.info("🔍 Filtering for AI/ML-specific papers...")
        ai_papers = filter_ai_papers(raw_papers)
        logger.info(f"✅ Found {len(ai_papers)}/{len(raw_papers)} papers with AI/ML keywords")
        
        if not ai_papers:
            logger.warning("No AI/ML papers found after keyword filtering!")
            return None
        
        # 2. Filter for full-text availability
        logger.info("📄 Extracting full-text from PDFs...")
        papers_with_fulltext = []
        
        for i, paper_data in enumerate(ai_papers, 1):
            logger.info(f"  [{i}/{len(ai_papers)}] Checking: {paper_data.get('title', 'Unknown')[:60]}...")
            
            full_text = await extract_full_text(paper_data)
            if full_text and len(full_text) > 1000:
                # Convert dict to Paper-like object
                paper_obj = create_paper_object(paper_data)
                paper_obj.full_text = full_text
                paper_obj.has_full_text = True
                paper_obj.full_text_source = "openalex_pdf"
                papers_with_fulltext.append(paper_obj)
                logger.info(f"    ✅ Full-text extracted ({len(full_text)} chars)")
            else:
                logger.info(f"    ❌ No full-text available")
        
        logger.info(f"✅ Filtered to {len(papers_with_fulltext)}/{len(raw_papers)} papers with full-text")
        
        if not papers_with_fulltext:
            logger.warning("No papers with full-text found!")
            return None
        
        # 3. Calculate quality scores
        logger.info("📊 Calculating quality scores...")
        for paper in papers_with_fulltext:
            paper.quality_score = calculate_quality_score(paper)
        
        # Sort by quality, take top 20 for LLM ranking
        top_papers = sorted(
            papers_with_fulltext,
            key=lambda p: p.quality_score,
            reverse=True
        )[:20]
        
        logger.info(f"🏆 Top 20 papers by quality score:")
        for i, p in enumerate(top_papers[:5], 1):
            logger.info(f"  {i}. [{p.quality_score:.1f}] {p.title[:70]}...")
        
        # 4. LLM ranking (GPT-4o-mini)
        logger.info("🤖 Running LLM ranking...")
        curator = PaperCurator(model="gpt-4o-mini")
        ranked_papers = await curator.rank_papers(top_papers, max_select=5)
        
        logger.info(f"🎯 LLM ranked top 5:")
        for i, p in enumerate(ranked_papers, 1):
            logger.info(f"  {i}. {p.title[:70]}...")
        
        # 5. Select top paper
        selected_paper = ranked_papers[0]
        selected_paper.is_selected = True
        selected_paper.category_slug = "ai_tech"  # Use existing category for now
        selected_paper.llm_rank = 1
        
        logger.info(f"✅ Selected: {selected_paper.title}")
        
        # 6. Generate premium content (using GPT-4o for quality)
        if not dry_run:
            logger.info("✨ Generating premium content with GPT-4o...")
            generator = PremiumContentGenerator(model="gpt-4o")  # Using 4o for newsletter quality
            premium_content = await generator.generate(selected_paper)
            
            # Store in paper
            selected_paper.deep_analysis = premium_content["deep_analysis"]
            selected_paper.code_walkthrough = premium_content.get("code_walkthrough")
            selected_paper.practical_applications = premium_content.get("practical_applications")
            
            logger.info("✅ Premium content generated")
        
        # 7. Save to DB
        if not dry_run:
            paper_id = await save_paper(db, selected_paper)
            logger.info(f"💾 Saved paper ID: {paper_id}")
            
            return {
                "paper_id": paper_id,
                "title": selected_paper.title,
                "quality_score": selected_paper.quality_score,
                "has_full_text": selected_paper.has_full_text,
                "deep_analysis_length": len(selected_paper.deep_analysis or ""),
                "code_walkthrough_length": len(selected_paper.code_walkthrough or ""),
            }
        else:
            logger.info("🔍 DRY RUN - not saving to DB")
            return {
                "paper_id": None,
                "title": selected_paper.title,
                "quality_score": selected_paper.quality_score,
                "has_full_text": selected_paper.has_full_text,
            }


def create_paper_object(paper_data: dict):
    """Convert OpenAlex API response to Paper-like object."""
    class PaperObj:
        def __init__(self, data):
            self.openalex_id = data.get("id", "").replace("https://openalex.org/", "")
            self.id = self.openalex_id  # Use openalex_id as temporary ID for LLM ranking
            self.doi = data.get("doi", "").replace("https://doi.org/", "") if data.get("doi") else None
            self.title = data.get("title", "Unknown")
            
            # Reconstruct abstract from inverted index
            from app.services.harvester import OpenAlexHarvester
            self.abstract = OpenAlexHarvester.reconstruct_abstract(
                data.get("abstract_inverted_index")
            )
            
            self.publication_date = date.fromisoformat(data.get("publication_date")) if data.get("publication_date") else date.today()
            self.cited_by_count = data.get("cited_by_count", 0)
            
            # Metadata
            self.authors_metadata = data.get("authorships", [])
            self.topics_metadata = data.get("topics", [])
            self.metrics = {
                "cited_by_count": self.cited_by_count,
                "fwci": data.get("fwci", 0)
            }
            
            # URLs
            self.pdf_url = None
            self.landing_page_url = data.get("doi")
            
            # Open access
            self.open_access = data.get("open_access", {})
            if self.open_access and self.open_access.get("oa_url"):
                self.pdf_url = self.open_access.get("oa_url")
            
            # Primary location (venue)
            self.primary_location = data.get("primary_location", {})
            
            # Fields to be filled later
            self.full_text = None
            self.has_full_text = False
            self.full_text_source = None
            self.quality_score = None
            self.llm_rank = None
            self.is_selected = False
            self.category_slug = None
            self.deep_analysis = None
            self.code_walkthrough = None
            self.practical_applications = None
    
    return PaperObj(paper_data)


async def extract_full_text(paper_data: dict) -> Optional[str]:
    """
    Extract full-text from OpenAlex PDF.
    
    Returns:
        Full text string if successful, None otherwise
    """
    oa = paper_data.get("open_access", {})
    if not oa or not oa.get("is_oa") or not oa.get("oa_url"):
        return None
    
    try:
        pdf_url = oa.get("oa_url")
        
        # Download PDF
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(pdf_url, follow_redirects=True)
            if response.status_code != 200:
                return None
            
            pdf_bytes = response.content
        
        # Extract text using PyMuPDF
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        
        return text.strip()
    
    except Exception as e:
        logger.debug(f"Failed to extract full-text: {e}")
        return None


def calculate_quality_score(paper) -> float:
    """
    Calculate quality score (0-100) based on:
    - Venue prestige (40 points)
    - Author h-index (20 points)
    - Code availability (15 points)
    - Open access (10 points)
    - Citation velocity (15 points)
    """
    score = 0
    
    # Venue prestige
    venue = ""
    if hasattr(paper, 'primary_location') and paper.primary_location:
        source = paper.primary_location.get("source", {})
        venue = source.get("display_name", "") if source else ""
    
    tier_1 = ["NeurIPS", "ICML", "ICLR", "CVPR", "ICCV", "ECCV"]
    tier_2 = ["ACL", "EMNLP", "AAAI", "IJCAI", "CoRL", "NAACL", "SIGIR"]
    tier_3 = ["WACV", "EACL", "COLING", "AISTATS", "UAI"]
    
    if any(v in venue for v in tier_1):
        score += 40
    elif any(v in venue for v in tier_2):
        score += 30
    elif any(v in venue for v in tier_3):
        score += 20
    elif "arxiv" in venue.lower():
        score += 10  # ArXiv preprints get some credit
    
    # Author reputation (max h-index)
    if hasattr(paper, 'authors_metadata') and paper.authors_metadata:
        h_indices = []
        for author in paper.authors_metadata:
            if isinstance(author, dict):
                h_index = author.get("author", {}).get("h_index", 0)
                h_indices.append(h_index)
        
        if h_indices:
            h_index_max = max(h_indices)
            score += min(h_index_max / 5, 20)
    
    # Code availability (check for GitHub/HuggingFace in title/abstract)
    text = f"{paper.title} {paper.abstract or ''}".lower()
    if "github" in text or "huggingface" in text or "code available" in text:
        score += 15
    
    # Open access
    if hasattr(paper, 'open_access') and paper.open_access:
        if isinstance(paper.open_access, dict) and paper.open_access.get("is_oa"):
            score += 10
    
    # Citation velocity
    if hasattr(paper, 'publication_date') and hasattr(paper, 'cited_by_count'):
        days_since_pub = (date.today() - paper.publication_date).days
        if days_since_pub > 0:
            velocity = paper.cited_by_count / days_since_pub
            score += min(velocity * 5, 15)
    
    return round(score, 2)


async def save_paper(db, paper_obj) -> int:
    """
    Save ONLY the selected paper to database.
    
    Note: We intentionally DON'T save all 50 fetched papers because:
    - Paper quality changes daily (citations, relevance)
    - Avoids database bloat
    - Fresh evaluation each run
    """
    # Check if paper already exists
    from sqlalchemy import select
    stmt = select(Paper).where(Paper.openalex_id == paper_obj.openalex_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    
    if existing:
        logger.info(f"Paper already exists (ID: {existing.id}), updating with new content...")
        # Update existing paper with fresh analysis
        existing.full_text = paper_obj.full_text
        existing.has_full_text = paper_obj.has_full_text
        existing.full_text_source = paper_obj.full_text_source
        existing.quality_score = paper_obj.quality_score
        existing.llm_rank = paper_obj.llm_rank
        existing.is_selected = True  # Mark as selected today
        existing.deep_analysis = paper_obj.deep_analysis
        existing.code_walkthrough = paper_obj.code_walkthrough
        existing.practical_applications = paper_obj.practical_applications
        existing.category_slug = "ai_tech"
        await db.commit()
        return existing.id
    
    # Create new paper (ONLY for the #1 selected paper)
    db_paper = Paper(
        openalex_id=paper_obj.openalex_id,
        doi=paper_obj.doi,
        title=paper_obj.title,
        abstract=paper_obj.abstract,
        full_text=paper_obj.full_text,
        publication_date=paper_obj.publication_date,
        metrics=paper_obj.metrics or {},
        authors_metadata=paper_obj.authors_metadata or [],
        topics_metadata=paper_obj.topics_metadata or [],
        pdf_url=paper_obj.pdf_url,
        landing_page_url=paper_obj.landing_page_url,
        curation_score=paper_obj.quality_score,
        is_selected=True,  # This is the selected paper
        category_slug="ai_tech",
        has_full_text=paper_obj.has_full_text,
        full_text_source=paper_obj.full_text_source,
        quality_score=paper_obj.quality_score,
        llm_rank=1,  # Always rank 1 since we only save the top paper
        deep_analysis=paper_obj.deep_analysis,
        code_walkthrough=paper_obj.code_walkthrough,
        practical_applications=paper_obj.practical_applications,
    )
    
    db.add(db_paper)
    await db.commit()
    await db.refresh(db_paper)
    
    logger.info(f"✅ Saved NEW paper (only the #1 selected paper is saved)")
    return db_paper.id


# CLI for manual testing
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Curate AI papers")
    parser.add_argument("--lookback-days", type=int, default=2, help="Days to look back")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to DB")
    parser.add_argument("--max-papers", type=int, default=50, help="Max papers to fetch")
    
    args = parser.parse_args()
    
    result = asyncio.run(curate_ai_papers(
        lookback_days=args.lookback_days,
        dry_run=args.dry_run,
        max_papers=args.max_papers
    ))
    
    if result:
        logger.info(f"✅ Curation complete: {result}")
    else:
        logger.warning("❌ No papers curated")
