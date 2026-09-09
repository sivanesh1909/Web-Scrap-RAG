import pytest
import asyncio
from backend.crawler.parser import smart_parser
from backend.rag.chunker import semantic_chunker
from backend.rag.embeddings import embedding_service
from backend.rag.vector_store import KnowledgeBaseIndex


SAMPLE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>WebMind AI - Neural Knowledge Engine</title>
    <meta name="description" content="State of the art website RAG platform.">
</head>
<body>
    <header class="navbar">
        <nav><a href="/home">Home</a><a href="/pricing">Pricing</a></nav>
    </header>
    <main>
        <h1>Welcome to WebMind AI</h1>
        <p>WebMind transforms any public website into an interactive AI knowledge assistant.</p>
        
        <h2>Core Capabilities</h2>
        <p>It crawls websites recursively, cleans HTML content, and generates dense vector embeddings.</p>
        
        <table>
            <tr><th>Feature</th><th>Speed</th></tr>
            <tr><td>Crawling</td><td>Asynchronous</td></tr>
            <tr><td>RAG Retrieval</td><td>Sub-second</td></tr>
        </table>
        
        <h2>Installation Guide</h2>
        <p>Run pip install -r requirements.txt to get started.</p>
        <pre><code>uvicorn backend.main:app --reload</code></pre>
    </main>
    <footer class="footer-bottom">
        <p>© 2026 WebMind. All rights reserved.</p>
    </footer>
</body>
</html>
"""


def test_smart_parser():
    doc = smart_parser.parse(SAMPLE_HTML, "https://webmind.ai/docs")
    assert doc["title"] == "WebMind AI - Neural Knowledge Engine"
    assert doc["description"] == "State of the art website RAG platform."
    assert "Welcome to WebMind AI" in doc["content_markdown"]
    assert "Core Capabilities" in doc["content_markdown"]
    # Navbar and footer should be stripped
    assert "Home" not in doc["content_markdown"]
    assert "All rights reserved" not in doc["content_markdown"]
    assert len(doc["headings"]) >= 3
    assert doc["word_count"] > 20


def test_semantic_chunker():
    doc = smart_parser.parse(SAMPLE_HTML, "https://webmind.ai/docs")
    chunks = semantic_chunker.chunk_page(doc)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert "chunk_id" in chunk
        assert "url" in chunk
        assert "text" in chunk
        assert "token_count" in chunk
        assert chunk["url"] == "https://webmind.ai/docs"


def test_embeddings_and_vector_store():
    async def _async_test():
        doc = smart_parser.parse(SAMPLE_HTML, "https://webmind.ai/docs")
        chunks = semantic_chunker.chunk_page(doc)
        
        kb_id = "test_kb_sample"
        kb_index = KnowledgeBaseIndex(kb_id)
        await kb_index.build(
            metadata={"domain": "webmind.ai", "url": "https://webmind.ai"},
            chunks=chunks,
            provider="local"
        )

        results = await kb_index.search("How do I install WebMind?", top_k=2, provider="local")
        assert len(results) > 0
        assert "Installation Guide" in results[0]["text"] or "pip install" in results[0]["text"]
        assert results[0]["score"] > 0.0

    asyncio.run(_async_test())

