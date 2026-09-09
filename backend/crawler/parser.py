import re
import html
import json
import logging
from typing import Dict, List, Set, Any, Optional
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup, Comment, Tag

logger = logging.getLogger(__name__)


class SmartHTMLParser:
    """
    Intelligent HTML-to-Markdown and SPA Knowledge Extractor engineered specifically for production RAG pipelines.
    Preserves semantic headings, tables, code snippets, lists, JSON-LD structured schemas,
    and metadata while providing deep SPA (React/Vite/Vue/Next.js) client-side bundle extraction.
    """

    NOISE_TAGS = {
        "style", "noscript", "iframe", "svg", "canvas",
        "audio", "video", "source", "track", "applet", "embed", "object"
    }

    # Boilerplate patterns (advertisement, cookies, popups)
    BOILERPLATE_PATTERNS = [
        r"\bcookie[-_]?(notice|banner|consent|modal|bar|alert)?\b",
        r"\bconsent[-_]?(banner|modal|popup|box)?\b",
        r"\b(ad|ads|advert|advertisement)[-_]?(container|wrapper|banner|box|slot|unit)?\b",
        r"\bpopup[-_]?(overlay|wrapper|container|modal)?\b",
        r"\bnewsletter[-_]?(signup|form|popup|box)?\b",
        r"\b(share|social)[-_]?(buttons|bar|links|icons)?\b",
        r"\bdisclaimer[-_]?(banner|box)?\b",
    ]

    BLOCK_TAGS = {
        "p", "div", "section", "article", "header", "footer", "main",
        "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
        "blockquote", "pre", "table", "tr", "hr", "aside"
    }

    def parse(
        self,
        html_content: str,
        base_url: str,
        http_client: Optional[httpx.Client] = None
    ) -> Dict[str, Any]:
        soup = BeautifulSoup(html_content, "lxml")

        # 1. Remove HTML comments
        for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
            comment.extract()

        # 2. Extract Metadata & Structured Schema before any tag stripping
        title = self._extract_title(soup)
        description = self._extract_description(soup)
        keywords = self._extract_keywords(soup)
        canonical = self._extract_canonical(soup, base_url)
        internal_links, external_links = self._extract_links(soup, base_url)
        json_ld_sections = self._extract_json_ld(soup)
        contact_info = self._extract_contact_info(soup, html_content)

        # 3. Detect bundle scripts for SPA fallback before decomposing script tags
        bundle_script_urls = self._find_spa_bundle_scripts(soup, base_url)

        # 4. Strip raw noise tags safely without touching structural containers
        PROTECTED_TAGS = {"html", "body", "main", "article", "section"}

        for tag_name in self.NOISE_TAGS:
            if tag_name not in PROTECTED_TAGS:
                for tag in soup.find_all(tag_name):
                    tag.decompose()

        # Decompose non-data script tags now
        for script_tag in soup.find_all("script"):
            script_type = (script_tag.get("type") or "").lower()
            if "json" not in script_type:
                script_tag.decompose()

        # 5. Strip doc/wiki-specific reference lists, citation links, edit tags, and navboxes
        for ref_tag in soup.find_all(["sup", "span"], class_=re.compile(r"(reference|mw-editsection|mw-cite-backlink)", re.I)):
            if ref_tag.name not in PROTECTED_TAGS:
                ref_tag.decompose()

        for ref_list in soup.find_all(["div", "nav", "aside", "ol", "ul", "table"], class_=re.compile(r"\b(reflist|references|navbox|catlinks|sidebar|mw-jump-link|toc|table-of-contents|vector-menu|vector-dropdown|mw-portlet|interlanguage-link)\b", re.I)):
            if ref_list.name not in PROTECTED_TAGS and not ref_list.find("h1"):
                ref_list.decompose()

        # 6. Clean boilerplate elements without removing contact details or headings
        for element in list(soup.find_all(True)):
            if not isinstance(element, Tag) or getattr(element, "attrs", None) is None:
                continue

            if element.name in PROTECTED_TAGS:
                continue

            elem_id = str(element.attrs.get("id", "") or "")
            elem_classes = element.attrs.get("class", [])
            class_str = " ".join(elem_classes) if isinstance(elem_classes, list) else str(elem_classes or "")
            attrs = f"{elem_id} {class_str}".lower()

            is_boilerplate = any(re.search(pat, attrs) for pat in self.BOILERPLATE_PATTERNS)
            if is_boilerplate:
                has_major_headings = bool(element.find(["h1", "h2", "h3"]))
                has_contacts = bool(element.find("a", href=re.compile(r"^(mailto:|tel:)")))
                word_count = len(element.get_text().split())
                if not has_major_headings and not has_contacts and word_count < 40:
                    element.decompose()

        # 7. Locate core content container
        content_root = None
        for candidate in [
            soup.find("main"),
            soup.find(attrs={"role": "main"}),
            soup.find("article"),
            soup.find(id=re.compile(r"^(content|main-content|article-body|post-content|documentation|docs-content)$", re.I)),
            soup.find(class_=re.compile(r"(mw-parser-output|article-content|post-body|markdown-body|entry-content)", re.I))
        ]:
            if candidate and candidate.name not in ["html"] and len(candidate.get_text().split()) > 40:
                content_root = candidate
                break

        if not content_root or not hasattr(content_root, "children"):
            content_root = soup.body or soup

        # 8. Convert primary semantic content to clean Markdown
        markdown_content = self._node_to_markdown(content_root)
        clean_markdown = self._cleanup_markdown(markdown_content)

        # Strip leftover footnote brackets [1], [2], [edit], [citation needed]
        clean_markdown = re.sub(r"\[\d+\]", "", clean_markdown)
        clean_markdown = re.sub(r"\[(?:edit|citation needed|note \d+)\]", "", clean_markdown, flags=re.I)
        clean_markdown = re.sub(r"\n{3,}", "\n\n", clean_markdown).strip()

        words = clean_markdown.split()
        initial_word_count = len(words)

        # 9. Intelligent SPA Extraction Fallback:
        # If the page has very little extracted body text (< 80 words) and has root containers / bundle scripts:
        spa_sections = []
        is_spa_shell = (
            initial_word_count < 80
            and (
                soup.find(id=re.compile(r"^(root|app|__next)$", re.I)) is not None
                or len(bundle_script_urls) > 0
            )
        )

        if is_spa_shell and bundle_script_urls:
            spa_markdown = self._extract_spa_bundle_content(
                bundle_script_urls, base_url, http_client=http_client
            )
            if spa_markdown.strip():
                spa_sections.append(spa_markdown)

        # 10. Synthesize Structured Knowledge Document
        final_doc_parts = []
        doc_title = title or "Indexed Document"
        final_doc_parts.append(f"# {doc_title}\n")

        if description:
            final_doc_parts.append(f"## Overview\n{description}\n")

        if keywords:
            final_doc_parts.append(f"## Core Competencies & Keywords\n{keywords}\n")

        if json_ld_sections:
            final_doc_parts.append(json_ld_sections + "\n")

        if clean_markdown and initial_word_count >= 30:
            final_doc_parts.append(f"## Page Content\n{clean_markdown}\n")

        if spa_sections:
            final_doc_parts.append("\n".join(spa_sections) + "\n")

        if contact_info:
            final_doc_parts.append(contact_info + "\n")

        final_markdown = "\n".join(final_doc_parts)
        final_markdown = self._cleanup_markdown(final_markdown)

        plain_text = re.sub(r"[#*_`>\[\]]", " ", final_markdown)
        plain_text = re.sub(r"\s+", " ", plain_text).strip()
        word_count = len(plain_text.split())

        # Extract structured headings from final markdown
        headings = self._extract_markdown_headings(final_markdown)

        return {
            "url": canonical or base_url,
            "title": doc_title,
            "description": description or "",
            "headings": headings,
            "content_markdown": final_markdown,
            "plain_text": plain_text,
            "word_count": word_count,
            "internal_links": list(internal_links),
            "external_links": list(external_links)
        }

    def _extract_title(self, soup: BeautifulSoup) -> str:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            return self._clean_text(og_title["content"])
        if soup.title and soup.title.string:
            return self._clean_text(soup.title.string)
        h1 = soup.find("h1")
        if h1:
            return self._clean_text(h1.get_text(separator=" ", strip=True))
        return ""

    def _extract_description(self, soup: BeautifulSoup) -> str:
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            return self._clean_text(og_desc["content"])
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            return self._clean_text(meta_desc["content"])
        tw_desc = soup.find("meta", attrs={"name": "twitter:description"})
        if tw_desc and tw_desc.get("content"):
            return self._clean_text(tw_desc["content"])
        return ""

    def _extract_keywords(self, soup: BeautifulSoup) -> str:
        meta_kw = soup.find("meta", attrs={"name": "keywords"})
        if meta_kw and meta_kw.get("content"):
            return self._clean_text(meta_kw["content"])
        return ""

    def _extract_canonical(self, soup: BeautifulSoup, base_url: str) -> str:
        link = soup.find("link", rel="canonical")
        if link and link.get("href"):
            return urljoin(base_url, link["href"].strip())
        return base_url

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> tuple[Set[str], Set[str]]:
        internal_links = set()
        external_links = set()
        parsed_base = urlparse(base_url)
        base_netloc = parsed_base.netloc.lower()
        base_core = base_netloc.replace("www.", "")

        for a in soup.find_all("a", href=True):
            raw_href = a["href"].strip()
            if not raw_href or raw_href.startswith(("javascript:", "mailto:", "tel:", "data:")):
                continue

            full_url = urljoin(base_url, raw_href)
            parsed = urlparse(full_url)

            if parsed.scheme not in ["http", "https"]:
                continue

            normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if parsed.query:
                normalized += f"?{parsed.query}"

            target_netloc = parsed.netloc.lower()
            target_core = target_netloc.replace("www.", "")

            if (
                target_core == base_core
                or target_core.endswith(f".{base_core}")
                or base_core.endswith(f".{target_core}")
            ):
                internal_links.add(normalized)
            else:
                external_links.add(normalized)

        return internal_links, external_links

    def _extract_json_ld(self, soup: BeautifulSoup) -> str:
        """
        Parses all <script type="application/ld+json"> structured data into clean Markdown.
        """
        sections = []
        for script in soup.find_all("script", type="application/ld+json"):
            if not script.string:
                continue
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    schema_type = item.get("@type", "Entity")
                    lines = [f"## Structured Profile ({schema_type})"]
                    for k, v in item.items():
                        if k.startswith("@"):
                            continue
                        k_clean = k.replace("_", " ").title()
                        if isinstance(v, dict):
                            sub_props = [f"{sk}: {sv}" for sk, sv in v.items() if not sk.startswith("@")]
                            lines.append(f"- **{k_clean}**: {', '.join(sub_props)}")
                        elif isinstance(v, list):
                            lines.append(f"- **{k_clean}**: {', '.join(str(x) for x in v if x)}")
                        elif v:
                            lines.append(f"- **{k_clean}**: {v}")
                    if len(lines) > 1:
                        sections.append("\n".join(lines))
            except Exception as e:
                logger.debug(f"JSON-LD parsing exception: {e}")

        return "\n\n".join(sections)

    def _extract_contact_info(self, soup: BeautifulSoup, raw_html: str) -> str:
        """
        Extracts direct contact methods (emails, phone numbers, social profiles).
        """
        contacts = set()

        # Mailto links
        for a in soup.find_all("a", href=re.compile(r"^mailto:", re.I)):
            email = a["href"].replace("mailto:", "").split("?")[0].strip()
            if email and "@" in email:
                contacts.add(f"- **Email**: {email}")

        # Tel links
        for a in soup.find_all("a", href=re.compile(r"^tel:", re.I)):
            phone = a["href"].replace("tel:", "").strip()
            if phone:
                contacts.add(f"- **Phone**: {phone}")

        # Social profiles
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if "linkedin.com/in/" in href:
                contacts.add(f"- **LinkedIn**: {href}")
            elif "github.com/" in href and not any(href.endswith(e) for e in [".png", ".jpg", ".css", ".js"]):
                contacts.add(f"- **GitHub**: {href}")
            elif "twitter.com/" in href or "x.com/" in href:
                contacts.add(f"- **Twitter/X**: {href}")

        # Regex fallback for emails in text if none found
        if not any("Email" in c for c in contacts):
            emails = set(re.findall(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", raw_html))
            for em in emails:
                if not any(em.endswith(ext) for ext in [".png", ".jpg", ".svg", ".webp", ".js"]):
                    contacts.add(f"- **Email**: {em}")

        if contacts:
            return "## Contact & External Profiles\n" + "\n".join(sorted(contacts))
        return ""

    def _find_spa_bundle_scripts(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """
        Locates application JavaScript bundles in SPA pages (e.g. index-*.js, app-*.js).
        """
        bundle_urls = []
        for s in soup.find_all("script", src=True):
            src = s["src"].strip()
            if not src:
                continue
            src_lower = src.lower()
            if (
                any(keyword in src_lower for keyword in ["index", "main", "app", "bundle", "vendor", "chunk"])
                and src_lower.endswith(".js")
            ):
                bundle_urls.append(urljoin(base_url, src))

        # If no named bundle found, collect first 3 .js scripts
        if not bundle_urls:
            for s in soup.find_all("script", src=True):
                src = s["src"].strip()
                if src.lower().endswith(".js"):
                    bundle_urls.append(urljoin(base_url, src))
                if len(bundle_urls) >= 3:
                    break

        return bundle_urls[:3]

    def _extract_spa_bundle_content(
        self,
        bundle_urls: List[str],
        base_url: str,
        http_client: Optional[httpx.Client] = None
    ) -> str:
        """
        Extracts textual content, JSX children, and data properties from client-side JS bundles.
        """
        extracted_sections: List[str] = ["## Detailed Application Content & Portfolio"]
        client = http_client or httpx.Client(timeout=10.0, verify=False)

        close_client = False
        if http_client is None:
            close_client = True

        try:
            for bundle_url in bundle_urls:
                try:
                    resp = client.get(bundle_url)
                    if resp.status_code != 200:
                        continue
                    js_text = resp.text

                    # 1. Extract JSX children template literals and strings
                    jsx_children = re.findall(r'children:\s*`([^`\\]*(?:\\.[^`\\]*)*)`', js_text)

                    meaningful_items: List[str] = []
                    seen = set()

                    for child in jsx_children:
                        cleaned = self._clean_text(child)
                        cleaned = " ".join(cleaned.split()).strip()
                        # Exclude code identifiers, CSS variables, calc expressions, SVG definitions
                        if (
                            len(cleaned) >= 2
                            and cleaned.lower() not in seen
                            and not cleaned.startswith(("var(", "calc(", "genesis-", "rgba(", "#", "http://", "https://"))
                            and not any(tag in cleaned for tag in ["<path", "<svg", "stroke-width"])
                        ):
                            seen.add(cleaned.lower())
                            meaningful_items.append(cleaned)

                    # 2. Extract Data Objects (title, description, role, company, skills, etc.)
                    data_props = re.findall(
                        r'(?:title|description|name|role|company|summary|bio|details|institution|degree|heading|quote):\s*`([^`\\]*(?:\\.[^`\\]*)*)`',
                        js_text
                    )
                    for prop in data_props:
                        cleaned = self._clean_text(prop)
                        cleaned = " ".join(cleaned.split()).strip()
                        if len(cleaned) >= 3 and cleaned.lower() not in seen and not cleaned.startswith(("var(", "calc(")):
                            seen.add(cleaned.lower())
                            meaningful_items.append(cleaned)

                    # Organize into sections
                    for item in meaningful_items:
                        if item.startswith(("01 //", "02 //", "03 //", "04 //", "05 //", "06 //", "07 //", "08 //", "09 //")):
                            extracted_sections.append(f"\n### {item}")
                        elif len(item) > 70:
                            extracted_sections.append(f"\n{item}\n")
                        else:
                            extracted_sections.append(f"- {item}")

                except Exception as e:
                    logger.debug(f"Failed to extract SPA bundle {bundle_url}: {e}")
        finally:
            if close_client:
                client.close()

        if len(extracted_sections) > 1:
            return "\n".join(extracted_sections)
        return ""

    def _extract_markdown_headings(self, markdown_text: str) -> List[Dict[str, Any]]:
        headings: List[Dict[str, Any]] = []
        for line in markdown_text.splitlines():
            line_str = line.strip()
            match = re.match(r"^(#{1,6})\s+(.+)$", line_str)
            if match:
                level = len(match.group(1))
                text = match.group(2).strip()
                if text and len(text) > 1:
                    headings.append({"level": level, "text": text})
        return headings

    def _node_to_markdown(self, node: Tag) -> str:
        lines: List[str] = []

        for child in node.children:
            if isinstance(child, str):
                raw = str(child)
                if not raw.strip():
                    if any(c.isspace() for c in raw):
                        lines.append(" ")
                    continue
                clean = re.sub(r"\s+", " ", raw.strip())
                has_leading = raw[0].isspace()
                has_trailing = raw[-1].isspace()
                prefix = " " if has_leading else ""
                suffix = " " if has_trailing else ""
                lines.append(f"{prefix}{clean}{suffix}")
            elif isinstance(child, Tag):
                tag_name = child.name.lower()

                if tag_name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                    level = int(tag_name[1])
                    h_text = self._clean_text(child.get_text(separator=" ", strip=True))
                    if h_text:
                        lines.append(f"\n\n{'#' * level} {h_text}\n\n")
                elif tag_name == "p":
                    p_text = self._clean_text(child.get_text(separator=" ", strip=True))
                    if p_text:
                        lines.append(f"\n\n{p_text}\n\n")
                elif tag_name in ["pre", "code"]:
                    code_text = child.get_text()
                    lines.append(f"\n```\n{code_text}\n```\n")
                elif tag_name in ["ul", "ol"]:
                    for li in child.find_all("li", recursive=False):
                        prefix = "- " if tag_name == "ul" else "1. "
                        li_text = self._clean_text(li.get_text(separator=" ", strip=True))
                        if li_text:
                            lines.append(f"\n{prefix}{li_text}")
                    lines.append("\n\n")
                elif tag_name == "table":
                    lines.append(self._table_to_markdown(child))
                elif tag_name == "blockquote":
                    bq_text = self._clean_text(child.get_text(separator=" ", strip=True))
                    if bq_text:
                        lines.append(f"\n> {bq_text}\n\n")
                elif tag_name == "hr":
                    lines.append("\n\n---\n\n")
                elif tag_name == "br":
                    lines.append("\n")
                elif tag_name in self.BLOCK_TAGS:
                    sub = self._node_to_markdown(child).strip()
                    if sub:
                        lines.append(f"\n\n{sub}\n\n")
                else:
                    # Inline tag: span, a, strong, em, b, i, button, small
                    sub = self._node_to_markdown(child).strip()
                    if sub:
                        lines.append(f" {sub} ")

        return "".join(lines)

    def _table_to_markdown(self, table: Tag) -> str:
        rows = table.find_all("tr")
        if not rows:
            return ""

        md_rows = []
        for i, tr in enumerate(rows):
            cells = tr.find_all(["th", "td"])
            cell_texts = [
                self._clean_text(re.sub(r"\s+", " ", cell.get_text(separator=" ", strip=True))).replace("|", "\\|")
                for cell in cells
            ]
            if not any(cell_texts):
                continue
            md_rows.append(f"| {' | '.join(cell_texts)} |")
            if i == 0:
                md_rows.append(f"| {' | '.join(['---'] * len(cell_texts))} |")

        return "\n\n" + "\n".join(md_rows) + "\n\n"

    def _clean_text(self, text: str) -> str:
        if not text:
            return ""
        cleaned = html.unescape(text)
        cleaned = cleaned.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
        cleaned = (
            cleaned.replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"')
            .replace("—", " - ")
            .replace("–", " - ")
        )
        return re.sub(r"[ \t]+", " ", cleaned).strip()

    def _cleanup_markdown(self, md: str) -> str:
        cleaned = self._clean_text(md)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
        return cleaned.strip()


smart_parser = SmartHTMLParser()
