import asyncio
import logging
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx
from backend.config import settings, KNOWLEDGE_BASES_DIR
from backend.crawler.parser import smart_parser
from backend.rag.chunker import semantic_chunker
from backend.rag.vector_store import KnowledgeBaseIndex

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("reindex_kb")


async def reindex_url(url: str, provider: str = "gemini"):
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    domain = parsed.netloc.lower() or url.replace("https://", "").replace("http://", "").split("/")[0].lower()
    kb_id = f"kb_{domain.replace('.', '_')}"

    logger.info(f"Re-indexing {url} (KB: {kb_id}) with provider: {provider} ...")

    # Fetch with browser headers
    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    with httpx.Client(timeout=25.0, verify=False, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        if resp.status_code != 200:
            logger.error(f"Failed to fetch {url}: status {resp.status_code}")
            return False

        parsed_doc = smart_parser.parse(resp.text, str(resp.url), http_client=client)

    logger.info(f"Parsed {parsed_doc['title']}: {parsed_doc['word_count']} words, {len(parsed_doc['headings'])} headings")

    chunks = semantic_chunker.chunk_page(parsed_doc)
    logger.info(f"Generated {len(chunks)} chunks")

    kb_metadata = {
        "kb_id": kb_id,
        "url": url,
        "domain": domain,
        "title": parsed_doc["title"],
        "description": parsed_doc.get("description", ""),
        "total_pages": 1,
        "total_chunks": len(chunks),
        "total_words": parsed_doc["word_count"],
        "created_at": datetime.now().isoformat(),
        "last_crawled_at": datetime.now().isoformat(),
        "pages": [
            {
                "url": parsed_doc["url"],
                "title": parsed_doc["title"],
                "word_count": parsed_doc["word_count"],
                "headings_count": len(parsed_doc["headings"]),
                "depth": 0
            }
        ],
        "crawl_tree": [
            {
                "url": parsed_doc["url"],
                "title": parsed_doc["title"],
                "parent": None,
                "depth": 0,
                "word_count": parsed_doc["word_count"]
            }
        ]
    }

    kb = KnowledgeBaseIndex(kb_id)
    await kb.build(
        metadata=kb_metadata,
        chunks=chunks,
        provider=provider,
        api_key=settings.gemini_api_key if provider == "gemini" else None
    )

    logger.info(f"Successfully re-indexed {kb_id}! Total chunks: {len(chunks)}, word count: {parsed_doc['word_count']}")
    return True


async def main():
    target_urls = [
        "https://sivanesh1909.github.io/Sivanesh---portfolio/",
        "https://futryx.in",
    ]
    for url in target_urls:
        try:
            await reindex_url(url, provider="gemini")
        except Exception as e:
            logger.error(f"Error reindexing {url}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
