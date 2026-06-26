/**
 * Gradebook.jsx — Broadsheet view
 * Rows = students in a class, Columns = one subject
 * Fields: CA1, CA2, CA3, CA Total (auto), Exam, Total (auto), LT CUM, Cum Avg, Grade, Remarks
 * Grade + Remarks are auto-computed (same logic as AcademicRecordForm / Exam Results)
 */
import React, { useState, useEffect, useCallback } from "react";
import { BRAND } from "@/config/brand";
import { supabase } from "@/api/supabaseClient";
import { Student, Subject } from "@/entities/all";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Save, Loader2, BookOpen, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";

const ALL_CLASSES = [
  "KG 1","KG 2","Nursery 1","Nursery 2",
  "Primary 1","Primary 2","Primary 3","Primary 4",
  "JSS 1","JSS 2","JSS 3","SSS 1","SSS 2","SSS 3",
];

const SSS_CLASSES = ["SSS 1","SSS 2","SSS 3"];

function getPreviousTermAndYear(term, academicYear) {
  if (term === "Second Term") return { term: "First Term", academicYear };
  if (term === "Third Term") return { term: "Second Term", academicYear };
  const [start, end] = String(academicYear || "").split("/").map(Number);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return { term: "Third Term", academicYear: `${start - 1}/${end - 1}` };
  }
  return { term: null, academicYear };
}

function getCarryForwardScore(resultLike) {
  const cumulative = Number(resultLike?.cumulative_average);
  if (Number.isFinite(cumulative) && cumulative > 0) return cumulative;

  const total = Number(resultLike?.total_score);
  if (Number.isFinite(total) && total > 0) return total;

  const ltCum = Number(resultLike?.lt_cum);
  if (Number.isFinite(ltCum) && ltCum > 0) return ltCum;

  return 0;
}

// ── Grade scale: SSS uses WAEC A1-F9, others use A-F ─────────────────────────
function getGradeAndRemark(total, className) {
  if (total === null || total === undefined || total === "") return { grade: "", remarks: "" };
  const t = Number(total);
  const isSSS = SSS_CLASSES.includes(className);
  if (isSSS) {
    if (t >= 75) return { grade: "A1", remarks: "Excellent" };
    if (t >= 70) return { grade: "B2", remarks: "Very Good" };
    if (t >= 65) return { grade: "B3", remarks: "Good" };
    if (t >= 60) return { grade: "C4", remarks: "Credit" };
    if (t >= 55) return { grade: "C5", remarks: "Credit" };
    if (t >= 50) return { grade: "C6", remarks: "Credit" };
    if (t >= 45) return { grade: "D7", remarks: "Pass" };
    if (t >= 40) return { grade: "E8", remarks: "Pass" };
    return { grade: "F9", remarks: "Fail" };
  } else {
    if (t >= 70) return { grade: "A", remarks: "Excellent" };
    if (t >= 60) return { grade: "B", remarks: "Very Good" };
    if (t >= 50) return { grade: "C", remarks: "Good" };
    if (t >= 45) return { grade: "D", remarks: "Pass" };
    if (t >= 40) return { grade: "E", remarks: "Pass" };
    return { grade: "F", remarks: "Fail" };
  }
}

const GRADE_COLORS = {
  A:  "bg-emerald-100 text-emerald-800",
  A1: "bg-emerald-100 text-emerald-800",
  B:  "bg-blue-100 text-blue-800",
  B2: "bg-blue-100 text-blue-800",
  B3: "bg-blue-100 text-blue-800",
  C:  "bg-amber-100 text-amber-800",
  C4: "bg-amber-100 text-amber-800",
  C5: "bg-amber-100 text-amber-800",
  C6: "bg-amber-100 text-amber-800",
  D:  "bg-orange-100 text-orange-800",
  D7: "bg-orange-100 text-orange-800",
  E:  "bg-red-100 text-red-700",
  E8: "bg-red-100 text-red-700",
  F:  "bg-red-200 text-red-900",
  F9: "bg-red-200 text-red-900",
};

