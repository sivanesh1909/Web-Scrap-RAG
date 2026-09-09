"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Cpu,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";

interface HeroSectionProps {
  onStartCrawl: (url: string, maxPages: number, maxDepth: number, respectRobots: boolean) => void;
  isCrawling: boolean;
  onSelectPreset?: (url: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onStartCrawl,
  isCrawling,
  onSelectPreset,
}) => {
  const [url, setUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxPages, setMaxPages] = useState(15);
  const [maxDepth, setMaxDepth] = useState(2);
  const [respectRobots, setRespectRobots] = useState(true);

  const presets = [
    { label: "AethelExult.AI", url: "https://aethelexult.ai" },
    { label: "Python Docs", url: "https://docs.python.org/3" },
    { label: "OpenAI", url: "https://openai.com" },
    { label: "Apple", url: "https://www.apple.com" },
    { label: "Infomeister", url: "https://www.infomeister.co.in" },
  ];

  const handlePresetClick = (presetUrl: string) => {
    setUrl(presetUrl);
    if (onSelectPreset) {
      onSelectPreset(presetUrl);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isCrawling) return;
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    onStartCrawl(targetUrl, maxPages, maxDepth, respectRobots);
  };

  return (
    <section className="relative pt-10 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center z-10">
      {/* Top Floating Badge */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-8 shadow-[0_0_20px_rgba(0,240,255,0.2)] animate-float-slow cursor-default"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
        </span>
        <span className="tracking-wide">Next-Gen Autonomous Web Scraping & Grounded RAG</span>
      </motion.div>

      {/* Main Cinematic Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
        className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6"
      >
        Transform Any Website Into An{" "}
        <span className="animate-gradient-text relative inline-block">
          AI Knowledge Assistant
          <span className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-400 opacity-60 blur-sm rounded-full" />
        </span>
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
        className="max-w-2xl mx-auto text-base sm:text-lg text-slate-400 mb-10 leading-relaxed"
      >
        Paste a public URL. AethelExult.AI crawls it recursively, strips boilerplate, chunks semantic documents, indexes dense vectors, and creates an interactive assistant with verified source citations.
      </motion.p>

      {/* Primary Ingestion Bar with Animated Contour */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
        className="max-w-3xl mx-auto mb-6"
      >
        <form onSubmit={handleSubmit} className="relative">
          {/* Animated Gradient Border Shell */}
          <div className="relative p-[1.5px] rounded-2xl bg-gradient-to-r from-cyan-500/40 via-purple-500/30 to-cyan-500/40 shadow-[0_0_35px_-5px_rgba(0,240,255,0.25)] hover:shadow-[0_0_50px_rgba(0,240,255,0.35)] transition-all duration-300">
            <div className="relative flex flex-col sm:flex-row items-center p-2 rounded-[15px] bg-slate-900/95 backdrop-blur-2xl transition-all">
              <div className="flex items-center w-full pl-3 pr-2 py-2">
                <Globe className="w-5 h-5 text-cyan-400 mr-3 shrink-0 animate-pulse" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter any website URL (e.g. https://openai.com or docs.python.org)"
                  className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none"
                  disabled={isCrawling}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <motion.button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2.5 rounded-xl border transition-all ${
                    showAdvanced
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                      : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                  title="Crawl depth & settings"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </motion.button>

                <motion.button
                  type="submit"
                  disabled={isCrawling || !url.trim()}
                  whileHover={{ scale: url.trim() && !isCrawling ? 1.03 : 1 }}
                  whileTap={{ scale: url.trim() && !isCrawling ? 0.97 : 1 }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-semibold text-sm hover:opacity-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(0,240,255,0.4)] shrink-0 cursor-pointer"
                >
                  {isCrawling ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Crawling & Indexing...</span>
                    </>
                  ) : (
                    <>
                      <span>Crawl & Build AI</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Advanced Crawl Controls Drawer with Spring Physics */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 rounded-xl bg-slate-900/95 border border-slate-700/80 text-left text-xs grid grid-cols-1 sm:grid-cols-3 gap-4 shadow-2xl backdrop-blur-xl">
                  <div>
                    <label className="block text-slate-400 mb-1 font-mono">Max Pages Limit</label>
                    <select
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value={5}>5 pages (Quick test)</option>
                      <option value={15}>15 pages (Recommended)</option>
                      <option value={30}>30 pages (Deep crawl)</option>
                      <option value={60}>60 pages (Full site)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-mono">Crawl Tree Depth</label>
                    <select
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value={1}>Depth 1 (Homepage only)</option>
                      <option value={2}>Depth 2 (Direct links)</option>
                      <option value={3}>Depth 3 (Sub-links)</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        checked={respectRobots}
                        onChange={(e) => setRespectRobots(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-slate-300 font-mono">Respect robots.txt</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Preset Quick Links with Hover Bounce */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex flex-wrap items-center justify-center gap-2 mb-12"
      >
        <span className="text-xs text-slate-500 font-mono mr-1">Quick Presets:</span>
        {presets.map((p) => (
          <motion.button
            key={p.label}
            type="button"
            onClick={() => handlePresetClick(p.url)}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-1 rounded-lg bg-slate-900/70 border border-white/[0.08] hover:border-cyan-500/40 hover:bg-cyan-500/10 text-xs text-slate-400 hover:text-cyan-300 transition-all font-mono shadow-sm hover:shadow-[0_0_12px_rgba(0,240,255,0.2)] cursor-pointer"
          >
            {p.label}
          </motion.button>
        ))}
      </motion.div>

      {/* Feature Pillar Highlights with Motion Hover Lift */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {[
          {
            icon: ShieldCheck,
            color: "cyan",
            title: "100% Grounded",
            desc: "Zero Hallucination Guarantee",
            border: "hover:border-cyan-500/40",
            glow: "group-hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]",
          },
          {
            icon: Zap,
            color: "purple",
            title: "Sub-Second RAG",
            desc: "Hybrid BM25 + Vector Engine",
            border: "hover:border-purple-500/40",
            glow: "group-hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]",
          },
          {
            icon: Cpu,
            color: "emerald",
            title: "Dual Model Intel",
            desc: "Gemini 2.5 Flash & GPT-4o",
            border: "hover:border-emerald-500/40",
            glow: "group-hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]",
          },
          {
            icon: Layers,
            color: "blue",
            title: "Exact Citations",
            desc: "Verified URL Attribution",
            border: "hover:border-blue-500/40",
            glow: "group-hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]",
          },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={idx}
              whileHover={{ y: -5, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`p-3.5 rounded-xl bg-slate-900/50 border border-white/[0.08] ${item.border} backdrop-blur-md flex items-center gap-3 transition-colors group cursor-default shadow-lg`}
            >
              <div
                className={`p-2 rounded-lg bg-${item.color}-500/10 text-${item.color}-400 shrink-0 group-hover:scale-110 transition-transform`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
