import json
import logging
import re
from typing import Dict, List, Any, Optional
from collections import Counter
from backend.config import settings

logger = logging.getLogger(__name__)


class KnowledgeBaseAnalytics:
    """
    Generates high-level summaries, topic clusters, key insights, and auto-generated FAQs
    from crawled website knowledge base content.
    """

    async def generate_analytics(
        self,
        kb_metadata: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        provider: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        if not chunks:
            return {
                "summary": "No content available to analyze.",
                "insights": [],
                "faqs": [],
                "topics": [],
                "statistics": {}
            }

        # Calculate base statistics
        all_text = " ".join([c["text"] for c in chunks])
        words = re.findall(r"\b[a-zA-Z]{3,}\b", all_text.lower())
        total_words = len(words)
        reading_time_min = max(1, total_words // 200)

        # Stopwords to filter out
        stopwords = {
            "the", "and", "for", "that", "this", "with", "from", "your", "have",
            "are", "not", "will", "all", "can", "more", "about", "source", "document",
            "section", "page", "our", "you", "use", "using", "into", "get", "any",
            "which", "their", "they", "been", "has", "were", "what", "when", "how"
        }
        filtered_words = [w for w in words if w not in stopwords and len(w) > 3]
        word_counts = Counter(filtered_words)
        top_keywords = [w for w, _ in word_counts.most_common(12)]

        # Extract top headings
        headings = []
        for c in chunks:
            h = c.get("section_heading")
            if h and h not in headings and h != "General Overview":
                headings.append(h)

        # Build topic clusters
        topics = [
            {"name": h, "relevance": round(0.95 - (i * 0.05), 2)}
            for i, h in enumerate(headings[:8])
        ]
        if not topics:
            topics = [{"name": kw.capitalize(), "relevance": 0.85} for kw in top_keywords[:6]]

        # LLM Synthesis if API key available
        selected_provider = provider or settings.default_provider
        key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)

        if selected_provider == "gemini" and key:
            try:
                from google import genai
                client = genai.Client(api_key=key)
                sample_context = "\n\n".join([c["text"] for c in chunks[:10]])[:12000]
                prompt = (
                    f"Analyze this website knowledge base for '{kb_metadata.get('domain', 'the site')}'.\n"
                    f"Content sample:\n{sample_context}\n\n"
                    f"Output valid JSON ONLY with this structure:\n"
                    f"{{\n"
                    f'  "summary": "2-3 paragraphs describing purpose, offerings, and value proposition.",\n'
                    f'  "insights": ["key insight 1", "key insight 2", "key insight 3", "key insight 4", "key insight 5"],\n'
                    f'  "faqs": [\n'
                    f'    {{"question": "Q1", "answer": "A1"}},\n'
                    f'    {{"question": "Q2", "answer": "A2"}},\n'
                    f'    {{"question": "Q3", "answer": "A3"}}\n'
                    f"  ]\n"
                    f"}}"
                )
                response = None
                for candidate_model in [settings.gemini_chat_model, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                    try:
                        response = client.models.generate_content(
                            model=candidate_model,
                            contents=prompt
                        )
                        if response and response.text:
                            break
                    except Exception as model_err:
                        logger.warning(f"Analytics model candidate {candidate_model} failed: {model_err}")
                        continue

                if not response or not response.text:
                    raise RuntimeError("All Gemini model candidates failed to generate analytics")
                raw_text = response.text.strip()
                # Clean code blocks if present
                clean_json = re.sub(r"^```json\s*|\s*```$", "", raw_text, flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
                return {
                    "summary": parsed.get("summary", ""),
                    "insights": parsed.get("insights", []),
                    "faqs": parsed.get("faqs", []),
                    "topics": topics,
                    "statistics": {
                        "total_words": total_words,
                        "reading_time_min": reading_time_min,
                        "total_chunks": len(chunks),
                        "top_keywords": top_keywords[:8]
                    }
                }
            except Exception as e:
                logger.warning(f"Gemini analytics synthesis error: {e}, falling back to local analysis")

        elif selected_provider == "openai" and key:
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=key)
                sample_context = "\n\n".join([c["text"] for c in chunks[:10]])[:12000]
                prompt = (
                    f"Analyze this website knowledge base for '{kb_metadata.get('domain', 'the site')}'.\n"
                    f"Content sample:\n{sample_context}\n\n"
                    f"Output valid JSON ONLY with the keys: 'summary', 'insights' (list of strings), and 'faqs' (list of {{question, answer}})."
                )
                resp = await client.chat.completions.create(
                    model=settings.openai_chat_model,
                    response_format={"type": "json_object"},
                    messages=[{"role": "user", "content": prompt}]
                )
                parsed = json.loads(resp.choices[0].message.content)
                return {
                    "summary": parsed.get("summary", ""),
                    "insights": parsed.get("insights", []),
                    "faqs": parsed.get("faqs", []),
                    "topics": topics,
                    "statistics": {
                        "total_words": total_words,
                        "reading_time_min": reading_time_min,
                        "total_chunks": len(chunks),
                        "top_keywords": top_keywords[:8]
                    }
                }
            except Exception as e:
                logger.warning(f"OpenAI analytics synthesis error: {e}, falling back to local analysis")

        # High quality local deterministic extraction fallback
        domain = kb_metadata.get("domain", "the website")
        site_title = kb_metadata.get("title", domain)

        summary = (
            f"{site_title} ({domain}) provides comprehensive information spanning {len(chunks)} indexed sections. "
            f"Key domains covered include {', '.join(top_keywords[:4])}. "
            f"The platform features structured documentation and guides designed to support users exploring its technical architecture and offerings."
        )

        insights = [
            f"Comprehensive coverage of {domain} organized into {len(headings)} primary topic sections.",
            f"High information density with over {total_words:,} total extracted words.",
            f"Key focus areas identified around {', '.join(top_keywords[:3])}.",
            f"Structured content with full support for semantic RAG question answering and verified source citations."
        ]

        faqs = []
        for h in headings[:5]:
            matching_chunks = [c for c in chunks if c.get("section_heading") == h]
            answer_snippet = matching_chunks[0]["raw_text"][:220] + "..." if matching_chunks else "Details provided in the indexed content."
            faqs.append({
                "question": f"What information is available regarding {h}?",
                "answer": answer_snippet
            })

        if not faqs:
            faqs = [
                {
                    "question": f"What is the primary purpose of {site_title}?",
                    "answer": summary
                },
                {
                    "question": "What topics can I ask this AI assistant about?",
                    "answer": f"You can ask about any information covered on {domain}, including {', '.join(top_keywords[:5])}."
                }
            ]

        return {
            "summary": summary,
            "insights": insights,
            "faqs": faqs,
            "topics": topics,
            "statistics": {
                "total_words": total_words,
                "reading_time_min": reading_time_min,
                "total_chunks": len(chunks),
                "top_keywords": top_keywords[:8]
            }
        }


kb_analytics = KnowledgeBaseAnalytics()
