/**
 * Library — Admin / Teacher view
 * Navigation: Pick class → pick subject → pick source → browse resources
 * Admins/teachers can Add, Edit and Delete resources at any level.
 */
import React, { useState, useEffect } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { createEntity } from "@/lib/createEntity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Search, BookOpen, ExternalLink, X, Pencil, Trash2,
  Loader2, Play, FileText, Globe, Save, Sparkles, Calculator,
  ChevronRight, GraduationCap, Folder, BookMarked, Award,
  Tv, Headphones,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AiTutor from "@/components/AiTutor";

const LibraryResource = createEntity("library_resources");

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECTS = [
  "Mathematics", "English Language", "Basic Science", "Basic Technology",
  "Social Studies", "Business Studies", "Civic Education", "Computer Studies",
  "Agricultural Science", "Home Economics", "French", "Christian Religious Studies",
  "Cultural & Creative Arts", "Physical & Health Education",
  "Biology", "Chemistry", "Physics", "Further Mathematics",
  "Economics", "Government", "Literature in English", "Geography",
  "Financial Accounting", "Commerce", "Computer Science", "History",
];
const GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];
const TYPES = [
  { value: "textbook", label: "Textbook",  icon: BookOpen },
  { value: "article",  label: "Article",   icon: Globe    },
  { value: "video",    label: "Video",     icon: Play     },
  { value: "pdf",      label: "PDF",       icon: FileText },
];

