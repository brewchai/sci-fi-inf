"""
Mine author emails for papers featured in podcast episodes.

Looks up each episode's papers, extracts the corresponding/first author,
resolves their email via multiple strategies:
  1. CrossRef API (best hit rate — many publishers deposit emails)
  2. PubMed XML metadata (biomedical papers often have author emails)
  3. OpenAlex Author API → ORCID public email
  4. Paper landing page scraping (fallback)

Usage:
    python scripts/mine_author_emails.py              # populate DB
    python scripts/mine_author_emails.py --dry-run     # preview only
    python scripts/mine_author_emails.py --episode-id 52
"""
import asyncio
import argparse
import re
import sys
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from sqlalchemy import select, and_

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.paper import Paper
from app.models.podcast import PodcastEpisode
from app.models.author_email import AuthorEmail
from app.core.config import settings


# Regex for validating emails
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# Domains/patterns to skip
SKIP_PATTERNS = {
    "example.com", "test.com", "noreply", "no-reply",
    "support@", "info@", "admin@", "webmaster@",
    "editorial@", "editor@", "journal@", "mdpi.com",
    "springer.com", "elsevier.com", "wiley.com",
    "permissions@", "submissions@", "contact@",
}

# Shared HTTP client settings
HTTP_TIMEOUT = 15


def extract_corresponding_author(authors_metadata: list[dict]) -> Optional[dict]:
    """
    Extract the corresponding author from OpenAlex authorships data.
    Falls back to first author if no corresponding author flagged.
    """
    if not authors_metadata:
        return None

    for authorship in authors_metadata:
        if authorship.get("is_corresponding"):
            return authorship

    for authorship in authors_metadata:
        if authorship.get("author_position") == "first":
            return authorship

    return authors_metadata[0] if authors_metadata else None


def is_valid_author_email(email: str) -> bool:
    """Check if an email looks like a real author email (not a publisher catch-all)."""
    if not email or not EMAIL_RE.match(email):
        return False
    
    email_lower = email.lower()
    for skip in SKIP_PATTERNS:
        if skip in email_lower:
            return False

    return True


# =============================================================================
# Strategy 1: CrossRef API (BEST hit rate for corresponding author emails)
# =============================================================================

async def resolve_email_from_crossref(doi: str, author_name: str) -> Optional[str]:
    """
    Look up paper on CrossRef by DOI. Many publishers deposit author emails here.
    
    CrossRef author objects sometimes contain:
    {"given": "John", "family": "Doe", "email": "john.doe@university.edu", "sequence": "first"}
    """
    if not doi:
        return None

    # Strip the prefix if present
    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
    url = f"https://api.crossref.org/works/{doi_clean}"

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": f"TheEurekaFeed/1.0 (mailto:{settings.OPENALEX_MAILTO})"},
            )
            if resp.status_code != 200:
                logger.debug(f"    CrossRef lookup failed ({resp.status_code}) for DOI: {doi_clean}")
                return None

            data = resp.json()
            authors = data.get("message", {}).get("author", [])

            # First pass: look for email on the corresponding/first author
            for author in authors:
                email = author.get("email")
                if email and is_valid_author_email(email):
                    cr_name = f"{author.get('given', '')} {author.get('family', '')}".strip()
                    logger.info(f"    ✅ CrossRef email found: {email} ({cr_name})")
                    return email

            return None
    except Exception as e:
        logger.debug(f"    CrossRef error: {e}")
        return None


# =============================================================================
# Strategy 2: PubMed XML (biomedical papers often include author emails)
# =============================================================================

async def resolve_email_from_pubmed(doi: str) -> Optional[str]:
    """
    Look up the paper on PubMed via DOI, fetch the full XML metadata,
    and extract the corresponding author's email.
    
    PubMed XML often contains <Email> elements within <Author> blocks.
    """
    if not doi:
        return None

    doi_clean = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            # Step 1: Find PubMed ID from DOI
            search_url = (
                f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
                f"?db=pubmed&term={doi_clean}&retmode=json"
            )
            resp = await client.get(search_url)
            if resp.status_code != 200:
                return None

            ids = resp.json().get("esearchresult", {}).get("idlist", [])
            if not ids:
                logger.debug(f"    PubMed: No PMID found for DOI {doi_clean}")
                return None

            pmid = ids[0]

            # Step 2: Fetch full article XML
            fetch_url = (
                f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
                f"?db=pubmed&id={pmid}&retmode=xml"
            )
            resp = await client.get(fetch_url)
            if resp.status_code != 200:
                return None

            # Parse XML
            import warnings
            from bs4 import XMLParsedAsHTMLWarning
            warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

            soup = BeautifulSoup(resp.text, "lxml")

            # Look for email elements
            for email_el in soup.find_all("email"):
                email = email_el.get_text().strip()
                if is_valid_author_email(email):
                    logger.info(f"    ✅ PubMed email found: {email}")
                    return email

            # Look for emails embedded in affiliation text
            for aff in soup.find_all("affiliation"):
                text = aff.get_text()
                emails = EMAIL_RE.findall(text)
                for email in emails:
                    if is_valid_author_email(email):
                        logger.info(f"    ✅ PubMed affiliation email found: {email}")
                        return email

            return None
    except Exception as e:
        logger.debug(f"    PubMed error: {e}")
        return None


