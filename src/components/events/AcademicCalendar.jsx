/**
 * AcademicCalendar
 * Physical monthly grid calendar.
 * – Term days shaded green; breaks/vacations shaded white (gap)
 * – No spanning bars — each event shows as a pill in every cell it covers
 * – "Add Event" dialog
 */
import React, { useState, useMemo } from "react";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, X, Loader2, CalendarDays, Pencil, Trash2 } from "lucide-react";
import { formatDateInLagos, getLagosDateString, getLagosYear } from "@/lib/timezone";

// ─── Colours ──────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  term_start:  "bg-emerald-500 text-white",
  term_end:    "bg-rose-500    text-white",
  mid_term:    "bg-orange-400  text-white",
  open_day:    "bg-blue-500    text-white",
  holiday:     "bg-emerald-500  text-white",
  vacation:    "bg-teal-500    text-white",
  celebration: "bg-amber-400   text-white",
  event:       "bg-indigo-400  text-white",
};
const TYPE_DOT = {
  term_start: "bg-emerald-500", term_end: "bg-rose-500",   mid_term: "bg-orange-400",
  open_day:   "bg-blue-500",    holiday:  "bg-emerald-500", vacation:  "bg-teal-500",
  celebration:"bg-amber-400",   event:    "bg-indigo-400",
};

const TYPE_OPTIONS = [
  { value: "term_start",  label: "Term Start"     },
  { value: "term_end",    label: "Term End"       },
  { value: "mid_term",    label: "Mid-Term Break" },
  { value: "open_day",    label: "Open Day"       },
  { value: "holiday",     label: "Public Holiday" },
  { value: "vacation",    label: "Vacation"       },
  { value: "celebration", label: "Celebration"    },
  { value: "event",       label: "Other Event"    },
];
const TERM_OPTIONS = ["First Term", "Second Term", "Third Term"];
const DAY_LABELS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toIso  = d  => d ? getLagosDateString(d) : null;
const toDate = s  => s ? new Date(s + "T12:00:00") : null;
const addDay = d  => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

function getWeeks(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  let week = Array(first.getDay()).fill(null);
  const weeks = [];
  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
  return weeks;
}

/**
 * Build a lookup: isoDate → { shade: 'term'|'break'|null, events: Event[] }
 * 'term'  = inside a term window → green cell
 * 'break' = inside mid_term/vacation → white cell (gap)
 * Events are attached to every day they span.
 */
function buildDayMap(events) {
  const map = {};

  function ensure(iso) {
    if (!map[iso]) map[iso] = { shade: null, events: [] };
  }
  function markRange(startIso, endIso, shade) {
    let d = toDate(startIso);
    const end = toDate(endIso);
    if (!d || !end) return;
    while (d <= end) {
      const iso = toIso(d);
      ensure(iso);
      // 'break' overrides 'term'
      if (shade === "break" || map[iso].shade === null) map[iso].shade = shade;
      d = addDay(d);
    }
  }

  // 1. Build term shading: match term_start ↔ term_end by term + academic_year
  const starts = events.filter(e => e.event_type === "term_start");
  const ends   = events.filter(e => e.event_type === "term_end");
  for (const s of starts) {
    const e = ends.find(e => e.term === s.term && e.academic_year === s.academic_year);
    if (e) markRange(s.event_date, e.event_date, "term");
  }

  // 2. Mark breaks (override term shading)
  for (const ev of events) {
    if (ev.event_type === "mid_term" || ev.event_type === "vacation") {
      markRange(ev.event_date, ev.end_date || ev.event_date, "break");
    }
  }

  // 3. Assign events to every day they span
  for (const ev of events) {
    let d = toDate(ev.event_date);
    const end = toDate(ev.end_date || ev.event_date);
    if (!d) continue;
    while (d <= end) {
      const iso = toIso(d);
      ensure(iso);
      map[iso].events.push(ev);
      d = addDay(d);
    }
  }

  return map;
}

// ─── Add / Edit Event Dialog ──────────────────────────────────────────────────
const DEFAULT_YEAR = (() => { const y = getLagosYear(); return `${y-1}/${y}`; })();

