import React, { useState, useEffect, useRef } from "react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  AlertCircle, Trophy, RotateCcw, Loader2, GraduationCap, Download, X,
  Sparkles, ArrowLeft, Printer
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS_UTME = [
  { value: "english", label: "English Language" },
  { value: "mathematics", label: "Mathematics" },
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "biology", label: "Biology" },
  { value: "geography", label: "Geography" },
  { value: "economics", label: "Economics" },
  { value: "government", label: "Government" },
  { value: "english-literature", label: "Literature in English" },
  { value: "commerce", label: "Commerce" },
  { value: "accounting", label: "Financial Accounting" },
  { value: "agric", label: "Agricultural Science" },
  { value: "crk", label: "Christian Religious Knowledge" },
  { value: "civic-education", label: "Civic Education" },
  { value: "further-mathematics", label: "Further Mathematics" },
  { value: "islamic-religious-studies", label: "Islamic Religious Knowledge" },
  { value: "yoruba", label: "Yoruba" },
];

const SUBJECTS_WASSCE = [
  { value: "english", label: "English Language" },
  { value: "mathematics", label: "Mathematics" },
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "biology", label: "Biology" },
  { value: "geography", label: "Geography" },
  { value: "economics", label: "Economics" },
  { value: "government", label: "Government" },
  { value: "english-literature", label: "Literature in English" },
  { value: "commerce", label: "Commerce" },
  { value: "accounting", label: "Financial Accounting" },
  { value: "agric", label: "Agricultural Science" },
  { value: "crk", label: "Christian Religious Knowledge" },
  { value: "further-mathematics", label: "Further Mathematics" },
];

const ALL_SUBJECTS = { utme: SUBJECTS_UTME, wassce: SUBJECTS_WASSCE };
const IMPORT_YEARS = Array.from({ length: 24 }, (_, i) => String(2023 - i));
const OPTION_LABELS = ["A", "B", "C", "D"];
const SESSION_KEY = "practice_exam_session";

