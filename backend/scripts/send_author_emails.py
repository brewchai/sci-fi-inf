"""
Send branded outreach emails to scientists whose papers were featured.

Reads author_emails records with status="pending" and email_address set,
sends branded HTML emails via Resend, and updates the DB with send status.

Usage:
    python scripts/send_author_emails.py              # send all pending
    python scripts/send_author_emails.py --dry-run     # preview emails
    python scripts/send_author_emails.py --limit 1     # send just 1 (test)
"""
import asyncio
import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from loguru import logger
from sqlalchemy import select, and_

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.author_email import AuthorEmail
from app.models.paper import Paper  # noqa: F401 — needed for ORM relationship resolution
from app.models.podcast import PodcastEpisode  # noqa: F401
from app.core.config import settings


def build_html_email(
    author_name: str,
    paper_title: str,
    episode_url: str,
) -> str:
    """Build a branded HTML email for the author outreach."""
    
    # Extract first name or title for greeting
    name_parts = author_name.strip().split()
    greeting_name = name_parts[-1] if len(name_parts) > 1 else author_name

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0a0f; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:24px; color:#ffffff; font-weight:700; letter-spacing:-0.5px;">
                    📖 The Eureka Feed
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:13px; color:#7f8ea3; padding-top:6px; letter-spacing:0.5px;">
                    CUTTING-EDGE RESEARCH, DISTILLED
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:linear-gradient(135deg, #12121a 0%, #1a1a2e 100%); border:1px solid #2a2a3e; border-radius:16px; padding:40px 36px;">

              <!-- Title -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:13px; color:#646cff; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; padding-bottom:16px;">
                    Your Research Was Featured
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:16px; color:#e0e0e8; line-height:1.7;">
                    <p style="margin:0 0 18px 0;">Hi Dr. {greeting_name},</p>

                    <p style="margin:0 0 18px 0;">
                      Your paper <strong style="color:#ffffff;">"{paper_title}"</strong> was recently
                      featured on <strong style="color:#ffffff;">The Eureka Feed</strong> — a daily
                      science podcast that transforms cutting-edge research into accessible audio
                      briefings for a curious, non-specialist audience.
                    </p>

                    <p style="margin:0 0 24px 0;">
                      We believe your work deserves a wider audience. If you'd like to share the
                      episode with your network, we'd be grateful. And if you have any feedback
                      or corrections, we'd love to hear from you via our
                      <a href="{settings.SITE_URL}/contact" style="color:#646cff; text-decoration:none;">contact page</a>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 24px 0;">
                    <a href="{episode_url}" target="_blank"
                       style="display:inline-block; background:linear-gradient(135deg, #646cff 0%, #535bf2 100%);
                              color:#ffffff; text-decoration:none; font-size:15px; font-weight:600;
                              padding:14px 32px; border-radius:10px; letter-spacing:0.3px;">
                      🎧&nbsp; Listen to the Episode
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-top:1px solid #2a2a3e; padding-top:20px;">
                    <p style="margin:0; font-size:14px; color:#7f8ea3; line-height:1.6;">
                      Best regards,<br>
                      <strong style="color:#e0e0e8;">The Eureka Feed Team</strong><br>
                      <a href="https://www.theeurekafeed.com" style="color:#646cff; text-decoration:none;">theeurekafeed.com</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 20px 0 20px;">
              <p style="margin:0; font-size:12px; color:#4a4a5e; line-height:1.5;">
                You're receiving this because your research was featured on The Eureka Feed.<br>
                © 2026 The Eureka Feed. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def build_plain_text_email(
    author_name: str,
    paper_title: str,
    episode_url: str,
) -> str:
    """Build a plain text fallback for the email."""
    name_parts = author_name.strip().split()
    greeting_name = name_parts[-1] if len(name_parts) > 1 else author_name

    return f"""Hi Dr. {greeting_name},

Your paper "{paper_title}" was recently featured on The Eureka Feed — a daily science podcast that transforms cutting-edge research into accessible audio briefings for a curious, non-specialist audience.

Listen to the episode: {episode_url}

We believe your work deserves a wider audience. If you'd like to share the episode with your network, we'd be grateful. And if you have any feedback or corrections, we'd love to hear from you via our contact page: {settings.SITE_URL}/contact

Best regards,
The Eureka Feed Team
https://www.theeurekafeed.com

---
You're receiving this because your research was featured on The Eureka Feed.
"""


async def send_emails(dry_run: bool = False, limit: Optional[int] = None):
    """Send pending author emails via Resend."""
    
    # Import resend here so script doesn't crash if not installed
    try:
        import resend
    except ImportError:
        logger.error("resend package not installed. Run: pip install resend")
        return

    if not settings.RESEND_API_KEY and not dry_run:
        logger.error("RESEND_API_KEY not set in .env")
        return

    if not dry_run:
        resend.api_key = settings.RESEND_API_KEY

    stats = {"sent": 0, "failed": 0, "skipped": 0}

    async with SessionLocal() as db:
        # Get pending records with email addresses
        stmt = (
            select(AuthorEmail)
            .where(
                and_(
                    AuthorEmail.status == "pending",
                    AuthorEmail.email_address.isnot(None),
                )
            )
            .order_by(AuthorEmail.created_at.asc())
        )
        if limit:
            stmt = stmt.limit(limit)

        result = await db.execute(stmt)
        records = result.scalars().all()

        if not records:
            logger.info("No pending emails to send.")
            return stats

        logger.info(f"Found {len(records)} email(s) to send...")

        for record in records:
            # Fetch associated paper title
            from app.models.paper import Paper
            paper_result = await db.execute(
                select(Paper).where(Paper.id == record.paper_id)
            )
            paper = paper_result.scalar_one_or_none()
            paper_title = paper.title if paper else "your recent paper"

            # Build episode URL
            if record.episode_slug:
                episode_url = f"{settings.SITE_URL}/episodes/{record.episode_slug}"
            else:
                episode_url = settings.SITE_URL

            # Build email content
            html_body = build_html_email(record.author_name, paper_title, episode_url)
            text_body = build_plain_text_email(record.author_name, paper_title, episode_url)

            subject = f'Your research on "{paper_title[:80]}" was featured on The Eureka Feed 🎧'

            logger.info(f"\n{'─'*50}")
            logger.info(f"To:      {record.email_address}")
            logger.info(f"Author:  {record.author_name}")
            logger.info(f"Paper:   {paper_title[:60]}...")
            logger.info(f"Episode: {episode_url}")
            logger.info(f"Subject: {subject}")

            if dry_run:
                logger.info("[DRY RUN] Would send email ↑")
                stats["skipped"] += 1
                continue

            try:
                # Send via Resend
                params = {
                    "from": settings.EMAIL_FROM,
                    "to": [record.email_address],
                    "bcc": ["ninad.mundalik@gmail.com"],
                    "subject": subject,
                    "html": html_body,
                    "text": text_body,
                }
                if settings.EMAIL_REPLY_TO:
                    params["reply_to"] = settings.EMAIL_REPLY_TO

                email_response = resend.Emails.send(params)

                # Update record
                record.status = "sent"
                record.resend_message_id = email_response.get("id") if isinstance(email_response, dict) else getattr(email_response, "id", None)
                record.sent_at = datetime.utcnow()
                await db.commit()

                logger.info(f"✅ Sent! (Resend ID: {record.resend_message_id})")
                stats["sent"] += 1

            except Exception as e:
                logger.error(f"❌ Send failed: {e}")
                record.status = "failed"
                await db.commit()
                stats["failed"] += 1

    return stats


async def main():
    parser = argparse.ArgumentParser(description="Send outreach emails to scientists")
    parser.add_argument("--dry-run", action="store_true", help="Preview without sending")
    parser.add_argument("--limit", type=int, help="Max emails to send")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("AUTHOR EMAIL SEND")
    logger.info(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.limit:
        logger.info(f"Limit: {args.limit}")
    logger.info(f"From: {settings.EMAIL_FROM}")
    logger.info(f"Reply-To: {settings.EMAIL_REPLY_TO or '(not set)'}")
    logger.info("=" * 60)

    stats = await send_emails(dry_run=args.dry_run, limit=args.limit)

    if stats:
        logger.info("\n" + "=" * 60)
        logger.info("SUMMARY")
        logger.info(f"  Sent:    {stats['sent']}")
        logger.info(f"  Failed:  {stats['failed']}")
        logger.info(f"  Skipped: {stats['skipped']}")
        logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
