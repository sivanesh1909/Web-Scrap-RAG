import re
import logging
from typing import List, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from backend.config import settings

import hashlib
import joblib
from pathlib import Path

logger = logging.getLogger(__name__)


class LocalDenseEmbedder:
    """
    High-capacity, offline-capable dense embedding engine using multi-gram TF-IDF
    with L2-normalized vector projections and joblib persistence.
    Provides deterministic semantic & lexical vector representations with zero external API calls.
    """

    def __init__(self, dimension: int = 1024):
        self.dimension = dimension
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=self.dimension,
            sublinear_tf=True,
            strip_accents="unicode",
            token_pattern=r"(?u)\b\w+\b"
        )
        self.is_fitted = False

    def fit_and_embed(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimension), dtype=np.float32)
        try:
            sparse_mat = self.vectorizer.fit_transform(texts)
            dense_mat = sparse_mat.toarray().astype(np.float32)

            # Pad or slice to match target dimension
            if dense_mat.shape[1] < self.dimension:
                pad_width = ((0, 0), (0, self.dimension - dense_mat.shape[1]))
                dense_mat = np.pad(dense_mat, pad_width, mode="constant")
            elif dense_mat.shape[1] > self.dimension:
                dense_mat = dense_mat[:, :self.dimension]

            # L2 Normalize
            norms = np.linalg.norm(dense_mat, axis=1, keepdims=True)
            norms[norms == 0] = 1e-10
            normalized = dense_mat / norms
            self.is_fitted = True
            return normalized
        except Exception as e:
            logger.warning(f"TF-IDF fitting error: {e}, falling back to deterministic projection")
            return self._deterministic_hash_embed(texts)

    def embed_query(self, query: str, target_dimension: Optional[int] = None) -> np.ndarray:
        dim = target_dimension or self.dimension
        if not self.is_fitted:
            return self._deterministic_hash_embed([query], dimension=dim)[0]
        try:
            sparse = self.vectorizer.transform([query])
            dense = sparse.toarray().astype(np.float32)
            if dense.shape[1] < dim:
                pad_width = ((0, 0), (0, dim - dense.shape[1]))
                dense = np.pad(dense, pad_width, mode="constant")
            elif dense.shape[1] > dim:
                dense = dense[:, :dim]
            norm = np.linalg.norm(dense)
            if norm > 0:
                dense = dense / norm
            return dense[0]
        except Exception:
            return self._deterministic_hash_embed([query], dimension=dim)[0]

    def _deterministic_hash_embed(self, texts: List[str], dimension: Optional[int] = None) -> np.ndarray:
        """
        MD5-based deterministic vector projection that does NOT rely on Python's randomized hash seed.
        """
        dim = dimension or self.dimension
        vectors = []
        for text in texts:
            vec = np.zeros(dim, dtype=np.float32)
            words = re.findall(r"\b\w+\b", text.lower())
            for w in words:
                idx = int(hashlib.md5(w.encode("utf-8")).hexdigest(), 16) % dim
                vec[idx] += 1.0
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            vectors.append(vec)
        return np.array(vectors, dtype=np.float32)

    def save(self, file_path: Path):
        try:
            joblib.dump(self.vectorizer, file_path)
        except Exception as e:
            logger.error(f"Failed to persist vectorizer to {file_path}: {e}")

    def load(self, file_path: Path) -> bool:
        try:
            if file_path.exists():
                self.vectorizer = joblib.load(file_path)
                self.is_fitted = True
                return True
        except Exception as e:
            logger.error(f"Failed to load vectorizer from {file_path}: {e}")
        return False


class EmbeddingService:
    """
    Unified embedding service supporting Google Gemini (gemini-embedding-001, gemini-embedding-2), OpenAI, and Local engines.
    """

    def __init__(self):
        self.local_embedder = LocalDenseEmbedder(dimension=1024)

    async def embed_documents(
        self,
        texts: List[str],
        provider: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> np.ndarray:
        selected_provider = provider or settings.default_provider
        key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)

        if selected_provider == "gemini" and key:
            try:
                from google import genai
                client = genai.Client(api_key=key)
                
                models_to_try = [
                    settings.gemini_embedding_model,
                    "gemini-embedding-001",
                    "gemini-embedding-2",
                ]
                
                for emb_model in models_to_try:
                    try:
                        embeddings = []
                        # Batch in groups of 32
                        for i in range(0, len(texts), 32):
                            batch = texts[i:i + 32]
                            resp = client.models.embed_content(
                                model=emb_model,
                                contents=batch
                            )
                            for emb in resp.embeddings:
                                embeddings.append(emb.values)
                        
                        arr = np.array(embeddings, dtype=np.float32)
                        norms = np.linalg.norm(arr, axis=1, keepdims=True)
                        norms[norms == 0] = 1e-10
                        logger.info(f"Successfully embedded {len(texts)} documents using {emb_model} (dim {arr.shape[1]})")
                        return arr / norms
                    except Exception as m_err:
                        logger.warning(f"Failed embedding with {emb_model}: {m_err}")
                        continue
            except Exception as e:
                logger.error(f"Gemini embedding service error: {e}, falling back to local embedder")

        elif selected_provider == "openai" and key:
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=key)
                response = await client.embeddings.create(
                    model=settings.openai_embedding_model,
                    input=texts
                )
                embeddings = [item.embedding for item in response.data]
                arr = np.array(embeddings, dtype=np.float32)
                norms = np.linalg.norm(arr, axis=1, keepdims=True)
                norms[norms == 0] = 1e-10
                return arr / norms
            except Exception as e:
                logger.error(f"OpenAI embedding error: {e}, falling back to local embedder")

        # Local fallback
        return self.local_embedder.fit_and_embed(texts)

    async def embed_query(
        self,
        query: str,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        target_dimension: Optional[int] = None
    ) -> np.ndarray:
        selected_provider = provider or settings.default_provider
        key = api_key or (settings.gemini_api_key if selected_provider == "gemini" else settings.openai_api_key)

        if selected_provider == "gemini" and key:
            try:
                from google import genai
                client = genai.Client(api_key=key)
                models_to_try = [
                    settings.gemini_embedding_model,
                    "gemini-embedding-001",
                    "gemini-embedding-2",
                ]
                for emb_model in models_to_try:
                    try:
                        resp = client.models.embed_content(
                            model=emb_model,
                            contents=[query]
                        )
                        vec = np.array(resp.embeddings[0].values, dtype=np.float32)
                        norm = np.linalg.norm(vec)
                        if norm > 0:
                            vec = vec / norm
                        return vec
                    except Exception:
                        continue
            except Exception as e:
                logger.error(f"Gemini query embed error: {e}, using local embedder")

        elif selected_provider == "openai" and key:
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=key)
                response = await client.embeddings.create(
                    model=settings.openai_embedding_model,
                    input=[query]
                )
                vec = np.array(response.data[0].embedding, dtype=np.float32)
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                return vec
            except Exception as e:
                logger.error(f"OpenAI query embed error: {e}, using local embedder")

        return self.local_embedder.embed_query(query, target_dimension=target_dimension)


embedding_service = EmbeddingService()
