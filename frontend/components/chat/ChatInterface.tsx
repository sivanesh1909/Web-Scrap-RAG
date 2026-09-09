"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  User,
  ExternalLink,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Trash2,
  Download,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Square,
  Key,
  Globe,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Compass,
} from "lucide-react";
import { CitationSource, KnowledgeBaseMetadata, api } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: CitationSource[];
  suggestions?: string[];
  isStreaming?: boolean;
  liked?: boolean | null;
}

interface ChatInterfaceProps {
  currentKb: KnowledgeBaseMetadata | null;
  knowledgeBases?: KnowledgeBaseMetadata[];
  selectedKbId?: string | null;
  onSelectKb?: (kbId: string) => void;
  onNavigateToCrawl?: () => void;
  onOpenSettings: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentKb,
  knowledgeBases = [],
  selectedKbId,
  onSelectKb,
  onNavigateToCrawl,
  onOpenSettings,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitation, setActiveCitation] = useState<CitationSource | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Gemini API Key management
  const [geminiKeyModalOpen, setGeminiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string>("");
  const [activeModel, setActiveModel] = useState<"gemini-3.7-flash" | "grounded-local">("gemini-3.7-flash");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load saved Gemini API Key on mount
  useEffect(() => {
    const localKey = localStorage.getItem("aethelexult_gemini_api_key") || localStorage.getItem("webmind_gemini_api_key") || "";
    setSavedApiKey(localKey);
    setApiKeyInput(localKey);
    if (!localKey) {
      setActiveModel("grounded-local");
    }
  }, []);

  // When active knowledge base changes, reset message thread for that website
  useEffect(() => {
    if (currentKb) {
      setMessages([]);
    }
  }, [currentKb?.kb_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    localStorage.setItem("aethelexult_gemini_api_key", trimmed);
    setSavedApiKey(trimmed);
    if (trimmed) {
      setActiveModel("gemini-2.0-flash");
      api.updateSettings({ gemini_api_key: trimmed, default_provider: "gemini" }).catch(() => {});
    } else {
      setActiveModel("grounded-local");
    }
    setGeminiKeyModalOpen(false);
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isStreaming) return;

    const userMessage: Message = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const assistantPlaceholderId = `asst_${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantPlaceholderId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isStreaming: true,
      sources: [],
      suggestions: [],
      liked: null,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(api.getChatStreamUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          query: textToSend.trim(),
          kb_id: currentKb?.kb_id || undefined,
          provider: savedApiKey ? "gemini" : "local",
          api_key: savedApiKey || undefined,
          chat_history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat stream connection failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let accumulatedSources: CitationSource[] = [];
      let accumulatedSuggestions: string[] = [];
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = "token";
          let dataText = "";

          const lines = block.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace(/^event:\s*/, "").trim();
            } else if (line.startsWith("data:")) {
              dataText = line.replace(/^data:\s*/, "").trim();
            }
          }

          if (dataText) {
            try {
              const parsed = JSON.parse(dataText);
              if (eventType === "token" && parsed.token) {
                assistantContent += parsed.token;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantPlaceholderId
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
              } else if (eventType === "sources" && parsed.sources) {
                accumulatedSources = parsed.sources;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantPlaceholderId
                      ? { ...msg, sources: accumulatedSources }
                      : msg
                  )
                );
              } else if (eventType === "suggestions" && parsed.suggestions) {
                accumulatedSuggestions = parsed.suggestions;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantPlaceholderId
                      ? { ...msg, suggestions: accumulatedSuggestions }
                      : msg
                  )
                );
              } else if (eventType === "error") {
                assistantContent = `⚠️ ${parsed.error || "An error occurred with this request."}`;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantPlaceholderId
                      ? { ...msg, content: assistantContent, isStreaming: false }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantPlaceholderId
            ? {
                ...msg,
                isStreaming: false,
                sources: accumulatedSources,
                suggestions: accumulatedSuggestions,
              }
            : msg
        )
      );

      if (speechEnabled && assistantContent && "speechSynthesis" in window) {
        const cleanSpeech = assistantContent
          .replace(/\[\d+\]/g, "")
          .replace(/[#*_`]/g, "")
          .slice(0, 300);
        const utterance = new SpeechSynthesisUtterance(cleanSpeech);
        window.speechSynthesis.speak(utterance);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantPlaceholderId
              ? {
                  ...msg,
                  content: `⚠️ Failed to retrieve grounded answer: ${err.message}`,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const copyMessage = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyCode = (codeId: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(codeId);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const clearChat = () => {
    if (confirm("Clear current Gemini chat session?")) {
      setMessages([]);
    }
  };

  const toggleFeedback = (msgId: string, liked: boolean) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === msgId
          ? { ...msg, liked: msg.liked === liked ? null : liked }
          : msg
      )
    );
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const md = messages
      .map(
        (m) =>
          `### ${m.role === "user" ? "User" : "Google Gemini"} (${m.timestamp})\n\n${m.content}\n`
      )
      .join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gemini-chat-${currentKb?.domain || "session"}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render text with interactive [1], [2] citation badges and formatting
  const renderFormattedText = (text: string, sources?: CitationSource[], parentKey = "text") => {
    const citationRegex = /(\[\d+\])/g;
    const parts = text.split(citationRegex);

    return parts.map((part, pIdx) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const source = sources?.find((s) => s.id === num);
        return (
          <button
            key={`${parentKey}-cit-${pIdx}`}
            onClick={() => {
              if (source) {
                setActiveCitation(source);
              }
            }}
            className="inline-flex items-center px-1.5 py-0.2 mx-1 text-[11px] font-mono font-semibold rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 hover:border-blue-400 hover:text-white transition-all cursor-pointer shadow-sm align-baseline"
            title={source ? `Source ${num}: ${source.title}` : `Source [${num}]`}
          >
            [{num}]
          </button>
        );
      }

      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bPart, bIdx) => {
        if (bPart.startsWith("**") && bPart.endsWith("**")) {
          return (
            <strong key={`${parentKey}-b-${pIdx}-${bIdx}`} className="font-semibold text-white">
              {bPart.slice(2, -2)}
            </strong>
          );
        }
        const codeParts = bPart.split(/(`[^`]+`)/g);
        return codeParts.map((cPart, cIdx) => {
          if (cPart.startsWith("`") && cPart.endsWith("`")) {
            return (
              <code
                key={`${parentKey}-c-${pIdx}-${bIdx}-${cIdx}`}
                className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-xs text-cyan-300"
              >
                {cPart.slice(1, -1)}
              </code>
            );
          }
          return <span key={`${parentKey}-t-${pIdx}-${bIdx}-${cIdx}`}>{cPart}</span>;
        });
      });
    });
  };

  // Full Gemini Markdown renderer with Code Blocks, Headings, Lists, Blockquotes
  const renderGeminiMarkdown = (content: string, msgId: string, sources?: CitationSource[]) => {
    if (!content) return null;

    const codeBlockRegex = /(```[\s\S]*?```)/g;
    const blocks = content.split(codeBlockRegex);

    return (
      <div className="space-y-3 leading-relaxed text-sm text-slate-200">
        {blocks.map((block, bIdx) => {
          if (block.startsWith("```") && block.endsWith("```")) {
            const lines = block.slice(3, -3).trim().split("\n");
            let lang = "python";
            let code = block.slice(3, -3).trim();

            if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0].trim())) {
              lang = lines[0].trim();
              code = lines.slice(1).join("\n");
            }

            const codeId = `${msgId}_code_${bIdx}`;

            return (
              <div
                key={codeId}
                className="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-[#0d1117] shadow-xl"
              >
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#161b22] border-b border-slate-800 text-[11px] font-mono text-slate-400">
                  <span className="uppercase font-semibold tracking-wider text-slate-300">
                    {lang}
                  </span>
                  <button
                    onClick={() => copyCode(codeId, code)}
                    className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                    title="Copy code to clipboard"
                  >
                    {copiedCodeId === codeId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-normal">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          const paragraphs = block.split(/\n\n+/);

          return paragraphs.map((para, pIdx) => {
            const pTrimmed = para.trim();
            if (!pTrimmed) return null;

            if (pTrimmed.startsWith("### ")) {
              return (
                <h4
                  key={`h3-${bIdx}-${pIdx}`}
                  className="font-bold text-sm text-cyan-300 mt-4 mb-2 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  {renderFormattedText(pTrimmed.slice(4), sources, `h3-${bIdx}-${pIdx}`)}
                </h4>
              );
            }

            if (pTrimmed.startsWith("## ")) {
              return (
                <h3
                  key={`h2-${bIdx}-${pIdx}`}
                  className="font-extrabold text-base text-white mt-5 mb-2 pb-1 border-b border-white/[0.08]"
                >
                  {renderFormattedText(pTrimmed.slice(3), sources, `h2-${bIdx}-${pIdx}`)}
                </h3>
              );
            }

            if (pTrimmed.startsWith("> ")) {
              return (
                <blockquote
                  key={`bq-${bIdx}-${pIdx}`}
                  className="pl-3.5 py-1 border-l-2 border-blue-400/80 italic text-slate-300 bg-blue-500/[0.05] rounded-r-lg my-2"
                >
                  {renderFormattedText(pTrimmed.slice(2), sources, `bq-${bIdx}-${pIdx}`)}
                </blockquote>
              );
            }

            if (pTrimmed.includes("\n- ") || pTrimmed.startsWith("- ")) {
              const listItems = pTrimmed.split("\n").filter((l) => l.trim());
              return (
                <ul key={`ul-${bIdx}-${pIdx}`} className="space-y-1.5 my-2.5 pl-1">
                  {listItems.map((item, liIdx) => {
                    const cleanItem = item.replace(/^-\s+/, "").trim();
                    return (
                      <li key={`li-${bIdx}-${pIdx}-${liIdx}`} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                        <div className="flex-1">
                          {renderFormattedText(cleanItem, sources, `li-${bIdx}-${pIdx}-${liIdx}`)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            }

            return (
              <p key={`p-${bIdx}-${pIdx}`} className="leading-relaxed">
                {renderFormattedText(pTrimmed, sources, `p-${bIdx}-${pIdx}`)}
              </p>
            );
          });
        })}
      </div>
    );
  };

  const domainName = currentKb ? currentKb.domain : "All Indexed Websites";

  // Dynamic suggested prompt chips per domain
  const getPromptCards = () => {
    const dLower = (currentKb?.domain || "").toLowerCase();
    if (dLower.includes("infomeister")) {
      return [
        {
          title: "Core Technical Domains",
          desc: "List all 6 specialized engineering tracks",
          prompt: "What are the domains in Infomeister?",
        },
        {
          title: "Faculty Coordinator",
          desc: "Department leadership and advisor details",
          prompt: "Who is the faculty coordinator of Infomeister?",
        },
        {
          title: "Trisquadathon 2.0",
          desc: "Flagship hackathon tracks & innovation marathon",
          prompt: "What is Trisquadathon 2.0?",
        },
        {
          title: "Impact & Metrics",
          desc: "Students reached, workshops, and milestones",
          prompt: "What are the key impact metrics and milestones?",
        },
      ];
    } else if (dLower.includes("python")) {
      return [
        {
          title: "Python 3.12 TaskGroup",
          desc: "Asyncio structured concurrency & error cancellation",
          prompt: "Tell me about asyncio TaskGroup in Python 3.12",
        },
        {
          title: "Async Coroutine Example",
          desc: "Working code example for async def and event loop",
          prompt: "Can you provide a working code example of asyncio coroutines?",
        },
        {
          title: "Performance Boosts",
          desc: "Adaptive bytecode (PEP 659) & memory optimization",
          prompt: "What performance enhancements were introduced in Python 3.12?",
        },
        {
          title: "Event Loop Architecture",
          desc: "How event multiplexing and tasks are scheduled",
          prompt: "How does the asyncio event loop work?",
        },
      ];
    } else if (dLower.includes("apple")) {
      return [
        {
          title: "Flagship Hardware Lines",
          desc: "iPhone, Mac personal computers, iPad, Apple Watch",
          prompt: "What are Apple's flagship products and hardware lines?",
        },
        {
          title: "Apple Silicon Processors",
          desc: "M-series chips, unified memory, and performance",
          prompt: "Tell me about Apple Silicon processors and the Mac lineup",
        },
        {
          title: "Subscription Services",
          desc: "App Store, iCloud+, Apple Music, and Apple TV+",
          prompt: "What subscription services does Apple offer?",
        },
        {
          title: "iPhone Product Family",
          desc: "Camera architecture, displays, and A-series chips",
          prompt: "Overview of the iPhone product family",
        },
      ];
    } else if (dLower.includes("openai")) {
      return [
        {
          title: "GPT-4o Multimodal",
          desc: "Real-time native audio, vision, and text reasoning",
          prompt: "What are GPT-4o's multimodal capabilities?",
        },
        {
          title: "ChatGPT Enterprise",
          desc: "Enterprise data privacy and custom models",
          prompt: "What capabilities does ChatGPT Enterprise offer?",
        },
        {
          title: "Developer API Platform",
          desc: "Completions, structured outputs, embeddings, vision",
          prompt: "How does the OpenAI developer API work?",
        },
        {
          title: "AGI Mission & Safety",
          desc: "Frontier research and safe beneficial deployment",
          prompt: "What is OpenAI's mission for Artificial General Intelligence?",
        },
      ];
    } else {
      return [
        {
          title: "Executive Overview",
          desc: "Comprehensive summary of mission and core topics",
          prompt: `What is ${domainName} about?`,
        },
        {
          title: "Key Features & Services",
          desc: "Extract offerings, capabilities, and solutions",
          prompt: "What are the main products, services, or features covered?",
        },
        {
          title: "Technical Architecture",
          desc: "Code snippets, frameworks, and implementations",
          prompt: "Explain the technical architecture and show examples if available",
        },
        {
          title: "Leadership & Contacts",
          desc: "Team, coordinators, or organization structure",
          prompt: "Who are the leaders, faculty, or key team members mentioned?",
        },
      ];
    }
  };

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-[#080b12] text-[#e3e3e3] relative select-none">
      {/* ========================================================================= */}
      {/* 1. GOOGLE GEMINI COLLAPSIBLE SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`${
          sidebarOpen ? "w-72" : "w-0 -translate-x-full"
        } shrink-0 h-full border-r border-white/[0.08] bg-[#070910]/95 backdrop-blur-2xl flex flex-col justify-between p-3.5 transition-all duration-300 ease-in-out z-20 overflow-hidden select-auto shadow-[4px_0_24px_rgba(0,0,0,0.5)]`}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Top Brand & Collapse Trigger */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#1a73e8] via-[#8e24aa] to-[#e91e63] p-[1px] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(142,36,170,0.4)]">
                <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                </div>
              </div>
              <span className="font-bold text-sm text-white tracking-tight">Gemini Chat Studio</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* + New Chat Pill Button (Google Gemini Style) */}
          <button
            onClick={() => {
              setMessages([]);
            }}
            className="w-full mb-4 py-2.5 px-4 rounded-full bg-slate-900/90 hover:bg-slate-800/90 border border-white/[0.12] hover:border-blue-500/40 text-xs font-semibold text-white flex items-center gap-2.5 transition-all duration-200 shadow-md hover:shadow-[0_0_16px_rgba(66,133,244,0.2)] cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <Plus className="w-3 h-3" />
            </div>
            <span>New chat</span>
          </button>

          {/* Grounded Websites / Knowledge Bases Section */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            <div className="px-2 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between mb-1.5">
              <span>Grounded Websites</span>
              <span className="text-emerald-400 font-bold">{knowledgeBases.length}</span>
            </div>

            {knowledgeBases.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No indexed sites yet.
              </div>
            ) : (
              knowledgeBases.map((kb) => {
                const isActive = kb.kb_id === currentKb?.kb_id;
                return (
                  <button
                    key={kb.kb_id}
                    onClick={() => onSelectKb?.(kb.kb_id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all text-xs cursor-pointer group ${
                      isActive
                        ? "bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/10 border border-blue-500/50 text-white font-semibold shadow-[0_0_15px_rgba(66,133,244,0.15)]"
                        : "hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-1">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isActive
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                            : "bg-slate-600 group-hover:bg-slate-400"
                        }`}
                      />
                      <div className="truncate">
                        <div className="truncate font-medium text-xs">{kb.domain}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {kb.total_chunks} sections • {kb.total_pages} {kb.total_pages === 1 ? "page" : "pages"}
                        </div>
                      </div>
                    </div>
                    {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Actions inside Sidebar */}
          <div className="pt-3 mt-3 border-t border-white/[0.08] space-y-2 shrink-0">
            {onNavigateToCrawl && (
              <button
                onClick={onNavigateToCrawl}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600/15 to-purple-600/15 hover:from-blue-600/25 hover:to-purple-600/25 border border-blue-500/30 text-xs font-mono text-blue-300 hover:text-white transition-all cursor-pointer shadow-sm"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>+ Crawl New Website</span>
              </button>
            )}

            <button
              onClick={() => setGeminiKeyModalOpen(true)}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-white/[0.06] text-[11px] font-mono text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Key className="w-3 h-3 text-purple-400" />
                <span>{savedApiKey ? "Gemini 2.0 Flash" : "Grounded Engine"}</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">
                {savedApiKey ? "Configured" : "Offline"}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. CENTRAL GOOGLE GEMINI WORKSPACE */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#090c15] relative overflow-hidden select-auto">
        {/* Top Gemini Navigation Bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-white/[0.08] bg-[#0b0e18]/80 backdrop-blur-xl flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl bg-slate-900 border border-white/[0.08] hover:border-blue-500/40 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            {/* Gemini Brand & Model Indicator */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white flex items-center gap-1.5">
                Google Gemini
                <span className="text-[11px] font-normal text-slate-400 font-mono">
                  {savedApiKey ? "2.0 Flash" : "Grounded"}
                </span>
              </span>

              {/* Active Website Grounding Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300 shadow-sm truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="truncate max-w-[160px] font-semibold">{domainName}</span>
                {currentKb && (
                  <span className="text-[10px] text-emerald-400/80 hidden sm:inline">
                    • {currentKb.total_chunks} verified chunks
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Utility Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Connect Gemini Key */}
            <button
              onClick={() => setGeminiKeyModalOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                savedApiKey
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
                  : "bg-purple-500/10 border-purple-500/40 text-purple-300 hover:bg-purple-500/20"
              }`}
              title="Configure Google Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {savedApiKey ? "Gemini Key" : "API Key"}
              </span>
            </button>

            {/* Read Aloud Voice Toggle */}
            <button
              onClick={() => setSpeechEnabled(!speechEnabled)}
              className={`p-2 rounded-xl border text-xs transition-all ${
                speechEnabled
                  ? "bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                  : "bg-slate-900 border-white/[0.08] text-slate-400 hover:text-white"
              }`}
              title={speechEnabled ? "Voice Output Active" : "Enable Read Aloud"}
            >
              {speechEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Export Chat */}
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="p-2 rounded-xl bg-slate-900 border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-all cursor-pointer"
              title="Export Conversation"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Reset / Clear Chat */}
            <button
              onClick={clearChat}
              disabled={messages.length === 0}
              className="p-2 rounded-xl bg-slate-900 border border-white/[0.08] text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-all cursor-pointer"
              title="Clear Chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Open Full Settings */}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-900 border border-white/[0.08] text-slate-400 hover:text-white text-xs transition-all cursor-pointer"
              title="Settings"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Gemini Chat Feed Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 scrollbar-thin space-y-6">
          {/* Welcome Screen (Google Gemini Style) */}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto my-auto py-12">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#1a73e8] via-[#8e24aa] to-[#e91e63] p-[2px] shadow-[0_0_30px_rgba(142,36,170,0.5)] mb-6 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[12px] flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-300 to-rose-400" />
                </div>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4285f4] via-[#9b72cf] to-[#d96570]">
                  Hello, Explorer
                </span>
              </h2>
              <p className="text-sm text-slate-400 max-w-lg mb-8">
                How can I help you explore{" "}
                <strong className="text-white font-semibold">{domainName}</strong> today? Every
                response is verified directly from crawled documentation.
              </p>

              {/* 4 Interactive Prompt Suggestion Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {getPromptCards().map((card, cIdx) => (
                  <motion.button
                    key={cIdx}
                    onClick={() => handleSend(card.prompt)}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-4 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-white/[0.08] hover:border-blue-500/40 text-left transition-all duration-200 group cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-slate-200 group-hover:text-blue-300 transition-colors">
                        {card.title}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-[11px] text-slate-400">{card.desc}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Active Conversation Messages */}
          {messages.length > 0 && (
            <div className="max-w-3xl mx-auto w-full space-y-6 pb-28">
              {messages.map((msg) => {
                const isAssistant = msg.role === "assistant";

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className={`flex gap-3.5 ${isAssistant ? "justify-start" : "justify-end"} group`}
                  >
                    {isAssistant && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1a73e8] via-[#8e24aa] to-[#e91e63] p-[1px] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(142,36,170,0.3)] mt-1">
                        <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-purple-300" />
                        </div>
                      </div>
                    )}

                    <div
                      className={`max-w-2xl rounded-2xl p-4 sm:p-5 transition-all ${
                        isAssistant
                          ? "bg-[#0d111b]/95 border border-white/[0.08] shadow-xl backdrop-blur-2xl"
                          : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_4px_20px_rgba(37,99,235,0.25)] rounded-tr-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold ${
                              isAssistant
                                ? "text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400"
                                : "text-blue-100"
                            }`}
                          >
                            {isAssistant ? "Gemini" : "You"}
                          </span>
                          {isAssistant && (
                            <span className="px-1.5 py-0.2 rounded bg-white/[0.05] text-[10px] text-slate-400">
                              {savedApiKey ? "Gemini 2.0 Flash" : "Grounded Engine"}
                            </span>
                          )}
                        </div>
                        <span>{msg.timestamp}</span>
                      </div>

                      {isAssistant ? (
                        renderGeminiMarkdown(msg.content, msg.id, msg.sources)
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.content}</p>
                      )}

                      {msg.isStreaming && (
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/[0.06] text-blue-400 text-xs font-mono">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
                          </span>
                          <span>Gemini is synthesizing verified response...</span>
                        </div>
                      )}

                      {/* Assistant Action Footer & Sources */}
                      {isAssistant && !msg.isStreaming && msg.content && (
                        <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <button
                              onClick={() => copyMessage(msg.id, msg.content)}
                              className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                              title="Copy answer"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => toggleFeedback(msg.id, true)}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                msg.liked === true
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "hover:bg-slate-800 hover:text-white"
                              }`}
                              title="Helpful"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => toggleFeedback(msg.id, false)}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                msg.liked === false
                                  ? "bg-rose-500/20 text-rose-400"
                                  : "hover:bg-slate-800 hover:text-white"
                              }`}
                              title="Not helpful"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>

                            {speechEnabled && (
                              <button
                                onClick={() => {
                                  if ("speechSynthesis" in window) {
                                    const cleanText = msg.content
                                      .replace(/\[\d+\]/g, "")
                                      .replace(/[#*_`]/g, "");
                                    const u = new SpeechSynthesisUtterance(cleanText.slice(0, 300));
                                    window.speechSynthesis.speak(u);
                                  }
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-all"
                                title="Read aloud"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {msg.sources && msg.sources.length > 0 && (
                            <button
                              onClick={() =>
                                setExpandedSourcesMsgId(
                                  expandedSourcesMsgId === msg.id ? null : msg.id
                                )
                              }
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                              <Globe className="w-3 h-3 text-blue-400" />
                              <span>{msg.sources.length} Verified Sources</span>
                              {expandedSourcesMsgId === msg.id ? (
                                <ChevronUp className="w-3 h-3 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Expandable Sources Drawer */}
                      {isAssistant &&
                        msg.sources &&
                        msg.sources.length > 0 &&
                        expandedSourcesMsgId === msg.id && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                              <span className="flex items-center gap-1 text-blue-300 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Verified Grounding Citations:
                              </span>
                              <span>Click card to inspect source</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.sources.map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => setActiveCitation(s)}
                                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#090d14] hover:bg-slate-800/80 border border-slate-700/80 hover:border-blue-500/50 text-left transition-all group cursor-pointer"
                                >
                                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold shrink-0">
                                    [{s.id}]
                                  </span>
                                  <div className="flex-1 truncate">
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className="font-semibold text-xs text-white group-hover:text-blue-300 truncate">
                                        {s.title}
                                      </span>
                                      <span className="text-[10px] font-mono text-emerald-400 px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                                        {Math.round(s.score * 100)}%
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">
                                      {s.section || "Overview"}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Follow-up suggestions */}
                      {isAssistant &&
                        msg.suggestions &&
                        msg.suggestions.length > 0 &&
                        !msg.isStreaming && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08]">
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-purple-300 mb-2">
                              <Lightbulb className="w-3 h-3 text-purple-400" />
                              <span>Suggested follow-up questions:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.suggestions.map((suggestion, sIdx) => (
                                <motion.button
                                  key={sIdx}
                                  onClick={() => handleSend(suggestion)}
                                  whileHover={{ scale: 1.04, y: -1 }}
                                  whileTap={{ scale: 0.96 }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/25 hover:border-purple-400 text-xs text-purple-200 transition-all group cursor-pointer shadow-sm"
                                >
                                  <span>{suggestion}</span>
                                  <ArrowRight className="w-3 h-3 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
                                </motion.button>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>

                    {!isAssistant && (
                      <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                        <User className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. PINNED FLOATING GOOGLE GEMINI PROMPT CAPSULE */}
        {/* ========================================================================= */}
        <div className="shrink-0 max-w-3xl mx-auto w-full px-4 pb-4 pt-1 z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative rounded-3xl bg-[#131722]/95 border border-white/[0.14] focus-within:border-blue-500/70 focus-within:ring-2 focus-within:ring-blue-500/20 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all"
          >
            {/* Top Bar inside Input Pill */}
            <div className="px-5 pt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-blue-400" />
                <span>Grounded on:</span>
                <span className="font-semibold text-white">{domainName}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>{savedApiKey ? "Gemini 2.0 Flash" : "Grounded Neural RAG"}</span>
              </div>
            </div>

            {/* Multiline Textarea + Action Button */}
            <div className="flex items-center px-4 pb-2.5 pt-1 gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Ask Gemini anything about ${domainName}... (Press Enter)`}
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 py-2 focus:outline-none resize-none max-h-32 leading-relaxed"
                disabled={isStreaming}
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStream}
                  className="p-2.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title="Stop generation"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Send query"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          <div className="text-center text-[10px] text-slate-500 font-mono mt-1.5">
            AethelExult.AI is grounded in verified crawled documentation. Inspect citations [1] for sources.
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. CITATION INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {activeCitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="max-w-xl w-full p-6 rounded-2xl bg-[#0d121c] border border-blue-500/40 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
                  Source [{activeCitation.id}]
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono text-xs">
                  {Math.round(activeCitation.score * 100)}% Match Confidence
                </span>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-slate-400 hover:text-white text-xs font-mono px-2.5 py-1 rounded bg-slate-800 cursor-pointer"
              >
                Close (ESC)
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <h4 className="font-bold text-base text-white">{activeCitation.title}</h4>
                <p className="text-xs text-blue-400 font-mono mt-0.5">
                  Section: {activeCitation.section || "Overview"}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-y-auto scrollbar-thin">
                {activeCitation.snippet}
              </div>

              <div className="text-[11px] text-slate-400 font-mono break-all flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-slate-500 shrink-0" />
                <span>{activeCitation.url}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <a
                href={activeCitation.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all"
              >
                <span>Visit Source Webpage</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. GEMINI API KEY MODAL */}
      {/* ========================================================================= */}
      {geminiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#0d121c] border border-purple-500/40 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/[0.08]">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1a73e8] via-[#8e24aa] to-[#e91e63] p-[1.5px] flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Key className="w-4 h-4 text-purple-300" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Google Gemini Engine Settings</h3>
                <p className="text-[11px] text-slate-400">Gemini 2.0 Flash with Real-time Grounding</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5">
                  Gemini API Key (Generative Language API)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Enter your Google Gemini API key to enable live streaming directly from Gemini 2.0 Flash.
                  If left empty, AethelExult.AI uses its built-in local grounded synthesis engine.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.06] text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-purple-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Dual Operating Modes:</span>
                </div>
                <div className="text-[11px] text-slate-400 pl-4 space-y-0.5">
                  <p>• <strong>Gemini 2.0 Flash</strong>: Cloud LLM with full context injection.</p>
                  <p>• <strong>Local Grounded Engine</strong>: Offline zero-setup neural extraction.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setGeminiKeyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold transition-all shadow-lg cursor-pointer"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
