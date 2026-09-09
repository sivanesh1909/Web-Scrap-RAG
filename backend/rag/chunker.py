import re
import uuid
from typing import List, Dict, Any
import tiktoken
from backend.config import settings


class SemanticChunker:
    """
    Splits markdown and web documents into high-retrieval quality chunks.
    Maintains hierarchical context (breadcrumbs/headings) and sentence boundaries,
    with configurable token limits and overlap.
    """

    def __init__(
        self,
        chunk_size: int = settings.chunk_size,
        chunk_overlap: int = settings.chunk_overlap
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            self.tokenizer = None

    def count_tokens(self, text: str) -> int:
        if self.tokenizer:
            try:
                return len(self.tokenizer.encode(text))
            except Exception:
                pass
        # Fallback estimation: ~4 chars per token
        return max(1, len(text) // 4)

    NOISE_SECTION_NAMES = {
        "references", "external links", "further reading", "see also", "notes",
        "bibliography", "cookie policy", "terms of service", "privacy policy",
        "navigation menu", "contents", "table of contents", "citations"
    }

    def _is_noise_section(self, heading: str) -> bool:
        clean = heading.lower().strip()
        return (
            clean in self.NOISE_SECTION_NAMES
            or any(clean.startswith(n) for n in ["references", "external links", "see also", "notes [", "further reading"])
        )

    def chunk_page(self, page_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        url = page_data.get("url", "")
        title = page_data.get("title", "Untitled Document")
        markdown_text = page_data.get("content_markdown", "")

        if not markdown_text.strip():
            # Fallback to plain_text if markdown is empty
            markdown_text = page_data.get("plain_text", "")
            if not markdown_text.strip():
                return []

        # Split document by markdown headings or paragraphs
        sections = self._split_by_headings(markdown_text)
        all_chunks: List[Dict[str, Any]] = []
        chunk_index = 0

        for section in sections:
            heading = section["heading"]
            if self._is_noise_section(heading):
                continue

            text = section["text"].strip()
            if not text or len(text.split()) < 4:
                continue

            # Sub-split long section text if it exceeds chunk_size
            sub_chunks = self._split_into_token_chunks(text, heading, title)
            for sub_text, token_count, context_header in sub_chunks:
                chunk_id = f"chk_{uuid.uuid4().hex[:12]}"
                all_chunks.append({
                    "chunk_id": chunk_id,
                    "url": url,
                    "title": title,
                    "section_heading": heading,
                    "context_header": context_header,
                    "chunk_index": chunk_index,
                    "token_count": token_count,
                    "text": f"{context_header}\n\n{sub_text}".strip(),
                    "raw_text": sub_text.strip()
                })
                chunk_index += 1

        return all_chunks

    def _split_by_headings(self, text: str) -> List[Dict[str, str]]:
        """
        Splits markdown text on lines starting with #, ##, ###, etc.
        """
        lines = text.splitlines()
        sections: List[Dict[str, str]] = []
        current_heading = "General Overview"
        current_lines: List[str] = []

        heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$")

        for line in lines:
            match = heading_pattern.match(line.strip())
            if match:
                # Save previous section if it has content
                if current_lines:
                    sections.append({
                        "heading": current_heading,
                        "text": "\n".join(current_lines)
                    })
                    current_lines = []
                current_heading = match.group(2).strip()
            else:
                current_lines.append(line)

        if current_lines:
            sections.append({
                "heading": current_heading,
                "text": "\n".join(current_lines)
            })

        return sections

    def _split_into_token_chunks(
        self,
        text: str,
        heading: str,
        title: str
    ) -> List[tuple[str, int, str]]:
        context_header = f"Source Document: {title} > Section: {heading}"
        header_tokens = self.count_tokens(context_header)
        effective_chunk_size = max(100, self.chunk_size - header_tokens)

        # Break text into paragraphs or sentences
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        chunks = []
        current_paras: List[str] = []
        current_tokens = 0

        for para in paragraphs:
            para_tokens = self.count_tokens(para)

            # If single paragraph exceeds effective chunk size, split by sentences
            if para_tokens > effective_chunk_size:
                sentences = re.split(r"(?<=[.?!])\s+", para)
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    sent_tokens = self.count_tokens(sent)
                    if current_tokens + sent_tokens > effective_chunk_size and current_paras:
                        chunk_text = "\n\n".join(current_paras)
                        chunks.append((chunk_text, self.count_tokens(chunk_text) + header_tokens, context_header))
                        # Keep some overlap sentences
                        current_paras = [current_paras[-1]] if self.chunk_overlap > 0 and len(current_paras) > 1 else []
                        current_tokens = sum(self.count_tokens(p) for p in current_paras)

                    current_paras.append(sent)
                    current_tokens += sent_tokens
            else:
                if current_tokens + para_tokens > effective_chunk_size and current_paras:
                    chunk_text = "\n\n".join(current_paras)
                    chunks.append((chunk_text, self.count_tokens(chunk_text) + header_tokens, context_header))
                    # Overlap
                    current_paras = [current_paras[-1]] if self.chunk_overlap > 0 and len(current_paras) > 1 else []
                    current_tokens = sum(self.count_tokens(p) for p in current_paras)

                current_paras.append(para)
                current_tokens += para_tokens

        if current_paras:
            chunk_text = "\n\n".join(current_paras)
            chunks.append((chunk_text, self.count_tokens(chunk_text) + header_tokens, context_header))

        return chunks


semantic_chunker = SemanticChunker()
