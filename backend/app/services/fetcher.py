import httpx
from bs4 import BeautifulSoup
from loguru import logger
from typing import Optional
import re

class FullTextFetcher:
    """
    Service to fetch and extract full text from Open Access research papers.
    Specifically optimized for journals like Frontiers, PLOS, and MDPI.
    """

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }

    async def fetch_full_text(self, url: str) -> Optional[str]:
        """
        Fetch full text from a given URL.
        Detects the source and uses the appropriate extraction logic.
        """
        if not url:
            return None

        # Clean URL (OpenAlex often returns DOI URLs, we might need to resolve them)
        if "doi.org" in url:
            # Let's see if we can get the direct landing page or if httpx follows redirects
            pass

        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=self.timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                final_url = str(response.url)
                html = response.text
                
                if "frontiersin.org" in final_url:
                    return self._extract_frontiers(html)
                elif "plos.org" in final_url:
                    return self._extract_plos(html)
                else:
                    return self._extract_generic(html)
                    
        except Exception as e:
            logger.error(f"Failed to fetch full text from {url}: {e}")
            return None

    def _extract_frontiers(self, html: str) -> str:
        """Extract main sections from Frontiers journal HTML."""
        soup = BeautifulSoup(html, "lxml")
        
        # Frontiers full text is usually in a div with content
        # We target specific sections: Results, Discussion, Conclusion
        content_parts = []
        
        # Try to find all section headers and their next siblings
        sections_to_keep = ["results", "discussion", "conclusion", "conclusions"]
        
        for section in soup.find_all(["h2", "h3"]):
            text = section.get_text().lower().strip()
            if any(key in text for key in sections_to_keep):
                content_parts.append(f"\n## {section.get_text()}\n")
                
                # Get following paragraphs until the next header
                curr = section.next_sibling
                while curr and curr.name not in ["h2", "h3"]:
                    if curr.name == "p":
                        content_parts.append(curr.get_text().strip())
                    curr = curr.next_sibling
        
        if not content_parts:
            # Fallback to general article body if sections not found
            body = soup.find("div", class_="article-body") or soup.find("div", class_="ArticleBody")
            if body:
                return body.get_text(separator="\n", strip=True)
                
        return "\n".join(content_parts).strip()

    def _extract_plos(self, html: str) -> str:
        """Extract from PLOS journals."""
        soup = BeautifulSoup(html, "lxml")
        # Target specific divs often used by PLOS
        body = soup.find("div", class_="article-text") or soup.find("div", id="artText")
        if body:
            return body.get_text(separator="\n", strip=True)
        return self._extract_generic(html)

    def _extract_generic(self, html: str) -> str:
        """Generic extraction for unknown sources."""
        soup = BeautifulSoup(html, "lxml")
        
        # Remove script, style, and navigation elements
        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()
            
        # Try to find the "main" content
        main = soup.find("main") or soup.find("article") or soup.find("div", id="content")
        if main:
            return main.get_text(separator="\n", strip=True)
            
        return soup.get_text(separator="\n", strip=True)