# =============================================================================
# Strategy 3: OpenAlex Author → ORCID public email
# =============================================================================

async def resolve_email_from_openalex(author_id: str) -> Optional[str]:
    """
    Look up author on OpenAlex, get their ORCID, then check ORCID for public email.
    """
    if not author_id:
        return None

    url = f"https://api.openalex.org/authors/{author_id.split('/')[-1]}"
    headers = {}
    if settings.OPENALEX_MAILTO:
        headers["User-Agent"] = f"mailto:{settings.OPENALEX_MAILTO}"

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None

            data = resp.json()
            orcid = data.get("orcid")
            if orcid:
                email = await resolve_email_from_orcid(orcid)
                if email:
                    return email

            return None
    except Exception as e:
        logger.debug(f"    OpenAlex author lookup error: {e}")
        return None


async def resolve_email_from_orcid(orcid_url: str) -> Optional[str]:
    """Fetch ORCID public profile and look for an email."""
    if not orcid_url:
        return None

    orcid_id = orcid_url.rstrip("/").split("/")[-1]
    api_url = f"https://pub.orcid.org/v3.0/{orcid_id}/email"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(api_url, headers={"Accept": "application/json"})
            if resp.status_code != 200:
                return None

            data = resp.json()
            for entry in data.get("email", []):
                email = entry.get("email")
                if email and is_valid_author_email(email):
                    logger.info(f"    ✅ ORCID email found: {email}")
                    return email
            return None
    except Exception as e:
        logger.debug(f"    ORCID lookup error: {e}")
        return None


# =============================================================================
# Strategy 4: Landing page scraping (fallback)
# =============================================================================

async def resolve_email_from_landing_page(landing_url: str) -> Optional[str]:
    """Scrape the paper's landing page for a corresponding author email."""
    if not landing_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(landing_url)
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "lxml")

            # mailto: links
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"]
                if href.startswith("mailto:"):
                    email = href.replace("mailto:", "").split("?")[0].strip()
                    if is_valid_author_email(email):
                        logger.info(f"    ✅ Landing page mailto found: {email}")
                        return email

            # Email patterns in text
            text = soup.get_text()
            for email in EMAIL_RE.findall(text):
                if is_valid_author_email(email):
                    logger.info(f"    ✅ Landing page text email found: {email}")
                    return email

            return None
    except Exception as e:
        logger.debug(f"    Landing page scrape error: {e}")
        return None


# =============================================================================
# Orchestrator: Try all strategies in priority order
# =============================================================================

async def resolve_author_email(
    author_openalex_id: str,
    doi: Optional[str] = None,
    landing_page_url: Optional[str] = None,
    author_name: str = "",
) -> Optional[str]:
    """
    Try multiple strategies to resolve an author's email.
    
    Priority (ordered by hit rate):
    1. CrossRef API (many publishers deposit emails here)
    2. PubMed XML (biomedical papers)
    3. OpenAlex → ORCID public email
    4. Landing page scraping (last resort)
    """
    # Strategy 1: CrossRef (best hit rate)
    if doi:
        logger.info(f"    [1/4] Trying CrossRef...")
        email = await resolve_email_from_crossref(doi, author_name)
        if email:
            return email

    # Strategy 2: PubMed
    if doi:
        logger.info(f"    [2/4] Trying PubMed...")
        email = await resolve_email_from_pubmed(doi)
        if email:
            return email

    # Strategy 3: OpenAlex → ORCID
    logger.info(f"    [3/4] Trying OpenAlex → ORCID...")
    email = await resolve_email_from_openalex(author_openalex_id)
    if email:
        return email

    # Strategy 4: Landing page scraping
    if landing_page_url:
        logger.info(f"    [4/4] Trying landing page scrape...")
        email = await resolve_email_from_landing_page(landing_page_url)
        if email:
            return email

    return None


# =============================================================================
# Main mining logic
# =============================================================================

