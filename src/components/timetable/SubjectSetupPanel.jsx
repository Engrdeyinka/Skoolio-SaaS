import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Edit2, Check, AlertTriangle, Link2, Plus, Trash2, Loader2, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { DEFAULT_SS_PAIRINGS, normalizeSSPairings } from "./ssPairings";
import { PERIODS } from "./constants";

// ── Period-time helpers ────────────────────────────────────────────────────
// Parse a display range like "7:30–8:15" into { start: "07:30", end: "08:15" }
// for use with <input type="time">.
function parseRange(rangeStr = "") {
  const [rawStart, rawEnd] = rangeStr.split(/[–—\-]/).map(s => s.trim());
  return {
    start: toTimeInput(rawStart || ""),
    end:   toTimeInput(rawEnd   || ""),
  };
}
// "7:30" or "07:30"  → "07:30"  (HTML time input value)
function toTimeInput(s = "") {
  const parts = s.trim().split(":");
  if (parts.length < 2) return "";
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
// "07:30" → "7:30"  (compact display / storage format)
function fromTimeInput(s = "") {
  if (!s) return "";
  const [h, m] = s.split(":").map(Number);
  return `${h}:${String(m).padStart(2, "0")}`;
}

const GRADE_GROUPS = [
  { label: "JSS 1 – 3", grades: ["JSS 1", "JSS 2", "JSS 3"] },
  { label: "SSS 1 – 3", grades: ["SSS 1", "SSS 2", "SSS 3"] },
];

export default function SubjectSetupPanel({
  subjects,
  assignments,
  teachers,
  grades,
  onSaveAssignment,
  availabilities = [],
  ssPairings = DEFAULT_SS_PAIRINGS,
  onSaveSSPairings = null,
  periodTimes = {},
  onSavePeriodTimes = null,
  breakTime = "12:00 – 12:30",
  onSaveBreakTime = null,
}) {
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeGrade, setActiveGrade] = useState(GRADE_GROUPS[0].grades[0]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [pairDraft, setPairDraft] = useState(() => normalizeSSPairings(ssPairings));
  const [savingPairings, setSavingPairings] = useState(false);
  const [pairingsOpen, setPairingsOpen] = useState(false);

  // ── Period time editor state ────────────────────────────────────────────
  const [timesOpen, setTimesOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState(() =>
    PERIODS.reduce((acc, p) => {
      acc[p] = parseRange(periodTimes[p] || "");
      return acc;
    }, {})
  );
  // Break time draft (two separate time inputs)
  const [breakDraft, setBreakDraft] = useState(() => parseRange(breakTime));
  const [savingTimes, setSavingTimes] = useState(false);

  // Keep drafts in sync when parent values change (e.g. on mount)
  useEffect(() => {
    setTimeDraft(
      PERIODS.reduce((acc, p) => {
        acc[p] = parseRange(periodTimes[p] || "");
        return acc;
      }, {})
    );
  }, [periodTimes]);

  useEffect(() => {
    setBreakDraft(parseRange(breakTime));
  }, [breakTime]);

  const handleTimeChange = (period, side, value) => {
    setTimeDraft(prev => ({
      ...prev,
      [period]: { ...prev[period], [side]: value },
    }));
  };

  const handleBreakChange = (side, value) => {
    setBreakDraft(prev => ({ ...prev, [side]: value }));
  };

  const handleSaveTimes = async () => {
    setSavingTimes(true);
    try {
      // Save period times
      if (onSavePeriodTimes) {
        const newTimes = PERIODS.reduce((acc, p) => {
          const { start, end } = timeDraft[p] || {};
          const s = fromTimeInput(start);
          const e = fromTimeInput(end);
          acc[p] = s && e ? `${s}–${e}` : s || e || periodTimes[p] || "";
          return acc;
        }, {});
        await onSavePeriodTimes(newTimes);
      }
      // Save break time
      if (onSaveBreakTime) {
        const bs = fromTimeInput(breakDraft.start);
        const be = fromTimeInput(breakDraft.end);
        const newBreak = bs && be ? `${bs} – ${be}` : bs || be || breakTime;
        await onSaveBreakTime(newBreak);
      }
    } catch (e) {
      console.error("Failed to save period times:", e);
    } finally {
      setSavingTimes(false);
    }
  };

  useEffect(() => {
    setPairDraft(normalizeSSPairings(ssPairings));
  }, [ssPairings]);

  // ── Compute total periods assigned per teacher across ALL grades ──────────
  // Deduplicate by (grade, subject) first so a teacher isn't counted twice
  // if duplicate DB rows exist for the same class-subject pairing.
  const teacherPeriodTotals = useMemo(() => {
    const totals = {};
    const seen = new Set();
    for (const a of assignments) {
      if (!a.subject_teacher_id || a.subject_teacher_id === "none") continue;
      // Use lowercase subject name so a renamed subject (e.g. ECONOMICS → Economics)
      // is never counted twice for the same teacher + grade combination.
      const key = `${a.grade}|${(a.subject || "").toLowerCase()}`;
      if (seen.has(key)) continue; // skip duplicate (grade, subject) rows
      seen.add(key);
      totals[a.subject_teacher_id] = (totals[a.subject_teacher_id] || 0) + (Number(a.periods_per_week) || 0);
    }
    return totals;
  }, [assignments]);

  const getTeacherLimit = (teacherId) => {
    const av = availabilities.find(a => a.teacher_id === teacherId);
    return av?.max_periods_per_week ?? 30;
  };

  // Returns { type: "over"|"near"|"ok", total, limit } or null
  const getLoadStatus = (teacherId) => {
    if (!teacherId || teacherId === "none") return null;
    const total = teacherPeriodTotals[teacherId] || 0;
    const limit = getTeacherLimit(teacherId);
    if (total > limit)        return { type: "over", total, limit };
    if (total >= limit * 0.9) return { type: "near", total, limit };
    return { type: "ok", total, limit };
  };

  const currentGroupGrades = GRADE_GROUPS[activeGroup].grades.filter(g => grades.includes(g));

  const gradeSubjects = subjects.filter(s => s.grade_levels && s.grade_levels.includes(activeGrade));
  const gradeAssignments = assignments.filter(a => a.grade === activeGrade);

  const getAssignment = (subjectName) =>
    gradeAssignments.find(a => a.subject === subjectName) || {};

  const startEdit = (subjectName) => {
    const a = getAssignment(subjectName);
    setEditingId(subjectName);
    setEditForm({
      subject_teacher_id: a.subject_teacher_id || "",
      periods_per_week: a.periods_per_week ?? 4,
      max_per_day: a.max_per_day ?? 2,
      allow_double: a.allow_double ?? false,
    });
  };

  const handleSave = async (subjectName) => {
    setSaving(true);
    await onSaveAssignment({
      grade: activeGrade,
      subject: subjectName,
      ...editForm,
    });
    setEditingId(null);
    setSaving(false);
  };

  // ── Overloaded teachers summary ──────────────────────────────────────────
  // Build a per-teacher breakdown: which (grade, subject) rows push them over
  const teacherBreakdown = useMemo(() => {
    const breakdown = {};
    const seen = new Set();
    for (const a of assignments) {
      if (!a.subject_teacher_id || a.subject_teacher_id === "none") continue;
      // Case-insensitive deduplication — same fix as teacherPeriodTotals
      const key = `${a.grade}|${(a.subject || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!breakdown[a.subject_teacher_id]) breakdown[a.subject_teacher_id] = [];
      breakdown[a.subject_teacher_id].push({ grade: a.grade, subject: a.subject, ppw: Number(a.periods_per_week) || 0 });
    }
    return breakdown;
  }, [assignments]);

  const overloadedTeachers = teachers.filter(t => {
    const status = getLoadStatus(t.id);
    return status?.type === "over";
  });

  const updatePairValue = (index, side, value) => {
    setPairDraft((prev) => prev.map((pair, i) => {
      if (i !== index) return pair;
      if (side === 0) return [value, pair[1]];
      return [pair[0], value];
    }));
  };

  const addPairRow = () => {
    setPairDraft((prev) => [...prev, ["", ""]]);
  };

  const removePairRow = (index) => {
    setPairDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSavePairings = async () => {
    if (!onSaveSSPairings) return;
    const normalized = normalizeSSPairings(pairDraft);
    setSavingPairings(true);
    try {
      await onSaveSSPairings(normalized);
      setPairDraft(normalized);
    } finally {
      setSavingPairings(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      {overloadedTeachers.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-700">
              {overloadedTeachers.length} teacher{overloadedTeachers.length > 1 ? "s are" : " is"} assigned more periods than their weekly limit
            </span>
          </div>
          <p className="text-xs text-red-500 ml-6">
            The number shown is the <strong>total teaching sessions per week across all classes</strong>.
            Each class counts separately — e.g. teaching Maths to 6 classes at 4 periods/class = 24 periods/week.
            Either reduce the subjects assigned to these teachers, lower the periods per class, or raise their weekly limit in the <strong>Teachers</strong> tab.
          </p>
          <div className="ml-6 space-y-1.5">
            {overloadedTeachers.map((t) => {
              const status = getLoadStatus(t.id);
              const rows = teacherBreakdown[t.id] || [];
              // Group by subject for a compact breakdown
              const bySubject = {};
              rows.forEach(r => {
                if (!bySubject[r.subject]) bySubject[r.subject] = { grades: [], ppw: r.ppw };
                bySubject[r.subject].grades.push(r.grade);
              });
              return (
                <div key={t.id} className="text-xs text-red-700">
                  <span className="font-semibold">{t.first_name} {t.last_name}</span>
                  <span className="mx-1.5 text-red-400">—</span>
                  <span className="font-semibold text-red-800">{status.total} periods/wk</span>
                  <span className="text-red-400"> (limit {status.limit})</span>
                  <span className="text-red-400 mx-1.5">·</span>
                  <span className="text-red-500">
                    {Object.entries(bySubject).map(([subj, info], i) => (
                      <span key={subj}>
                        {i > 0 && ", "}
                        {subj} × {info.grades.length} class{info.grades.length > 1 ? "es" : ""} ({info.ppw}p each = {info.grades.length * info.ppw})
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-lg">Subject Setup per Class</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          For each class, assign teachers to subjects and set how many periods per week each subject needs. This drives the auto-generator.
        </p>

        {/* ── Period Times Editor ───────────────────────────────────────────── */}
        <div className="border border-teal-200 bg-teal-50 rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setTimesOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-teal-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-teal-800">Period Times</span>
              <span className="text-xs text-teal-500 font-normal">(P1–P8 start &amp; end times)</span>
            </div>
            {timesOpen
              ? <ChevronDown className="w-4 h-4 text-teal-500 flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-teal-500 flex-shrink-0" />}
          </button>

          {timesOpen && (
            <div className="px-3 pb-3 space-y-3 border-t border-teal-200 pt-3">
              <p className="text-xs text-teal-700">
                Set the start and end time for each period. Changes are saved to the database and reflected across all devices immediately.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERIODS.map(p => {
                  const { start, end } = timeDraft[p] || {};
                  const preview = start && end
                    ? `${fromTimeInput(start)}–${fromTimeInput(end)}`
                    : periodTimes[p] || "";

                  // Insert Long Break row visually between P4 and P5
                  const breakRow = p === 5 ? (() => {
                    const bs = fromTimeInput(breakDraft.start);
                    const be = fromTimeInput(breakDraft.end);
                    const breakPreview = bs && be ? `${bs} – ${be}` : breakTime;
                    return (
                      <div key="break" className="flex items-center gap-2 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2 sm:col-span-2">
                        <span className="w-20 text-xs font-bold text-amber-700 shrink-0">Long Break</span>
                        <input
                          type="time"
                          value={breakDraft.start || ""}
                          onChange={e => handleBreakChange("start", e.target.value)}
                          className="w-28 text-sm border border-amber-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        />
                        <span className="text-slate-400 text-sm font-medium">–</span>
                        <input
                          type="time"
                          value={breakDraft.end || ""}
                          onChange={e => handleBreakChange("end", e.target.value)}
                          className="w-28 text-sm border border-amber-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        />
                        {breakPreview && (
                          <span className="text-xs text-amber-600 ml-auto shrink-0 font-medium">{breakPreview}</span>
                        )}
                      </div>
                    );
                  })() : null;

                  return (
                    <React.Fragment key={p}>
                      {breakRow}
                      <div className="flex items-center gap-2 bg-white rounded-lg border border-teal-100 px-3 py-2">
                        <span className="w-7 text-xs font-bold text-teal-700 shrink-0">P{p}</span>
                        <input
                          type="time"
                          value={start || ""}
                          onChange={e => handleTimeChange(p, "start", e.target.value)}
                          className="w-28 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                        <span className="text-slate-400 text-sm font-medium">–</span>
                        <input
                          type="time"
                          value={end || ""}
                          onChange={e => handleTimeChange(p, "end", e.target.value)}
                          className="w-28 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                        {preview && (
                          <span className="text-xs text-slate-500 ml-auto shrink-0">{preview}</span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
                  onClick={() => {
                    setTimeDraft(
                      PERIODS.reduce((acc, p) => {
                        acc[p] = parseRange(periodTimes[p] || "");
                        return acc;
                      }, {})
                    );
                    setBreakDraft(parseRange(breakTime));
                  }}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveTimes}
                  disabled={savingTimes}
                  className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                >
                  {savingTimes
                    ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    : <Check className="w-3 h-3 mr-1" />}
                  Save Times
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── SSS Subject Pairings ─────────────────────────────────────────────── */}
        <div className="border border-indigo-200 bg-indigo-50 rounded-lg mb-4">
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => setPairingsOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-indigo-800">SSS Subject Pairings (Split Periods)</span>
              <span className="text-xs text-indigo-500 font-normal">({pairDraft.length} pair{pairDraft.length !== 1 ? "s" : ""})</span>
            </div>
            {pairingsOpen
              ? <ChevronDown className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />}
          </button>

          {/* Collapsible body */}
          {pairingsOpen && (
            <div className="px-3 pb-3 space-y-3 border-t border-indigo-200 pt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-indigo-700">
                  These pairings are used by all timetable solvers for SSS classes. Example: Geography + Yoruba share the same period.
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button type="button" size="sm" variant="outline" onClick={addPairRow} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Add Pair
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSavePairings}
                    disabled={savingPairings || !onSaveSSPairings}
                    className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                  >
                    {savingPairings ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                    Save Pairings
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {pairDraft.map((pair, index) => (
                  <div key={`pair-${index}`} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      value={pair[0] || ""}
                      onChange={(e) => updatePairValue(index, 0, e.target.value)}
                      placeholder="Subject A"
                      className="col-span-5 h-8 text-sm bg-white"
                    />
                    <div className="col-span-1 text-center text-indigo-500 font-semibold">+</div>
                    <Input
                      value={pair[1] || ""}
                      onChange={(e) => updatePairValue(index, 1, e.target.value)}
                      placeholder="Subject B"
                      className="col-span-5 h-8 text-sm bg-white"
                    />
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-100"
                        onClick={() => removePairRow(index)}
                        disabled={pairDraft.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Group tabs */}
        <div className="flex gap-2 mb-3">
          {GRADE_GROUPS.map((group, idx) => (
            <button
              key={group.label}
              onClick={() => {
                setActiveGroup(idx);
                setActiveGrade(GRADE_GROUPS[idx].grades.find(g => grades.includes(g)) || GRADE_GROUPS[idx].grades[0]);
                setEditingId(null);
              }}
              className={`px-5 py-2 rounded-lg text-sm font-bold border transition-all ${
                activeGroup === idx
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Sub-grade tabs */}
        <div className="flex gap-1 flex-wrap mb-6">
          {currentGroupGrades.map(g => (
            <button
              key={g}
              onClick={() => { setActiveGrade(g); setEditingId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                activeGrade === g
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {gradeSubjects.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No subjects configured for {activeGrade}.</p>
            <p className="text-xs mt-1">Go to <strong>Subjects</strong> in the sidebar to add subjects and assign grade levels.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-3 pb-2 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-3">Subject</div>
              <div className="col-span-3">Assigned Teacher</div>
              <div className="col-span-2 text-center">Periods/Week</div>
              <div className="col-span-2 text-center">Max/Day</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {gradeSubjects.map(subject => {
              const assignment = getAssignment(subject.subject_name);
              const isEditing = editingId === subject.subject_name;
              const teacherName = teachers.find(t => t.id === assignment.subject_teacher_id);
              const assignableTeachers = teachers.filter(
                (teacher) =>
                  teacher.employment_status !== "inactive" ||
                  teacher.id === editForm.subject_teacher_id
              );

              return (
                <div
                  key={subject.id}
                  className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg transition-colors ${isEditing ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"}`}
                >
                  <div className="col-span-3">
                    <div className="font-semibold text-slate-700 text-sm">{subject.subject_name}</div>
                    {subject.subject_code && <div className="text-xs text-slate-400">{subject.subject_code}</div>}
                  </div>

                  {isEditing ? (
                    <>
                      <div className="col-span-3">
                        <Select value={editForm.subject_teacher_id} onValueChange={v => setEditForm(p => ({ ...p, subject_teacher_id: v }))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select teacher..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No teacher</SelectItem>
                            {assignableTeachers.map(t => {
                              const status = getLoadStatus(t.id);
                              const loadLabel = status ? ` (${status.total}/${status.limit} periods)` : "";
                              return (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.first_name} {t.last_name}{loadLabel}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Input
                          type="number" min={0} max={10}
                          value={editForm.periods_per_week}
                          onChange={e => setEditForm(p => ({ ...p, periods_per_week: Number(e.target.value) }))}
                          className="w-16 h-8 text-sm text-center"
                        />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Input
                          type="number" min={1} max={4}
                          value={editForm.max_per_day}
                          onChange={e => setEditForm(p => ({ ...p, max_per_day: Number(e.target.value) }))}
                          className="w-16 h-8 text-sm text-center"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end gap-1">
                        <Button size="sm" onClick={() => handleSave(subject.subject_name)} disabled={saving} className="h-8 text-xs bg-green-600 hover:bg-green-700">
                          <Check className="w-3 h-3 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-8 text-xs">
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-3">
                        {teacherName ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm text-slate-600">{teacherName.first_name} {teacherName.last_name}</span>
                            {(() => {
                              const status = getLoadStatus(assignment.subject_teacher_id);
                              if (!status || status.type === "ok") return null;
                              return (
                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                  status.type === "over"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {status.total}/{status.limit}
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500 font-medium">⚠ Unassigned</span>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-sm font-semibold ${(assignment.periods_per_week || 0) > 0 ? "text-blue-700" : "text-slate-300"}`}>
                          {assignment.periods_per_week ?? "—"}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="text-sm text-slate-500">{assignment.max_per_day ?? "—"}</span>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => startEdit(subject.subject_name)} className="h-8 text-xs">
                          <Edit2 className="w-3 h-3 mr-1" /> Edit
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
