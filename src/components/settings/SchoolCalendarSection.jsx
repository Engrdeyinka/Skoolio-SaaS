/**
 * SchoolCalendarSection
 * Settings → General → "School Calendar"
 * Upload any file (PDF, image, text) → edge function extracts events → preview → save
 */
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { parseSchoolCalendar } from "@/functions/parseSchoolCalendar";
import { Button } from "@/components/ui/button";
import { formatDateInLagos } from "@/lib/timezone";
import {
  Upload, Loader2, CheckCircle2, Trash2, CalendarDays,
  RefreshCw, AlertCircle, ChevronDown, ChevronUp, X,
} from "lucide-react";

const ACCEPTED = "application/pdf,image/jpeg,image/png,image/gif,image/webp,text/plain,text/csv,text/html,.pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.html";

const TYPE_META = {
  term_start:  { label: "Term Start",     color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  term_end:    { label: "Term End",       color: "bg-rose-100 text-rose-800 border-rose-200"         },
  mid_term:    { label: "Mid-Term Break", color: "bg-orange-100 text-orange-800 border-orange-200"   },
  open_day:    { label: "Open Day",       color: "bg-blue-100 text-blue-800 border-blue-200"         },
  holiday:     { label: "Holiday",        color: "bg-emerald-100 text-emerald-800 border-emerald-200"   },
  vacation:    { label: "Vacation",       color: "bg-teal-100 text-teal-800 border-teal-200"         },
  celebration: { label: "Celebration",   color: "bg-amber-100 text-amber-800 border-amber-200"      },
  event:       { label: "Event",          color: "bg-slate-100 text-slate-700 border-slate-200"      },
};

function TypeBadge({ type }) {
  const m = TYPE_META[type] || TYPE_META.event;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return formatDateInLagos(new Date(iso + "T12:00:00"), {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    }, "en-GB");
  } catch { return iso; }
}

// Friendly label for file type
function fileTypeLabel(file) {
  if (!file) return "file";
  const t = file.type;
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("text/")) return "text file";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp"].includes(ext)) return "image";
  if (["txt","csv","html"].includes(ext)) return "text file";
  return "file";
}

