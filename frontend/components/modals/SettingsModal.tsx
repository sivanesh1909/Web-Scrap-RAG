"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Key,
  Cpu,
  Sliders,
  CheckCircle2,
  X,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { AppSettings, api } from "@/lib/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_configured: false,
    openai_configured: false,
    default_provider: "gemini",
    gemini_chat_model: "gemini-2.0-flash",
    openai_chat_model: "gpt-4o-mini",
    chunk_size: 500,
    chunk_overlap: 80,
    top_k_retrieval: 5,
  });

  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (e) {
      console.error("Failed to fetch settings:", e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        gemini_api_key: geminiKey || undefined,
        openai_api_key: openaiKey || undefined,
        default_provider: settings.default_provider,
        chunk_size: settings.chunk_size,
        chunk_overlap: settings.chunk_overlap,
        top_k_retrieval: settings.top_k_retrieval,
      });

      setSavedSuccess(true);
      if (onSettingsSaved) onSettingsSaved();
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1200);
    } catch (e) {
      alert("Failed to save settings: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-cyan-500/30 p-6 shadow-[0_0_50px_rgba(0,240,255,0.15)] relative">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Engine Configuration</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Default Provider Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 font-mono">
              Default Intelligence Engine
            </label>
            <select
              value={settings.default_provider}
              onChange={(e) => setSettings({ ...settings, default_provider: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value="gemini">Google Gemini (Gemini 2.0 Flash / Embeddings)</option>
              <option value="openai">OpenAI (GPT-4o / text-embedding-3)</option>
              <option value="local">Local Grounded Engine (Offline / Zero-Key)</option>
            </select>
          </div>

          {/* Gemini API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-semibold font-mono flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>Google Gemini API Key</span>
              </label>
              {settings.gemini_configured && (
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Configured
                </span>
              )}
            </div>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={settings.gemini_configured ? "••••••••••••••••••••" : "Paste AIzaSy... API key"}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* OpenAI API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-semibold font-mono flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-purple-400" />
                <span>OpenAI API Key</span>
              </label>
              {settings.openai_configured && (
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Configured
                </span>
              )}
            </div>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={settings.openai_configured ? "••••••••••••••••••••" : "Paste sk-... API key"}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* RAG Hyperparameters */}
          <div className="pt-2 border-t border-white/[0.06] grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-400 font-mono text-[11px] mb-1">Chunk Size</label>
              <input
                type="number"
                value={settings.chunk_size}
                onChange={(e) => setSettings({ ...settings, chunk_size: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-mono text-[11px] mb-1">Chunk Overlap</label>
              <input
                type="number"
                value={settings.chunk_overlap}
                onChange={(e) => setSettings({ ...settings, chunk_overlap: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-mono text-[11px] mb-1">Top-K Chunks</label>
              <input
                type="number"
                value={settings.top_k_retrieval}
                onChange={(e) => setSettings({ ...settings, top_k_retrieval: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-4 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-mono">
              Keys stored locally in session/env
            </span>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] flex items-center gap-1.5"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
