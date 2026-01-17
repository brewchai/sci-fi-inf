import asyncio
import sys
import os

from app.db.session import SessionLocal
from app.services.editor import EditorEngine
from app.models.paper import Paper
from sqlalchemy import select

async def verify():
    async with SessionLocal() as db:
        # Target paper 58 (Frontiers)
        stmt = select(Paper).where(Paper.id == 58)
        result = await db.execute(stmt)
        paper = result.scalar_one_or_none()
        
        if not paper:
            print("Paper 58 not found!")
            return

        print(f"--- Original Paper {paper.id} ---")
        print(f"Title: {paper.title}")
        print(f"PDF URL: {paper.pdf_url}")
        print(f"Old Summary Preview: {paper.eli5_summary[:200] if paper.eli5_summary else 'None'}")
        
        # Clear summary to force regeneration
        paper.eli5_summary = None
        
        editor = EditorEngine(db)
        print("\n--- Regenerating Summary with Full Text Fetching ---")
        success = await editor.generate_summary(paper)
        
        if success:
            await db.commit()
            print("\n--- New Improved Summary ---")
            print(f"Headline: {paper.headline}")
            print(f"Summary: {paper.eli5_summary}")
        else:
            print("Generation failed.")

if __name__ == "__main__":
    asyncio.run(verify())
