import asyncio
import logging
from typing import Dict, List, Set, Optional, Callable, Any
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser
import httpx

from backend.config import settings
from backend.crawler.parser import smart_parser

logger = logging.getLogger(__name__)

# File extensions to skip
IGNORE_EXTENSIONS = {
    ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".exe", ".dmg", ".pkg", ".deb",
    ".css", ".js", ".json", ".xml"
}


WIKIPEDIA_COMPLIANT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36 AethelRAG/2.0 (compatible; KnowledgeEngine/2.0; +https://aethelexult.ai; Contact: info@aethelexult.ai)"
)


def get_request_headers(url: str, retry: bool = False) -> Dict[str, str]:
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }
    url_lower = url.lower()
    if "wikipedia.org" in url_lower or "wikimedia.org" in url_lower or retry:
        headers["User-Agent"] = WIKIPEDIA_COMPLIANT_UA
    else:
        headers["User-Agent"] = settings.user_agent
    return headers


class CrawlJob:
    def __init__(
        self,
        job_id: str,
        start_url: str,
        max_pages: int = settings.default_max_pages,
        max_depth: int = settings.crawl_depth,
        respect_robots_txt: bool = settings.respect_robots_txt,
        on_event: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.job_id = job_id
        self.start_url = self._normalize_url(start_url)
        self.max_pages = min(max_pages, settings.max_pages_limit)
        self.max_depth = max_depth
        self.respect_robots_txt = respect_robots_txt
        self.on_event = on_event

        parsed = urlparse(self.start_url)
        self.base_domain = parsed.netloc.lower()
        self.base_root = self.base_domain.replace("www.", "")
        self.scheme = parsed.scheme

        self.visited_urls: Set[str] = set()
        self.crawled_pages: List[Dict[str, Any]] = []
        self.crawl_tree: List[Dict[str, Any]] = []  # For visual graph tree
        self.status: str = "pending"  # pending | crawling | completed | failed
        self.progress_percent: int = 0
        self.current_action: str = "Initializing crawler..."
        self.error_message: Optional[str] = None
        self.robot_parser: Optional[RobotFileParser] = None

    def _normalize_url(self, url: str) -> str:
        if not url:
            return ""
        url = url.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        parsed = urlparse(url)
        scheme = parsed.scheme.lower() if parsed.scheme in ["http", "https"] else "https"
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/")
        if not path:
            path = ""

        # Filter out tracking query parameters
        clean_query = ""
        if parsed.query:
            import urllib.parse
            qs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
            ignored_prefixes = ("utm_", "fbclid", "gclid", "ref", "source", "session", "_ga")
            filtered = [(k, v) for k, v in qs if not any(k.lower().startswith(p) for p in ignored_prefixes)]
            if filtered:
                clean_query = f"?{urllib.parse.urlencode(filtered)}"

        return f"{scheme}://{netloc}{path}{clean_query}"

    def _should_crawl(self, url: str) -> bool:
        if url in self.visited_urls:
            return False

        parsed = urlparse(url)
        if parsed.scheme not in ["http", "https"]:
            return False

        # Domain matching: exact domain or direct root domain match
        netloc = parsed.netloc.lower()
        netloc_root = netloc.replace("www.", "")
        if netloc_root != self.base_root and not netloc.endswith(f".{self.base_root}"):
            return False

        # Skip unwanted extensions
        path_lower = parsed.path.lower()
        if any(path_lower.endswith(ext) for ext in IGNORE_EXTENSIONS):
            return False

        # Check robots.txt if applicable
        if self.respect_robots_txt and self.robot_parser:
            try:
                ua = get_request_headers(url)["User-Agent"]
                if not self.robot_parser.can_fetch(ua, url):
                    # Always allow the user's primary target URL
                    if url == self.start_url:
                        self.emit("log", {"message": f"Notice: robots.txt disallows generic bot, proceeding for primary URL: {url}"})
                    else:
                        return False
            except Exception:
                pass

        return True

    def emit(self, event_type: str, data: Dict[str, Any]):
        event = {
            "job_id": self.job_id,
            "type": event_type,
            "status": self.status,
            "progress": self.progress_percent,
            "current_action": self.current_action,
            "pages_crawled": len(self.crawled_pages),
            "max_pages": self.max_pages,
            **data
        }
        if self.on_event:
            try:
                self.on_event(event)
            except Exception as e:
                logger.error(f"Error in on_event callback: {e}")

    async def init_robots_txt(self, client: httpx.AsyncClient):
        if not self.respect_robots_txt:
            return

        robots_url = f"{self.scheme}://{self.base_domain}/robots.txt"
        try:
            req_headers = get_request_headers(robots_url)
            resp = await client.get(robots_url, headers=req_headers, timeout=5.0)
            if resp.status_code == 200:
                self.robot_parser = RobotFileParser()
                self.robot_parser.parse(resp.text.splitlines())
                self.emit("log", {"message": f"Discovered and parsed robots.txt for {self.base_domain}"})
        except Exception:
            pass

    async def crawl(self) -> List[Dict[str, Any]]:
        self.status = "crawling"
        self.emit("status_change", {"message": f"Initiating crawl of {self.start_url}"})

        # Queue contains tuples of (url, depth, parent_url)
        queue: asyncio.Queue = asyncio.Queue()
        await queue.put((self.start_url, 0, None))
        self.visited_urls.add(self.start_url)

        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        async with httpx.AsyncClient(
            limits=limits,
            timeout=settings.request_timeout_sec,
            follow_redirects=True,
            verify=False  # Avoid failures on self-signed or incomplete SSL chains
        ) as client:
            await self.init_robots_txt(client)

            while not queue.empty() and len(self.crawled_pages) < self.max_pages:
                url, depth, parent = await queue.get()

                self.current_action = f"Fetching [{len(self.crawled_pages) + 1}/{self.max_pages}]: {url}"
                self.progress_percent = int((len(self.crawled_pages) / self.max_pages) * 100)
                self.emit("page_fetch_start", {"url": url, "depth": depth, "parent": parent})

                try:
                    req_headers = get_request_headers(url)
                    response = await client.get(url, headers=req_headers)

                    # Retry once if 403 or 429 encountered
                    if response.status_code in [403, 429]:
                        self.emit("log", {"message": f"Received status {response.status_code} on {url}, retrying with alternate headers..."})
                        await asyncio.sleep(1.0)
                        retry_headers = get_request_headers(url, retry=True)
                        response = await client.get(url, headers=retry_headers)

                    content_type = response.headers.get("content-type", "")

                    if response.status_code != 200 or "text/html" not in content_type.lower():
                        self.emit("page_skipped", {
                            "url": url,
                            "reason": f"Status {response.status_code}, content-type: {content_type}"
                        })
                        continue

                    # Parse HTML
                    parsed_doc = smart_parser.parse(response.text, str(response.url))
                    parsed_doc["depth"] = depth
                    parsed_doc["parent_url"] = parent
                    parsed_doc["status_code"] = response.status_code

                    # If the page has virtually zero extracted text, log a warning
                    if parsed_doc["word_count"] < 10:
                        self.emit("log", {"message": f"Warning: Very little text extracted ({parsed_doc['word_count']} words) from {url}."})

                    self.crawled_pages.append(parsed_doc)
                    self.crawl_tree.append({
                        "url": parsed_doc["url"],
                        "title": parsed_doc["title"],
                        "parent": parent,
                        "depth": depth,
                        "word_count": parsed_doc["word_count"]
                    })

                    self.emit("page_parsed", {
                        "url": parsed_doc["url"],
                        "title": parsed_doc["title"],
                        "word_count": parsed_doc["word_count"],
                        "headings_count": len(parsed_doc["headings"]),
                        "depth": depth
                    })

                    # Discover next links if within depth limit
                    if depth < self.max_depth:
                        for internal_link in parsed_doc["internal_links"]:
                            normalized_link = self._normalize_url(internal_link)
                            if self._should_crawl(normalized_link):
                                self.visited_urls.add(normalized_link)
                                await queue.put((normalized_link, depth + 1, parsed_doc["url"]))
                                self.emit("link_discovered", {"discovered_url": normalized_link, "from_url": url})

                    # Polite crawl pause
                    await asyncio.sleep(0.15)

                except Exception as exc:
                    logger.warning(f"Failed to crawl {url}: {exc}")
                    self.emit("page_error", {"url": url, "error": str(exc)})

        self.status = "completed"
        self.progress_percent = 100
        self.current_action = f"Successfully crawled {len(self.crawled_pages)} pages."
        self.emit("crawl_completed", {
            "total_pages": len(self.crawled_pages),
            "total_words": sum(p["word_count"] for p in self.crawled_pages)
        })

        return self.crawled_pages