async def mine_emails(dry_run: bool = False, episode_id: Optional[int] = None):
    """Iterate episodes → papers → authors and resolve emails."""
    stats = {"processed": 0, "found": 0, "skipped_exists": 0, "no_email": 0, "errors": 0}

    async with SessionLocal() as db:
        stmt = (
            select(PodcastEpisode)
            .where(PodcastEpisode.status == "ready")
            .order_by(PodcastEpisode.episode_date.desc())
        )
        if episode_id:
            stmt = stmt.where(PodcastEpisode.id == episode_id)

        result = await db.execute(stmt)
        episodes = result.scalars().all()

        if not episodes:
            logger.warning("No ready episodes found.")
            return stats

        logger.info(f"Processing {len(episodes)} episode(s)...")

        for episode in episodes:
            logger.info(f"\n{'='*60}")
            logger.info(f"Episode {episode.id}: {episode.title} ({episode.episode_date})")
            logger.info(f"  Slug: {episode.slug}")
            logger.info(f"  Paper IDs: {episode.paper_ids}")

            if not episode.paper_ids:
                logger.warning(f"  No paper_ids for episode {episode.id}, skipping")
                continue

            paper_stmt = select(Paper).where(Paper.id.in_(episode.paper_ids))
            paper_result = await db.execute(paper_stmt)
            papers = paper_result.scalars().all()

            for paper in papers:
                stats["processed"] += 1
                logger.info(f"\n  Paper {paper.id}: {paper.title[:80]}...")
                logger.info(f"    DOI: {paper.doi or 'N/A'}")

                authorship = extract_corresponding_author(paper.authors_metadata or [])
                if not authorship:
                    logger.warning(f"    No authors found for paper {paper.id}")
                    stats["no_email"] += 1
                    continue

                author_info = authorship.get("author", {})
                author_name = author_info.get("display_name", "Unknown")
                author_id = author_info.get("id", "")
                is_corresponding = authorship.get("is_corresponding", False)

                logger.info(f"    Author: {author_name} (corresponding={is_corresponding})")
                logger.info(f"    OpenAlex ID: {author_id}")

                if not author_id:
                    logger.warning(f"    No OpenAlex ID for author, skipping")
                    stats["no_email"] += 1
                    continue

                # Dedup check
                existing_stmt = select(AuthorEmail).where(
                    and_(
                        AuthorEmail.paper_id == paper.id,
                        AuthorEmail.author_openalex_id == author_id,
                    )
                )
                existing_result = await db.execute(existing_stmt)
                if existing_result.scalar_one_or_none():
                    logger.info(f"    Already exists in DB, skipping")
                    stats["skipped_exists"] += 1
                    continue

                # Resolve email using all strategies
                email = await resolve_author_email(
                    author_openalex_id=author_id,
                    doi=paper.doi,
                    landing_page_url=paper.landing_page_url,
                    author_name=author_name,
                )

                status = "pending" if email else "no_email"
                if email:
                    stats["found"] += 1
                    logger.info(f"    ✅ Final result: {email}")
                else:
                    stats["no_email"] += 1
                    logger.info(f"    ❌ No email found (all 4 strategies exhausted)")

                if dry_run:
                    logger.info(f"    [DRY RUN] Would insert: author={author_name}, email={email}, status={status}")
                    continue

                try:
                    record = AuthorEmail(
                        paper_id=paper.id,
                        episode_id=episode.id,
                        author_name=author_name,
                        author_openalex_id=author_id,
                        email_address=email,
                        episode_slug=episode.slug,
                        status=status,
                    )
                    db.add(record)
                    await db.commit()
                    logger.info(f"    💾 Saved to DB")
                except Exception as e:
                    logger.error(f"    DB insert error: {e}")
                    await db.rollback()
                    stats["errors"] += 1

    return stats


async def main():
    parser = argparse.ArgumentParser(description="Mine author emails for featured papers")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    parser.add_argument("--episode-id", type=int, help="Process only a specific episode ID")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("AUTHOR EMAIL MINING")
    logger.info(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.episode_id:
        logger.info(f"Episode filter: {args.episode_id}")
    logger.info("Strategies: CrossRef → PubMed → ORCID → Landing Page")
    logger.info("=" * 60)

    stats = await mine_emails(dry_run=args.dry_run, episode_id=args.episode_id)

    logger.info("\n" + "=" * 60)
    logger.info("SUMMARY")
    logger.info(f"  Papers processed: {stats['processed']}")
    logger.info(f"  Emails found:     {stats['found']}")
    logger.info(f"  Already in DB:    {stats['skipped_exists']}")
    logger.info(f"  No email found:   {stats['no_email']}")
    logger.info(f"  Errors:           {stats['errors']}")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
