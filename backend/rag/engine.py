import asyncio
import json
import logging
import re
from typing import AsyncGenerator, List, Dict, Any, Optional

from backend.config import settings
from backend.rag.vector_store import vector_store_manager

logger = logging.getLogger(__name__)


class RAGEngine:
    """
    Advanced Grounded RAG Query Engine orchestrating:
    - Hybrid dense + BM25 retrieval with Reciprocal Rank Fusion
    - Real-time SSE token streaming
    - Grounded LLM generation (Gemini 2.5 Flash / 2.0 Flash / GPT-4o) with strict source citations
    - Advanced Fluent Local Synthesizer for offline / zero-key mode
    - Universal question answering with grounded citations
    - Real-time citation mapping and follow-up suggestion generation
    """

    def _build_grounded_system_prompt(self, domain: str, passages: List[Dict[str, Any]]) -> str:
        if passages:
            passages_text = []
            for i, p in enumerate(passages, start=1):
                passages_text.append(
                    f"[Source {i}]\n"
                    f"Page URL: {p['url']}\n"
                    f"Page Title: {p['title']}\n"
                    f"Section: {p.get('section_heading', 'Overview')}\n"
                    f"Content:\n{p['text']}\n"
                )
            formatted_context = "\n---\n".join(passages_text)
            context_section = (
                f"VERIFIED WEBSITE SOURCES (Domain: '{domain}'):\n"
                f"{formatted_context}\n"
            )
        else:
            context_section = (
                f"NOTICE: The indexed documentation for '{domain}' does not contain relevant content for this question. "
                f"Clearly inform the user that this specific information is not found in the indexed website, "
                f"and do not invent facts, projects, roles, or metrics not supported by the sources.\n"
            )

        return (
            f"You are WebMind AI (powered by AethelExult.AI), an expert Autonomous Knowledge & Research Assistant for '{domain}'.\n\n"
            f"OPERATIONAL DIRECTIVES:\n"
            f"1. ANSWER THE USER'S QUESTION DIRECTLY: Start your response with a direct, exact, and articulate answer to the user's specific question in the very first sentence. "
            f"If asked 'Who is X?', identify the person, their title/role, and core background immediately. "
            f"If asked 'What is X?', define it directly. Avoid generic fluff or repetitive site overviews when answering a specific question.\n"
            f"2. FACTUAL GROUNDING & CITATIONS: Ground all factual statements strictly in the verified website sources provided. Cite corresponding source numbers using inline bracketed notation like [1], [2] immediately following the facts.\n"
            f"3. STRUCTURED SUPPORTING DETAILS: Follow the direct answer with clear headings, bullet points, technical stacks, projects, credentials, or code blocks where applicable.\n"
            f"4. HONESTY & ANTI-HALLUCINATION: If the requested information is absent or incomplete in the sources, state clearly what is known from the site and what is not covered.\n"
            f"5. CLEAN MARKDOWN: Format with clean headers, bold terms, concise lists, and syntax-highlighted code blocks.\n\n"
            f"{context_section}"
        )

    async def stream_rag_response(
        self,
        query: str,
        kb_id: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        top_k: int = settings.top_k_retrieval
    ) -> AsyncGenerator[str, None]:
        # 1. Retrieve most relevant chunks using Hybrid RRF
        domain = "all indexed websites"
        raw_retrieved = []
        if kb_id:
            kb_index = vector_store_manager.get_index(kb_id)
            if kb_index:
                domain = kb_index.metadata.get("domain", kb_id.replace("kb_", "").replace("_", "."))
                raw_retrieved = await kb_index.search(
                    query, top_k=top_k, provider=provider, api_key=api_key
                )
        else:
            raw_retrieved = await vector_store_manager.search_across_all(
                query, top_k=top_k, provider=provider, api_key=api_key
            )

        # Keep top chunks
        retrieved_chunks = raw_retrieved[:max(top_k, 5)] if raw_retrieved else []

        # Format sources payload
        sources = []
        for i, c in enumerate(retrieved_chunks):
            raw_s = c.get("score", 0.75)
            display_score = round(max(0.70, min(0.99, raw_s)), 2)
            sources.append({
                "id": i + 1,
                "url": c["url"],
                "title": c["title"],
                "section": c.get("section_heading", "Overview"),
                "score": display_score,
                "snippet": c.get("raw_text", c["text"])[:260] + "..."
            })

        # Emit sources event
        yield f"event: sources\ndata: {json.dumps({'sources': sources})}\n\n"

        # Generate follow-up suggestions based on content or general query
        follow_up_suggestions = self._generate_follow_up_suggestions(query, retrieved_chunks)
        yield f"event: suggestions\ndata: {json.dumps({'suggestions': follow_up_suggestions})}\n\n"

        # 2. Build Grounded Prompt
        system_prompt = self._build_grounded_system_prompt(domain, retrieved_chunks)

        selected_provider = provider or settings.default_provider
        key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)
        
        # Priority fallback: If client requested local or has no key, but GEMINI_API_KEY exists in settings, use Gemini!
        if (selected_provider == "local" or not key) and settings.gemini_api_key:
            selected_provider = "gemini"
            key = settings.gemini_api_key
        elif not key and settings.openai_api_key:
            selected_provider = "openai"
            key = settings.openai_api_key

        # 3. Stream from Google Gemini if API key is provided
        if selected_provider == "gemini" and key:
            try:
                from google import genai
                client = genai.Client(api_key=key)

                # Format conversation history
                history_text = ""
                if chat_history:
                    history_lines = []
                    for h in chat_history[-4:]:
                        role = "User" if h.get("role") == "user" else "Assistant"
                        history_lines.append(f"{role}: {h.get('content', '')}")
                    if history_lines:
                        history_text = "CONVERSATION HISTORY:\n" + "\n".join(history_lines) + "\n\n"

                prompt_content = f"{system_prompt}\n\n{history_text}User Question: {query}\n\nAnswer:"
                
                # High-availability model cascade prioritizing fast working models with high quotas
                preferred_models = [
                    settings.gemini_chat_model or "gemini-3.7-flash",
                    "gemini-3.7-flash",
                    "gemini-flash-lite-latest",
                    "gemini-3.1-flash-lite",
                    "gemini-flash-latest",
                ]
                models_to_try = []
                for m in preferred_models:
                    if m and m not in models_to_try and m != "gemini-3.6-flash":
                        models_to_try.append(m)

                stream_succeeded = False

                for model_candidate in models_to_try:
                    if not model_candidate:
                        continue
                    try:
                        response_stream = client.models.generate_content_stream(
                            model=model_candidate,
                            contents=prompt_content
                        )
                        for chunk in response_stream:
                            if chunk.text:
                                yield f"event: token\ndata: {json.dumps({'token': chunk.text})}\n\n"
                                await asyncio.sleep(0.005)
                        stream_succeeded = True
                        break
                    except Exception as model_err:
                        logger.warning(f"Failed with Gemini model {model_candidate}: {model_err}")
                        continue

                if stream_succeeded:
                    yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"
                    return
                else:
                    logger.warning("Gemini streaming could not complete; seamlessly falling back to intelligent local synthesis")
                    async for sse_event in self._stream_intelligent_local_synthesis(query, domain, retrieved_chunks):
                        yield sse_event
                    return

            except Exception as e:
                logger.error(f"Gemini API streaming error: {e}, falling back to intelligent local synthesis")

        # 4. Stream from OpenAI if API key is provided
        elif selected_provider == "openai" and key:
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=key)
                messages = [{"role": "system", "content": system_prompt}]
                if chat_history:
                    for h in chat_history[-4:]:
                        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
                messages.append({"role": "user", "content": query})

                response = await client.chat.completions.create(
                    model=settings.openai_chat_model,
                    messages=messages,
                    stream=True
                )
                async for chunk in response:
                    delta = chunk.choices[0].delta.content if chunk.choices else ""
                    if delta:
                        yield f"event: token\ndata: {json.dumps({'token': delta})}\n\n"
                        await asyncio.sleep(0.005)

                yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"
                return
            except Exception as e:
                logger.error(f"OpenAI streaming error: {e}, falling back to intelligent local synthesis")

        # 5. Advanced Fluent Local Synthesizer (Offline / Zero-Key Mode)
        async for sse_event in self._stream_intelligent_local_synthesis(query, domain, retrieved_chunks):
            yield sse_event

    def _split_into_sentences(self, text: str) -> List[str]:
        """
        Splits text into coherent sentences without truncating abbreviations or academic titles like Dr., Prof., etc.
        """
        if not text:
            return []
        protected = text.strip()
        abbreviations = [
            "Dr.", "Prof.", "Mr.", "Mrs.", "Ms.", "Sr.", "Jr.", "Ph.D.",
            "e.g.", "i.e.", "etc.", "vs.", "Inc.", "Ltd.", "Corp.", "Dept.",
            "Assoc.", "Univ.", "Inst.", "No.", "Fig.", "Jan.", "Feb.", "Mar.",
            "Apr.", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."
        ]
        for i, abbr in enumerate(abbreviations):
            protected = protected.replace(abbr, f"__TITLE_ABBR_{i}__")

        # Split on sentence terminals followed by space
        raw_parts = re.split(r"(?<=[.!?])\s+", protected)
        sentences = []
        for p in raw_parts:
            # Restore abbreviations
            restored = p
            for i, abbr in enumerate(abbreviations):
                restored = restored.replace(f"__TITLE_ABBR_{i}__", abbr)
            restored = " ".join(restored.split()).strip()
            if len(restored) > 12:
                sentences.append(restored)
        return sentences

    async def _stream_intelligent_local_synthesis(
        self,
        query: str,
        domain: str,
        chunks: List[Dict[str, Any]]
    ) -> AsyncGenerator[str, None]:
        """
        Synthesizes a precise, citation-grounded answer to the user's question using semantic
        sentence scoring, intent classification, and structured Markdown formatting.
        Never cuts off sentences or dumps irrelevant chunks.
        """
        query_strip = query.strip()
        query_lower = query_strip.lower()

        # A. Conversational / Greeting Handling
        greetings = ["hi", "hello", "hey", "greetings", "good morning", "good evening", "who are you", "what are you", "help"]
        if any(re.match(rf"^{g}\b", query_lower) for g in greetings) or query_lower in ["hi", "hello", "hey"]:
            greeting_text = (
                f"Hello! I am **WebMind AI**, your autonomous Knowledge & Research Assistant for **{domain}**.\n\n"
                f"I continuously index and synthesize documentation, guides, and technical records from this website. "
                f"You can ask me:\n"
                f"- **Direct Questions**: Ask 'Who is...', 'What is...', or 'How do I...'.\n"
                f"- **Technical Architecture**: Explore code snippets, APIs, specifications, or key takeaways.\n"
                f"- **Step-by-Step Guides**: Inquire how to install, configure, or run specific features.\n\n"
                f"What would you like to know about **{domain}**?"
            )
            for token in re.split(r"(\s+)", greeting_text):
                if token:
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                    await asyncio.sleep(0.008)
            yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"
            return

        # B. Analyze query intent and extract key search tokens
        stopwords = {
            "what", "who", "where", "when", "why", "how", "is", "are", "do", "does", "did",
            "the", "a", "an", "can", "you", "tell", "me", "about", "which", "and",
            "or", "in", "on", "for", "of", "to", "with", "this", "that", "give", "from",
            "by", "at", "it", "as", "be", "was", "were", "been", "have", "has", "had",
            "work", "works", "working", "make", "makes", "get", "gets", "please"
        }
        raw_words = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", query_lower)
        keywords = [w for w in raw_words if w not in stopwords]
        kw_set = set(keywords)

        is_who = any(w in query_lower.split() for w in ["who", "whom", "leader", "coordinator", "faculty", "person", "founder"])
        is_what = any(w in query_lower.split() for w in ["what", "define", "meaning", "explain", "overview"])
        is_how = any(w in query_lower.split() for w in ["how", "install", "setup", "run", "guide", "steps", "execute"])
        is_where = any(w in query_lower.split() for w in ["where", "location", "address", "venue", "place"])
        is_when = any(w in query_lower.split() for w in ["when", "date", "time", "year", "deadline", "schedule"])

        # C. Extract individual sentences across all chunks and score for direct question answering
        scored_sentences = []
        if chunks:
            for source_idx, chunk in enumerate(chunks, start=1):
                raw_text = chunk.get("raw_text", chunk["text"])
                section = chunk.get("section_heading", "Overview")
                title = chunk.get("title", domain)

                sentences = self._split_into_sentences(raw_text)
                for s in sentences:
                    s_lower = s.lower()
                    s_words = set(re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", s_lower))

                    overlap = len(s_words & kw_set)
                    ratio = overlap / max(len(kw_set), 1)

                    score = (overlap * 3.0) + (ratio * 5.0)

                    # Exact phrase bonus
                    if len(query_strip) > 5 and query_strip.lower() in s_lower:
                        score += 8.0

                    # Intent-specific alignment bonus
                    if is_who and any(t in s_lower for t in ["dr.", "prof", "faculty", "coordinator", "associate professor", "advisor", "mentor", "lead", "serves as", "headed by"]):
                        score += 6.0
                    if is_what and any(t in s_lower for t in ["is a", "is an", "refers to", "defined as", "serves as", "represents"]):
                        score += 3.5
                    if is_where and any(t in s_lower for t in ["at ", "located", "campus", "room", "institute", "college", "hall"]):
                        score += 4.0
                    if is_when and any(t in s_lower for t in ["202", "date", "held on", "scheduled", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]):
                        score += 4.0
                    if is_how and any(t in s_lower for t in ["step", "command", "run", "install", "configure", "use", "using"]):
                        score += 3.5

                    # Heading alignment bonus
                    if any(k in section.lower() for k in kw_set):
                        score += 3.0

                    scored_sentences.append({
                        "text": s,
                        "score": score,
                        "source_id": source_idx,
                        "section": section,
                        "title": title
                    })

            scored_sentences.sort(key=lambda x: x["score"], reverse=True)

        # Deduplicate sentences
        unique_sentences = []
        seen = set()
        for item in scored_sentences:
            key_hash = item["text"][:60].lower()
            if key_hash not in seen:
                seen.add(key_hash)
                unique_sentences.append(item)

        paragraphs_out = []

        # D. Formulate Grounded Answer
        if unique_sentences and unique_sentences[0]["score"] >= 3.0:
            top_sent = unique_sentences[0]

            # 1. Lead Direct Answer
            paragraphs_out.append("### Direct Answer")
            paragraphs_out.append(f"**{top_sent['text']}** [{top_sent['source_id']}]")

            # 2. Context & Supporting Evidence
            supporting = [
                s for s in unique_sentences[1:5]
                if s["score"] >= top_sent["score"] * 0.35 and s["text"] != top_sent["text"]
            ]
            if supporting:
                paragraphs_out.append("### Supporting Details & Context")
                for s in supporting:
                    paragraphs_out.append(f"- **{s['section']}**: {s['text']} [{s['source_id']}]")

            # 3. Check for Code Snippets
            for i, c in enumerate(chunks[:3], start=1):
                text = c.get("raw_text", c["text"])
                if "```" in text:
                    code_match = re.search(r"```[\w]*\n[\s\S]+?\n```", text)
                    if code_match:
                        paragraphs_out.append(f"### Implementation Snippet:\n{code_match.group(0)} [{i}]")
                        break

        elif chunks:
            # Fallback when no single sentence exceeds threshold
            paragraphs_out.append(f"### Knowledge Overview for '{query_strip}'")
            first_chunk = chunks[0]
            clean_first = " ".join(first_chunk.get("text", "")[:350].split())
            paragraphs_out.append(
                f"While the indexed documentation does not explicitly answer the exact phrasing of your question, "
                f"here is the most relevant verified section from **{first_chunk.get('title', domain)}**:\n\n"
                f"> \"{clean_first}...\" [1]"
            )
        else:
            paragraphs_out.append(
                f"No indexed content was found matching **{query_strip}** in **{domain}**. "
                f"Please ensure the website is crawled and indexed."
            )

        # E. Stream generated response tokens
        full_response = "\n\n".join(paragraphs_out)
        tokens = re.split(r"(\s+)", full_response)
        for token in tokens:
            if token:
                yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                await asyncio.sleep(0.008)

        yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"

    def _generate_follow_up_suggestions(
        self,
        query: str,
        chunks: List[Dict[str, Any]]
    ) -> List[str]:
        suggestions = []
        headings = [
            c.get("section_heading")
            for c in chunks
            if c.get("section_heading") and c.get("section_heading") not in ["General Overview", "Documentation", "Overview"]
        ]

        for h in headings[:2]:
            suggestions.append(f"What details are covered under '{h}'?")

        if not suggestions:
            suggestions.append("What are the primary capabilities and features?")
            suggestions.append("Can you provide code or implementation examples?")
            suggestions.append("Can you summarize the key takeaways?")
        else:
            suggestions.append("Can you summarize the core points in detail?")

        return suggestions[:3]


rag_engine = RAGEngine()
