# 🧠 WebMind AI — Autonomous Website Scraping & Grounded RAG Platform

> **Transform any public website into a hyper-intelligent, citation-grounded AI knowledge assistant.**

WebMind AI is a production-grade AI SaaS platform engineered to compete with products from OpenAI, Perplexity, Glean, and Notion AI. It seamlessly combines **asynchronous multi-page crawling**, **semantic DOM noise filtering**, **hierarchical token chunking**, **hybrid vector search (BM25 + Cosine Similarity)**, and **retrieval-augmented generation (RAG)** powered by **Google Gemini** and **OpenAI**.

---

## 🌟 Key Features

- 🕷️ **Autonomous Multi-Page Crawler**: Asynchronous recursive link discovery with domain scoping, robots.txt compliance, and canonical deduplication.
- 🧹 **Intelligent DOM Extraction**: Strips navigation menus, footers, cookie consent banners, and adverts; preserves semantic markdown headings, tables, code snippets, and structured lists.
- ⚡ **Hybrid Vector Database**: Combines dense vector embeddings with sparse BM25 lexical keyword retrieval for sub-second recall of technical terms, URLs, and code snippets.
- 🛡️ **Zero-Hallucination Grounding**: Strict anti-hallucination system prompts ensure the assistant synthesizes responses *only* from verified scraped passages.
- 📌 **Interactive Source Citations**: Every answer features interactive `[1]`, `[2]` citation pills. Clicking any citation opens the exact scraped paragraph, confidence score, and original URL.
- 💡 **Dynamic Follow-Up Suggestions**: Automatically generates contextual follow-up question chips for continuous exploration.
- 📊 **Executive Knowledge HUD**: Auto-generates website summaries, key insights, topic clusters, and interactive FAQ accordions.
- 🔬 **Document Chunk Explorer**: Search, inspect, and browse individual indexed document chunks with breadcrumbs and token metrics.
- 🤖 **Dual Model Intel + Local Engine**: Native integration with **Google Gemini 2.5 Flash** (`google-genai`), **OpenAI GPT-4o**, and an embedded **Local Grounded Engine** for instant offline exploration with zero API keys required.
- 🎨 **Ultra-Premium UI/UX**: Cinematic dark mode, 60 FPS interactive HTML5 canvas particle universe, aurora gradients, glassmorphism panels, and typewriter streaming responses.

---

## 🏗️ Architecture Overview

```
WebMind AI
├── frontend/                          # Next.js 15 (App Router) + React 19 + Tailwind CSS + Framer Motion
│   ├── app/
│   │   ├── globals.css                # Obsidian & Neon design tokens, glassmorphism utilities
│   │   ├── layout.tsx                 # Root layout with fonts & SEO metadata
│   │   └── page.tsx                   # Master landing page & interactive workspace
│   ├── components/
│   │   ├── canvas/ParticleUniverse.tsx # 60 FPS interactive canvas neural particle network
│   │   ├── navbar/Navbar.tsx          # Glassmorphic header & KB switcher
│   │   ├── hero/HeroSection.tsx       # Cinematic headline, URL ingestion bar & presets
│   │   ├── crawler/CrawlConsole.tsx   # Live crawl telemetry, progress bar & log stream
│   │   ├── chat/ChatInterface.tsx     # ChatGPT/Perplexity-grade streaming chat & citations
│   │   ├── dashboard/KnowledgeHUD.tsx # Vector analytics, FAQs, and chunk explorer
│   │   └── modals/SettingsModal.tsx   # Model & API key configuration
│   └── lib/api.ts                     # Typed API client
│
├── backend/                           # Python FastAPI Core Engine
│   ├── crawler/
│   │   ├── crawler.py                 # Async BFS multi-page crawler & robots.txt parser
│   │   └── parser.py                  # BeautifulSoup4 smart DOM-to-Markdown extractor
│   ├── rag/
│   │   ├── chunker.py                 # Semantic token-aware recursive chunker
│   │   ├── embeddings.py              # Gemini, OpenAI & Local dense vectorizer
│   │   ├── vector_store.py            # Persistent Hybrid Vector Store (BM25 + Cosine)
│   │   ├── engine.py                  # Grounded RAG orchestrator & SSE streaming
│   │   └── analytics.py               # Auto-generated summaries, FAQs & topic clusters
│   ├── storage/knowledge_bases/       # Persistent JSON & NumPy vector indexes
│   ├── tests/                         # Pytest test suite (crawler, chunker, vector store, API)
│   ├── config.py                      # Global configuration & thresholds
│   └── main.py                        # FastAPI endpoints & background tasks
│
└── run_all.py                         # Single-command unified server launcher
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Python 3.10+** (Tested on Python 3.12)
- **Node.js 18+** & **npm**

### 2. Start Both Servers with One Command
From the project root:
```bash
python run_all.py
```

Or run them individually:

**Backend (FastAPI)**:
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend (Next.js)**:
```bash
cd frontend
npm run dev
```

Visit:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🧪 Testing

Run backend tests:
```bash
python -m pytest backend/tests/ -v
```

Build frontend for production:
```bash
cd frontend
npm run build
```

---

## 📄 License
MIT License. Built for world-class AI developer experiences.