function EventDialog({ initialDate, editEvent, onSave, onClose }) {
  const isEdit = !!editEvent;
  const [form, setForm] = useState({
    title:         editEvent?.title         || "",
    event_date:    editEvent?.event_date    || initialDate || "",
    end_date:      editEvent?.end_date      || "",
    event_type:    editEvent?.event_type    || "event",
    term:          editEvent?.term          || "First Term",
    academic_year: editEvent?.academic_year || DEFAULT_YEAR,
    description:   editEvent?.description   || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (!form.event_date)   { setErr("Start date is required."); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({
        title:         form.title.trim(),
        event_date:    form.event_date,
        end_date:      form.end_date  || null,
        event_type:    form.event_type,
        term:          form.term,
        academic_year: form.academic_year,
        description:   form.description.trim(),
      });
      onClose();
    } catch (e) { setErr(e.message || "Failed to save."); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isEdit ? "bg-amber-50" : "bg-indigo-50"}`}>
              <CalendarDays className={`w-5 h-5 ${isEdit ? "text-amber-600" : "text-indigo-600"}`} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit Event" : "Add Calendar Event"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <span className="flex-1">{err}</span>
              <button onClick={() => setErr(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Event Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Prize Giving Day"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date *</label>
              <input type="date" value={form.event_date} onChange={e => set("event_date", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Date <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="date" value={form.end_date || ""} min={form.event_date} onChange={e => set("end_date", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Event Type</label>
              <select value={form.event_type} onChange={e => set("event_type", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
              <select value={form.term} onChange={e => set("term", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                {TERM_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Academic Year</label>
            <input value={form.academic_year} onChange={e => set("academic_year", e.target.value)}
              placeholder="e.g. 2024/2025"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="border-gray-200 text-gray-600">Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}
            className={isEdit ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
              : isEdit ? <Pencil className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {isEdit ? "Save Changes" : "Add Event"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Day click popover ────────────────────────────────────────────────────────
function DayPopover({ day, dayInfo, onEdit, onDelete, onClose }) {
  const label    = formatDateInLagos(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB");
  const evs      = dayInfo?.events || [];
  const [confirmDelete, setConfirmDelete] = useState(null); // event id to confirm

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <p className="font-semibold text-sm text-slate-800">{label}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Events */}
        <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
          {evs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No events on this day</p>
          ) : evs.map((ev) => (
            <div key={ev.id} className="group/ev relative rounded-lg overflow-hidden">
              {/* Event bar */}
              <div className={`px-3 py-2 text-xs text-white font-medium ${TYPE_COLORS[ev.event_type] || TYPE_COLORS.event}`}>
                <p className="font-semibold pr-14 truncate">{ev.title}</p>
                {ev.description && <p className="mt-0.5 opacity-80 truncate">{ev.description}</p>}
                {ev.end_date && ev.end_date !== ev.event_date && (
                  <p className="mt-0.5 opacity-70 text-xs">
                    {formatDateInLagos(new Date(ev.event_date + "T12:00:00"), { day: "numeric", month: "short" }, "en-GB")}
                    {" – "}
                    {formatDateInLagos(new Date(ev.end_date + "T12:00:00"), { day: "numeric", month: "short" }, "en-GB")}
                  </p>
                )}
              </div>

              {/* Edit / Delete buttons (hover) */}
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/ev:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(ev); onClose(); }}
                  className="p-1 rounded bg-white/20 hover:bg-white/40 text-white transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {confirmDelete === ev.id ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(ev.id); setConfirmDelete(null); onClose(); }}
                      className="px-1.5 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                      className="px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/40 text-white text-xs transition-colors"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(ev.id); }}
                    className="p-1 rounded bg-white/20 hover:bg-red-500 text-white transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Hint */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
          <p className="text-xs text-slate-400">Hover an event to edit or delete it</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AcademicCalendar({ events, onEventAdded }) {
  const now   = new Date();
  const [year,         setYear]         = useState(now.getFullYear());
  const [month,        setMonth]        = useState(now.getMonth());
  const [showAdd,      setShowAdd]      = useState(false);
  const [addDate,      setAddDate]      = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [popDay,       setPopDay]       = useState(null);

  const weeks  = useMemo(() => getWeeks(year, month), [year, month]);
  const dayMap = useMemo(() => buildDayMap(events), [events]);
  const todayIso = toIso(now);

  function prev() { month === 0 ? (setMonth(11), setYear(y => y-1)) : setMonth(m => m-1); }
  function next() { month === 11 ? (setMonth(0), setYear(y => y+1)) : setMonth(m => m+1); }

  function handleEdit(ev) {
    setEditingEvent(ev);
    setShowAdd(true);
  }

  async function handleDelete(id) {
    await SchoolCalendarEvent.delete(id);
    if (onEventAdded) onEventAdded();
  }

  async function handleSave(payload) {
    if (editingEvent) {
      await SchoolCalendarEvent.update(editingEvent.id, payload);
    } else {
      await SchoolCalendarEvent.create(payload);
    }
    if (onEventAdded) onEventAdded();
  }

  const MAX_PILLS = 3;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden select-none">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-slate-900 w-44 text-center">
            {MONTH_LABELS[month]} {year}
          </h2>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="ml-1 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50 transition-colors">
            Today
          </button>
        </div>
        <Button size="sm" onClick={() => { setAddDate(null); setEditingEvent(null); setShowAdd(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-1" /> Add Event
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
          {week.map((day, di) => {
            const iso     = day ? toIso(day) : null;
            const info    = iso ? dayMap[iso] : null;
            const isToday = iso === todayIso;
            const inTerm  = info?.shade === "term";
            const isBreak = info?.shade === "break";
            const pills   = info?.events || [];
            const extra   = pills.length - MAX_PILLS;

            // Background colour
            let cellBg = "bg-white";
            if (!day)    cellBg = "bg-slate-50/60";
            else if (isBreak) cellBg = "bg-white";         // gap — white
            else if (inTerm)  cellBg = "bg-emerald-50/70"; // term — soft green

            return (
              <div
                key={di}
                onClick={() => day && setPopDay(day)}
                onDoubleClick={() => { if (day) { setAddDate(iso); setShowAdd(true); } }}
                className={`min-h-[100px] p-1.5 border-r border-slate-100 last:border-r-0 cursor-pointer
                  transition-colors hover:brightness-95 ${cellBg}`}
              >
                {/* Day number */}
                {day && (
                  <div className="flex justify-end mb-1">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                      ${isToday ? "bg-indigo-600 text-white" : isBreak ? "text-slate-400" : inTerm ? "text-emerald-800" : "text-slate-500"}`}>
                      {day.getDate()}
                    </span>
                  </div>
                )}

                {/* Event pills */}
                <div className="space-y-0.5">
                  {pills.slice(0, MAX_PILLS).map((ev, i) => (
                    <div key={i}
                      className={`text-xs truncate rounded px-1.5 py-0.5 font-medium leading-tight ${TYPE_COLORS[ev.event_type] || TYPE_COLORS.event}`}>
                      {ev.title}
                    </div>
                  ))}
                  {extra > 0 && (
                    <div className="text-xs text-slate-400 font-medium px-1">+{extra} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" />
          Term days
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-sm bg-white border border-slate-200" />
          Break / Vacation
        </span>
        {TYPE_OPTIONS.map(o => (
          <span key={o.value} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOT[o.value]}`} />
            {o.label}
          </span>
        ))}
      </div>

      {/* Add / Edit Event Dialog */}
      {showAdd && (
        <EventDialog
          initialDate={addDate}
          editEvent={editingEvent}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setAddDate(null); setEditingEvent(null); }}
        />
      )}

      {/* Day popover */}
      {popDay && (
        <DayPopover
          day={popDay}
          dayInfo={dayMap[toIso(popDay)]}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onClose={() => setPopDay(null)}
        />
      )}
    </div>
  );
}
