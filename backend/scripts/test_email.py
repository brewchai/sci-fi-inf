"""
Send a test branded email using REAL paper data from the database.
Routes to your own email (not the author) with BCC for monitoring.

Usage:
    python scripts/test_email.py your.email@example.com             # send 1 real email
    python scripts/test_email.py your.email@example.com --limit 3   # send up to 3
    python scripts/test_email.py --preview                          # preview without sending
"""
import sys
import asyncio
import argparse
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from loguru import logger
from sqlalchemy import select, and_

from app.db.session import SessionLocal
from app.models.author_email import AuthorEmail
from app.models.paper import Paper
from app.models.podcast import PodcastEpisode  # noqa: F401 — needed for ORM relationship resolution
from app.core.config import settings
from scripts.send_author_emails import build_html_email, build_plain_text_email

BCC_EMAIL = "ninad.mundalik@gmail.com"


async def send_test(target_email: str, limit: int = 1, preview: bool = False):
    try:
        import resend
    except ImportError:
        logger.error("resend package not installed. Run: pip install resend")
        return

    if not settings.RESEND_API_KEY and not preview:
        logger.error("RESEND_API_KEY not found in .env")
        return

    if not preview:
        resend.api_key = settings.RESEND_API_KEY

    async with SessionLocal() as db:
        # Fetch real pending author_email records that have email addresses
        stmt = (
            select(AuthorEmail)
            .where(
                and_(
                    AuthorEmail.status == "pending",
                    AuthorEmail.email_address.isnot(None),
                )
            )
            .order_by(AuthorEmail.created_at.asc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        records = result.scalars().all()

        if not records:
            logger.warning("No pending author_email records with email addresses found.")
            return

        logger.info(f"Found {len(records)} record(s) to test with.\n")

        for record in records:
            # Fetch associated paper
            paper_result = await db.execute(
                select(Paper).where(Paper.id == record.paper_id)
            )
            paper = paper_result.scalar_one_or_none()
            paper_title = paper.title if paper else "your recent paper"

            # Build real episode URL
            if record.episode_slug:
                episode_url = f"{settings.SITE_URL}/episodes/{record.episode_slug}"
            else:
                episode_url = settings.SITE_URL

            # Build email content using real data
            html_body = build_html_email(record.author_name, paper_title, episode_url)
            text_body = build_plain_text_email(record.author_name, paper_title, episode_url)

            subject = f'Your research on "{paper_title[:80]}" was featured on The Eureka Feed 🎧'

            logger.info(f"{'─'*50}")
            logger.info(f"Record ID:     {record.id}")
            logger.info(f"Real Author:   {record.author_name}")
            logger.info(f"Real Email:    {record.email_address}")
            logger.info(f"Paper:         {paper_title[:80]}")
            logger.info(f"Episode URL:   {episode_url}")
            logger.info(f"Sending To:    {target_email}  (NOT the author)")
            logger.info(f"BCC:           {BCC_EMAIL}")
            logger.info(f"Subject:       {subject}")

            if preview:
                logger.info("  [PREVIEW] Would send email ↑\n")
                continue

            try:
                params = {
                    "from": settings.EMAIL_FROM,
                    "to": [target_email],
                    "bcc": [BCC_EMAIL],
                    "subject": subject,
                    "html": html_body,
                    "text": text_body,
                }
                if settings.EMAIL_REPLY_TO:
                    params["reply_to"] = settings.EMAIL_REPLY_TO

                email_response = resend.Emails.send(params)
                resend_id = (
                    email_response.get("id")
                    if isinstance(email_response, dict)
                    else getattr(email_response, "id", None)
                )
                logger.info(f"  ✅ Sent! Resend ID: {resend_id}\n")

            except Exception as e:
                logger.error(f"  ❌ Send failed: {e}\n")


async def main():
    parser = argparse.ArgumentParser(
        description="Send test emails using REAL paper data (routed to your own inbox)"
    )
    parser.add_argument("email", nargs="?", help="Your email to receive the test")
    parser.add_argument("--limit", type=int, default=1, help="Number of records to test with (default: 1)")
    parser.add_argument("--preview", action="store_true", help="Preview without sending")
    args = parser.parse_args()

    if not args.preview and not args.email:
        parser.error("Provide a target email or use --preview")

    target = args.email or "(preview mode)"

    logger.info("=" * 60)
    logger.info("TEST EMAIL SEND (using real DB data)")
    logger.info(f"Mode:    {'PREVIEW' if args.preview else 'LIVE'}")
    logger.info(f"To:      {target}")
    logger.info(f"BCC:     {BCC_EMAIL}")
    logger.info(f"From:    {settings.EMAIL_FROM}")
    logger.info(f"Limit:   {args.limit}")
    logger.info("=" * 60 + "\n")

    await send_test(
        target_email=args.email or "",
        limit=args.limit,
        preview=args.preview,
    )


if __name__ == "__main__":
    asyncio.run(main())
