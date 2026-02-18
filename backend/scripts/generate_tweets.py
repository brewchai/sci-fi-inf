import asyncio
import os
import sys
from typing import List
from pathlib import Path
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.paper import Paper
from app.models.social import SocialPost
from app.core.config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

async def generate_tweets_for_paper(paper: Paper) -> str:
    """Generate viral tweets for a paper using OpenAI."""
    
    # Prioritize full text, fallback to abstract
    content_source = paper.full_text if paper.full_text else paper.abstract
    
    # Truncate to ~10k chars to fit context window/save tokens
    if content_source and len(content_source) > 10000:
        content_source = content_source[:10000] + "..."

    CTAS = [
        "Join Eurekafeed.com for link to paper and to listen to audio format of absolute cutting edge research before anybody else.",
        "🎧 Listen to the full audio breakdown of this paper at Eurekafeed.com.",
        "Get the full paper + audio summary instantly at Eurekafeed.com 🧠",
        "Go deeper: Audio format & source link available on Eurekafeed.com.",
        "Want this cutting-edge research in audio? Join Eurekafeed.com.",
        "Full access (Paper + Audio) 👉 Eurekafeed.com",
        "Don't just read it. Hear the breakthrough at Eurekafeed.com.",
        "Eurekafeed.com: The fastest way to consume cutting-edge science.",
        "Stream the audio version of this study at Eurekafeed.com 🎧",
        "Unlock the full insight (Audio + Text) at Eurekafeed.com.",
        "Join the inner circle of science at Eurekafeed.com."
    ]
    import random
    selected_cta = random.choice(CTAS)

    prompt = f"""
    You are a viral social media manager for "The Eureka Feed", a cutting-edge science podcast.
    
    Your goal is to write 5 distinct, high-engagement tweets about this research paper.
    
    Paper Title: {paper.title}
    Content: {content_source}
    
    Format Constraints:
    1. Hook: A single sentence that grabs attention (startling fact, question, or bold claim).
    2. Body: 2-3 sentences explaining the core breakthrough or insight.
    3. CTA: Must end with exactly: "{selected_cta}"
    
    Output Format:
    Separate each tweet with "---"
    Do not number them.
    Do not use hashtags.
    """

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    
    return response.choices[0].message.content

async def run_harvest():
    async with SessionLocal() as db:
        try:
            # 1. Fetch all papers that DO NOT have a social post yet
            stmt = (
                select(Paper)
                .outerjoin(SocialPost, Paper.id == SocialPost.paper_id)
                .where(SocialPost.id == None)
                .where(Paper.abstract != None)
            )
            
            result = await db.execute(stmt)
            papers_to_process = result.scalars().all()
            
            print(f"Found {len(papers_to_process)} papers to process.")
            
            for paper in papers_to_process:
                print(f"Generating tweets for: {paper.title[:50]}...")
                try:
                    tweet_content = await generate_tweets_for_paper(paper)
                    
                    # Store the result
                    post = SocialPost(
                        paper_id=paper.id,
                        content=tweet_content,
                        platform="twitter"
                    )
                    db.add(post)
                    await db.commit()
                    print(f"✅ Saved tweets for paper {paper.id}")
                    
                except Exception as e:
                    print(f"❌ Failed to generate for paper {paper.id}: {e}")
                    await db.rollback()
                    
        except Exception as e:
            print(f"Critical Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_harvest())
