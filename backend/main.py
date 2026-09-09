import asyncio
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, HttpUrl

from backend.config import settings, persist_env_variable
from backend.crawler.crawler import CrawlJob
from backend.rag.chunker import semantic_chunker
from backend.rag.vector_store import vector_store_manager, KnowledgeBaseIndex
from backend.rag.engine import rag_engine
from backend.rag.analytics import kb_analytics

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("aethelexult.api")

app = FastAPI(
    title="AethelExult.AI Engine",
    description="Autonomous Website Scraping, Vector Database, and Grounded RAG Knowledge Assistant API",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory crawl job registry for live progress tracking
active_crawl_jobs: Dict[str, Dict[str, Any]] = {}


# Request Models
class CrawlRequest(BaseModel):
    url: str
    max_pages: Optional[int] = settings.default_max_pages
    max_depth: Optional[int] = settings.crawl_depth
    respect_robots_txt: Optional[bool] = settings.respect_robots_txt
    provider: Optional[str] = "gemini"
    api_key: Optional[str] = None


class ChatRequest(BaseModel):
    query: str
    kb_id: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    top_k: Optional[int] = settings.top_k_retrieval


class SettingsUpdateRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    default_provider: Optional[str] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    top_k_retrieval: Optional[int] = None


# Background Crawl Pipeline
async def run_crawl_pipeline(
    job_id: str,
    url: str,
    max_pages: int,
    max_depth: int,
    respect_robots_txt: bool,
    provider: Optional[str],
    api_key: Optional[str]
):
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    domain = parsed.netloc.lower() or url.replace("https://", "").replace("http://", "").split("/")[0].lower()
    kb_id = f"kb_{domain.replace('.', '_')}"

    job_state = active_crawl_jobs[job_id]
    job_state["status"] = "crawling"
    job_state["kb_id"] = kb_id
    job_state["logs"] = []

    def on_crawl_event(event: Dict[str, Any]):
        job_state["progress"] = event.get("progress", job_state["progress"])
        job_state["current_action"] = event.get("current_action", job_state["current_action"])
        if "message" in event:
            job_state["logs"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {event['message']}")
        elif event.get("type") == "page_parsed":
            job_state["logs"].append(
                f"[{datetime.now().strftime('%H:%M:%S')}] Parsed: {event.get('title', 'Page')} ({event.get('word_count', 0)} words)"
            )

    crawler = CrawlJob(
        job_id=job_id,
        start_url=url,
        max_pages=max_pages,
        max_depth=max_depth,
        respect_robots_txt=respect_robots_txt,
        on_event=on_crawl_event
    )

    try:
        pages = await crawler.crawl()
        if not pages:
            job_state["status"] = "failed"
            job_state["error"] = f"Unable to retrieve content from {url}. Please verify the website is online and allows crawling."
            job_state["current_action"] = "Crawl failed: 0 pages retrieved."
            job_state["logs"].append(f"[{datetime.now().strftime('%H:%M:%S')}] ERROR: 0 pages retrieved from {url}. Knowledge base not overwritten.")
            return

        job_state["logs"].append(f"[{datetime.now().strftime('%H:%M:%S')}] Crawl complete. Chunking documents...")
        job_state["current_action"] = "Chunking documents & extracting semantic hierarchy..."
        job_state["progress"] = 80

        # Chunk all pages
        all_chunks: List[Dict[str, Any]] = []
        for page in pages:
            chunks = semantic_chunker.chunk_page(page)
            all_chunks.extend(chunks)

        job_state["logs"].append(
            f"[{datetime.now().strftime('%H:%M:%S')}] Generated {len(all_chunks)} semantic chunks. Generating embeddings..."
        )
        job_state["current_action"] = "Generating vector embeddings & building hybrid index..."
        job_state["progress"] = 90

        # Build Knowledge Base Index
        kb_metadata = {
            "kb_id": kb_id,
            "url": url,
            "domain": domain,
            "title": pages[0]["title"] if pages else domain,
            "description": pages[0]["description"] if pages else "",
            "total_pages": len(pages),
            "total_chunks": len(all_chunks),
            "total_words": sum(p["word_count"] for p in pages),
            "created_at": datetime.now().isoformat(),
            "last_crawled_at": datetime.now().isoformat(),
            "pages": [
                {
                    "url": p["url"],
                    "title": p["title"],
                    "word_count": p["word_count"],
                    "headings_count": len(p["headings"]),
                    "depth": p.get("depth", 0)
                }
                for p in pages
            ],
            "crawl_tree": crawler.crawl_tree
        }

        kb_index = KnowledgeBaseIndex(kb_id)
        await kb_index.build(
            metadata=kb_metadata,
            chunks=all_chunks,
            provider=provider,
            api_key=api_key
        )

        job_state["status"] = "completed"
        job_state["progress"] = 100
        job_state["current_action"] = f"Knowledge base ready! {len(pages)} pages, {len(all_chunks)} chunks indexed."
        job_state["logs"].append(
            f"[{datetime.now().strftime('%H:%M:%S')}] Indexing complete. Assistant ready to chat."
        )

    except Exception as e:
        logger.exception(f"Crawl pipeline failed for {url}")
        job_state["status"] = "failed"
        job_state["error"] = str(e)
        job_state["current_action"] = f"Error: {str(e)}"
        job_state["logs"].append(f"[{datetime.now().strftime('%H:%M:%S')}] ERROR: {str(e)}")


# API Endpoints
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AethelExult.AI Core (WebMind Engine)",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/crawl")
async def start_crawl(req: CrawlRequest, background_tasks: BackgroundTasks):
    req_url = req.url.strip()
    if not req_url.startswith(("http://", "https://")):
        req_url = "https://" + req_url

    job_id = f"job_{uuid.uuid4().hex[:10]}"
    active_crawl_jobs[job_id] = {
        "job_id": job_id,
        "url": req_url,
        "status": "queued",
        "progress": 0,
        "current_action": "Queueing crawl job...",
        "created_at": datetime.now().isoformat(),
        "logs": [f"[{datetime.now().strftime('%H:%M:%S')}] Crawl job registered for {req_url}"]
    }

    background_tasks.add_task(
        run_crawl_pipeline,
        job_id=job_id,
        url=req_url,
        max_pages=req.max_pages or settings.default_max_pages,
        max_depth=req.max_depth or settings.crawl_depth,
        respect_robots_txt=req.respect_robots_txt if req.respect_robots_txt is not None else False,
        provider=req.provider,
        api_key=req.api_key
    )

    return {
        "job_id": job_id,
        "url": req_url,
        "status": "queued",
        "message": f"Crawl job started for {req_url}"
    }


@app.get("/api/crawl/status/{job_id}")
async def get_crawl_status(job_id: str):
    if job_id not in active_crawl_jobs:
        raise HTTPException(status_code=404, detail="Crawl job not found")
    return active_crawl_jobs[job_id]


@app.get("/api/knowledge-bases")
async def list_knowledge_bases():
    return vector_store_manager.list_knowledge_bases()


@app.get("/api/knowledge-bases/{kb_id}")
async def get_knowledge_base(kb_id: str):
    idx = vector_store_manager.get_index(kb_id)
    if not idx:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return {
        "metadata": idx.metadata,
        "total_chunks": len(idx.chunks)
    }


@app.get("/api/knowledge-bases/{kb_id}/chunks")
async def get_kb_chunks(
    kb_id: str,
    search: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0)
):
    idx = vector_store_manager.get_index(kb_id)
    if not idx:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    filtered = idx.chunks
    if search:
        search_lower = search.lower()
        filtered = [
            c for c in filtered
            if search_lower in c["text"].lower() or search_lower in c.get("title", "").lower()
        ]

    total = len(filtered)
    paginated = filtered[offset:offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "chunks": paginated
    }


