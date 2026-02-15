"""Generate premium content for AI papers."""
from openai import AsyncOpenAI
from app.core.config import settings
from loguru import logger


class PremiumContentGenerator:
    """Generate deep analysis, code walkthroughs, and applications for AI papers."""
    
    def __init__(self, model: str = "gpt-4o-mini"):
        self.llm = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = model
    
    async def generate(self, paper) -> dict:
        """
        Generate premium content for a paper.
        
        Args:
            paper: Paper object with title, abstract, full_text
            
        Returns:
            Dict with deep_analysis, code_walkthrough, practical_applications
        """
        logger.info(f"Generating premium content for: {paper.title[:60]}...")
        
        deep_analysis = await self.generate_deep_analysis(paper)
        code_walkthrough = await self.generate_code_walkthrough(paper)
        # Applications now merged into main article's Implications section
        
        return {
            "deep_analysis": deep_analysis,
            "code_walkthrough": code_walkthrough,
            "practical_applications": None  # Merged into main article
        }
    
    async def generate_deep_analysis(self, paper) -> str:
        """Generate 800-900 word newsletter article (3-4 minute read)."""
        prompt = f"""You are a science journalist writing for The Eureka Feed, a newsletter for informed professionals who follow AI and technology.

Your readers are educated, intellectually curious, and want to understand significant AI research without wading through academic papers. They value substance over hype.

PAPER:
Title: {paper.title}
Abstract: {paper.abstract}
Full Text: {paper.full_text[:15000] if paper.full_text else "Not available"}

Write an 800-900 word article (approximately 3-4 minute read) that explains this research clearly and factually.

STRUCTURE (use ## headers):

## [Create a clear, descriptive headline - no clickbait]
Write a proper article with flowing prose - NOT bullet points or listicles.

**Opening paragraph:** State what this research is and why it matters. Be direct. Don't oversell.

**The Research:** Explain what the researchers did, why they did it, and what problem they addressed. One clear analogy is acceptable if it genuinely aids understanding.

**Key Findings:** Present the most important results with specific numbers or benchmarks. Explain what these mean in context.

**Implications:** Who might benefit? What are the practical applications? Be specific but measured in your claims.

**Limitations:** What doesn't this solve? What are the caveats? Be honest about the gap between research and real-world deployment.

TONE:
- Factual and measured, not enthusiastic or promotional
- Report what the research shows, not what it "could potentially revolutionize"
- Let the findings speak for themselves
- Skeptical but fair - acknowledge both merits and limitations

AVOID:
- Superlatives (groundbreaking, revolutionary, game-changing, remarkable)
- Flattery ("brilliant researchers," "impressive work")
- Hype phrases ("promises to transform," "could fundamentally change")
- Speculation beyond what the paper demonstrates
- Bullet points, numbered lists, emoji
- "In this article we will..." / "As we have seen..."

Write like a seasoned tech reporter who has seen many papers come and go - informed, clear, neither cynical nor starry-eyed.
"""
        
        response = await self.llm.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,  # Slightly lower for more factual tone
            max_tokens=2000
        )
        
        content = response.choices[0].message.content
        logger.info(f"Generated deep analysis ({len(content)} chars)")
        return content
    
    async def generate_code_walkthrough(self, paper) -> str:
        """Generate code walkthrough if GitHub/code is mentioned."""
        # Check if paper mentions code
        text = f"{paper.title} {paper.abstract or ''}".lower()
        if "github" not in text and "code" not in text and "implementation" not in text:
            logger.info("No code mentioned, skipping code walkthrough")
            return None
        
        prompt = f"""Create a code walkthrough for this paper:

Paper: {paper.title}
Abstract: {paper.abstract}

Provide:
1. **Setup** - Dependencies, environment (e.g., PyTorch, TensorFlow)
2. **Key Concepts** - Core algorithms/techniques to implement
3. **Example Usage** - Runnable code snippets (Python preferred)
4. **Common Pitfalls** - What to watch out for

Format: Markdown with code blocks (```python).
Note: If no official code is available, provide pseudocode or conceptual examples.
Length: 500-800 words.
"""
        
        response = await self.llm.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content
        logger.info(f"Generated code walkthrough ({len(content)} chars)")
        return content
    
    async def generate_applications(self, paper) -> str:
        """Generate practical applications section."""
        prompt = f"""What can people actually DO with this research?

Paper: {paper.title}
Abstract: {paper.abstract}

Provide 3-5 concrete use cases:

1. **For AI Companies** (OpenAI, Anthropic, Google, etc.)
   - How could they use this in their products?
   - What features could this enable?

2. **For Startups/Developers**
   - What apps or tools could you build with this?
   - How does this lower barriers or enable new things?

3. **For Researchers**
   - What follow-up work does this enable?
   - What new questions can we now ask?

Format: Numbered list with 2-3 sentences each.
Be SPECIFIC. Name actual products/companies/use cases.
Tone: Practical and actionable, not theoretical.
Length: 400-600 words.
"""
        
        response = await self.llm.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=800
        )
        
        content = response.choices[0].message.content
        logger.info(f"Generated applications ({len(content)} chars)")
        return content
