"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Terminal,
  Layers,
  FileText,
  Network,
  Copy,
  Check,
  Radar,
} from "lucide-react";
import { CrawlStatusResponse } from "@/lib/api";

interface CrawlConsoleProps {
  statusData: CrawlStatusResponse | null;
  onNavigateToChat: () => void;
}

export const CrawlConsole: React.FC<CrawlConsoleProps> = ({
  statusData,
  onNavigateToChat,
}) => {
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [statusData?.logs]);

  const copyLogs = () => {
    if (!statusData?.logs) return;
    navigator.clipboard.writeText(statusData.logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!statusData) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto px-4 py-16 text-center"
      >
        <div className="p-8 rounded-2xl bg-slate-900/60 border border-white/[0.08] backdrop-blur-xl shadow-2xl">
          <div className="relative w-14 h-14 mx-auto mb-4 flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400/20" />
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">No Active Crawl Session</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-2">
            Enter a website URL above and click <strong>Crawl & Build AI</strong> to watch the autonomous crawler discover internal links, extract content, and build vector embeddings in real time.
          </p>
        </div>
      </motion.div>
    );
  }

  const isCompleted = statusData.status === "completed";
  const isFailed = statusData.status === "failed";
  const isCrawling = statusData.status === "crawling" || statusData.status === "queued";

  const stages = [
    { num: "STAGE 1", name: "DOM Crawler", threshold: 20 },
    { num: "STAGE 2", name: "HTML Cleaner", threshold: 50 },
    { num: "STAGE 3", name: "Chunking", threshold: 80 },
    { num: "STAGE 4", name: "Vector Indexed", threshold: 100 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      {/* Status Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-cyan-500/30 backdrop-blur-2xl mb-6 shadow-[0_0_30px_-10px_rgba(0,240,255,0.25)] relative overflow-hidden">
        {/* Subtle background radar beam while crawling */}
        {isCrawling && (
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none animate-pulse-slow" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                JOB ID: {statusData.job_id}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isCompleted
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    : isFailed
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                }`}
              >
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                {isFailed && <AlertCircle className="w-3.5 h-3.5" />}
                {isCrawling && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                )}
                <span className="capitalize">{statusData.status}</span>
              </span>
            </div>

            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Target: {statusData.url}</span>
              <a
                href={statusData.url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <ExternalLink className="w-4 h-4 hover:scale-110 transition-transform" />
              </a>
            </h2>
            <p className="text-xs text-slate-300 mt-1 font-mono flex items-center gap-2">
              {isCrawling && <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
              {statusData.current_action}
            </p>
          </div>

          {isCompleted && (
            <motion.button
              onClick={onNavigateToChat}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-bold hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-all flex items-center gap-2 self-start sm:self-center cursor-pointer shadow-lg"
            >
              <span>Chat With This Website</span>
              <CheckCircle2 className="w-4 h-4" />
            </motion.button>
          )}
        </div>

        {/* Live Progress Bar with Shimmer Beam */}
        <div className="space-y-2 relative z-10">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Scraping, Extraction & Vectorization Pipeline</span>
            <span className="text-cyan-400 font-bold">{statusData.progress}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden p-0.5 border border-white/[0.08] relative">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 relative overflow-hidden shadow-[0_0_15px_rgba(0,240,255,0.7)]"
              initial={{ width: "5%" }}
              animate={{ width: `${Math.max(5, statusData.progress)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="absolute inset-0 shimmer-effect opacity-60" />
            </motion.div>
          </div>
        </div>

        {/* Pipeline Stage Indicators with Spring Feedback */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 pt-6 border-t border-white/[0.06] text-center text-xs relative z-10">
          {stages.map((stage, sIdx) => {
            const isStagePassed = statusData.progress >= stage.threshold;
            const isCurrent =
              statusData.progress < stage.threshold &&
              (sIdx === 0 || statusData.progress >= stages[sIdx - 1].threshold);

            return (
              <motion.div
                key={stage.num}
                animate={isCurrent ? { scale: [1, 1.03, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
                className={`p-2.5 rounded-xl border transition-all duration-300 ${
                  isStagePassed
                    ? stage.threshold === 100
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                      : "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                    : isCurrent
                    ? "bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                    : "bg-slate-950/40 border-white/[0.04] text-slate-500"
                }`}
              >
                <span className="font-mono block text-[10px] tracking-wider mb-0.5">{stage.num}</span>
                <span className="font-semibold flex items-center justify-center gap-1">
                  {stage.name}
                  {isStagePassed && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Terminal Live Stream View */}
      <div className="rounded-2xl bg-[#090d16] border border-white/[0.08] overflow-hidden shadow-2xl">
        <div className="px-4 py-3 bg-slate-900/90 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Real-Time Crawl Stream Telemetry</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-cyan-300 border border-white/[0.06]">
              {statusData.logs.length} events
            </span>
          </div>
          <motion.button
            onClick={copyLogs}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-[11px] font-mono transition-all cursor-pointer"
            title="Copy Logs"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </motion.button>
        </div>

        <div
          ref={logContainerRef}
          className="p-4 font-mono text-xs text-slate-300 h-80 overflow-y-auto space-y-1.5 selection:bg-cyan-500/30 scroll-smooth"
        >
          {statusData.logs.length === 0 ? (
            <div className="text-slate-500 italic flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
              Waiting for crawler telemetry stream...
            </div>
          ) : (
            statusData.logs.map((log, index) => {
              const isError = log.includes("ERROR");
              const isParsed = log.includes("Parsed:");
              const isComplete = log.includes("complete") || log.includes("ready");

              return (
                <div
                  key={index}
                  className={`leading-relaxed transition-all duration-200 ${
                    isError
                      ? "text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded"
                      : isParsed
                      ? "text-cyan-300"
                      : isComplete
                      ? "text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded"
                      : "text-slate-400"
                  }`}
                >
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
};
