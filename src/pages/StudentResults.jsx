import React, { useState, useEffect } from "react";
import { Student, ExamResult } from "@/entities/all";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, ArrowLeft, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { canStudentsViewResultsForStatus, getResultsWorkflowStatus } from "@/lib/resultsWorkflow";

const GRADE_COLOR = (grade) => {
  if (!grade) return "bg-slate-100 text-slate-600";
  if (grade.startsWith("A")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-800 border-blue-200";
  if (grade.startsWith("C")) return "bg-amber-100 text-amber-800 border-amber-200";
  if (grade.startsWith("D") || grade.startsWith("E")) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
};

function fmt(val) {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  return Number.isFinite(n) ? (Number.isInteger(n) ? n : n.toFixed(1)) : "—";
}

export default function StudentResults() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { term: schoolTerm, year: schoolYear, schoolName, loading: settingsLoading } = useSchoolSettings();

  const [student,          setStudent]          = useState(null);
  const [entries,          setEntries]          = useState([]); // gradebook_entries rows
  const [examResults,      setExamResults]      = useState([]); // exam_results rows (grade/remarks/position)
  const [isLoading,        setIsLoading]        = useState(true);
  const [filters,          setFilters]          = useState({ term: "", academic_year: "" });
  const [hasTouchedFilters,setHasTouchedFilters]= useState(false);
  const [workflow,         setWorkflow]         = useState({ status: "draft" });

  // Seed filters from school settings
  useEffect(() => {
    if (hasTouchedFilters) return;
    if (!schoolTerm || !schoolYear) return;
    setFilters({ term: schoolTerm, academic_year: schoolYear });
  }, [schoolTerm, schoolYear, hasTouchedFilters]);

  // Load student info once
  useEffect(() => {
    if (!currentUser) return;
    if (!currentUser.linked_student_id) { setIsLoading(false); return; }
    Student.list()
      .then(list => setStudent(list.find(s => s.id === currentUser.linked_student_id) || null))
      .catch(() => {});
  }, [currentUser]);

  // Load results whenever filters change
  useEffect(() => {
    if (!filters.term || !filters.academic_year || !currentUser?.linked_student_id) return;
    setIsLoading(true);

    const sid = currentUser.linked_student_id;

    Promise.all([
      // gradebook_entries — has ca1/ca2/ca3/exam_score/lt_cum
      supabase
        .from("gradebook_entries")
        .select("*")
        .eq("student_id", sid)
        .eq("term", filters.term)
        .eq("academic_year", filters.academic_year),

      // exam_results — has grade/remarks/position/total_score
      ExamResult.filter({ student_id: sid }),

      // workflow status
      getResultsWorkflowStatus(filters.term, filters.academic_year).catch(() => ({ status: "draft" })),
    ])
      .then(([gbRes, erRows, wf]) => {
        setEntries(gbRes.data || []);
        setExamResults(erRows || []);
        setWorkflow(wf || { status: "draft" });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [filters, currentUser]);

  if (isLoading || settingsLoading || !filters.term || !filters.academic_year) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Build merged row per subject
  const erMap = {};
  for (const r of examResults) {
    if (r.term === filters.term && r.academic_year === filters.academic_year) {
      // keep latest per subject
      if (!erMap[r.subject_name] || r.id > erMap[r.subject_name].id) {
        erMap[r.subject_name] = r;
      }
    }
  }

  // Merge gradebook entries with exam_results
  const subjectRows = entries.map(e => {
    const er = erMap[e.subject] || {};
    const ca1 = e.ca1 ?? er.ca1_score ?? null;
    const ca2 = e.ca2 ?? er.ca2_score ?? null;
    const ca3 = e.ca3 ?? er.ca3_score ?? null;
    const caTotal = (ca1 !== null || ca2 !== null || ca3 !== null)
      ? (Number(ca1 || 0) + Number(ca2 || 0) + Number(ca3 || 0))
      : null;
    const exam   = e.exam_score ?? er.exam_score ?? null;
    const total  = e.total_score ?? er.total_score ?? (caTotal !== null && exam !== null ? caTotal + Number(exam) : null);
    const grade   = er.grade  || e.grade  || null;
    const remarks = er.remarks || e.remarks || null;
    const ltCum   = e.lt_cum  ?? er.lt_cum  ?? null;
    const cumAvg  = e.cum_avg ?? er.cumulative_average ?? null;
    return { subject: e.subject, ca1, ca2, ca3, caTotal, exam, total, grade, remarks, ltCum, cumAvg };
  });

  // Add any exam_result subjects not in gradebook_entries
  for (const [subj, er] of Object.entries(erMap)) {
    if (!subjectRows.find(r => r.subject === subj)) {
      const ca1 = er.ca1_score ?? null;
      const ca2 = er.ca2_score ?? null;
      const ca3 = er.ca3_score ?? null;
      const caTotal = (ca1 !== null || ca2 !== null || ca3 !== null)
        ? (Number(ca1 || 0) + Number(ca2 || 0) + Number(ca3 || 0))
        : null;
      const exam  = er.exam_score ?? null;
      const total = er.total_score ?? null;
      subjectRows.push({
        subject: subj, ca1, ca2, ca3, caTotal, exam, total,
        grade: er.grade || null, remarks: er.remarks || null,
        ltCum: er.lt_cum ?? null, cumAvg: er.cumulative_average ?? null,
      });
    }
  }

  subjectRows.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));

  // Visibility is driven by workflow status, not per-row results_released flags.
  // "published"  → students can see results
  // "locked"     → results frozen/hidden (show locked message)
  // draft/review/approved → not yet released
  const isLocked    = workflow.status === "locked";
  const isPublished = workflow.status === "published";
  const canView     = isPublished;

  // Summary stats
  const scored = subjectRows.filter(r => r.total !== null);
  const overallAvg = scored.length
    ? (scored.reduce((s, r) => s + Number(r.total), 0) / scored.length).toFixed(1)
    : null;
  const position = examResults.find(r =>
    r.term === filters.term && r.academic_year === filters.academic_year && r.position
  )?.position || null;

  const availableYears = Array.from(
    new Set([schoolYear, ...examResults.map(r => r?.academic_year)].filter(Boolean))
  ).sort((a, b) => Number(String(b).split("/")[0]) - Number(String(a).split("/")[0]));

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-3xl font-bold text-slate-900">My Results</h1>
          <p className="text-slate-500 mt-1">Your academic performance record</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
            <Select value={filters.term} onValueChange={v => { setHasTouchedFilters(true); setFilters(p => ({ ...p, term: v })); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="First Term">First Term</SelectItem>
                <SelectItem value="Second Term">Second Term</SelectItem>
                <SelectItem value="Third Term">Third Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
            <Select value={filters.academic_year} onValueChange={v => { setHasTouchedFilters(true); setFilters(p => ({ ...p, academic_year: v })); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Locked state */}
        {isLocked ? (
          <Card className="bg-white border border-slate-200">
            <CardContent className="text-center py-16">
              <Lock className="w-14 h-14 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Results Locked</h3>
              <p className="text-slate-500 text-sm">Your school has temporarily restricted access to results for this term.<br />Please contact your teacher.</p>
            </CardContent>
          </Card>
        ) : !isPublished ? (
          <Card className="bg-white border border-slate-200">
            <CardContent className="text-center py-16">
              <BookOpen className="w-14 h-14 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Results Not Yet Released</h3>
              <p className="text-slate-500 text-sm">Your results for this term have not been released yet.<br />Please check back later or ask your teacher.</p>
            </CardContent>
          </Card>
        ) : subjectRows.length === 0 ? (
          <Card className="bg-white border border-slate-200">
            <CardContent className="text-center py-16">
              <BookOpen className="w-14 h-14 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Results Yet</h3>
              <p className="text-slate-500 text-sm">No scores have been entered for this term yet.<br />Check back once your teacher has recorded your results.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Student info + summary */}
            {student && (
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl border border-emerald-100 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{student.first_name} {student.last_name}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{student.grade} &nbsp;·&nbsp; {filters.term} &nbsp;·&nbsp; {filters.academic_year}</p>
                    {student.reg_number && <p className="text-xs text-slate-500 mt-0.5">Reg: {student.reg_number}</p>}
                  </div>
                  <div className="flex gap-4 flex-wrap">
                    {overallAvg !== null && (
                      <div className="text-center bg-white rounded-xl px-5 py-3 border border-slate-200 shadow-sm">
                        <p className="text-2xl font-bold text-emerald-700">{overallAvg}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Average</p>
                      </div>
                    )}
                    {position && (
                      <div className="text-center bg-white rounded-xl px-5 py-3 border border-slate-200 shadow-sm">
                        <p className="text-2xl font-bold text-blue-700">{position}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Position</p>
                      </div>
                    )}
                    <div className="text-center bg-white rounded-xl px-5 py-3 border border-slate-200 shadow-sm">
                      <p className="text-2xl font-bold text-slate-800">{scored.length}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Subjects</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Broadsheet table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Subject Scores</h2>
                <span className="text-xs text-slate-400">{filters.term} · {filters.academic_year}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide sticky left-0 bg-slate-900 z-10 min-w-[140px]">Subject</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">CA 1</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">CA 2</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">CA 3</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap bg-slate-800">CA Total</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">Exam</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap bg-emerald-800">Total</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">L.T. CUM</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide whitespace-nowrap">Cum Ave</th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wide">Grade</th>
                      <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjectRows.map((row, i) => (
                      <tr key={row.subject} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-inherit z-10">{row.subject}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{fmt(row.ca1)}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{fmt(row.ca2)}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{fmt(row.ca3)}</td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-800 bg-slate-50">{fmt(row.caTotal)}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{fmt(row.exam)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold text-base ${Number(row.total) >= 50 ? "text-emerald-700" : Number(row.total) >= 40 ? "text-amber-700" : "text-red-700"}`}>
                            {fmt(row.total)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{fmt(row.ltCum)}</td>
                        <td className="px-4 py-3 text-center text-slate-600 font-medium">{fmt(row.cumAvg)}</td>
                        <td className="px-4 py-3 text-center">
                          {row.grade
                            ? <Badge className={`text-xs font-bold ${GRADE_COLOR(row.grade)}`}>{row.grade}</Badge>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 italic text-xs">{row.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Footer totals row */}
                  {scored.length > 0 && (
                    <tfoot>
                      <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                        <td className="px-4 py-3 font-bold text-slate-900 sticky left-0 bg-emerald-50">Summary</td>
                        <td colSpan={5} />
                        <td className="px-4 py-3 text-center font-bold text-emerald-800 text-base">
                          Avg: {overallAvg}
                        </td>
                        <td colSpan={4} className="px-4 py-3 text-xs text-slate-500">
                          {position ? `Class position: ${position}` : ""}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
