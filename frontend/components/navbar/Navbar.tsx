"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Globe,
  Settings as SettingsIcon,
  Activity,
  Layers,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { KnowledgeBaseMetadata } from "@/lib/api";

interface NavbarProps {
  activeTab: "chat" | "crawl" | "hud";
  setActiveTab: (tab: "chat" | "crawl" | "hud") => void;
  knowledgeBases: KnowledgeBaseMetadata[];
  selectedKbId: string | null;
  onSelectKb: (kbId: string) => void;
  onOpenSettings: () => void;
  backendOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  knowledgeBases,
  selectedKbId,
  onSelectKb,
  onOpenSettings,
  backendOnline,
}) => {
  const tabs: Array<{ id: "chat" | "crawl" | "hud"; label: string; icon: any }> = [
    { id: "chat", label: "AI Assistant", icon: MessageSquare },
    { id: "crawl", label: "Crawl Console", icon: Activity },
    { id: "hud", label: "Knowledge HUD", icon: Layers },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#06080d]/80 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-6">
          <motion.div
            onClick={() => setActiveTab("chat")}
            className="flex items-center gap-3 cursor-pointer group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-emerald-500/20 border border-cyan-500/30 group-hover:border-cyan-400/60 transition-all duration-300 shadow-[0_0_15px_-3px_rgba(0,240,255,0.3)]">
              <Sparkles className="w-5 h-5 text-cyan-400 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300" />
              <div className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight animate-gradient-text">
                  AethelExult
                </span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  .AI
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wider uppercase font-mono">
                Neural RAG Engine
              </p>
            </div>
          </motion.div>

          {/* Active Knowledge Base Switcher */}
          {knowledgeBases.length > 0 && (
            <div className="relative group hidden sm:block">
              <select
                value={selectedKbId || ""}
                onChange={(e) => onSelectKb(e.target.value)}
                className="appearance-none pl-8 pr-8 py-1.5 text-xs font-medium rounded-lg bg-slate-900/90 border border-slate-700/60 text-slate-200 hover:border-cyan-500/40 focus:outline-none focus:border-cyan-400 transition-all cursor-pointer shadow-inner"
              >
                {knowledgeBases.map((kb) => (
                  <option key={kb.kb_id} value={kb.kb_id} className="bg-slate-950 text-white">
                    {kb.domain} ({kb.total_pages} {kb.total_pages === 1 ? "page" : "pages"})
                  </option>
                ))}
              </select>
              <Globe className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:translate-y-[-40%] transition-transform" />
            </div>
          )}
        </div>

        {/* Center: Main View Tabs with Sliding Indicator */}
        <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/[0.08] backdrop-blur-md shadow-inner">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 z-10 ${
                  isActive ? "text-cyan-300 font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-emerald-500/15 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.25)] -z-10"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Engine Status & Settings */}
        <div className="flex items-center gap-3">
          {/* Engine Status Pulse */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/70 border border-white/[0.08] text-[11px] font-mono text-slate-300 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              {backendOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  backendOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-amber-500"
                }`}
              />
            </span>
            <span>{backendOnline ? "Core API Active" : "Connecting..."}</span>
          </div>

          {/* Settings Trigger */}
          <motion.button
            onClick={onOpenSettings}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900/70 border border-white/[0.08] hover:border-cyan-500/40 hover:shadow-[0_0_12px_rgba(0,240,255,0.25)] transition-all shadow-sm"
            title="Configure Models & API Keys"
          >
            <SettingsIcon className="w-3.5 h-3.5 text-cyan-400 transition-transform duration-300 hover:rotate-90" />
            <span className="hidden sm:inline">Settings</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
};
