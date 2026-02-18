import asyncio
import sys
import random
from pathlib import Path
from sqlalchemy import select

# Add backend directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.social import SocialPost

OLD_CTA = "Join Eurekafeed.com for link to paper and to listen to audio format of absolute cutting edge research before anybody else."

NEW_CTAs = [
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

async def vary_ctas():
    async with SessionLocal() as db:
        print("🔍 Scanning for repetitive CTAs...")
        
        result = await db.execute(select(SocialPost))
        posts = result.scalars().all()
        
        count = 0
        for post in posts:
            if OLD_CTA in post.content:
                # Replace ALL occurrences in the content (remember there are 5 tweets per post)
                # We want each of the 5 tweets to potentially have a DIFFERENT CTA if possible,
                # but simple replace might just swap them all.
                # Better approach: Split by ---, replace per tweet, join back.
                
                tweets = post.content.split('---')
                new_tweets = []
                for tweet in tweets:
                    if OLD_CTA in tweet:
                        new_cta = random.choice(NEW_CTAs)
                        new_tweet = tweet.replace(OLD_CTA, new_cta)
                        new_tweets.append(new_tweet)
                    else:
                        new_tweets.append(tweet)
                
                post.content = '---'.join(new_tweets)
                count += 1
        
        await db.commit()
        print(f"✅ Updated {count} posts with varied CTAs.")

if __name__ == "__main__":
    asyncio.run(vary_ctas())