@app.get("/api/knowledge-bases/{kb_id}/analytics")
async def get_kb_analytics(
    kb_id: str,
    provider: Optional[str] = None,
    api_key: Optional[str] = None
):
    idx = vector_store_manager.get_index(kb_id)
    if not idx:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    analytics_data = await kb_analytics.generate_analytics(
        kb_metadata=idx.metadata,
        chunks=idx.chunks,
        provider=provider,
        api_key=api_key
    )
    return analytics_data


@app.post("/api/chat")
async def chat_with_website(req: ChatRequest):
    """
    SSE streaming chat endpoint. Delivers tokens, source references, and follow-up suggestions in real-time.
    """
    async def event_generator():
        async for chunk in rag_engine.stream_rag_response(
            query=req.query,
            kb_id=req.kb_id,
            chat_history=req.chat_history,
            provider=req.provider,
            api_key=req.api_key,
            top_k=req.top_k or settings.top_k_retrieval
        ):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.delete("/api/knowledge-bases/{kb_id}")
async def delete_knowledge_base(kb_id: str):
    success = vector_store_manager.delete_knowledge_base(kb_id)
    if not success:
        raise HTTPException(status_code=404, detail="Knowledge base not found or could not be deleted")
    return {"message": f"Knowledge base {kb_id} deleted successfully"}


@app.get("/api/settings")
async def get_settings():
    return {
        "gemini_configured": bool(settings.gemini_api_key),
        "openai_configured": bool(settings.openai_api_key),
        "default_provider": settings.default_provider,
        "gemini_chat_model": settings.gemini_chat_model,
        "openai_chat_model": settings.openai_chat_model,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k_retrieval": settings.top_k_retrieval
    }


@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    if req.gemini_api_key is not None:
        key_val = req.gemini_api_key.strip()
        settings.gemini_api_key = key_val
        persist_env_variable("GEMINI_API_KEY", key_val)
    if req.openai_api_key is not None:
        key_val = req.openai_api_key.strip()
        settings.openai_api_key = key_val
        persist_env_variable("OPENAI_API_KEY", key_val)
    if req.default_provider:
        settings.default_provider = req.default_provider
    if req.chunk_size:
        settings.chunk_size = req.chunk_size
    if req.chunk_overlap:
        settings.chunk_overlap = req.chunk_overlap
    if req.top_k_retrieval:
        settings.top_k_retrieval = req.top_k_retrieval

    return {"status": "success", "message": "Settings updated successfully"}


@app.post("/api/export")
async def export_data(
    kb_id: Optional[str] = None,
    format: str = Query(default="json", pattern="^(json|markdown)$")
):
    if not kb_id:
        raise HTTPException(status_code=400, detail="kb_id required for export")

    idx = vector_store_manager.get_index(kb_id)
    if not idx:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if format == "json":
        return JSONResponse(
            content={
                "metadata": idx.metadata,
                "chunks": idx.chunks
            },
            headers={"Content-Disposition": f'attachment; filename="{kb_id}_export.json"'}
        )
    else:
        # Markdown export
        md_lines = [
            f"# AethelExult.AI Knowledge Base: {idx.metadata.get('domain')}",
            f"Source: {idx.metadata.get('url')}",
            f"Indexed Pages: {idx.metadata.get('total_pages')}",
            f"Exported: {datetime.now().isoformat()}",
            "\n---\n"
        ]
        for c in idx.chunks:
            md_lines.append(f"## {c.get('title')} - {c.get('section_heading')}")
            md_lines.append(f"URL: {c.get('url')}\n")
            md_lines.append(c.get("text", "") + "\n\n")

        return StreamingResponse(
            iter(["\n".join(md_lines)]),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{kb_id}_export.md"'}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
