/**
 * StudentLibrary — student view
 * Flow: Pick class → see subject cards → pick subject → see resources
 */
import React, { useState, useEffect } from "react";
import { createEntity } from "@/lib/createEntity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, ExternalLink, X, Search, Play, FileText, Globe,
  Loader2, GraduationCap, ArrowLeft, ChevronRight, Sparkles, Calculator,
  Tv, Headphones, Folder, Award, BookMarked,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Student } from "@/entities/Student";
import AiTutor from "@/components/AiTutor";

const LibraryResource = createEntity("library_resources");

const GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

const GRADE_COLORS = {
  "JSS 1": { active: "bg-blue-600 text-white border-blue-600",     soft: "bg-blue-50 text-blue-700 border-blue-300" },
  "JSS 2": { active: "bg-indigo-600 text-white border-indigo-600", soft: "bg-indigo-50 text-indigo-700 border-indigo-300" },
  "JSS 3": { active: "bg-emerald-600 text-white border-emerald-600", soft: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  "SSS 1": { active: "bg-emerald-600 text-white border-emerald-600", soft: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  "SSS 2": { active: "bg-teal-600 text-white border-teal-600",     soft: "bg-teal-50 text-teal-700 border-teal-300" },
  "SSS 3": { active: "bg-cyan-600 text-white border-cyan-600",     soft: "bg-cyan-50 text-cyan-700 border-cyan-300" },
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
  if (!url) return "Other";
  if (url.includes("wolframalpha.com"))                        return "Wolfram Alpha";
  if (url.includes("classnotes.ng"))                           return "ClassNotes NG";
  if (url.includes("bbc.co.uk") || url.includes("bbc.com"))   return "BBC Bitesize";
  if (url.includes("khanacademy.org"))                         return "Khan Academy";
  if (url.includes("phet.colorado.edu"))                       return "PhET Simulations";
  if (url.includes("geogebra.org"))                            return "GeoGebra";
  if (url.includes("desmos.com"))                              return "Desmos";
  if (url.includes("passnownow.com"))                          return "PassNowNow";
  if (url.includes("myschool.ng"))                             return "MySchool NG";
  if (url.includes("prepclass.ng"))                            return "PrepClass NG";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("britannica.com"))                          return "Britannica";
  if (url.includes("sparknotes.com"))                          return "SparkNotes";
  if (url.includes("librivox.org"))                            return "LibriVox";
  if (url.includes("hyperphysics"))                            return "HyperPhysics";
  if (url.includes("chemguide.co.uk"))                         return "ChemGuide";
  if (url.includes("drive.google.com"))                        return "Google Drive";
  if (url.includes("ted.com"))                                 return "TED-Ed";
  if (url.includes("wolframalpha.com"))                        return "Wolfram Alpha";
  return "Other Resources";
}

const SOURCE_CONFIG = {
  "Wolfram Alpha":    { icon: Calculator,    color: "bg-orange-50 border-orange-200 text-orange-900",    dot: "bg-orange-500",  desc: "Maths problem solver with step-by-step working"       },
  "ClassNotes NG":    { icon: BookOpen,      color: "bg-blue-50 border-blue-200 text-blue-900",           dot: "bg-blue-600",    desc: "Nigerian curriculum notes and study guides"            },
  "BBC Bitesize":     { icon: Tv,            color: "bg-red-50 border-red-200 text-red-900",              dot: "bg-red-500",     desc: "BBC's free revision guides and study materials"        },
  "Khan Academy":     { icon: GraduationCap, color: "bg-green-50 border-green-200 text-green-900",        dot: "bg-green-600",   desc: "Free world-class education for everyone"               },
  "PhET Simulations": { icon: Globe,         color: "bg-emerald-50 border-emerald-200 text-emerald-900",     dot: "bg-emerald-500",  desc: "Interactive science and maths simulations"             },
  "GeoGebra":         { icon: Calculator,    color: "bg-indigo-50 border-indigo-200 text-indigo-900",     dot: "bg-indigo-500",  desc: "Dynamic maths, geometry and graphing tools"            },
  "Desmos":           { icon: Calculator,    color: "bg-cyan-50 border-cyan-200 text-cyan-900",           dot: "bg-cyan-500",    desc: "Online graphing calculator and activities"             },
  "PassNowNow":       { icon: Award,         color: "bg-emerald-50 border-emerald-200 text-emerald-900",  dot: "bg-emerald-500", desc: "WAEC/NECO past questions and practice tests"           },
  "MySchool NG":      { icon: BookMarked,    color: "bg-teal-50 border-teal-200 text-teal-900",           dot: "bg-teal-500",    desc: "Nigerian school resources and revision notes"          },
  "PrepClass NG":     { icon: Award,         color: "bg-lime-50 border-lime-200 text-lime-900",           dot: "bg-lime-600",    desc: "Exam preparation and past questions"                   },
  "YouTube":          { icon: Play,          color: "bg-rose-50 border-rose-200 text-rose-900",           dot: "bg-rose-500",    desc: "Video lessons — Crash Course, TED-Ed, Numberphile…"   },
  "Britannica":       { icon: Globe,         color: "bg-sky-50 border-sky-200 text-sky-900",              dot: "bg-sky-600",     desc: "Encyclopaedia Britannica — trusted references"         },
  "SparkNotes":       { icon: BookOpen,      color: "bg-yellow-50 border-yellow-200 text-yellow-900",     dot: "bg-yellow-500",  desc: "Literature summaries and study guides"                 },
  "LibriVox":         { icon: Headphones,    color: "bg-stone-50 border-stone-200 text-stone-900",        dot: "bg-stone-500",   desc: "Free public domain audiobooks"                         },
  "HyperPhysics":     { icon: Globe,         color: "bg-emerald-50 border-emerald-200 text-emerald-900",     dot: "bg-emerald-500",  desc: "Physics concepts, equations and reference"             },
  "ChemGuide":        { icon: BookMarked,    color: "bg-amber-50 border-amber-200 text-amber-900",        dot: "bg-amber-500",   desc: "Comprehensive A-level chemistry guides"                },
  "Google Drive":     { icon: Folder,        color: "bg-slate-50 border-slate-200 text-slate-900",        dot: "bg-slate-500",   desc: "School-uploaded documents and PDFs"                    },
  "TED-Ed":           { icon: Play,          color: "bg-red-50 border-red-100 text-red-900",              dot: "bg-red-400",     desc: "Short animated TED educational videos"                 },
  "Other Resources":  { icon: Globe,         color: "bg-slate-50 border-slate-200 text-slate-800",        dot: "bg-slate-400",   desc: "Additional learning materials"                         },
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

function getIframeSrc(url = "") {
  const pl = url.match(/youtube\.com\/playlist\?list=([^&\s]+)/);
  if (pl) return `https://www.youtube.com/embed/videoseries?list=${pl[1]}`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

// ── Wolfram Alpha Maths examples ──────────────────────────────────────────────
const WOLFRAM_MATHS_EXAMPLES = [
  // Algebra
  "solve x² - 5x + 6 = 0",
  "expand (a + b)³",
  "simplify (x² - 9) / (x - 3)",
  "solve system: 2x + y = 5, x - y = 1",
  // Numbers
  "LCM of 36 and 48",
  "HCF of 84 and 120",
  "prime factors of 360",
  // Geometry
  "area of circle radius 7 cm",
  "volume of sphere radius 5 cm",
  "Pythagoras: a=3, b=4, find c",
  // Graphs
  "plot y = x² - 4x + 3",
  "plot y = sin(x) from 0 to 2π",
  // Calculus (SSS)
  "derivative of x³ + 2x² - 3x",
  "integrate 3x² + 2x dx",
  // Statistics
  "mean of 4, 7, 13, 2, 8",
  "standard deviation of 2, 4, 4, 4, 5, 5, 7, 9",
];

// ── Wolfram Alpha Panel (Maths Solver) ────────────────────────────────────────
function WolframPanel({ onClose }) {
  const [query, setQuery] = useState("");

  function openWolfram(q = query) {
    const trimmed = (q || query).trim();
    if (!trimmed) return;
    window.open(
      `https://www.wolframalpha.com/input?i=${encodeURIComponent(trimmed)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Calculator className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm">Wolfram Alpha — Maths Solver</p>
            <p className="text-xs text-slate-400">Type any maths problem and get a step-by-step answer</p>
          </div>
        </div>
        <a
          href="https://www.wolframalpha.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors text-white flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open site
        </a>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto flex flex-col items-center px-6 py-10 gap-8">

        {/* Hero */}
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

        {/* Search bar */}
        <div className="w-full max-w-xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Calculator className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && openWolfram()}
                placeholder="e.g. solve x² - 5x + 6 = 0"
                autoFocus
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => openWolfram()}
              disabled={!query.trim()}
              className="h-12 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center gap-2 flex-shrink-0"
            >
              <Sparkles className="w-4 h-4" /> Solve
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Press Enter or click Solve — answer opens in a new tab with full working shown
          </p>
        </div>

        {/* Example chips grouped by topic */}
        <div className="w-full max-w-xl space-y-4">
          {[
            { label: "Algebra",    items: WOLFRAM_MATHS_EXAMPLES.slice(0, 4)  },
            { label: "Numbers",    items: WOLFRAM_MATHS_EXAMPLES.slice(4, 7)  },
            { label: "Geometry",   items: WOLFRAM_MATHS_EXAMPLES.slice(7, 10) },
            { label: "Graphs",     items: WOLFRAM_MATHS_EXAMPLES.slice(10, 12)},
            { label: "Calculus",   items: WOLFRAM_MATHS_EXAMPLES.slice(12, 14)},
            { label: "Statistics", items: WOLFRAM_MATHS_EXAMPLES.slice(14)    },
          ].map(({ label, items }) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
              <div className="flex flex-wrap gap-2">
                {items.map(ex => (
                  <button
                    key={ex}
                    onClick={() => { setQuery(ex); openWolfram(ex); }}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-orange-500/30 border border-white/10 hover:border-orange-400/50 text-white text-xs transition-all duration-150 hover:scale-105"
                  >
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

// ── Inline Reader ─────────────────────────────────────────────────────────────
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
          <iframe key={src} src={src} title={resource.title}
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

// ── Subject card ──────────────────────────────────────────────────────────────
function SubjectCard({ subject, count, onClick }) {
  const colorClass = subjectColor(subject);
  const dotClass = SUBJECT_BG[subject] || "bg-slate-400";
  return (
    <div onClick={onClick}
      className={`rounded-2xl border-2 p-4 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col gap-3 ${colorClass}`}>
      <div className={`w-10 h-10 rounded-xl ${dotClass} flex items-center justify-center shadow-sm flex-shrink-0`}>
        <BookOpen className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="font-bold text-sm leading-snug">{subject}</p>
        <p className="text-xs opacity-60 mt-1">{count} resource{count !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex items-center justify-end">
        <ChevronRight className="w-4 h-4 opacity-40" />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StudentLibrary() {
  const { user: authUser } = useAuth();
  const [studentGrade,  setStudentGrade]  = useState(null);
  const [selectedGrade,   setSelectedGrade]   = useState("JSS 1");
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedSource,  setSelectedSource]  = useState(null);
  const [showAiTutor,     setShowAiTutor]     = useState(false);
  const [showWolfram,     setShowWolfram]     = useState(false);
  const [resources,       setResources]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState("");
  const [reading,         setReading]         = useState(null);
  const [selectedType,    setSelectedType]    = useState("all");

  useEffect(() => {
    const id = authUser?.linked_student_id;
    if (id && id !== "0000" && id.length > 4) {
      Student.get(id).then(s => {
        const g = s?.grade || null;
        setStudentGrade(g);
        if (g) setSelectedGrade(g);
      }).catch(() => {});
    }
  }, [authUser?.linked_student_id]);

  useEffect(() => {
    LibraryResource.list("title")
      .then(setResources)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleGradeSelect(g) {
    if (studentGrade && g !== studentGrade) return;
    setSelectedGrade(g);
    setSelectedSubject(null);
    setSelectedSource(null);
    setSearch("");
    setSelectedType("all");
  }
  function handleSourceSelect(src) {
    setSelectedSource(src);
    setSearch("");
    setSelectedType("all");
  }

  const lockedGrade = studentGrade || selectedGrade;

  // Resources for the selected class
  const classResources = resources.filter(
    r => r.grade === "All" || r.grade === lockedGrade
  );

  // Unique subjects for this class, sorted
  const subjectList = Array.from(
    new Set(classResources.map(r => r.subject).filter(Boolean))
  ).sort();

  // Resources for the selected subject
  const subjectResources = selectedSubject
    ? classResources.filter(r => r.subject === selectedSubject)
    : [];

  // Unique sources for this subject, sorted
  const sourceList = Array.from(
    new Set(subjectResources.map(r => getSource(r.url)))
  ).filter(s => s !== "Wolfram Alpha").sort();

  // Resources for the selected source
  const sourceResources = selectedSource
    ? subjectResources.filter(r => getSource(r.url) === selectedSource)
    : [];

  // Final visible list — filtered by type then search
  const typeFiltered = selectedType === "all"
    ? sourceResources
    : sourceResources.filter(r => (r.resource_type || "textbook") === selectedType);
  const visible = search
    ? typeFiltered.filter(r =>
        r.title?.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase())
      )
    : typeFiltered;

  const gradeColors = GRADE_COLORS[lockedGrade] || GRADE_COLORS["JSS 1"];

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="max-w-screen-2xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-0.5">Library</h1>
          <p className="text-slate-500 text-sm">
            {studentGrade
              ? "Browse your class library by subject and source"
              : "Pick your class → subject → source to find resources"}
          </p>
        </div>

        {/* ── Class selector (always visible) ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {studentGrade ? "Your Class" : "Select Class"}
            </span>
          </div>

          {studentGrade ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold border-2 ${gradeColors.active}`}>
                {lockedGrade}
              </span>
              <span className="text-xs text-slate-400">Only resources for your class are shown here.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1.5 ml-0.5">Junior Secondary</p>
                <div className="flex flex-wrap gap-2">
                  {GRADES.filter(g => g.startsWith("JSS")).map(g => {
                    const colors = GRADE_COLORS[g];
                    return (
                      <button key={g} onClick={() => handleGradeSelect(g)}
                        className={`relative px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all duration-150 hover:shadow-sm ${
                          lockedGrade === g ? colors.active : colors.soft
                        }`}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1.5 ml-0.5">Senior Secondary</p>
                <div className="flex flex-wrap gap-2">
                  {GRADES.filter(g => g.startsWith("SSS")).map(g => {
                    const colors = GRADE_COLORS[g];
                    return (
                      <button key={g} onClick={() => handleGradeSelect(g)}
                        className={`relative px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all duration-150 hover:shadow-sm ${
                          lockedGrade === g ? colors.active : colors.soft
                        }`}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Breadcrumb ── */}
        {selectedSubject && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {/* ← Class pill */}
            <button
              onClick={() => { setSelectedSubject(null); setSelectedSource(null); setSearch(""); }}
              className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${gradeColors.soft}`}>{lockedGrade}</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            {selectedSource ? (
              /* Class › Subject (clickable) › Source · count */
              <>
                <button
                  onClick={() => { setSelectedSource(null); setSearch(""); }}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                >
                  {selectedSubject}
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-sm font-bold text-slate-800">{selectedSource}</span>
                <span className="text-xs text-slate-400 ml-1">
                  · {sourceResources.length} resource{sourceResources.length !== 1 ? "s" : ""}
                </span>
              </>
            ) : (
              /* Class › Subject · N sources */
              <>
                <span className="text-sm font-bold text-slate-800">{selectedSubject}</span>
                <span className="text-xs text-slate-400 ml-1">
                  · {sourceList.length} source{sourceList.length !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── LOADING skeleton ── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array(10).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-200 rounded-2xl h-36" />
            ))}
          </div>

        /* ── LEVEL 1: SUBJECT GRID ── */
        ) : !selectedSubject ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${gradeColors.soft}`}>{lockedGrade}</span>
              <span className="text-xs text-slate-400">{subjectList.length} subject{subjectList.length !== 1 ? "s" : ""} · {classResources.length} total resources</span>
            </div>
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
            {subjectList.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">No resources for {lockedGrade} yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {subjectList.map(subject => (
                  <SubjectCard
                    key={subject}
                    subject={subject}
                    count={classResources.filter(r => r.subject === subject).length}
                    onClick={() => { setSelectedSubject(subject); setSelectedSource(null); setSearch(""); }}
                  />
                ))}
              </div>
            )}
          </>

        /* ── LEVEL 2: SOURCE GRID ── */
        ) : !selectedSource ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500 font-medium">Choose a source to learn from:</span>
            </div>
            {sourceList.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">No resources for {selectedSubject} yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {sourceList.map(source => (
                  <SourceCard
                    key={source}
                    source={source}
                    count={subjectResources.filter(r => getSource(r.url) === source).length}
                    onClick={() => handleSourceSelect(source)}
                  />
                ))}
              </div>
            )}
          </>

        /* ── LEVEL 3: RESOURCE GRID ── */
        ) : (
          <>
            {/* Search + type filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder={`Search ${selectedSource}…`} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-white" />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 self-start flex-wrap">
                {[
                  { value: "all",      label: "All"      },
                  { value: "textbook", label: "Textbook" },
                  { value: "article",  label: "Article"  },
                  { value: "video",    label: "Video"    },
                  { value: "pdf",      label: "PDF"      },
                ].map(t => (
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
              <div className="text-center py-20">
                <BookOpen className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">No resources found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {visible.map(r => {
                  const TypeIcon = TYPE_ICON[r.resource_type] || BookOpen;
                  const colorClass = subjectColor(r.subject);
                  return (
                    <div key={r.id}
                      className={`rounded-xl border p-3 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${colorClass}`}
                      onClick={() => setReading(r)}>
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 bg-white/70 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs leading-snug line-clamp-2">{r.title}</p>
                          <span className="text-[10px] opacity-60 mt-0.5 inline-block">
                            {TYPE_LABEL[r.resource_type] || "Resource"}
                          </span>
                        </div>
                      </div>
                      {r.description && (
                        <p className="text-[10px] opacity-70 line-clamp-2 leading-snug">{r.description}</p>
                      )}
                      <Button size="sm" className="w-full h-7 bg-white/60 hover:bg-white/90 text-inherit border-0 shadow-sm font-semibold text-[11px] mt-auto">
                        <BookOpen className="w-3 h-3 mr-1" /> Open
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

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