function buildAlocProxyUrl({ subject, type, year, token }) {
  const params = new URLSearchParams({ subject, type });
  if (year) params.set("year", year);
  if (token) params.set("token", token);
  return `/api/aloc?${params.toString()}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function getScoreColor(p) { return p >= 70 ? "text-emerald-600" : p >= 50 ? "text-amber-600" : "text-red-600"; }
function getScoreBg(p) {
  return p >= 70 ? "bg-emerald-50 border-emerald-200" : p >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Render HTML safely (for <sup>, <sub>, <b> etc. from question text)
function QText({ text, className = "" }) {
  if (!text) return null;
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

// ── Import panel ──────────────────────────────────────────────────────────────

function ImportPanel({ alocApiToken, onClose }) {
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [inserted, setInserted] = useState(0);
  const abortRef = useRef(false);
  const logRef = useRef(null);
  const [selExamType, setSelExamType] = useState("utme");
  const [selSubjects, setSelSubjects] = useState([]);

  const toggleSubject = (val) =>
    setSelSubjects((prev) => prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]);
  const selectAll = () => setSelSubjects(ALL_SUBJECTS[selExamType].map((s) => s.value));
  const clearAll = () => setSelSubjects([]);
  const addLog = (msg) => setLog((l) => [...l, msg]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
  useEffect(() => { setSelSubjects([]); }, [selExamType]);

  const runImport = async () => {
    if (selSubjects.length === 0) return;
    abortRef.current = false;
    setStatus("running");
    setLog([]);
    setDone(0);
    setInserted(0);

    const allCombos = [];
    for (const subj of selSubjects) {
      for (const year of IMPORT_YEARS) {
        allCombos.push({ type: selExamType, subject: subj, year });
      }
    }

    addLog("Checking database for already-imported combinations...");
    const { data: existing } = await supabase.rpc("get_imported_combos");
    const doneKeys = new Set((existing || []).map((r) => `${r.exam_type}|${r.subject}|${r.exam_year}`));
    const combos = allCombos.filter((c) => !doneKeys.has(`${c.type}|${c.subject}|${c.year}`));
    const skipped = allCombos.length - combos.length;
    if (skipped > 0) addLog(`Skipping ${skipped} combinations already in database.`);
    if (combos.length === 0) {
      addLog("All selected combinations already imported!");
      setStatus("done");
      return;
    }

    setTotal(combos.length);
    addLog(`Fetching ${combos.length} year combinations for ${selSubjects.length} subject(s)...`);
    let totalInserted = 0;

    for (const combo of combos) {
      if (abortRef.current) { addLog("Import cancelled."); setStatus("idle"); return; }
      try {
        const res = await fetch(buildAlocProxyUrl({
          subject: combo.subject,
          type: combo.type,
          year: combo.year,
          token: alocApiToken,
        }));
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const raw = Array.isArray(data.data) ? data.data : [];
        const valid = raw.filter((q) => q.question && q.option && q.answer);
        if (valid.length === 0) {
          addLog(`⚠ No questions returned for ${combo.subject} / ${combo.year}`);
        } else {
          const rows = valid.map((q) => ({
            external_id: String(q.id || ""),
            exam_type: combo.type,
            subject: combo.subject,
            exam_year: combo.year,
            question: q.question,
            option_a: q.option?.a || null,
            option_b: q.option?.b || null,
            option_c: q.option?.c || null,
            option_d: q.option?.d || null,
            answer: q.answer?.toLowerCase(),
            image_url: q.image || null,
          }));
          const { error } = await supabase
            .from("practice_questions")
            .upsert(rows, { onConflict: "exam_type,subject,exam_year,external_id", ignoreDuplicates: true });
          if (error) {
            addLog(`⚠ DB error (${combo.subject}/${combo.year}): ${error.message}`);
          } else {
            totalInserted += rows.length;
            setInserted(totalInserted);
          }
        }
      } catch (err) {
        addLog(`⚠ Error fetching ${combo.subject}/${combo.year}: ${err.message}`);
      }
      setDone((d) => {
        const next = d + 1;
        if (next % 24 === 0) addLog(`Progress: ${next}/${combos.length} fetched, ${totalInserted} questions saved...`);
        return next;
      });
      await new Promise((r) => setTimeout(r, 200));
    }

    addLog(`Done! ${totalInserted} questions imported into your database.`);
    setStatus("done");
  };

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-500" /> Import Questions to Database
          </CardTitle>
          {status !== "running" && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "idle" && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Exam Type</label>
                <div className="flex gap-2">
                  {[{ value: "utme", label: "JAMB / UTME" }, { value: "wassce", label: "WAEC / WASSCE" }].map(({ value, label }) => (
                    <button key={value} onClick={() => setSelExamType(value)}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-semibold transition-all ${selExamType === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-500">Select Subjects</label>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-emerald-600 hover:underline">All</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={clearAll} className="text-xs text-slate-400 hover:underline">None</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {ALL_SUBJECTS[selExamType].map((s) => {
                    const selected = selSubjects.includes(s.value);
                    return (
                      <button key={s.value} onClick={() => toggleSubject(s.value)}
                        className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${selected ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}>
                        <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border-2 flex items-center justify-center ${selected ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                          {selected && <span className="text-white text-[8px] font-bold">✓</span>}
                        </span>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-slate-400">
                {selSubjects.length > 0 ? `${selSubjects.length} subject(s) × 24 years = ~${selSubjects.length * 24} API calls` : "Select at least one subject to continue"}
              </p>
              <Button onClick={runImport} disabled={selSubjects.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                Start Import ({selSubjects.length} subject{selSubjects.length !== 1 ? "s" : ""})
              </Button>
            </>
          )}
          {status === "running" && (
            <>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{done}/{total} requests</span>
                  <span>{inserted} questions saved</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-right">{progress}%</p>
              </div>
              <div ref={logRef} className="bg-slate-900 rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs text-emerald-400 space-y-0.5">
                {log.map((line, i) => <div key={i}>{line}</div>)}
              </div>
              <Button variant="outline" onClick={() => { abortRef.current = true; }} className="w-full text-red-500 border-red-200 hover:bg-red-50">Cancel Import</Button>
            </>
          )}
          {status === "done" && (
            <>
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">{inserted} questions imported!</p>
                  <p className="text-xs text-emerald-600 mt-0.5">All questions are now stored in your database.</p>
                </div>
              </div>
              <div ref={logRef} className="bg-slate-900 rounded-lg p-3 h-28 overflow-y-auto font-mono text-xs text-emerald-400">
                {log.map((line, i) => <div key={i}>{line}</div>)}
              </div>
              <Button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">Done</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── AI Explanation component ──────────────────────────────────────────────────

function AIExplanation({ question, options, correctAnswer }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [explanation, setExplanation] = useState("");

  const getExplanation = async () => {
    setStatus("loading");
    try {
      const optionText = Object.entries(options)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k.toUpperCase()}. ${v}`)
        .join("\n");

      const prompt = `You are a Nigerian secondary school exam tutor. A student got this question wrong. Explain step by step how to arrive at the correct answer.

Question: ${question}

Options:
${optionText}

Correct Answer: ${correctAnswer.toUpperCase()}

Give a clear, concise step-by-step explanation (3-5 steps max). Use simple language suitable for a Nigerian SS3 / JAMB student.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setExplanation(data.content?.[0]?.text || "No explanation available.");
      setStatus("done");
    } catch (e) {
      setStatus("error");
    }
  };

  if (status === "idle") {
    return (
      <button
        onClick={getExplanation}
        className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium"
      >
        <Sparkles className="w-3.5 h-3.5" /> Explain with AI
      </button>
    );
  }
  if (status === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting AI explanation...
      </div>
    );
  }
  if (status === "error") {
    return (
      <p className="mt-2 text-xs text-red-500">
        Could not load explanation. Check your Anthropic API key in Settings.
      </p>
    );
  }
  return (
    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-700">AI Step-by-Step Explanation</span>
      </div>
      <div className="text-xs text-slate-700 leading-relaxed prose prose-xs max-w-none
        prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:text-sm prose-headings:mb-1 prose-headings:mt-3
        prose-p:my-1 prose-p:text-slate-700
        prose-strong:text-slate-800 prose-strong:font-semibold
        prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
        prose-ol:my-1 prose-ol:pl-4
        prose-code:bg-emerald-100 prose-code:text-emerald-800 prose-code:px-1 prose-code:rounded prose-code:text-xs">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{explanation}</ReactMarkdown>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PracticeExam() {
  const { alocApiToken } = useSchoolSettings();

  const [examType, setExamType] = useState("utme");
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState("any");
  const [numQuestions, setNumQuestions] = useState("40");
  const [timePerQ, setTimePerQ] = useState("90");
  const [dbCount, setDbCount] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const [phase, setPhase] = useState("setup");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");

  const timerRef = useRef(null);
  const subjects = ALL_SUBJECTS[examType];

  // DB count
  useEffect(() => {
    supabase.from("practice_questions").select("id", { count: "exact", head: true })
      .then(({ count }) => setDbCount(count || 0));
  }, [showImport]);

  useEffect(() => { setSubject(""); }, [examType]);

  // Restore saved session
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (saved?.phase === "quiz" && saved?.questions?.length > 0) {
        setQuestions(saved.questions);
        setAnswers(saved.answers || {});
        setCurrentIndex(saved.currentIndex || 0);
        setTimeLeft(saved.timeLeft || 0);
        setExamType(saved.examType || "utme");
        setSubject(saved.subject || "");
        setPhase("quiz");
      }
    } catch (_) {}
  }, []);

  // Auto-save session
  useEffect(() => {
    if (phase === "quiz") {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ phase, questions, answers, currentIndex, timeLeft, examType, subject }));
    } else if (phase === "results" || phase === "setup") {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [phase, answers, currentIndex, timeLeft]);

  // Timer
  useEffect(() => {
    if (phase !== "quiz") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current); setPhase("results"); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const fetchQuestions = async () => {
    if (!subject) { setError("Please select a subject."); return; }
    setPhase("loading");
    setError("");
    const n = parseInt(numQuestions);

    try {
      let qs = [];
      if (dbCount > 0) {
        let query = supabase.from("practice_questions").select("*").eq("exam_type", examType).eq("subject", subject);
        if (year && year !== "any") query = query.eq("exam_year", year);
        const { data, error: dbError } = await query.limit(300);
        if (!dbError && data?.length > 0) {
          qs = shuffle(data).slice(0, n).map((q) => ({
            id: q.id, question: q.question, answer: q.answer,
            image: q.image_url, examyear: q.exam_year, subject: q.subject,
            option: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
          }));
        }
      }

      if (qs.length === 0) {
        const res = await fetch(buildAlocProxyUrl({
          subject,
          type: examType,
          year: year && year !== "any" ? year : "",
          token: alocApiToken,
        }));
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        qs = (Array.isArray(data.data) ? data.data : []).filter((q) => q.question && q.option && q.answer).slice(0, n);
      }

      if (qs.length === 0) {
        setError("No questions found. Try a different year or leave year as 'Any'.");
        setPhase("setup");
        return;
      }

      setQuestions(qs);
      setAnswers({});
      setCurrentIndex(0);
      setTimeLeft(qs.length * parseInt(timePerQ));
      setPhase("quiz");
    } catch (e) {
      setError("Failed to load questions. Check your internet connection and try again.");
      setPhase("setup");
    }
  };

  const selectAnswer = (option) => {
    setAnswers((prev) => ({ ...prev, [currentIndex]: option }));
  };

  const submitQuiz = () => {
    clearInterval(timerRef.current);
    localStorage.removeItem(SESSION_KEY);
    setPhase("results");
  };

  const restart = () => {
    clearInterval(timerRef.current);
    localStorage.removeItem(SESSION_KEY);
    setPhase("setup");
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setError("");
  };

  const [printing, setPrinting] = useState(false);

  const printPaper = async () => {
    if (!subject) { setError("Please select a subject before printing."); return; }
    setPrinting(true);
    setError("");
    const n = parseInt(numQuestions);

    try {
      let qs = [];
      if (dbCount > 0) {
        let query = supabase.from("practice_questions").select("*").eq("exam_type", examType).eq("subject", subject);
        if (year && year !== "any") query = query.eq("exam_year", year);
        const { data } = await query.limit(300);
        if (data?.length > 0) {
          qs = shuffle(data).slice(0, n).map((q) => ({
            question: q.question, answer: q.answer,
            examyear: q.exam_year,
            option: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
          }));
        }
      }
      if (qs.length === 0) {
        const res = await fetch(buildAlocProxyUrl({
          subject,
          type: examType,
          year: year && year !== "any" ? year : "",
          token: alocApiToken,
        }));
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        qs = (Array.isArray(data.data) ? data.data : [])
          .filter((q) => q.question && q.option && q.answer).slice(0, n)
          .map((q) => ({ question: q.question, answer: q.answer, examyear: q.examyear, option: q.option }));
      }
      if (qs.length === 0) { setError("No questions found for selected criteria."); setPrinting(false); return; }

      const subjectLabel = ALL_SUBJECTS[examType].find(s => s.value === subject)?.label || subject;
      const examLabel = examType === "utme" ? "JAMB/UTME" : "WAEC/WASSCE";
      const yearLabel = year === "any" ? "Mixed Years" : year;
      const OPTS = ["A", "B", "C", "D"];

      const questionsHTML = qs.map((q, i) => {
        const opts = Object.entries(q.option || {}).filter(([, v]) => v);
        const optsHTML = opts.map(([, v], idx) =>
          `<div style="margin:3px 0 3px 20px;font-size:13px;">${OPTS[idx] || ""}. ${v}</div>`
        ).join("");
        return `
          <div style="margin-bottom:18px;page-break-inside:avoid;">
            <div style="font-weight:600;font-size:13.5px;margin-bottom:4px;"><span style="color:#5b21b6;">${i + 1}.</span> ${q.question}</div>
            ${optsHTML}
          </div>`;
      }).join("");

      // Answer key — grid layout: 1.C  2.A  3.B ...
      const answersHTML = qs.map((q, i) => {
        const opts = Object.entries(q.option || {}).filter(([, v]) => v);
        const correctIdx = opts.findIndex(([k]) => k.toLowerCase() === q.answer?.toLowerCase());
        const letter = OPTS[correctIdx] ?? q.answer?.toUpperCase() ?? "?";
        return `<div style="display:inline-block;width:80px;margin:3px 4px;font-size:12px;"><span style="font-weight:700;color:#374151;">${i + 1}.</span> <span style="color:#5b21b6;font-weight:700;">${letter}</span></div>`;
      }).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>${examLabel} ${subjectLabel} ${yearLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20mm 18mm; color: #111; }
          h1 { font-size: 17px; font-weight: 800; margin: 0 0 2px; color: #1e1b4b; }
          .meta { font-size: 12px; color: #6b7280; margin-bottom: 18px; }
          .divider { border: none; border-top: 2px solid #5b21b6; margin: 20px 0; }
          .answers-title { font-size: 14px; font-weight: 800; color: #1e1b4b; margin-bottom: 10px; letter-spacing: 1px; }
          .answers-grid { display: flex; flex-wrap: wrap; }
          @media print { body { margin: 10mm 12mm; } }
        </style>
      </head><body>
        <h1>${examLabel} Past Questions — ${subjectLabel}</h1>
        <div class="meta">Year: ${yearLabel} &nbsp;|&nbsp; ${qs.length} Questions &nbsp;|&nbsp; Time: ${formatTime(qs.length * parseInt(timePerQ))}</div>
        <hr class="divider">
        ${questionsHTML}
        <hr class="divider">
        <div class="answers-title">ANSWERS</div>
        <div class="answers-grid">${answersHTML}</div>
      </body></html>`;

      const win = window.open("", "_blank", "width=900,height=700");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 500);
    } catch (e) {
      setError("Failed to load questions for printing.");
    }
    setPrinting(false);
  };

  const score = questions.reduce((acc, q, i) => acc + (answers[i]?.toLowerCase() === q.answer?.toLowerCase() ? 1 : 0), 0);
  const percent = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const answered = Object.keys(answers).length;
  const currentQ = questions[currentIndex];

  // ── Setup ────────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        {showImport && <ImportPanel alocApiToken={alocApiToken} onClose={() => setShowImport(false)} />}

        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Exam Practice</h1>
              <p className="text-sm text-slate-500">JAMB/UTME & WAEC past questions</p>
            </div>
          </div>
          <div className="text-right">
            {dbCount !== null && (
              <p className="text-xs text-slate-400 mb-1">
                {dbCount > 0
                  ? <span className="text-emerald-600 font-medium">{dbCount.toLocaleString()} questions in database</span>
                  : <span className="text-amber-600">No local questions yet</span>}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="text-xs gap-1.5 border-emerald-200 text-emerald-600 hover:bg-emerald-50">
              <Download className="w-3.5 h-3.5" />{dbCount > 0 ? "Re-import Questions" : "Import All Questions"}
            </Button>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-700">Configure Your Practice Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Exam type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Exam Type</label>
              <div className="flex gap-3">
                {[{ value: "utme", label: "JAMB / UTME", color: "violet" }, { value: "wassce", label: "WAEC / WASSCE", color: "emerald" }].map(({ value, label, color }) => (
                  <button key={value} onClick={() => setExamType(value)}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all ${examType === value
                      ? color === "violet" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Subject</label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a subject..." /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Year <span className="text-slate-400 font-normal">(optional)</span></label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Any year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any year (mixed)</SelectItem>
                  {IMPORT_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Number of questions + time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">No. of Questions</label>
                <Select value={numQuestions} onValueChange={setNumQuestions}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 questions</SelectItem>
                    <SelectItem value="20">20 questions</SelectItem>
                    <SelectItem value="30">30 questions</SelectItem>
                    <SelectItem value="40">40 questions</SelectItem>
                    <SelectItem value="60">60 questions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Time per Question</label>
                <Select value={timePerQ} onValueChange={setTimePerQ}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="90">1.5 minutes</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-slate-400 -mt-2">
              Total time: {formatTime(parseInt(numQuestions) * parseInt(timePerQ))}
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <Button onClick={fetchQuestions} disabled={!subject} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-semibold">
                Start Practice ({numQuestions} Questions)
              </Button>
              <Button
                onClick={printPaper}
                disabled={!subject || printing}
                variant="outline"
                className="w-full h-10 gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {printing ? "Preparing..." : "Print Question Paper"}
              </Button>
              <p className="text-xs text-center text-slate-400">
                {dbCount > 0 ? "Serving questions from your local database" : "Questions served live from ALOC API · Import first for offline use"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Loading questions...</p>
          <p className="text-sm text-slate-400 mt-1">{dbCount > 0 ? "Fetching from local database" : "Fetching from ALOC API"}</p>
        </div>
      </div>
    );
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────────
  if (phase === "quiz" && currentQ) {
    const optionEntries = Object.entries(currentQ.option || {}).filter(([, v]) => v);
    const isLowTime = timeLeft <= 60;

    return (
      <div className="p-4 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={restart} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-all">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <Badge variant="outline" className="text-slate-600 border-slate-300 font-mono text-xs">
              {currentIndex + 1} / {questions.length}
            </Badge>
            <Badge variant="outline" className="text-slate-500 border-slate-200 text-xs capitalize hidden sm:flex">
              {examType === "utme" ? "JAMB/UTME" : "WAEC"} · {currentQ.subject}{currentQ.examyear ? ` · ${currentQ.examyear}` : ""}
            </Badge>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-mono font-semibold ${isLowTime ? "bg-red-50 text-red-600 border border-red-200 animate-pulse" : "bg-slate-100 text-slate-700"}`}>
            <Clock className="w-3.5 h-3.5" />{formatTime(timeLeft)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
        </div>

        {/* Question */}
        <Card className="border-slate-200 shadow-sm mb-4">
          <CardContent className="pt-5 pb-5">
            {currentQ.image && <img src={currentQ.image} alt="question" className="max-w-full rounded-lg mb-4 border border-slate-200" />}
            <p className="text-slate-800 font-medium leading-relaxed text-base">
              <span className="text-emerald-600 font-bold mr-2">{currentIndex + 1}.</span>
              <QText text={currentQ.question} />
            </p>
          </CardContent>
        </Card>

        {/* Options */}
        <div className="space-y-2.5 mb-6">
          {optionEntries.map(([key, value], idx) => {
            const isSelected = answers[currentIndex]?.toLowerCase() === key.toLowerCase();
            return (
              <button key={key} onClick={() => selectAnswer(key)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isSelected ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${isSelected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500"}`}>
                  {OPTION_LABELS[idx] || key.toUpperCase()}
                </span>
                <span className="flex-1 leading-relaxed"><QText text={value} /></span>
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Previous
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{answered}/{questions.length} answered</span>
            {currentIndex === questions.length - 1 ? (
              <Button onClick={submitQuiz} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                Submit <CheckCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Question grid */}
        <div className="mt-5 flex flex-wrap gap-1.5 justify-center">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentIndex(i)}
              className={`w-7 h-7 rounded-md text-xs font-semibold transition-all ${i === currentIndex ? "bg-emerald-600 text-white shadow-sm" : answers[i] !== undefined ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {i + 1}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-3">Progress is auto-saved</p>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────────
  if (phase === "results") {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        {/* Back button */}
        <button onClick={restart} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </button>

        <Card className={`border-2 mb-6 ${getScoreBg(percent)}`}>
          <CardContent className="pt-6 pb-6 text-center">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${getScoreColor(percent)}`} />
            <h2 className="text-3xl font-bold text-slate-800 mb-1">{score} / {questions.length}</h2>
            <p className={`text-5xl font-black mb-3 ${getScoreColor(percent)}`}>{percent}%</p>
            <p className="text-slate-600 text-sm">
              {percent >= 70 ? "Excellent work! Keep it up." : percent >= 50 ? "Good effort. Keep practising." : "Keep studying — you'll improve!"}
            </p>
            <div className="flex justify-center gap-4 mt-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle className="w-4 h-4" /> {score} correct</span>
              <span className="flex items-center gap-1 text-red-500"><XCircle className="w-4 h-4" /> {questions.length - score} wrong</span>
              <span className="flex items-center gap-1 text-slate-400"><AlertCircle className="w-4 h-4" /> {questions.length - answered} skipped</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 mb-6">
          <Button onClick={restart} variant="outline" className="flex-1 gap-2"><RotateCcw className="w-4 h-4" /> New Practice</Button>
          <Button onClick={() => setPhase("review")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><BookOpen className="w-4 h-4" /> Review Answers</Button>
        </div>
      </div>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setPhase("results")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Back to Results
          </button>
          <h2 className="text-lg font-bold text-slate-800">Answer Review</h2>
          <Badge className="bg-emerald-100 text-emerald-700 border-0">{score}/{questions.length}</Badge>
        </div>

        <div className="space-y-5">
          {questions.map((q, i) => {
            const userAns = answers[i];
            const correct = q.answer?.toLowerCase();
            const isCorrect = userAns?.toLowerCase() === correct;
            const optionEntries = Object.entries(q.option || {}).filter(([, v]) => v);

            return (
              <Card key={i} className={`border ${isCorrect ? "border-emerald-200" : "border-red-200"}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-2 mb-3">
                    {isCorrect
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                    <p className="text-sm text-slate-800 font-medium leading-snug">
                      <span className="text-emerald-600 font-bold mr-1">{i + 1}.</span>
                      <QText text={q.question} />
                    </p>
                  </div>

                  <div className="ml-6 space-y-1 mb-2">
                    {optionEntries.map(([key, value], idx) => {
                      const isAnswer = key.toLowerCase() === correct;
                      const isUserPick = userAns?.toLowerCase() === key.toLowerCase();
                      return (
                        <div key={key} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 ${isAnswer ? "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" : isUserPick && !isAnswer ? "bg-red-50 text-red-600 border border-red-200" : "text-slate-500"}`}>
                          <span className="font-bold">{OPTION_LABELS[idx] || key.toUpperCase()}.</span>
                          <span><QText text={value} /></span>
                          {isAnswer && <span className="ml-auto text-emerald-600">✓ Correct</span>}
                          {isUserPick && !isAnswer && <span className="ml-auto text-red-500">✗ Your answer</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* AI explanation for wrong answers */}
                  {!isCorrect && (
                    <div className="ml-6">
                      <AIExplanation
                        question={q.question}
                        options={q.option || {}}
                        correctAnswer={correct}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-6">
          <Button onClick={restart} variant="outline" className="w-full gap-2"><RotateCcw className="w-4 h-4" /> Start New Practice</Button>
        </div>
      </div>
    );
  }

  return null;
}
