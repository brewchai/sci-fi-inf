import asyncio
from sqlalchemy import text
from app.db.session import engine

async def migrate():
    async with engine.begin() as conn:
        print("Adding 'full_text' column to papers table...")
        await conn.execute(text("ALTER TABLE papers ADD COLUMN IF NOT EXISTS full_text TEXT;"))
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
