"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { ParticleUniverse } from "@/components/canvas/ParticleUniverse";
import { Navbar } from "@/components/navbar/Navbar";
import { HeroSection } from "@/components/hero/HeroSection";
import { CrawlConsole } from "@/components/crawler/CrawlConsole";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { KnowledgeHUD } from "@/components/dashboard/KnowledgeHUD";
import { SettingsModal } from "@/components/modals/SettingsModal";
import {
  KnowledgeBaseMetadata,
  CrawlStatusResponse,
  api,
} from "@/lib/api";
import {
  Globe,
  Sparkles,
  ShieldCheck,
  Zap,
  Cpu,
  Layers,
  Search,
  Database,
  Terminal,
  Bot,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"chat" | "crawl" | "hud">("chat");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseMetadata[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [activeCrawlStatus, setActiveCrawlStatus] = useState<CrawlStatusResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Dedicated selection handler that syncs to localStorage
  const handleSelectKb = useCallback((kbId: string) => {
    setSelectedKbId(kbId);
    if (typeof window !== "undefined") {
      localStorage.setItem("aethelexult_active_kb_id", kbId);
    }
  }, []);

  // Poll backend health and knowledge base list without stale closures
  const checkHealthAndLoad = useCallback(async () => {
    const isHealthy = await api.checkHealth();
    setBackendOnline(isHealthy);
    if (isHealthy) {
      try {
        const kbs = await api.listKnowledgeBases();
        setKnowledgeBases(kbs);
        setSelectedKbId((prev) => {
          // 1. If user already has a valid selected KB that exists in kbs, KEEP IT!
          if (prev && kbs.some((k) => k.kb_id === prev)) {
            return prev;
          }
          // 2. Check localStorage for user's last selected KB
          const stored = typeof window !== "undefined"
            ? (localStorage.getItem("aethelexult_active_kb_id") || localStorage.getItem("webmind_active_kb_id"))
            : null;
          if (stored && kbs.some((k) => k.kb_id === stored)) {
            return stored;
          }
          // 3. Fallback to first available KB
          const fallback = kbs.length > 0 ? kbs[0].kb_id : null;
          if (fallback && typeof window !== "undefined") {
            localStorage.setItem("aethelexult_active_kb_id", fallback);
          }
          return fallback;
        });
      } catch (e) {
        console.error("Failed to load knowledge bases:", e);
      }
    }
  }, []);

  useEffect(() => {
    checkHealthAndLoad();
    const interval = setInterval(checkHealthAndLoad, 8000);
    return () => clearInterval(interval);
  }, [checkHealthAndLoad]);

  // Start a new crawl job
  const handleStartCrawl = async (
    url: string,
    maxPages: number,
    maxDepth: number,
    respectRobots: boolean
  ) => {
    setIsCrawling(true);
    setActiveTab("crawl");

    try {
      const crawlResp = await api.startCrawl({
        url,
        max_pages: maxPages,
        max_depth: maxDepth,
        respect_robots_txt: respectRobots,
      });

      const jobId = crawlResp.job_id;

      // Poll crawl status until finished
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getCrawlStatus(jobId);
          setActiveCrawlStatus(status);

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setIsCrawling(false);
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
            });
            await checkHealthAndLoad();
            if (status.kb_id) {
              handleSelectKb(status.kb_id);
              setActiveTab("chat");
            }
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setIsCrawling(false);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setIsCrawling(false);
        }
      }, 1000);
    } catch (err: any) {
      alert(`Failed to launch crawl: ${err.message}`);
      setIsCrawling(false);
    }
  };

  const handleDeleteKb = async (kbId: string) => {
    try {
      await api.deleteKnowledgeBase(kbId);
      const remaining = knowledgeBases.filter((k) => k.kb_id !== kbId);
      setKnowledgeBases(remaining);
      setSelectedKbId((prev) => {
        if (prev === kbId) {
          const next = remaining.length > 0 ? remaining[0].kb_id : null;
          if (next && typeof window !== "undefined") {
            localStorage.setItem("aethelexult_active_kb_id", next);
          }
          return next;
        }
        return prev;
      });
    } catch (e) {
      alert("Failed to delete knowledge base");
    }
  };

  const currentKb = knowledgeBases.find((k) => k.kb_id === selectedKbId) || null;

  return (
    <div className="relative min-h-screen bg-[#06080d] text-[#f0f4fc] overflow-hidden">
      {/* 3D Particle Universe Canvas */}
      <ParticleUniverse />

      {/* Atmospheric Aurora Light Effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none animate-aurora-1" />
      <div className="fixed top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none animate-aurora-2" />
      <div className="fixed bottom-10 left-1/3 w-80 h-80 bg-emerald-500/8 rounded-full blur-[128px] pointer-events-none animate-aurora-3" />

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        knowledgeBases={knowledgeBases}
        selectedKbId={selectedKbId}
        onSelectKb={handleSelectKb}
        onOpenSettings={() => setSettingsOpen(true)}
        backendOnline={backendOnline}
      />

      {/* Primary Interactive Workspace with AnimatePresence */}
      <AnimatePresence mode="wait">
        {activeTab === "chat" ? (
          <motion.main
            key="chat-tab"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="relative z-10 h-[calc(100vh-4rem)] flex flex-col overflow-hidden"
          >
            <ChatInterface
              currentKb={currentKb}
              knowledgeBases={knowledgeBases}
              selectedKbId={selectedKbId}
              onSelectKb={handleSelectKb}
              onNavigateToCrawl={() => setActiveTab("crawl")}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </motion.main>
        ) : (
          <motion.div
            key="crawl-or-hud"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full"
          >
            {/* Hero Section & Ingestion Console */}
            <HeroSection
              onStartCrawl={handleStartCrawl}
              isCrawling={isCrawling}
              onSelectPreset={(presetUrl) => {
                try {
                  const host = new URL(presetUrl).hostname.toLowerCase();
                  const matching = knowledgeBases.find(
                    (k) =>
                      k.domain.toLowerCase() === host ||
                      host.includes(k.domain.toLowerCase()) ||
                      k.domain.toLowerCase().includes(host.replace(/^www\./, ""))
                  );
                  if (matching) {
                    handleSelectKb(matching.kb_id);
                    setActiveTab("chat");
                  }
                } catch {}
              }}
            />

            <main className="relative z-10 min-h-[600px] pb-24">
              <AnimatePresence mode="wait">
                {activeTab === "crawl" && (
                  <motion.div
                    key="crawl-view"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                  >
                    <CrawlConsole
                      statusData={activeCrawlStatus}
                      onNavigateToChat={() => setActiveTab("chat")}
                    />
                  </motion.div>
                )}

                {activeTab === "hud" && (
                  <motion.div
                    key="hud-view"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                  >
                    <KnowledgeHUD
                      currentKb={currentKb}
                      onRefreshKbList={checkHealthAndLoad}
                      onDeleteKb={handleDeleteKb}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feature Showcase Grid with Animated Cards */}
              <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 pt-16 border-t border-white/[0.08]">
                <div className="text-center mb-14">
                  <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                    Engine Capabilities
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
                    Engineered for Precision, Grounding & Scale
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xl mx-auto mt-3">
                    AethelExult.AI replaces hallucinations with deterministic citation graph indexing and sub-second hybrid vector search.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    {
                      icon: Globe,
                      color: "cyan",
                      title: "Autonomous Web Crawling",
                      desc: "Asynchronous link discovery with depth controls, canonical deduplication, and robots.txt adherence across multi-page domains.",
                    },
                    {
                      icon: Database,
                      color: "purple",
                      title: "Hybrid Vector Database",
                      desc: "Fuses BM25 lexical keyword matching with dense vector cosine similarity for sub-second recall of technical terms, URLs, and code.",
                    },
                    {
                      icon: ShieldCheck,
                      color: "emerald",
                      title: "Anti-Hallucination Grounding",
                      desc: "Strict system prompts instruct the LLM to synthesize answers exclusively from verified source passages with interactive citations.",
                    },
                    {
                      icon: Terminal,
                      color: "blue",
                      title: "Smart DOM & Noise Filter",
                      desc: "Strips cookie consent banners, adverts, headers, and footers while converting tables, lists, and code blocks into clean markdown.",
                    },
                    {
                      icon: Sparkles,
                      color: "pink",
                      title: "Auto-Generated Analytics & FAQs",
                      desc: "Automatically synthesizes executive website summaries, topic clusters, keyword density, and interactive FAQ accordions.",
                    },
                    {
                      icon: Bot,
                      color: "amber",
                      title: "Dual Model Intel + Local Engine",
                      desc: "Native integration with Google Gemini 2.5 Flash and OpenAI GPT-4o, with an embedded local semantic engine for zero-setup operation.",
                    },
                  ].map((card, cIdx) => {
                    const CardIcon = card.icon;
                    return (
                      <motion.div
                        key={cIdx}
                        whileHover={{ y: -6, scale: 1.02 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className={`p-6 rounded-2xl bg-slate-900/60 border border-white/[0.08] hover:border-${card.color}-500/40 backdrop-blur-xl transition-all duration-300 group shadow-lg cursor-default relative overflow-hidden`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl bg-${card.color}-500/10 border border-${card.color}-500/30 flex items-center justify-center text-${card.color}-400 mb-4 group-hover:scale-110 group-hover:shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all`}
                        >
                          <CardIcon className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-base text-white mb-2 group-hover:text-cyan-300 transition-colors">
                          {card.title}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {/* 7-Step Animated Architecture Flow */}
              <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-24">
                <div className="text-center mb-12">
                  <span className="text-xs font-mono text-purple-400 uppercase tracking-widest px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
                    Processing Pipeline
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
                    From Raw URL to Grounded Intelligence in 7 Steps
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 text-center text-xs relative">
                  {[
                    { step: "01", title: "URL Ingestion", desc: "Validate target domain" },
                    { step: "02", title: "Deep Crawler", desc: "Traverse internal links" },
                    { step: "03", title: "DOM Extraction", desc: "Clean noise & banners" },
                    { step: "04", title: "Chunking", desc: "Preserve headings hierarchy" },
                    { step: "05", title: "Embeddings", desc: "Compute dense vectors" },
                    { step: "06", title: "Hybrid Search", desc: "BM25 + Cosine similarity" },
                    { step: "07", title: "Grounded Chat", desc: "SSE stream with citations" },
                  ].map((s, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ y: -4, scale: 1.04 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="p-4 rounded-xl bg-slate-900/60 border border-white/[0.08] hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)] transition-all cursor-default relative group"
                    >
                      <div className="font-mono text-cyan-400 font-bold text-xs mb-1 group-hover:scale-110 transition-transform">
                        {s.step}
                      </div>
                      <div className="font-semibold text-white mb-1">{s.title}</div>
                      <div className="text-[10px] text-slate-400">{s.desc}</div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-white/[0.08] bg-slate-950/80 py-8 px-4 text-center text-xs text-slate-500 font-mono relative z-10">
              <p>© 2026 AethelExult.AI. Autonomous Website Knowledge Intelligence Platform.</p>
              <p className="mt-1 text-[11px] text-slate-600">Built with Next.js 15, React 19, FastAPI, Google Gemini & Hybrid RAG.</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsSaved={checkHealthAndLoad}
      />
    </div>
  );
}
