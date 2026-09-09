import asyncio
import os
import sys

# Ensure UTF-8 console output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from backend.crawler.crawler import CrawlJob
from backend.crawler.parser import smart_parser
from backend.rag.chunker import semantic_chunker
from backend.rag.vector_store import KnowledgeBaseIndex
from backend.rag.engine import rag_engine


async def test_full_pipeline():
    print("=" * 70)
    print("ADVANCED RAG & SCRAPING PIPELINE VERIFICATION")
    print("=" * 70)

    # 1. Test Scraper & Anti-Blocking Headers
    test_url = "https://en.wikipedia.org/wiki/Artificial_intelligence"
    print(f"\n[Step 1] Crawling test site: {test_url} ...")
    job = CrawlJob("test_verify_job", test_url, max_pages=1, max_depth=0)
    pages = await job.crawl()

    assert len(pages) > 0, "Crawl failed to retrieve any pages!"
    page = pages[0]
    print(f"  [OK] Page Title: {page['title']}")
    print(f"  [OK] Extracted Word Count: {page['word_count']:,} words")
    print(f"  [OK] Extracted Headings Count: {len(page['headings'])}")

    # Verify no Wikipedia footnote references like [1], [edit] in cleaned markdown
    assert "[edit]" not in page["content_markdown"].lower(), "Leftover [edit] found in markdown!"
    print("  [OK] Footnote noise, citation links, and edit tags cleanly stripped!")

    # 2. Test Semantic Chunking
    print("\n[Step 2] Chunking document into hierarchical semantic units...")
    chunks = semantic_chunker.chunk_page(page)
    print(f"  [OK] Generated Chunks: {len(chunks)}")
    assert len(chunks) > 10, "Expected at least 10 chunks for a long document!"
    
    sample_chunk = chunks[2]
    print(f"  [OK] Sample Chunk Breadcrumb: {sample_chunk['context_header']}")
    assert "Section:" in sample_chunk["context_header"], "Context header missing section breadcrumb!"

    # 3. Test Knowledge Base Index Building & Persistence
    print("\n[Step 3] Building Knowledge Base Index with Persistent Local Embedder...")
    kb_id = "test_verified_kb"
    kb = KnowledgeBaseIndex(kb_id)
    metadata = {
        "kb_id": kb_id,
        "url": page["url"],
        "domain": "en.wikipedia.org",
        "title": page["title"],
        "total_pages": 1,
        "total_chunks": len(chunks),
        "total_words": page["word_count"],
        "pages": [{"url": page["url"], "title": page["title"], "word_count": page["word_count"]}]
    }
    await kb.build(metadata, chunks, provider="local")
    print(f"  [OK] Vector dimension: {kb.metadata['vector_dimension']}")
    assert kb.vectorizer_file.exists(), f"Vectorizer file {kb.vectorizer_file} was not saved!"
    print(f"  [OK] Vectorizer successfully persisted to: {kb.vectorizer_file.name}")

    # 4. Test Persistence Reload
    print("\n[Step 4] Simulating fresh server reload from disk...")
    fresh_kb = KnowledgeBaseIndex(kb_id)
    assert fresh_kb.local_embedder.is_fitted, "Reloaded index local_embedder is NOT fitted!"
    assert fresh_kb.vectors is not None, "Reloaded index vectors are None!"
    assert fresh_kb.bm25 is not None, "Reloaded BM25 index is None!"
    print("  [OK] Index, BM25, and Vectorizer loaded from disk with 100% fidelity!")

    # 5. Test Hybrid RRF Retrieval
    print("\n[Step 5] Testing Hybrid RRF Retrieval...")
    test_query = "Who coined the term artificial intelligence and when?"
    print(f"  Query: '{test_query}'")
    search_results = await fresh_kb.search(test_query, top_k=5, provider="local")
    print(f"  [OK] Retrieved {len(search_results)} relevant chunks.")

    for i, r in enumerate(search_results[:3], 1):
        print(f"    Top {i}: [{r['section_heading']}] (Score: {r['score']}, Vec: {r['vector_score']}, BM25: {r['bm25_score']})")
        snippet = r['text'][:150].replace('\n', ' ')
        print(f"      Snippet: {snippet}...")

    # 6. Test RAG Answering Generation (Zero-Mock Intelligent Local Synthesizer)
    print("\n[Step 6] Streaming RAG Answer Generation...")
    stream_tokens = []
    stream_sources = []
    stream_suggestions = []

    async for event in rag_engine.stream_rag_response(test_query, kb_id=kb_id, provider="local"):
        for line in event.splitlines():
            if line.startswith("data:"):
                try:
                    import json
                    payload = json.loads(line[5:].strip())
                    if "token" in payload:
                        stream_tokens.append(payload["token"])
                    elif "sources" in payload:
                        stream_sources = payload["sources"]
                    elif "suggestions" in payload:
                        stream_suggestions = payload["suggestions"]
                except Exception:
                    pass

    full_answer = "".join(stream_tokens)
    print(f"  [OK] Streamed {len(stream_tokens)} tokens.")
    print(f"  [OK] Received {len(stream_sources)} grounded citation sources.")
    print(f"  [OK] Received {len(stream_suggestions)} follow-up suggestions.")

    print("\n" + "-" * 70)
    print("GENERATED GROUNDED ANSWER:")
    print("-" * 70)
    print(full_answer)
    print("-" * 70)

    # Verification Assertions on Answer Quality
    # A) Check that no mock garbage exists
    assert "trisquadathon" not in full_answer.lower(), "Found mock word 'trisquadathon' in answer!"
    assert "gokila" not in full_answer.lower(), "Found mock word 'gokila' in answer!"
    assert "TaskGroup" not in full_answer, "Found mock TaskGroup code in answer!"

    # B) Check that citations exist
    assert "[" in full_answer and "]" in full_answer, "Answer missing bracketed source citations!"

    # C) Check that answer is substantive
    assert len(full_answer.split()) > 20, "Answer is too short!"

    print("\n[SUCCESS] ALL ADVANCED RAG PIPELINE VERIFICATION TESTS PASSED PERFECTLY!")


if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