export default function SchoolCalendarSection() {
  const fileRef = useRef(null);
  const [events, setEvents]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [parsing, setParsing]             = useState(false);
  const [error, setError]                 = useState(null);
  const [successMsg, setSuccessMsg]       = useState(null);
  const [previewEvents, setPreviewEvents] = useState(null);
  const [expandedTerms, setExpandedTerms] = useState([]);
  const [clearConfirm, setClearConfirm]   = useState(false);
  const [currentFile, setCurrentFile]     = useState(null);

  useEffect(() => { loadEvents(); }, []);

  async function loadEvents() {
    setLoading(true);
    try {
      const data = await SchoolCalendarEvent.list("-event_date");
      setEvents(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);
    setPreviewEvents(null);
    setCurrentFile(file);
    setUploading(true);

    try {
      // 1. Upload to Supabase Storage
      const ext  = file.name.split(".").pop() || "bin";
      const path = `calendar/school_calendar_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("uploads").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(uploadData.path);
      const fileUrl = urlData.publicUrl;
      setUploading(false);

      // 2. Call edge function
      setParsing(true);
      const extracted = await parseSchoolCalendar(fileUrl);
      if (!extracted?.length) {
        throw new Error("No events could be extracted. Make sure the file contains calendar dates and ANTHROPIC_API_KEY is set in Supabase secrets.");
      }
      setPreviewEvents(extracted);
    } catch (err) {
      setError(err.message || "Failed to process file.");
      setCurrentFile(null);
    }
    setUploading(false);
    setParsing(false);
  }

  async function handleImportPreview() {
    if (!previewEvents?.length) return;
    setSaving(true);
    setError(null);
    try {
      // Load existing events once and build a dedup key set (title + date)
      const existing = await SchoolCalendarEvent.list("-event_date");
      const existingKeys = new Set(
        existing.map(e => `${(e.title || "").toLowerCase().trim()}|${e.event_date || ""}`)
      );

      // Only insert events that don't already exist
      let added = 0;
      let skipped = 0;
      for (const ev of previewEvents) {
        const key = `${(ev.title || "").toLowerCase().trim()}|${ev.event_date || ""}`;
        if (existingKeys.has(key)) { skipped++; continue; }
        await SchoolCalendarEvent.create({
          title:         ev.title         || "Untitled",
          event_date:    ev.event_date,
          end_date:      ev.end_date      || null,
          event_type:    ev.event_type    || "event",
          term:          ev.term          || "",
          academic_year: ev.academic_year || "",
          description:   ev.description   || "",
        });
        added++;
      }
      setPreviewEvents(null);
      setCurrentFile(null);
      setSuccessMsg(
        skipped > 0
          ? `${added} event(s) added. ${skipped} duplicate(s) skipped.`
          : `${added} event(s) added to your calendar.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      await loadEvents();
    } catch (err) {
      setError(err.message || "Failed to save events.");
    }
    setSaving(false);
  }

  async function handleDeleteEvent(id) {
    try {
      await SchoolCalendarEvent.delete(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err) { setError(err.message); }
  }

  async function handleClearAll() {
    setSaving(true);
    try {
      for (const ev of events) await SchoolCalendarEvent.delete(ev.id);
      setEvents([]);
      setClearConfirm(false);
    } catch (err) { setError(err.message); }
    setSaving(false);
  }

  function toggleTerm(term) {
    setExpandedTerms(prev =>
      prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]
    );
  }

  const termOrder = ["First Term", "Second Term", "Third Term", ""];
  const grouped   = termOrder.reduce((acc, t) => { acc[t] = []; return acc; }, {});
  for (const ev of events) {
    const key = termOrder.includes(ev.term) ? ev.term : "";
    grouped[key].push(ev);
  }
  for (const key of termOrder) {
    grouped[key].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
  }

  const busy = uploading || parsing || saving;

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-600" />
          School Calendar
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Upload the official school calendar — the app will automatically extract all term dates,
          holidays, open days, and vacations.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── Upload area ── */}
      {!previewEvents && (
        <div
          onClick={() => !busy && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 transition-colors
            ${busy
              ? "border-indigo-200 bg-indigo-50/60 cursor-not-allowed"
              : "border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/30 cursor-pointer"
            }`}
        >
          <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center">
            {(uploading || parsing)
              ? <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
              : <Upload className="w-7 h-7 text-indigo-500" />
            }
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">
              {uploading ? `Uploading ${fileTypeLabel(currentFile)}…`
                : parsing  ? "Extracting events with AI…"
                : "Upload Calendar File"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {(uploading || parsing)
                ? "Please wait, this may take a few seconds"
                : "PDF · Image (JPG, PNG, WEBP) · Text / CSV"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
        </div>
      )}

      {/* ── Preview panel ── */}
      {previewEvents && (
        <div className="border border-indigo-200 rounded-2xl overflow-hidden">
          <div className="bg-indigo-50 px-5 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-indigo-900 text-sm">
                {previewEvents.length} events extracted — review before saving
              </p>
              <p className="text-xs text-indigo-500 mt-0.5">
                New events will be added. Duplicates (same title &amp; date) are skipped.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => { setPreviewEvents(null); setCurrentFile(null); }}
                disabled={saving} className="text-slate-600 border-slate-300">
                Cancel
              </Button>
              <Button size="sm" onClick={handleImportPreview} disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Save to Calendar
              </Button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {previewEvents.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{ev.title}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(ev.event_date)}
                    {ev.end_date && ev.end_date !== ev.event_date ? ` – ${fmtDate(ev.end_date)}` : ""}
                    {ev.term ? ` · ${ev.term}` : ""}
                  </p>
                </div>
                <TypeBadge type={ev.event_type} />
              </div>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
            <button
              onClick={() => { setPreviewEvents(null); setCurrentFile(null); setTimeout(() => fileRef.current?.click(), 100); }}
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              ← Upload a different file
            </button>
          </div>
        </div>
      )}

      {/* ── Saved events list ── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : events.length > 0 ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Saved Events <span className="text-slate-400 font-normal">({events.length})</span>
            </p>
            <div className="flex items-center gap-3">
              <button onClick={loadEvents}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {!clearConfirm ? (
                <button onClick={() => setClearConfirm(true)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                  Clear all
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-red-600 font-medium">Confirm?</span>
                  <button onClick={handleClearAll} disabled={saving}
                    className="text-red-600 font-bold hover:text-red-800 ml-1">Yes</button>
                  <span className="text-slate-300 mx-0.5">/</span>
                  <button onClick={() => setClearConfirm(false)} className="text-slate-500 hover:text-slate-700">No</button>
                </span>
              )}
            </div>
          </div>

          {termOrder.map(term => {
            if (!grouped[term]?.length) return null;
            const label = term || "Other";
            const open  = expandedTerms.includes(term);
            return (
              <div key={term} className="border border-slate-200 rounded-xl overflow-hidden">
                <button onClick={() => toggleTerm(term)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-700">
                    {label}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      ({grouped[term].length}) · {grouped[term][0]?.academic_year || ""}
                    </span>
                  </span>
                  {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {open && (
                  <div className="divide-y divide-slate-100">
                    {grouped[term].map(ev => (
                      <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5 group/item hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{ev.title}</p>
                          <p className="text-xs text-slate-400">
                            {fmtDate(ev.event_date)}
                            {ev.end_date ? ` – ${fmtDate(ev.end_date)}` : ""}
                          </p>
                          {ev.description && <p className="text-xs text-slate-400 mt-0.5">{ev.description}</p>}
                        </div>
                        <TypeBadge type={ev.event_type} />
                        <button onClick={() => handleDeleteEvent(ev.id)}
                          className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover/item:opacity-100 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !previewEvents && (
          <div className="text-center py-8 text-slate-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No calendar events yet.</p>
            <p className="text-xs mt-1">Upload a calendar file above to get started.</p>
          </div>
        )
      )}
    </div>
  );
}
