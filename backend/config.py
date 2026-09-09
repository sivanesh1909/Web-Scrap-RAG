import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
ENV_FILE = ROOT_DIR / ".env"

load_dotenv(dotenv_path=ENV_FILE)
load_dotenv()

STORAGE_DIR = BASE_DIR / "storage"
KNOWLEDGE_BASES_DIR = STORAGE_DIR / "knowledge_bases"
CHAT_HISTORY_DIR = STORAGE_DIR / "chat_history"

# Ensure storage directories exist
KNOWLEDGE_BASES_DIR.mkdir(parents=True, exist_ok=True)
CHAT_HISTORY_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseModel):
    # API Keys
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    # Default LLM & Embedding models
    default_provider: str = "gemini"  # "gemini" | "openai" | "local"
    gemini_chat_model: str = "gemini-3.7-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    openai_chat_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Scraping defaults
    default_max_pages: int = 15
    max_pages_limit: int = 100
    crawl_depth: int = 2
    request_timeout_sec: int = 20
    respect_robots_txt: bool = False  # Set to False by default to prevent silent crawl failures on public pages
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )

    # RAG Settings
    chunk_size: int = 500  # Target tokens
    chunk_overlap: int = 90  # Overlap tokens
    top_k_retrieval: int = 6  # Top chunks to inject in prompt
    similarity_threshold: float = 0.20  # Minimum relevance score
    hybrid_alpha: float = 0.55  # Balanced weight for vector similarity vs BM25 keyword score


settings = Settings()


def persist_env_variable(key: str, value: str):
    """
    Safely saves or updates an environment variable in the root .env file and in settings.
    """
    os.environ[key] = value
    if key == "GEMINI_API_KEY":
        settings.gemini_api_key = value
    elif key == "OPENAI_API_KEY":
        settings.openai_api_key = value

    lines = []
    found = False
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith(f"{key}="):
                    lines.append(f"{key}={value}\n")
                    found = True
                else:
                    lines.append(line)
    if not found:
        lines.append(f"{key}={value}\n")

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)

