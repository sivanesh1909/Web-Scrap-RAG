export interface KnowledgeBaseMetadata {
  kb_id: string;
  url: string;
  domain: string;
  title: string;
  description?: string;
  total_pages: number;
  total_chunks: number;
  total_words: number;
  created_at: string;
  last_crawled_at: string;
  pages: Array<{
    url: string;
    title: string;
    word_count: number;
    headings_count?: number;
    depth: number;
  }>;
  crawl_tree: Array<{
    url: string;
    title: string;
    parent: string | null;
    depth: number;
    word_count: number;
  }>;
}

export interface ChunkItem {
  chunk_id: string;
  url: string;
  title: string;
  section_heading?: string;
  context_header?: string;
  chunk_index: number;
  token_count: number;
  text: string;
  raw_text?: string;
}

export interface CitationSource {
  id: number;
  url: string;
  title: string;
  section: string;
  score: number;
  snippet: string;
}

export interface CrawlStatusResponse {
  job_id: string;
  url: string;
  status: "queued" | "crawling" | "completed" | "failed";
  progress: number;
  current_action: string;
  kb_id?: string;
  logs: string[];
  error?: string;
}

export interface AnalyticsResponse {
  summary: string;
  insights: string[];
  faqs: Array<{ question: string; answer: string }>;
  topics: Array<{ name: string; relevance: number }>;
  statistics: {
    total_words?: number;
    reading_time_min?: number;
    total_chunks?: number;
    top_keywords?: string[];
  };
}

export interface AppSettings {
  gemini_configured: boolean;
  openai_configured: boolean;
  default_provider: string;
  gemini_chat_model: string;
  openai_chat_model: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k_retrieval: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const api = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async startCrawl(params: {
    url: string;
    max_pages?: number;
    max_depth?: number;
    respect_robots_txt?: boolean;
    provider?: string;
    api_key?: string;
  }): Promise<{ job_id: string; status: string; message: string }> {
    const res = await fetch(`${API_BASE_URL}/api/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Crawl request failed" }));
      throw new Error(err.detail || "Crawl initiation failed");
    }
    return res.json();
  },

  async getCrawlStatus(jobId: string): Promise<CrawlStatusResponse> {
    const res = await fetch(`${API_BASE_URL}/api/crawl/status/${jobId}`);
    if (!res.ok) {
      throw new Error("Failed to fetch crawl status");
    }
    return res.json();
  },

  async listKnowledgeBases(): Promise<KnowledgeBaseMetadata[]> {
    const res = await fetch(`${API_BASE_URL}/api/knowledge-bases`);
    if (!res.ok) {
      throw new Error("Failed to list knowledge bases");
    }
    return res.json();
  },

  async getKnowledgeBase(kbId: string): Promise<{ metadata: KnowledgeBaseMetadata; total_chunks: number }> {
    const res = await fetch(`${API_BASE_URL}/api/knowledge-bases/${kbId}`);
    if (!res.ok) {
      throw new Error("Failed to get knowledge base details");
    }
    return res.json();
  },

  async getChunks(kbId: string, search?: string, limit = 20, offset = 0): Promise<{ total: number; chunks: ChunkItem[] }> {
    const url = new URL(`${API_BASE_URL}/api/knowledge-bases/${kbId}/chunks`);
    if (search) url.searchParams.set("search", search);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("offset", offset.toString());

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error("Failed to fetch document chunks");
    }
    return res.json();
  },

  async getAnalytics(kbId: string): Promise<AnalyticsResponse> {
    const res = await fetch(`${API_BASE_URL}/api/knowledge-bases/${kbId}/analytics`);
    if (!res.ok) {
      throw new Error("Failed to fetch knowledge base analytics");
    }
    return res.json();
  },

  async deleteKnowledgeBase(kbId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/knowledge-bases/${kbId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error("Failed to delete knowledge base");
    }
  },

  async getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE_URL}/api/settings`);
    if (!res.ok) {
      throw new Error("Failed to fetch settings");
    }
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings> & { gemini_api_key?: string; openai_api_key?: string }): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      throw new Error("Failed to update settings");
    }
  },

  getExportUrl(kbId: string, format: "json" | "markdown"): string {
    return `${API_BASE_URL}/api/export?kb_id=${encodeURIComponent(kbId)}&format=${format}`;
  },

  getChatStreamUrl(): string {
    return `${API_BASE_URL}/api/chat`;
  },
};
