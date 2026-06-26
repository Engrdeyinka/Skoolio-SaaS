/**
 * AiTutor.jsx
 * Floating AI tutor chat with persistent multi-conversation history (localStorage).
 * Students can start new chats, switch between past ones, and delete any with X.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, X, Plus, User,
  MessageSquare, ChevronLeft, Trash2, PanelLeft,
} from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = "ai_tutor_conversations";

function loadConvs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveConvs(convs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)); } catch {}
}
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── Markdown + LaTeX renderer ─────────────────────────────────────────────────

function isTableRow(line) { return /^\|.+\|/.test(line.trim()); }

function RenderTable({ rows }) {
  const header   = rows[0];
  const body     = rows.slice(2);
  const parseRow = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-emerald-50">
            {parseRow(header).map((cell, ci) => (
              <th key={ci} className="px-3 py-2 text-left text-xs font-bold text-emerald-800 border-b border-slate-200">
                <RenderInline text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-700 border-b border-slate-100 text-xs">
                  <RenderInline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Render a line that may contain $...$ inline math and **bold**/*italic*
function RenderInline({ text }) {
  // Split on $...$ (but not $$)
  const parts = [];
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ t: "block-inline", v: m[1] });
    else                    parts.push({ t: "inline", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });

  return (
    <>
      {parts.map((p, idx) => {
        if (p.t === "inline")       return <InlineMath key={idx} math={p.v} />;
        if (p.t === "block-inline") return <InlineMath key={idx} math={p.v} />;
        // plain text with bold/italic/code
        const html = p.v
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono text-emerald-700">$1</code>');
        return <span key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}

function RenderAnswer({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Table block ──
    if (isTableRow(line)) {
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i])) { tableLines.push(lines[i]); i++; }
      if (tableLines.length >= 2) elements.push(<RenderTable key={`t${i}`} rows={tableLines} />);
      continue;
    }

    // ── Empty line ──
    if (!line.trim()) { elements.push(<div key={i} className="h-1.5" />); i++; continue; }

    // ── Block math: $$ alone on a line (multiline) ──
    if (line.trim() === "$$") {
      const mathLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") { mathLines.push(lines[i]); i++; }
      i++; // skip closing $$
      elements.push(
        <div key={`bm${i}`} className="my-3 flex justify-center">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-5 py-3 overflow-x-auto">
            <BlockMath math={mathLines.join("\\\\")} />
          </div>
        </div>
      );
      continue;
    }

    // ── Block math: $$...$$ on a single line ──
    const blockLine = line.match(/^\$\$(.+)\$\$$/);
    if (blockLine) {
      elements.push(
        <div key={i} className="my-3 flex justify-center">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-5 py-3 overflow-x-auto">
            <BlockMath math={blockLine[1]} />
          </div>
        </div>
      );
      i++; continue;
    }

    // ── Horizontal rule ──
    if (/^-{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-3 border-slate-200" />);
      i++; continue;
    }

    // ── ## Heading ──
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-slate-800 mt-4 mb-1.5 pb-1 border-b border-slate-100">
          <RenderInline text={h2[1]} />
        </h2>
      );
      i++; continue;
    }

    // ── ### Sub-heading ──
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      elements.push(
        <h3 key={i} className="text-xs font-bold text-emerald-700 mt-3 mb-1 uppercase tracking-wide">
          <RenderInline text={h3[1]} />
        </h3>
      );
      i++; continue;
    }

    // ── Numbered step ──
    const stepMatch = line.match(/^(\d+)\.\s+(.+)/) || line.match(/^(Step \d+)[:.]\s*(.+)/i);
    if (stepMatch) {
      const num = stepMatch[1];
      const displayNum = typeof num === "string" && num.startsWith("Step") ? num.replace("Step ", "") : num;
      elements.push(
        <div key={i} className="flex gap-3 items-start my-1.5">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
            {displayNum}
          </span>
          <span className="text-sm text-slate-800 leading-relaxed"><RenderInline text={stepMatch[2]} /></span>
        </div>
      );
      i++; continue;
    }

    // ── Answer: ──
    if (/^Answer:/i.test(line)) {
      elements.push(
        <div key={i} className="mt-3 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide mr-1">Answer</span>
          <span className="text-sm font-bold text-emerald-800">
            <RenderInline text={line.replace(/^Answer:\s*/i, "")} />
          </span>
        </div>
      );
      i++; continue;
    }

    // ── Bullet point ──
    if (/^[-•*]\s+/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2 items-start my-0.5">
          <span className="text-emerald-400 mt-1.5 text-[10px]">●</span>
          <span className="text-sm text-slate-800 leading-relaxed">
            <RenderInline text={line.replace(/^[-•*]\s+/, "")} />
          </span>
        </div>
      );
      i++; continue;
    }

    // ── Example: ──
    if (/^Example:/i.test(line)) {
      elements.push(
        <div key={i} className="mt-2 px-3 py-2 bg-amber-50 border-l-2 border-amber-300 rounded-r-lg">
          <span className="text-xs font-bold text-amber-700 mr-1">Example:</span>
          <span className="text-sm text-slate-700 italic">
            <RenderInline text={line.replace(/^Example:\s*/i, "")} />
          </span>
        </div>
      );
      i++; continue;
    }

    // ── Plain paragraph ──
    elements.push(
      <p key={i} className="text-sm text-slate-800 leading-relaxed my-0.5">
        <RenderInline text={line} />
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Suggested starter questions ───────────────────────────────────────────────
const SUGGESTIONS = [
  "What is photosynthesis?",
  "Solve: 3x + 7 = 22",
  "Explain Newton's second law",
  "What causes rainfall?",
  "Difference between acids and bases",
  "What is the mitochondria?",
  "How do I find the area of a circle?",
  "Explain supply and demand",
];

// ── Main component ────────────────────────────────────────────────────────────
export default function AiTutor({ onClose }) {
  const [convs,      setConvs]      = useState(() => loadConvs());
  const [activeId,   setActiveId]   = useState(() => { const c = loadConvs(); return c[0]?.id ?? null; });
  const [showSidebar, setShowSidebar] = useState(false);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeConv = convs.find(c => c.id === activeId) ?? null;
  const messages   = activeConv?.messages ?? [];

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => { inputRef.current?.focus(); }, [activeId]);

  // ── Persist helpers ───────────────────────────────────────────────────────
  function mutateConvs(fn) {
    setConvs(prev => { const next = fn(prev); saveConvs(next); return next; });
  }

  // ── New chat ──────────────────────────────────────────────────────────────
  function newChat() {
    const id = makeId();
    mutateConvs(prev => [{ id, title: "New chat", messages: [], createdAt: Date.now() }, ...prev]);
    setActiveId(id);
    setError("");
    setInput("");
    setShowSidebar(false);
  }

  // ── Delete conversation ───────────────────────────────────────────────────
  function deleteConv(id, e) {
    e?.stopPropagation();
    mutateConvs(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === activeId) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  // ── Switch conversation ───────────────────────────────────────────────────
  function switchConv(id) {
    setActiveId(id);
    setError("");
    setShowSidebar(false);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function send(question) {
    const q = (question || input).trim();
    if (!q || loading) return;
    setInput("");
    setError("");

    // Ensure there's an active conversation
    let convId = activeId;
    if (!convId) {
      const id = makeId();
      convId = id;
      mutateConvs(prev => [{ id, title: q.slice(0, 50), messages: [], createdAt: Date.now() }, ...prev]);
      setActiveId(id);
    }

    const prevMessages = convs.find(c => c.id === convId)?.messages ?? [];

    // "continue" — ask Claude to finish the cut-off response
    const isContinue = /^continue\.?$/i.test(q);
    const effectiveQ = isContinue
      ? "Please continue your previous response from where you left off. Do not repeat what you already said."
      : q;

    const newMessages = isContinue
      ? prevMessages  // don't add a visible user bubble for "continue"
      : [...prevMessages, { role: "user", content: q }];

    // Optimistically update UI & auto-title from first message
    mutateConvs(prev => prev.map(c => c.id === convId ? {
      ...c,
      title: c.messages.length === 0 ? q.slice(0, 50) : c.title,
      messages: newMessages,
    } : c));

    setLoading(true);

    try {
      const history = prevMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: effectiveQ, history }),
      });

      let data;
      try { data = await res.json(); }
      catch {
        throw new Error(res.status === 504
          ? "Request timed out — the AI took too long. Please try again."
          : "Unexpected response from server. Please try again.");
      }

      if (!res.ok || data.error) {
        const detail = data.rawError ? ` | ${data.rawError.slice(0, 200)}` : "";
        throw new Error((data.error || "Failed to get answer") + detail);
      }

      const aiMsg = { role: "assistant", content: data.answer };
      mutateConvs(prev => prev.map(c => c.id === convId
        ? { ...c, messages: [...newMessages, aiMsg] }
        : c));
      if (isContinue) setInput("");
    } catch (err) {
      setError(err.message);
      // Roll back the optimistic user message
      mutateConvs(prev => prev.map(c => c.id === convId
        ? { ...c, messages: prevMessages }
        : c));
    }

    setLoading(false);
  }

  const isEmpty = messages.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-inherit">

      {/* ── Sidebar ── */}
      {showSidebar && (
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-slate-200 bg-slate-50 min-h-0">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Chats</span>
            <button onClick={newChat}
              className="w-6 h-6 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors"
              title="New chat">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-1">
            {convs.length === 0 && (
              <p className="text-xs text-slate-400 text-center mt-6 px-3">No chats yet</p>
            )}
            {convs.map(c => (
              <button key={c.id}
                onClick={() => switchConv(c.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 group transition-colors ${
                  c.id === activeId
                    ? "bg-emerald-100 text-emerald-800"
                    : "hover:bg-slate-100 text-slate-700"
                }`}>
                <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${c.id === activeId ? "text-emerald-600" : "text-slate-400"}`} />
                <span className="flex-1 text-xs truncate leading-snug">{c.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => deleteConv(c.id, e)}
                  onKeyDown={e => e.key === 'Enter' && deleteConv(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 hover:text-red-500 text-slate-400 transition-all flex-shrink-0 cursor-pointer">
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main chat panel ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Sidebar toggle */}
            <button onClick={() => setShowSidebar(s => !s)}
              className={`p-1.5 rounded-lg transition-colors ${showSidebar ? "bg-emerald-100 text-emerald-600" : "hover:bg-slate-100 text-slate-400"}`}
              title="Chat history">
              <PanelLeft className="w-4 h-4" />
            </button>

            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">AI Tutor</p>
              {activeConv && activeConv.messages.length > 0 && (
                <p className="text-xs text-slate-400 truncate max-w-[160px]">{activeConv.title}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={newChat}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
              title="New chat">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center gap-5 pt-4">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-indigo-100 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="font-bold text-slate-800">What do you want to learn?</p>
                <p className="text-slate-500 text-sm mt-1">Ask any question — maths, science, English, anything</p>
              </div>
              <div className="w-full max-w-lg">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">Try asking</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-all shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message thread */}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-emerald-600 text-white rounded-tr-sm"
                  : "bg-white border border-slate-200 shadow-sm rounded-tl-sm"
              }`}>
                {m.role === "user"
                  ? <p className="text-sm leading-relaxed">{m.content}</p>
                  : <RenderAnswer text={m.content} />}
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking…</span>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error.includes("ANTHROPIC_API_KEY")
                ? <>AI Tutor not configured. Add <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code> to Vercel.</>
                : error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask any question… (Enter to send)"
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent max-h-32 overflow-y-auto"
                style={{ minHeight: "48px" }}
                onInput={e => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
                }}
              />
            </div>
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="h-12 w-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center flex-shrink-0 transition-colors shadow-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">AI can make mistakes — verify important answers with your teacher</p>
        </div>

      </div>
    </div>
  );
}
