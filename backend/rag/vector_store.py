import json
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np
from rank_bm25 import BM25Okapi

from backend.config import KNOWLEDGE_BASES_DIR, settings
from backend.rag.embeddings import embedding_service, LocalDenseEmbedder

logger = logging.getLogger(__name__)


def tokenize_text(text: str) -> List[str]:
    """
    Standardized alphanumeric tokenizer for BM25 indexing and querying.
    """
    stopwords = {
        "what", "are", "the", "in", "is", "of", "to", "a", "an", "for", "on", "with",
        "and", "or", "tell", "me", "about", "how", "do", "does", "this", "that", "from",
        "by", "at", "it", "as", "be", "was", "can", "will", "all", "which"
    }
    raw_tokens = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", text.lower())
    return [w for w in raw_tokens if w not in stopwords and not (w.isnumeric() and len(w) != 4)]


class KnowledgeBaseIndex:
    """
    Manages persistent vector embeddings, BM25 indices, and chunk metadata for a single website knowledge base.
    """

    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self.kb_dir = KNOWLEDGE_BASES_DIR / kb_id
        self.metadata_file = self.kb_dir / "metadata.json"
        self.chunks_file = self.kb_dir / "chunks.json"
        self.vectors_file = self.kb_dir / "vectors.npy"
        self.vectorizer_file = self.kb_dir / "vectorizer.joblib"

        self.metadata: Dict[str, Any] = {}
        self.chunks: List[Dict[str, Any]] = []
        self.vectors: Optional[np.ndarray] = None
        self.bm25: Optional[BM25Okapi] = None
        self.local_embedder = LocalDenseEmbedder(dimension=1024)

        if self.kb_dir.exists():
            self.load()

    def load(self):
        try:
            if self.metadata_file.exists():
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

            if self.chunks_file.exists():
                with open(self.chunks_file, "r", encoding="utf-8") as f:
                    self.chunks = json.load(f)

            if self.vectors_file.exists():
                self.vectors = np.load(str(self.vectors_file))

            # Load fitted local vectorizer if available
            if self.vectorizer_file.exists():
                self.local_embedder.load(self.vectorizer_file)

            # Ensure safe defaults for all metadata fields
            self.metadata.setdefault("kb_id", self.kb_id)
            self.metadata.setdefault("domain", self.metadata.get("domain", self.kb_id))
            self.metadata.setdefault("title", self.metadata.get("title", self.metadata.get("domain", self.kb_id)))
            self.metadata.setdefault("total_pages", len(self.metadata.get("pages", [])) or 1)
            self.metadata.setdefault("total_chunks", len(self.chunks))
            self.metadata.setdefault("total_words", sum(p.get("word_count", 0) for p in self.metadata.get("pages", [])))
            self.metadata.setdefault("created_at", "2026-01-01T00:00:00")
            self.metadata.setdefault("pages", [])
            self.metadata.setdefault("crawl_tree", [])

            # Build BM25 index from chunks using standardized tokenizer
            if self.chunks:
                tokenized_corpus = [tokenize_text(chunk["text"]) for chunk in self.chunks]
                # Ensure each document has at least one token
                tokenized_corpus = [doc if doc else ["document"] for doc in tokenized_corpus]
                self.bm25 = BM25Okapi(tokenized_corpus)

        except Exception as e:
            logger.error(f"Error loading KB {self.kb_id}: {e}")

    def save(self):
        self.kb_dir.mkdir(parents=True, exist_ok=True)
        with open(self.metadata_file, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, indent=2)

        with open(self.chunks_file, "w", encoding="utf-8") as f:
            json.dump(self.chunks, f, indent=2)

        if self.vectors is not None:
            np.save(str(self.vectors_file), self.vectors)

        if self.local_embedder.is_fitted:
            self.local_embedder.save(self.vectorizer_file)

    async def build(
        self,
        metadata: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        provider: Optional[str] = None,
        api_key: Optional[str] = None
    ):
        self.metadata = metadata
        self.chunks = chunks

        texts = [chunk["text"] for chunk in chunks]
        if texts:
            selected_provider = provider or settings.default_provider
            key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)
            if selected_provider in ["gemini", "openai"] and key:
                self.vectors = await embedding_service.embed_documents(
                    texts, provider=selected_provider, api_key=key
                )
            else:
                self.vectors = self.local_embedder.fit_and_embed(texts)

            tokenized_corpus = [tokenize_text(t) for t in texts]
            tokenized_corpus = [doc if doc else ["document"] for doc in tokenized_corpus]
            self.bm25 = BM25Okapi(tokenized_corpus)

            self.metadata["vector_dimension"] = self.vectors.shape[1] if self.vectors is not None else 0
            self.metadata["total_chunks"] = len(chunks)
        else:
            self.vectors = np.zeros((0, 1024), dtype=np.float32)
            self.metadata["vector_dimension"] = 1024
            self.metadata["total_chunks"] = 0

        self.save()

    async def search(
        self,
        query: str,
        top_k: int = settings.top_k_retrieval,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        hybrid_alpha: float = settings.hybrid_alpha
    ) -> List[Dict[str, Any]]:
        if not self.chunks or self.vectors is None or len(self.chunks) == 0:
            return []

        n_chunks = len(self.chunks)
        target_dim = self.vectors.shape[1] if self.vectors is not None else 1024

        selected_provider = provider or settings.default_provider
        key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)

        # 1. Dense Vector Search
        if selected_provider in ["gemini", "openai"] and key:
            query_vector = await embedding_service.embed_query(
                query, provider=selected_provider, api_key=key, target_dimension=target_dim
            )
        else:
            query_vector = self.local_embedder.embed_query(query, target_dimension=target_dim)

        # Ensure exact dimension alignment
        if query_vector.shape[0] != target_dim:
            if query_vector.shape[0] < target_dim:
                pad_width = (0, target_dim - query_vector.shape[0])
                query_vector = np.pad(query_vector, pad_width, mode="constant")
            else:
                query_vector = query_vector[:target_dim]
            norm = np.linalg.norm(query_vector)
            if norm > 0:
                query_vector = query_vector / norm

        vector_scores = np.dot(self.vectors, query_vector)
        vector_scores = np.clip(vector_scores, 0.0, 1.0)

        # 2. Sparse BM25 Search
        tokenized_query = tokenize_text(query)
        if self.bm25 and tokenized_query:
            bm25_raw_scores = np.array(self.bm25.get_scores(tokenized_query), dtype=np.float32)
            max_bm25 = np.max(bm25_raw_scores) if len(bm25_raw_scores) > 0 else 0
            bm25_norm_scores = (bm25_raw_scores / max_bm25) if max_bm25 > 0 else bm25_raw_scores
        else:
            bm25_norm_scores = np.zeros(n_chunks, dtype=np.float32)

        # 3. Exact Phrase & Heading Relevance Boosts
        query_clean = query.lower().strip()
        query_words = set(tokenized_query)
        phrase_boosts = np.zeros(n_chunks, dtype=np.float32)

        for i, chk in enumerate(self.chunks):
            text_lower = chk.get("raw_text", chk["text"]).lower()
            heading_lower = (chk.get("section_heading", "") + " " + chk.get("title", "")).lower()

            # Exact full query match
            if len(query_clean) > 4 and query_clean in text_lower:
                phrase_boosts[i] += 0.35

            # Heading keyword match
            heading_matches = sum(1 for w in query_words if len(w) > 2 and w in heading_lower)
            if heading_matches > 0:
                phrase_boosts[i] += min(0.30, heading_matches * 0.12)

        # 4. Reciprocal Rank Fusion (RRF)
        # RRF formula: RRF(d) = alpha / (60 + rank_dense) + (1 - alpha) / (60 + rank_bm25) + phrase_boosts
        rank_dense = np.argsort(np.argsort(-vector_scores))  # 0-based ranks
        rank_bm25 = np.argsort(np.argsort(-bm25_norm_scores))  # 0-based ranks

        rrf_scores = (
            (hybrid_alpha / (60.0 + rank_dense))
            + ((1.0 - hybrid_alpha) / (60.0 + rank_bm25))
            + (phrase_boosts * 0.02)
        )

        # Rank indices by RRF descending
        ranked_indices = list(np.argsort(-rrf_scores)[:top_k])

        # 5. Smart context expansion: if top chunk belongs to a multi-chunk section, pull adjacent context
        expanded_indices = list(ranked_indices)
        for r_idx in ranked_indices[:2]:
            curr_chunk = self.chunks[r_idx]
            curr_url = curr_chunk.get("url")
            curr_heading = curr_chunk.get("section_heading")
            # Check next sibling
            next_idx = r_idx + 1
            if next_idx < n_chunks and next_idx not in expanded_indices:
                next_chunk = self.chunks[next_idx]
                if next_chunk.get("url") == curr_url and next_chunk.get("section_heading") == curr_heading:
                    expanded_indices.append(next_idx)

        results = []
        for idx in expanded_indices[:max(top_k, 6)]:
            v_score = float(vector_scores[idx])
            b_score = float(bm25_norm_scores[idx])
            p_boost = float(phrase_boosts[idx])

            # Composite normalized display score (between 0.45 and 0.99)
            composite_score = min(0.99, max(0.45, (0.5 * v_score) + (0.35 * b_score) + (0.15 * min(1.0, p_boost))))

            chunk = self.chunks[idx]
            results.append({
                "chunk_id": chunk["chunk_id"],
                "url": chunk["url"],
                "title": chunk["title"],
                "section_heading": chunk.get("section_heading", ""),
                "text": chunk["text"],
                "raw_text": chunk.get("raw_text", chunk["text"]),
                "score": round(composite_score, 4),
                "vector_score": round(v_score, 4),
                "bm25_score": round(b_score, 4)
            })

        return results