const GRADE_COLORS = {
  "JSS 1": { active: "bg-blue-600 text-white border-blue-600",     soft: "bg-blue-50 text-blue-700 border-blue-200" },
  "JSS 2": { active: "bg-indigo-600 text-white border-indigo-600", soft: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "JSS 3": { active: "bg-emerald-600 text-white border-emerald-600", soft: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "SSS 1": { active: "bg-emerald-600 text-white border-emerald-600", soft: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "SSS 2": { active: "bg-teal-600 text-white border-teal-600",     soft: "bg-teal-50 text-teal-700 border-teal-200" },
  "SSS 3": { active: "bg-cyan-600 text-white border-cyan-600",     soft: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};

const SUBJECT_COLORS = {
  "Mathematics":               "bg-blue-50   border-blue-200   text-blue-800",
  "English Language":          "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Basic Science":             "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Basic Technology":          "bg-cyan-50   border-cyan-200   text-cyan-800",
  "Social Studies":            "bg-yellow-50 border-yellow-200 text-yellow-800",
  "Business Studies":          "bg-amber-50  border-amber-200  text-amber-800",
  "Civic Education":           "bg-rose-50   border-rose-200   text-rose-800",
  "Computer Studies":          "bg-sky-50    border-sky-200    text-sky-800",
  "Agricultural Science":      "bg-lime-50   border-lime-200   text-lime-800",
  "Home Economics":            "bg-pink-50   border-pink-200   text-pink-800",
  "French":                    "bg-indigo-50 border-indigo-200 text-indigo-800",
  "Christian Religious Studies":"bg-orange-50 border-orange-200 text-orange-800",
  "Cultural & Creative Arts":  "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
  "Physical & Health Education":"bg-teal-50  border-teal-200   text-teal-800",
  "Biology":                   "bg-green-50  border-green-200  text-green-800",
  "Chemistry":                 "bg-orange-50 border-orange-200 text-orange-800",
  "Physics":                   "bg-indigo-50 border-indigo-200 text-indigo-800",
  "Further Mathematics":       "bg-blue-50   border-blue-200   text-blue-800",
  "Economics":                 "bg-amber-50  border-amber-200  text-amber-800",
  "Government":                "bg-red-50    border-red-200    text-red-800",
  "Literature in English":     "bg-emerald-50 border-emerald-200 text-emerald-800",
  "Geography":                 "bg-teal-50   border-teal-200   text-teal-800",
  "Financial Accounting":      "bg-green-50  border-green-200  text-green-800",
  "Commerce":                  "bg-yellow-50 border-yellow-200 text-yellow-800",
  "Computer Science":          "bg-sky-50    border-sky-200    text-sky-800",
  "History":                   "bg-stone-50  border-stone-200  text-stone-800",
};
const subjectColor = s => SUBJECT_COLORS[s] || "bg-slate-50 border-slate-200 text-slate-800";

const SUBJECT_BG = {
  "Mathematics":               "bg-blue-500",
  "English Language":          "bg-emerald-500",
  "Basic Science":             "bg-emerald-500",
  "Basic Technology":          "bg-cyan-500",
  "Social Studies":            "bg-yellow-500",
  "Business Studies":          "bg-amber-500",
  "Civic Education":           "bg-rose-500",
  "Computer Studies":          "bg-sky-500",
  "Agricultural Science":      "bg-lime-500",
  "Home Economics":            "bg-pink-500",
  "French":                    "bg-indigo-400",
  "Christian Religious Studies":"bg-orange-400",
  "Cultural & Creative Arts":  "bg-fuchsia-500",
  "Physical & Health Education":"bg-teal-400",
  "Biology":                   "bg-green-500",
  "Chemistry":                 "bg-orange-500",
  "Physics":                   "bg-indigo-500",
  "Further Mathematics":       "bg-blue-400",
  "Economics":                 "bg-amber-500",
  "Government":                "bg-red-500",
  "Literature in English":     "bg-emerald-500",
  "Geography":                 "bg-teal-500",
  "Financial Accounting":      "bg-green-400",
  "Commerce":                  "bg-yellow-500",
  "Computer Science":          "bg-sky-500",
  "History":                   "bg-stone-500",
};

const TYPE_ICON  = { textbook: BookOpen, article: Globe, video: Play, pdf: FileText };
const TYPE_LABEL = { textbook: "Textbook", article: "Article", video: "Video", pdf: "PDF" };

// ── Source detection ──────────────────────────────────────────────────────────
function getSource(url = "") {
  if (!url) return "Other Resources";
  if (url.includes("wolframalpha.com"))                         return "Wolfram Alpha";
  if (url.includes("classnotes.ng"))                            return "ClassNotes NG";
  if (url.includes("bbc.co.uk") || url.includes("bbc.com"))    return "BBC Bitesize";
  if (url.includes("khanacademy.org"))                          return "Khan Academy";
  if (url.includes("phet.colorado.edu"))                        return "PhET Simulations";
  if (url.includes("geogebra.org"))                             return "GeoGebra";
  if (url.includes("desmos.com"))                               return "Desmos";
  if (url.includes("passnownow.com"))                           return "PassNowNow";
  if (url.includes("myschool.ng"))                              return "MySchool NG";
  if (url.includes("prepclass.ng"))                             return "PrepClass NG";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("britannica.com"))                           return "Britannica";
  if (url.includes("sparknotes.com"))                           return "SparkNotes";
  if (url.includes("librivox.org"))                             return "LibriVox";
  if (url.includes("hyperphysics"))                             return "HyperPhysics";
  if (url.includes("chemguide.co.uk"))                          return "ChemGuide";
  if (url.includes("drive.google.com"))                         return "Google Drive";
  if (url.includes("ted.com"))                                  return "TED-Ed";
  return "Other Resources";
}

const SOURCE_CONFIG = {
  "Wolfram Alpha":    { icon: Calculator,    color: "bg-orange-50 border-orange-200 text-orange-900",   dot: "bg-orange-500",  desc: "Maths problem solver with step-by-step working"      },
  "ClassNotes NG":    { icon: BookOpen,      color: "bg-blue-50 border-blue-200 text-blue-900",          dot: "bg-blue-600",    desc: "Nigerian curriculum notes and study guides"           },
  "BBC Bitesize":     { icon: Tv,            color: "bg-red-50 border-red-200 text-red-900",             dot: "bg-red-500",     desc: "BBC's free revision guides and study materials"       },
  "Khan Academy":     { icon: GraduationCap, color: "bg-green-50 border-green-200 text-green-900",       dot: "bg-green-600",   desc: "Free world-class education for everyone"              },
  "PhET Simulations": { icon: Globe,         color: "bg-emerald-50 border-emerald-200 text-emerald-900",    dot: "bg-emerald-500",  desc: "Interactive science and maths simulations"            },
  "GeoGebra":         { icon: Calculator,    color: "bg-indigo-50 border-indigo-200 text-indigo-900",    dot: "bg-indigo-500",  desc: "Dynamic maths, geometry and graphing tools"           },
  "Desmos":           { icon: Calculator,    color: "bg-cyan-50 border-cyan-200 text-cyan-900",          dot: "bg-cyan-500",    desc: "Online graphing calculator and activities"            },
  "PassNowNow":       { icon: Award,         color: "bg-emerald-50 border-emerald-200 text-emerald-900", dot: "bg-emerald-500", desc: "WAEC/NECO past questions and practice tests"          },
  "MySchool NG":      { icon: BookMarked,    color: "bg-teal-50 border-teal-200 text-teal-900",          dot: "bg-teal-500",    desc: "Nigerian school resources and revision notes"         },
  "PrepClass NG":     { icon: Award,         color: "bg-lime-50 border-lime-200 text-lime-900",          dot: "bg-lime-600",    desc: "Exam preparation and past questions"                  },
  "YouTube":          { icon: Play,          color: "bg-rose-50 border-rose-200 text-rose-900",          dot: "bg-rose-500",    desc: "Video lessons — Crash Course, TED-Ed, Numberphile…"  },
  "Britannica":       { icon: Globe,         color: "bg-sky-50 border-sky-200 text-sky-900",             dot: "bg-sky-600",     desc: "Encyclopaedia Britannica — trusted references"        },
  "SparkNotes":       { icon: BookOpen,      color: "bg-yellow-50 border-yellow-200 text-yellow-900",    dot: "bg-yellow-500",  desc: "Literature summaries and study guides"                },
  "LibriVox":         { icon: Headphones,    color: "bg-stone-50 border-stone-200 text-stone-900",       dot: "bg-stone-500",   desc: "Free public domain audiobooks"                        },
  "HyperPhysics":     { icon: Globe,         color: "bg-emerald-50 border-emerald-200 text-emerald-900",    dot: "bg-emerald-500",  desc: "Physics concepts, equations and reference"            },
  "ChemGuide":        { icon: BookMarked,    color: "bg-amber-50 border-amber-200 text-amber-900",       dot: "bg-amber-500",   desc: "Comprehensive A-level chemistry guides"               },
  "Google Drive":     { icon: Folder,        color: "bg-slate-50 border-slate-200 text-slate-900",       dot: "bg-slate-500",   desc: "School-uploaded documents and PDFs"                   },
  "TED-Ed":           { icon: Play,          color: "bg-red-50 border-red-100 text-red-900",             dot: "bg-red-400",     desc: "Short animated TED educational videos"                },
  "Other Resources":  { icon: Globe,         color: "bg-slate-50 border-slate-200 text-slate-800",       dot: "bg-slate-400",   desc: "Additional learning materials"                        },
};

// ── Source card ───────────────────────────────────────────────────────────────
function SourceCard({ source, count, onClick }) {
  const cfg  = SOURCE_CONFIG[source] || SOURCE_CONFIG["Other Resources"];
  const Icon = cfg.icon;
  return (
    <div onClick={onClick}
      className={`rounded-2xl border-2 p-4 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col gap-3 ${cfg.color}`}>
      <div className={`w-10 h-10 rounded-xl ${cfg.dot} flex items-center justify-center shadow-sm flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="font-bold text-sm leading-snug">{source}</p>
        <p className="text-[11px] opacity-70 mt-0.5 leading-tight line-clamp-2">{cfg.desc}</p>
        <p className="text-xs opacity-50 mt-1.5 font-medium">{count} resource{count !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex items-center justify-end">
        <ChevronRight className="w-4 h-4 opacity-40" />
      </div>
    </div>
  );
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function getIframeSrc(url = "") {
  const pl = url.match(/youtube\.com\/playlist\?list=([^&\s]+)/);
  if (pl) return `https://www.youtube.com/embed/videoseries?list=${pl[1]}`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}
function detectType(url = "") {
  if (/youtube\.com|youtu\.be/.test(url)) return "video";
  if (/khanacademy\.org/.test(url))       return "article";
  if (/\.pdf$|drive\.google\.com/.test(url)) return "pdf";
  return "textbook";
}

// ── Wolfram Alpha Maths Solver ────────────────────────────────────────────────
const WOLFRAM_MATHS_EXAMPLES = [
  "solve x² - 5x + 6 = 0",
  "expand (a + b)³",
  "simplify (x² - 9) / (x - 3)",
  "solve system: 2x + y = 5, x - y = 1",
  "LCM of 36 and 48",
  "HCF of 84 and 120",
  "prime factors of 360",
  "area of circle radius 7 cm",
  "volume of sphere radius 5 cm",
  "Pythagoras: a=3, b=4, find c",
  "plot y = x² - 4x + 3",
  "plot y = sin(x) from 0 to 2π",
  "derivative of x³ + 2x² - 3x",
  "integrate 3x² + 2x dx",
  "mean of 4, 7, 13, 2, 8",
  "standard deviation of 2, 4, 4, 4, 5, 5, 7, 9",
];

function WolframPanel({ onClose }) {
  const [query, setQuery] = useState("");
  function openWolfram(q = query) {
    const t = (q || query).trim();
    if (!t) return;
    window.open(`https://www.wolframalpha.com/input?i=${encodeURIComponent(t)}`, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)" }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Calculator className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm">Wolfram Alpha — Maths Solver</p>
            <p className="text-xs text-slate-400">Type any maths problem and get a step-by-step answer</p>
          </div>
        </div>
        <a href="https://www.wolframalpha.com" target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors flex-shrink-0">
          <ExternalLink className="w-3.5 h-3.5" /> Open site
        </a>
      </div>
      <div className="flex-1 overflow-auto flex flex-col items-center px-6 py-10 gap-8">
        <div className="text-center max-w-lg">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles className="w-6 h-6 text-orange-400" />
            <h2 className="text-2xl font-bold text-white">Maths Problem Solver</h2>
            <Sparkles className="w-6 h-6 text-orange-400" />
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            Type any maths question — equations, algebra, geometry, calculus, statistics.
            Wolfram Alpha will solve it and show you <strong className="text-white">step-by-step working</strong>.
          </p>
        </div>
        <div className="w-full max-w-xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Calculator className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text" value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && openWolfram()}
                placeholder="e.g. solve x² - 5x + 6 = 0"
                autoFocus
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <button onClick={() => openWolfram()} disabled={!query.trim()}
              className="h-12 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center gap-2 flex-shrink-0">
              <Sparkles className="w-4 h-4" /> Solve
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">Press Enter or click Solve — answer opens in a new tab with full working shown</p>
        </div>
        <div className="w-full max-w-xl space-y-4">
          {[
            { label:"Algebra",    items: WOLFRAM_MATHS_EXAMPLES.slice(0, 4)  },
            { label:"Numbers",    items: WOLFRAM_MATHS_EXAMPLES.slice(4, 7)  },
            { label:"Geometry",   items: WOLFRAM_MATHS_EXAMPLES.slice(7, 10) },
            { label:"Graphs",     items: WOLFRAM_MATHS_EXAMPLES.slice(10, 12)},
            { label:"Calculus",   items: WOLFRAM_MATHS_EXAMPLES.slice(12, 14)},
            { label:"Statistics", items: WOLFRAM_MATHS_EXAMPLES.slice(14)    },
          ].map(({ label, items }) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
              <div className="flex flex-wrap gap-2">
                {items.map(ex => (
                  <button key={ex} onClick={() => { setQuery(ex); openWolfram(ex); }}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-orange-500/30 border border-white/10 hover:border-orange-400/50 text-white text-xs transition-all hover:scale-105">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Resource Reader ───────────────────────────────────────────────────────────
function ResourceReader({ resource, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  // Wolfram Alpha cannot be embedded — always show the solver panel instead
  if (resource.url?.includes("wolframalpha.com")) {
    return <WolframPanel onClose={onClose} />;
  }

  const src = getIframeSrc(resource.url);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{resource.title}</p>
          {resource.subject && (
            <p className="text-xs text-slate-400">{resource.subject} · {resource.grade}</p>
          )}
        </div>
        <a href={resource.url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> Open in browser
        </a>
      </div>
      <div className="flex-1 relative bg-white">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-sm text-slate-400">Loading content…</p>
            </div>
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white">
            <BookOpen className="w-14 h-14 text-slate-300" />
            <p className="text-slate-400 text-sm">Could not load content inline.</p>
            <a href={resource.url} target="_blank" rel="noreferrer">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <ExternalLink className="w-4 h-4" /> Open in browser
              </Button>
            </a>
          </div>
        ) : (
          <iframe
            key={src}
            src={src}
            title={resource.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Add / Edit form ───────────────────────────────────────────────────────────
const EMPTY = { title: "", subject: "Mathematics", grade: "All", url: "", resource_type: "textbook", description: "" };

function ResourceForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleUrlChange(v) {
    set("url", v);
    set("resource_type", detectType(v));
  }

  async function save() {
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (!form.url.trim())   { setErr("URL is required.");   return; }
    setSaving(true); setErr(null);
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message || "Failed to save."); }
    setSaving(false);
  }

  const ALL_GRADES = ["All", ...GRADES];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
          <h2 className="font-semibold text-slate-900">{initial ? "Edit Resource" : "Add Resource"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Title *</label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. CK-12 Biology" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">URL *</label>
            <Input value={form.url} onChange={e => handleUrlChange(e.target.value)}
              placeholder="https://www.ck12.org/book/ck-12-biology/" />
            <p className="text-xs text-slate-400 mt-1">Paste any URL — CK-12, Khan Academy, YouTube, Google Drive PDF, etc.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
              <select value={form.subject} onChange={e => set("subject", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Grade</label>
              <select value={form.grade} onChange={e => set("grade", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {ALL_GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => set("resource_type", t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.resource_type === t.value
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                  }`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {initial ? "Save Changes" : "Add Resource"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Library() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [resources,       setResources]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = usePersistentState("library_search", "");
  const [selectedGrade,   setSelectedGrade]   = usePersistentState("library_grade", null);
  const [selectedSubject, setSelectedSubject] = usePersistentState("library_subject", null);
  const [selectedSource,  setSelectedSource]  = usePersistentState("library_source", null);
  const [showForm,        setShowForm]        = useState(false);
  const [editing,         setEditing]         = useState(null);
  const [reading,         setReading]         = useState(null);
  const [deletingResource, setDeletingResource] = useState(null);
  const [selectedType,    setSelectedType]    = usePersistentState("library_type", "all");
  const [showAiTutor,     setShowAiTutor]     = useState(false);
  const [showWolfram,     setShowWolfram]     = useState(false);

  const load = async () => {
    setLoading(true);
    try { setResources(await LibraryResource.list("title")); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Derived data at each drill-down level ──────────────────────────────────
  // Resources that match the selected grade (grade "All" appears in every class)
  const gradeResources = selectedGrade
    ? resources.filter(r => r.grade === selectedGrade || r.grade === "All")
    : [];

  // Unique subjects available for the selected grade
  const subjectList = Array.from(
    new Set(gradeResources.map(r => r.subject).filter(Boolean))
  ).sort();

  // Resources for the selected subject within the selected grade
  const subjectResources = selectedSubject
    ? gradeResources.filter(r => r.subject === selectedSubject)
    : [];

  // Unique sources for those resources
  const sourceList = Array.from(
    new Set(subjectResources.map(r => getSource(r.url)))
  ).filter(s => s !== "Wolfram Alpha").sort();

  // Final visible resources (filtered by source + optional search)
  const sourceResources = selectedSource
    ? subjectResources.filter(r => getSource(r.url) === selectedSource)
    : [];

  const typeFiltered = selectedType === "all"
    ? sourceResources
    : sourceResources.filter(r => (r.resource_type || "textbook") === selectedType);
  const visible = search
    ? typeFiltered.filter(r =>
        r.title?.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase())
      )
    : typeFiltered;

  // ── Breadcrumb helpers ─────────────────────────────────────────────────────
  const crumbLevel = !selectedGrade ? 0 : !selectedSubject ? 1 : !selectedSource ? 2 : 3;

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function handleSave(data) {
    if (editing) {
      await LibraryResource.update(editing.id, data);
      toast({ title: "Resource updated" });
    } else {
      await LibraryResource.create(data);
      toast({ title: "Resource added" });
    }
    load();
  }

  async function confirmDelete() {
    if (!deletingResource) return;
    await LibraryResource.delete(deletingResource.id);
    toast({ title: "Resource deleted" });
    setDeletingResource(null);
    load();
  }

  // ── Grade selection helpers ────────────────────────────────────────────────
  function handleGradeSelect(g) {
    setSelectedGrade(g);
    setSelectedSubject(null);
    setSelectedSource(null);
    setSearch("");
    setSelectedType("all");
  }
  function handleSubjectSelect(s) {
    setSelectedSubject(s);
    setSelectedSource(null);
    setSearch("");
    setSelectedType("all");
  }
  function handleSourceSelect(src) {
    setSelectedSource(src);
    setSearch("");
    setSelectedType("all");
  }

  // Count helpers for cards
  const countForSubject = s => gradeResources.filter(r => r.subject === s).length;
  const countForSource  = src => subjectResources.filter(r => getSource(r.url) === src).length;

  return (
    <div className="p-6 md:p-8">
      <Toaster />

      <AlertDialog open={!!deletingResource} onOpenChange={(open) => { if (!open) setDeletingResource(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingResource?.title}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">Library</h1>
            <p className="text-slate-600">Learning resources for students — textbooks, videos and articles</p>
          </div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}
            className="w-full lg:w-auto bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
            <Plus className="w-4 h-4 mr-2" /> Add Resource
          </Button>
        </div>

        {/* ── Breadcrumb ── */}
        {crumbLevel > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setSelectedGrade(null); setSelectedSubject(null); setSelectedSource(null); setSearch(""); }}
              className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" /> All Classes
            </button>
            {selectedGrade && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <button
                  onClick={() => { setSelectedSubject(null); setSelectedSource(null); setSearch(""); }}
                  className={`text-sm font-semibold transition-colors ${crumbLevel === 1 ? "text-slate-700" : "text-emerald-600 hover:text-emerald-800"}`}>
                  {selectedGrade}
                </button>
              </>
            )}
            {selectedSubject && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <button
                  onClick={() => { setSelectedSource(null); setSearch(""); }}
                  className={`text-sm font-semibold transition-colors ${crumbLevel === 2 ? "text-slate-700" : "text-emerald-600 hover:text-emerald-800"}`}>
                  {selectedSubject}
                </button>
              </>
            )}
            {selectedSource && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">
                  {selectedSource} · {visible.length} resource{visible.length !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array(12).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-200 rounded-2xl h-24" />
            ))}
          </div>
        )}

        {/* ── Level 0: Grade picker ── */}
        {!loading && !selectedGrade && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Select a class to browse resources</p>
            {/* AI Tutor + Wolfram Alpha cards */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setShowAiTutor(true)}
                className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-indigo-50 p-4 cursor-pointer hover:shadow-lg hover:border-emerald-400 transition-all duration-200 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-emerald-900 text-base">AI Tutor</p>
                  <p className="text-sm text-emerald-700 opacity-80">Ask any question, get a direct answer with step-by-step solution</p>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              </div>
              <div
                onClick={() => setShowWolfram(true)}
                className="rounded-2xl border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 cursor-pointer hover:shadow-lg hover:border-orange-400 transition-all duration-200 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md flex-shrink-0">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-orange-900 text-base">Wolfram Alpha</p>
                  <p className="text-sm text-orange-700 opacity-80">Maths solver with step-by-step working</p>
                </div>
                <ChevronRight className="w-5 h-5 text-orange-400 flex-shrink-0" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {GRADES.map(g => {
                const gc = GRADE_COLORS[g] || {};
                const cnt = resources.filter(r => r.grade === g || r.grade === "All").length;
                return (
                  <button key={g} onClick={() => handleGradeSelect(g)}
                    className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-2 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-200 ${gc.soft}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${gc.active}`}>
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-sm leading-tight">{g}</p>
                    <p className="text-[11px] opacity-60">{cnt} resource{cnt !== 1 ? "s" : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Level 1: Subject picker ── */}
        {!loading && selectedGrade && !selectedSubject && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              {selectedGrade} — choose a subject
            </p>
            {subjectList.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p>No resources added for {selectedGrade} yet.</p>
                <button onClick={() => { setEditing(null); setShowForm(true); }}
                  className="mt-3 text-emerald-600 text-sm font-medium hover:underline">
                  + Add the first resource
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {subjectList.map(s => {
                  const cnt = countForSubject(s);
                  const bg  = SUBJECT_BG[s] || "bg-slate-500";
                  const card = subjectColor(s);
                  return (
                    <div key={s} onClick={() => handleSubjectSelect(s)}
                      className={`rounded-2xl border-2 p-4 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col gap-2 ${card}`}>
                      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <BookOpen className="w-4 h-4 text-white" />
                      </div>
                      <p className="font-bold text-sm leading-snug">{s}</p>
                      <p className="text-[11px] opacity-60">{cnt} resource{cnt !== 1 ? "s" : ""}</p>
                      <div className="flex justify-end mt-auto">
                        <ChevronRight className="w-4 h-4 opacity-40" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Level 2: Source folder picker ── */}
        {!loading && selectedGrade && selectedSubject && !selectedSource && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              {selectedSubject} — choose a source
            </p>
            {sourceList.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Folder className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p>No resources found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sourceList.map(src => (
                  <SourceCard
                    key={src}
                    source={src}
                    count={countForSource(src)}
                    onClick={() => handleSourceSelect(src)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Level 3: Resource cards ── */}
        {!loading && selectedGrade && selectedSubject && selectedSource && (
          <div className="space-y-4">
            {/* Search + type filter row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search resources…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-white"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 self-start flex-wrap">
                {[{ value: "all", label: "All" }, ...TYPES].map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setSelectedType(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedType === t.value
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p>{search ? "No resources match your search." : "No resources in this folder."}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {visible.map(r => {
                  const TypeIcon = TYPE_ICON[r.resource_type] || BookOpen;
                  const card = subjectColor(r.subject);
                  return (
                    <div key={r.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden">
                      {/* Colour header */}
                      <div className={`px-4 pt-4 pb-3 flex items-start gap-3 ${card} rounded-t-2xl`}>
                        <div className="w-9 h-9 bg-white/60 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight line-clamp-2">{r.title}</p>
                          <p className="text-xs opacity-60 mt-0.5">{r.grade}</p>
                        </div>
                      </div>
                      {/* Body */}
                      <div className="px-4 py-3 flex-1">
                        {r.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{r.description}</p>
                        )}
                        <span className="inline-flex items-center gap-1 mt-2 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          <TypeIcon className="w-3 h-3" /> {TYPE_LABEL[r.resource_type] || "Resource"}
                        </span>
                      </div>
                      {/* Footer */}
                      <div className="px-4 pb-4 flex items-center gap-2">
                        <Button size="sm" onClick={() => setReading(r)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Open
                        </Button>
                        <button onClick={() => { setEditing(r); setShowForm(true); }}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
                          title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeletingResource(r)}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-500 transition-colors"
                          title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showForm && (
        <ResourceForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {reading && (
        <ResourceReader resource={reading} onClose={() => setReading(null)} />
      )}

      {/* AI Tutor overlay */}
      {showAiTutor && (
        <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
          <AiTutor onClose={() => setShowAiTutor(false)} />
        </div>
      )}

      {/* Wolfram Alpha overlay */}
      {showWolfram && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <WolframPanel onClose={() => setShowWolfram(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