const REMARKS_COLORS = {
  Excellent: "text-emerald-700",
  "Very Good": "text-blue-700",
  Good: "text-blue-600",
  Credit: "text-amber-700",
  Pass: "text-orange-700",
  Fail: "text-red-700",
};

// ── Editable cell ─────────────────────────────────────────────────────────────
function Cell({ value, onChange, max, readOnly, highlight }) {
  return (
    <td className={`px-1 py-0.5 text-center border-r border-slate-100 ${highlight ? "bg-slate-50 font-semibold" : ""}`}>
      {readOnly ? (
        <span className={`text-sm ${highlight ? "text-slate-700" : "text-slate-600"}`}>
          {value !== "" && value !== null && value !== undefined ? Math.ceil(Number(value)) : "—"}
        </span>
      ) : (
        <input
          type="number"
          min={0}
          max={max}
          value={value === null || value === undefined ? "" : value}
          onChange={e => {
            let v = e.target.value;
            if (v === "") { onChange(null); return; }
            const n = Math.min(max, Math.max(0, Number(v)));
            onChange(n);
          }}
          className="w-12 text-center text-sm bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-300 rounded px-0.5 py-0"
        />
      )}
    </td>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Gradebook({ term, academicYear, currentUser, teacherSubject, teacherSubjects, teacherClasses }) {
  const { schoolName } = useSchoolSettings();

  const [selectedClass,   setSelectedClass]   = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [classStudents,   setClassStudents]   = useState([]);
  const [entries,         setEntries]         = useState({}); // student_id → entry object
  const [saving,          setSaving]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [savedIds,        setSavedIds]        = useState(new Set());
  const [allSubjects,     setAllSubjects]     = useState([]); // ALL subjects from Settings
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const isTeacher = currentUser?.school_role === "teacher";

  // Available classes for this user
  const availableClasses = isTeacher && teacherClasses?.length
    ? ALL_CLASSES.filter(c => teacherClasses.includes(c))
    : ALL_CLASSES;

  // Available subjects: for teachers, restrict to their assigned subjects (from class_assignments)
  const resolvedTeacherSubjects = teacherSubjects?.length
    ? teacherSubjects
    : (teacherSubject ? [teacherSubject] : []);

  const availableSubjects = selectedClass
    ? (isTeacher && resolvedTeacherSubjects.length
        ? allSubjects
            .filter(s => s.grade_levels && s.grade_levels.includes(selectedClass) && resolvedTeacherSubjects.includes(s.subject_name))
            .map(s => s.subject_name)
            .filter(Boolean)
            .sort()
        : allSubjects
            .filter(s => s.grade_levels && s.grade_levels.includes(selectedClass))
            .map(s => s.subject_name)
            .filter(Boolean)
            .sort()
      )
    : [];

  // ── Load ALL subjects from DB once on mount (same data as Settings → Subjects) ─
  useEffect(() => {
    setSubjectsLoading(true);
    Subject.list()
      .then(subs => {
        setAllSubjects(subs || []);
        setSubjectsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load subjects:", err);
        setSubjectsLoading(false);
      });
  }, []); // load once on mount — no need to reload per class change

  // ── Load students + existing entries when class/subject/term/year changes ───
  const load = useCallback(async () => {
    if (!selectedClass || !selectedSubject || !term || !academicYear) return;
    setLoading(true);
    try {
      // 1. Students in this class
      const studs = await Student.filter({ grade: selectedClass });
      const sorted = [...studs].sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      );
      setClassStudents(sorted);

      // 2. Existing gradebook entries (source of truth if saved)
      const { data: gbRows } = await supabase
        .from("gradebook_entries")
        .select("*")
        .eq("class", selectedClass)
        .eq("subject", selectedSubject)
        .eq("term", term)
        .eq("academic_year", academicYear);

      const byStudent = {};
      const ids = new Set();
      (gbRows || []).forEach(r => {
        byStudent[r.student_id] = {
          id: r.id,
          ca1:        r.ca1        ?? null,
          ca2:        r.ca2        ?? null,
          ca3:        r.ca3        ?? null,
          exam_score: r.exam_score ?? null,
          lt_cum:     r.lt_cum     ?? null,
          cum_avg:    r.cum_avg    ?? null,
        };
        ids.add(r.student_id);
      });

      // 3. For students with NO gradebook row at all, pre-populate from exam_results.
      //    Students who DO have a gradebook row (even if all scores are null) are left
      //    as-is — a null row means the user intentionally cleared it and we must
      //    not silently re-populate it from exam_results.
      const missingIds = sorted.filter(s => !ids.has(s.id)).map(s => s.id);

      if (missingIds.length > 0) {
        const { data: examRows } = await supabase
          .from("exam_results")
          .select("*")
          .in("student_id", missingIds)
          .eq("subject_name", selectedSubject)
          .eq("term", term)
          .eq("academic_year", academicYear);

        (examRows || []).forEach(r => {
          if (!byStudent[r.student_id]) {
            byStudent[r.student_id] = {
              ca1:        r.ca1_score          ?? null,
              ca2:        r.ca2_score          ?? null,
              ca3:        r.ca3_score          ?? null,
              exam_score: r.exam_score         ?? null,
              lt_cum:     r.lt_cum             ?? null,
              cum_avg:    r.cumulative_average  ?? null,
              _fromExam:  true,
            };
          }
        });
      }

      // 4. If rollover already created academic_records for this term, use them
      // to seed LT CUM for students who still have no gradebook/exam row.
      const selectedSubjectRecord = allSubjects.find(
        subject => subject.subject_name === selectedSubject
      );
      const selectedSubjectId = selectedSubjectRecord?.id;
      if (missingIds.length > 0 && selectedSubjectId) {
        const { data: academicRows } = await supabase
          .from("academic_records")
          .select("student_id, lt_cum, total_score")
          .in("student_id", missingIds)
          .eq("subject_id", selectedSubjectId)
          .eq("term", term)
          .eq("academic_year", academicYear);

        (academicRows || []).forEach(r => {
          const existing = byStudent[r.student_id];
          if (!existing) {
            byStudent[r.student_id] = {
              ca1: null,
              ca2: null,
              ca3: null,
              exam_score: null,
              lt_cum: r.lt_cum ?? null,
              cum_avg: null,
              _fromAcademicRecord: true,
            };
            return;
          }

          if ((existing.lt_cum === null || existing.lt_cum === undefined) && r.lt_cum !== null && r.lt_cum !== undefined) {
            existing.lt_cum = r.lt_cum;
          }
        });
      }

      // 5. Recover LT CUM from the previous term's subject result when older
      // rollovers created zeroed academic records instead of carrying it forward.
      const carryForwardIds = sorted
        .filter(student => {
          const entry = byStudent[student.id];
          const ltCum = Number(entry?.lt_cum);
          return !entry || !Number.isFinite(ltCum) || ltCum <= 0;
        })
        .map(student => student.id);

      const previousScope = getPreviousTermAndYear(term, academicYear);
      if (carryForwardIds.length > 0 && previousScope.term) {
        const { data: previousExamRows } = await supabase
          .from("exam_results")
          .select("student_id, cumulative_average, total_score, lt_cum")
          .in("student_id", carryForwardIds)
          .eq("subject_name", selectedSubject)
          .eq("term", previousScope.term)
          .eq("academic_year", previousScope.academicYear);

        (previousExamRows || []).forEach(r => {
          const recoveredLtCum = getCarryForwardScore(r);
          if (recoveredLtCum <= 0) return;

          const existing = byStudent[r.student_id];
          if (!existing) {
            byStudent[r.student_id] = {
              ca1: null,
              ca2: null,
              ca3: null,
              exam_score: null,
              lt_cum: recoveredLtCum,
              cum_avg: null,
              _fromPreviousTerm: true,
            };
            return;
          }

          if ((Number(existing.lt_cum) || 0) <= 0) {
            existing.lt_cum = recoveredLtCum;
          }
        });
      }

      setEntries(byStudent);
      setSavedIds(ids);
    } catch (err) {
      console.error("Gradebook load error:", err);
      toast.error("Failed to load gradebook");
    }
    setLoading(false);
  }, [selectedClass, selectedSubject, term, academicYear]);

  useEffect(() => { load(); }, [load]);

  // Auto-select first available class for teacher
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClass) setSelectedClass(availableClasses[0]);
  }, [availableClasses.length]);

  // Reset subject when class changes; auto-select first available subject
  useEffect(() => {
    if (!selectedClass) return;
    if (!availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0] || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, availableSubjects.join(",")]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const getEntry = (studentId) => entries[studentId] || { ca1: null, ca2: null, ca3: null, exam_score: null, lt_cum: null, cum_avg: null };

  // Return null when all CA inputs are null (no data entered)
  const caTotal = (e) => {
    if (e.ca1 === null && e.ca2 === null && e.ca3 === null) return null;
    return (e.ca1 ?? 0) + (e.ca2 ?? 0) + (e.ca3 ?? 0);
  };
  // Return null when all inputs are null
  const total = (e) => {
    const ct = caTotal(e);
    if (ct === null && e.exam_score === null) return null;
    return (ct ?? 0) + (e.exam_score ?? 0);
  };
  const cumAvg  = (e) => {
    const t  = total(e);
    if (t === null) return null;
    // Treat lt_cum as "exists" only when it is a number greater than 0
    const ltRaw = e.lt_cum;
    const lt = (ltRaw !== null && ltRaw !== undefined && Number(ltRaw) > 0)
      ? Number(ltRaw)
      : null;
    if (lt !== null) return (t + lt) / 2;
    return t;
  };

  // ── Update a field ────────────────────────────────────────────────────────────
  const updateField = (studentId, field, value) => {
    setEntries(prev => ({
      ...prev,
      [studentId]: { ...getEntry(studentId), ...prev[studentId], [field]: value },
    }));
  };

  // ── Save all ──────────────────────────────────────────────────────────────────
  const saveAll = async () => {
    if (!selectedClass || !selectedSubject) return;
    setSaving(true);
    try {
      const upserts = classStudents.map(s => {
        const e   = getEntry(s.id);
        const tot = total(e);
        const ca  = cumAvg(e);
        const { grade, remarks } = tot !== null ? getGradeAndRemark(tot, selectedClass) : { grade: "", remarks: "" };
        return {
          student_id:   s.id,
          class:        selectedClass,
          subject:      selectedSubject,
          term,
          academic_year: academicYear,
          ca1:          e.ca1,
          ca2:          e.ca2,
          ca3:          e.ca3,
          exam_score:   e.exam_score,
          lt_cum:       e.lt_cum,
          cum_avg:      ca !== null ? parseFloat(ca.toFixed(2)) : null,
          grade_letter: grade,
          remarks:      remarks,
        };
      });

      const { error: gbError } = await supabase
        .from("gradebook_entries")
        .upsert(upserts, { onConflict: "student_id,subject,term,academic_year" });

      if (gbError) throw gbError;

      // ── Also sync to exam_results so the Exam Results page stays in sync ──
      // When all scores are cleared, delete the exam_results row so stale data
      // can't be re-used to re-populate the gradebook on the next load.
      const clearedIds = classStudents
        .filter(s => total(getEntry(s.id)) === null)
        .map(s => s.id);

      if (clearedIds.length > 0) {
        await supabase
          .from("exam_results")
          .delete()
          .in("student_id", clearedIds)
          .eq("subject_name", selectedSubject)
          .eq("term", term)
          .eq("academic_year", academicYear);
      }

      // Only upsert rows that have at least one score entered
      const examUpserts = classStudents
        .map(s => {
          const e   = getEntry(s.id);
          const ct  = caTotal(e);
          const tot = total(e);
          const ca  = cumAvg(e);
          if (tot === null) return null; // skip students with no data at all
          const { grade, remarks } = getGradeAndRemark(tot, selectedClass);
          return {
            student_id:            s.id,
            subject_name:          selectedSubject,
            term,
            academic_year:         academicYear,
            ca1_score:             e.ca1            ?? 0,
            ca2_score:             e.ca2            ?? 0,
            ca3_score:             e.ca3            ?? 0,
            continuous_assessment: ct               ?? 0,
            exam_score:            e.exam_score     ?? 0,
            total_score:           tot              ?? 0,
            lt_cum:                e.lt_cum         ?? 0,
            cumulative_average:    ca !== null ? parseFloat(ca.toFixed(2)) : 0,
            grade,
            remarks,
          };
        })
        .filter(Boolean);

      if (examUpserts.length > 0) {
        const { error: examError } = await supabase
          .from("exam_results")
          .upsert(examUpserts, {
            onConflict: "student_id,subject_name,term,academic_year",
          });
        if (examError) console.warn("Exam results sync warning:", examError.message);
      }

      toast.success("Gradebook saved & synced to Exam Results");
      recordStreak(currentUser?.id, STREAK_TYPES.ACADEMIC_RECORDS);
      await load();
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save: " + (err.message || "Unknown error"));
    }
    setSaving(false);
  };

  // ── Print gradebook ──────────────────────────────────────────────────────────
  const printGradebook = () => {
    const isSSS = SSS_CLASSES.includes(selectedClass);
    const legend = isSSS
      ? [["A1","≥75"],["B2","70–74"],["B3","65–69"],["C4","60–64"],["C5","55–59"],["C6","50–54"],["D7","45–49"],["E8","40–44"],["F9","<40"]]
      : [["A","≥70"],["B","60–69"],["C","50–59"],["D","45–49"],["E","40–44"],["F","<40"]];

    const rows = classStudents.map((s, idx) => {
      const e   = getEntry(s.id);
      const ct  = caTotal(e);
      const tot = total(e);
      const ca  = cumAvg(e);
      const { grade, remarks } = tot !== null ? getGradeAndRemark(tot, selectedClass) : { grade: "—", remarks: "—" };
      const fmt = (v) => (v !== null && v !== undefined ? Math.ceil(Number(v)) : "—");
      return `
        <tr class="${idx % 2 === 0 ? "even" : "odd"}">
          <td class="center">${idx + 1}</td>
          <td class="name">${s.last_name} ${s.first_name}${s.reg_number ? ` <span class="reg">${s.reg_number}</span>` : ""}</td>
          <td class="center">${fmt(e.ca1)}</td>
          <td class="center">${fmt(e.ca2)}</td>
          <td class="center">${fmt(e.ca3)}</td>
          <td class="center bold">${fmt(ct)}</td>
          <td class="center">${fmt(e.exam_score)}</td>
          <td class="center bold">${fmt(tot)}</td>
          <td class="center">${fmt(e.lt_cum)}</td>
          <td class="center bold">${ca !== null ? Math.ceil(ca) : "—"}</td>
          <td class="center grade">${grade || "—"}</td>
          <td class="center">${remarks || "—"}</td>
        </tr>`;
    }).join("");

    const legendHtml = legend.map(([g, s]) =>
      `<span class="badge">${g} (${s})</span>`
    ).join(" ");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Gradebook — ${selectedClass} ${selectedSubject} ${term} ${academicYear}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 16px; }
    .header { text-align: center; margin-bottom: 14px; }
    .header h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
    .header h2 { font-size: 12px; margin-top: 4px; }
    .meta { display: flex; justify-content: center; gap: 24px; margin-top: 6px; font-size: 10px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #581c87; color: #fff; padding: 5px 6px; font-size: 10px; text-align: center; border: 1px solid #7e22ce; }
    th.left { text-align: left; }
    td { padding: 4px 6px; border: 1px solid #e2e8f0; font-size: 10px; }
    td.center { text-align: center; }
    td.name { min-width: 140px; }
    td.bold { font-weight: 700; background: #f8f5ff; }
    td.grade { font-weight: 800; }
    tr.even { background: #fff; }
    tr.odd  { background: #fafafa; }
    .reg { font-size: 8px; color: #94a3b8; }
    .legend { margin-top: 12px; font-size: 9px; color: #475569; }
    .badge { display: inline-block; margin-right: 4px; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
    .footer { margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: right; }
    @media print {
      @page { size: A3 landscape; margin: 12mm; }
      body { padding: 0; }
      .footer { position: fixed; bottom: 0; right: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${schoolName || BRAND.schoolName}</h1>
    <h2>Gradebook — ${selectedSubject}</h2>
    <div class="meta">
      <span><b>Class:</b> ${selectedClass}</span>
      <span><b>Term:</b> ${term}</span>
      <span><b>Year:</b> ${academicYear}</span>
      <span><b>Students:</b> ${classStudents.length}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">S/N</th>
        <th class="left" style="min-width:140px">Student Name</th>
        <th>CA 1<br/>/10</th>
        <th>CA 2<br/>/10</th>
        <th>CA 3<br/>/10</th>
        <th>CA Total<br/>/30</th>
        <th>Exam<br/>/70</th>
        <th>Total<br/>/100</th>
        <th>L.T. CUM</th>
        <th>Cum Avg</th>
        <th>Grade</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="legend">
    <b>${isSSS ? "SSS Scale (WAEC):" : "JSS / Primary Scale:"}</b> ${legendHtml}
    &nbsp;&nbsp; ✓ All auto-computed fields calculated at time of print.
  </div>
  <div class="footer">Printed: ${new Date().toLocaleString("en-NG", { day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1100,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // ── Grade legend for current class ───────────────────────────────────────────
  const isSSS = SSS_CLASSES.includes(selectedClass);
  const gradeLegend = isSSS
    ? [["A1","≥75","emerald"],["B2","70–74","blue"],["B3","65–69","blue"],["C4","60–64","amber"],["C5","55–59","amber"],["C6","50–54","amber"],["D7","45–49","orange"],["E8","40–44","red"],["F9","<40","red"]]
    : [["A","≥70","emerald"],["B","60–69","blue"],["C","50–59","amber"],["D","45–49","orange"],["E","40–44","red"],["F","<40","red"]];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Class</label>
            <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setSelectedSubject(""); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {availableClasses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Subject</label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject} disabled={!selectedClass || subjectsLoading}>
              <SelectTrigger className="h-9 text-sm">
                {subjectsLoading
                  ? <span className="flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
                  : <SelectValue placeholder="Select subject" />
                }
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Term</label>
            <div className="h-9 flex items-center px-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700">{term || "—"}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Year</label>
            <div className="h-9 flex items-center px-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700">{academicYear || "—"}</div>
          </div>
        </div>
      </div>

      {/* ── Prompt to select ── */}
      {(!selectedClass || !selectedSubject) && (
        <div className="text-center py-20 text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="font-medium">Select a class and subject to open the gradebook</p>
        </div>
      )}

      {/* ── Table ── */}
      {selectedClass && selectedSubject && (
        <>
          {/* Header row with title + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-slate-800">{selectedClass} — {selectedSubject}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{term} · {academicYear} · {classStudents.length} student{classStudents.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={printGradebook}
                disabled={loading || classStudents.length === 0}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
              >
                <Printer className="w-4 h-4" /> Print
              </Button>
              <Button onClick={saveAll} disabled={saving || loading} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save All"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full border-collapse text-sm min-w-[860px]">
              <thead>
                <tr className="bg-emerald-700 text-white text-xs">
                  <th className="px-3 py-2 text-left font-semibold w-8 border-r border-emerald-600">S/N</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[160px] border-r border-emerald-600">Student Name</th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">CA 1<br/><span className="font-normal opacity-75">/10</span></th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">CA 2<br/><span className="font-normal opacity-75">/10</span></th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">CA 3<br/><span className="font-normal opacity-75">/10</span></th>
                  <th className="px-2 py-2 text-center font-bold border-r border-emerald-500 bg-emerald-600">CA Total<br/><span className="font-normal opacity-75">/30</span></th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">Exam<br/><span className="font-normal opacity-75">/70</span></th>
                  <th className="px-2 py-2 text-center font-bold border-r border-emerald-500 bg-emerald-600">Total<br/><span className="font-normal opacity-75">/100</span></th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">L.T. CUM</th>
                  <th className="px-2 py-2 text-center font-bold border-r border-emerald-500 bg-emerald-600">Cum Avg</th>
                  <th className="px-2 py-2 text-center font-semibold border-r border-emerald-600">Grade</th>
                  <th className="px-3 py-2 text-center font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array(8).fill(0).map((_, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2.5 border-r border-slate-100">
                        <div className="h-2.5 w-4 rounded bg-slate-200 animate-pulse mx-auto" />
                      </td>
                      <td className="px-3 py-2.5 border-r border-slate-100">
                        <div className="h-2.5 w-36 rounded bg-slate-200 animate-pulse" />
                      </td>
                      {Array(10).fill(0).map((_, j) => (
                        <td key={j} className="px-2 py-2.5 border-r border-slate-100">
                          <div className="h-2.5 w-8 rounded bg-slate-200 animate-pulse mx-auto" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-400">
                      No students found in {selectedClass}
                    </td>
                  </tr>
                ) : (
                    classStudents.map((s, idx) => {
                      const e   = getEntry(s.id);
                      const ct  = caTotal(e);
                      const tot = total(e);
                      const ca  = cumAvg(e);
                      const { grade, remarks } = tot !== null ? getGradeAndRemark(tot, selectedClass) : { grade: "", remarks: "" };
                      const isSaved    = savedIds.has(s.id);
                      const isFromExam = !isSaved && e._fromExam;
                      return (
                        <tr key={s.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          {/* S/N */}
                          <td className="px-3 py-1.5 text-center text-slate-400 text-xs border-r border-slate-100">
                            {isSaved
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" title="Saved in gradebook" />
                              : isFromExam
                                ? <span className="text-[9px] text-emerald-400 font-bold" title="Pre-filled from Exam Results">ER</span>
                                : idx + 1
                            }
                          </td>
                          {/* Name */}
                          <td className="px-3 py-1.5 font-medium text-slate-800 border-r border-slate-100 whitespace-nowrap">
                            {s.last_name} {s.first_name}
                            {s.reg_number && <span className="ml-1 text-[10px] text-slate-400">{s.reg_number}</span>}
                          </td>
                          {/* CA 1 */}
                          <Cell value={e.ca1} max={10} onChange={v => updateField(s.id, "ca1", v)} />
                          {/* CA 2 */}
                          <Cell value={e.ca2} max={10} onChange={v => updateField(s.id, "ca2", v)} />
                          {/* CA 3 */}
                          <Cell value={e.ca3} max={10} onChange={v => updateField(s.id, "ca3", v)} />
                          {/* CA Total (auto) */}
                          <Cell value={ct} readOnly highlight />
                          {/* Exam */}
                          <Cell value={e.exam_score} max={70} onChange={v => updateField(s.id, "exam_score", v)} />
                          {/* Total (auto) */}
                          <Cell value={tot} readOnly highlight />
                          {/* LT CUM */}
                          <Cell value={e.lt_cum} max={100} onChange={v => updateField(s.id, "lt_cum", v)} />
                          {/* Cum Avg (auto-computed: avg of Total + LT CUM, or Total if no LT CUM) */}
                          <Cell value={ca} readOnly highlight />
                          {/* Grade (auto) */}
                          <td className="px-1 py-1.5 text-center border-r border-slate-100">
                            {grade && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[grade] || "bg-slate-100 text-slate-700"}`}>
                                {grade}
                              </span>
                            )}
                          </td>
                          {/* Remarks (auto-computed from grade) */}
                          <td className="px-3 py-1.5 text-center">
                            <span className={`text-xs font-medium ${REMARKS_COLORS[remarks] || "text-slate-500"}`}>
                              {remarks || "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          {/* ── Grade legend (adapts to class) ── */}
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="text-slate-400 font-medium mr-1">
              {isSSS ? "SSS Scale (WAEC):" : "JSS / Primary Scale:"}
            </span>
            {gradeLegend.map(([g, s, c]) => (
              <span key={g} className={`px-2 py-0.5 rounded bg-${c}-100 text-${c}-800 font-semibold`}>
                {g} ({s})
              </span>
            ))}
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 ml-2">✓ = already saved</span>
          </div>
        </>
      )}
    </div>
  );
}