class VectorStoreManager:
    """
    Global Vector Store Registry managing multiple website knowledge bases.
    """

    def __init__(self):
        self._indices: Dict[str, KnowledgeBaseIndex] = {}
        self._load_all_existing()

    def _load_all_existing(self):
        for kb_path in KNOWLEDGE_BASES_DIR.iterdir():
            if kb_path.is_dir() and (kb_path / "metadata.json").exists():
                kb_id = kb_path.name
                self._indices[kb_id] = KnowledgeBaseIndex(kb_id)

    def get_index(self, kb_id: str) -> Optional[KnowledgeBaseIndex]:
        if kb_id in self._indices:
            return self._indices[kb_id]
        kb_path = KNOWLEDGE_BASES_DIR / kb_id
        if kb_path.exists():
            idx = KnowledgeBaseIndex(kb_id)
            self._indices[kb_id] = idx
            return idx
        return None

    def list_knowledge_bases(self) -> List[Dict[str, Any]]:
        self._load_all_existing()
        return [idx.metadata for idx in self._indices.values() if idx.metadata]

    def delete_knowledge_base(self, kb_id: str) -> bool:
        if kb_id in self._indices:
            del self._indices[kb_id]
        kb_dir = KNOWLEDGE_BASES_DIR / kb_id
        if kb_dir.exists():
            import shutil
            shutil.rmtree(kb_dir, ignore_errors=True)
            return True
        return False

    async def search_across_all(
        self,
        query: str,
        top_k: int = 5,
        provider: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        all_results = []
        for idx in self._indices.values():
            res = await idx.search(query, top_k=top_k, provider=provider, api_key=api_key)
            all_results.extend(res)

        # Sort all results by score descending
        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]


vector_store_manager = VectorStoreManager()
