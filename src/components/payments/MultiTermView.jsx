import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";

const TERMS = ["First Term", "Second Term", "Third Term"];

function getStatus(paid, fees) {
  if (fees <= 0) return "na";
  if (paid >= fees) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

const statusBadge = {
  paid:    { label: "Paid",    className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-800 border-amber-200" },
  unpaid:  { label: "Unpaid",  className: "bg-red-100 text-red-800 border-red-200" },
  na:      { label: "N/A",     className: "bg-slate-100 text-slate-400 border-slate-200" },
};

const statusDot = {
  paid:    "🟢",
  partial: "🟡",
  unpaid:  "🔴",
  na:      "⬜",
};

function fmtAmount(n) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${Number(n || 0).toLocaleString()}`;
}

export default function MultiTermView({ students, allPayments, classFees, academicYear }) {
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [gradeFilter, setGradeFilter] = useState("all");

  const activeStudents = useMemo(() =>
    (students || []).filter(s => s.enrollment_status === "active"),
    [students]
  );

  const grades = useMemo(() => {
    const set = new Set(activeStudents.map(s => s.grade).filter(Boolean));
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [activeStudents]);

  const filteredStudents = gradeFilter === "all"
    ? activeStudents
    : activeStudents.filter(s => s.grade === gradeFilter);

  const getStudentTermData = (student) => {
    return TERMS.map(term => {
      const feeSnapshot = getStudentFeeSnapshot({
        student,
        classFees,
        term,
        academicYear,
      });
      const fees = feeSnapshot.totalWithoutArrears;
      const termPayments = (allPayments || []).filter(
        p => p.student_id === student.id &&
             p.term === term &&
             p.academic_year === academicYear &&
             (p.payment_status === "paid" || p.payment_status === "partial")
      );
      const paid = termPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const status = getStatus(paid, fees);
      return { term, paid, fees, status, payments: termPayments };
    });
  };

  // Summary per term
  const termTotals = TERMS.map(term => {
    const total = filteredStudents.reduce((sum, student) => {
      const termData = (allPayments || []).filter(
        p => p.student_id === student.id &&
             p.term === term &&
             p.academic_year === academicYear &&
             (p.payment_status === "paid" || p.payment_status === "partial")
      ).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return sum + termData;
    }, 0);
    return total;
  });

  const rows = filteredStudents.map(student => {
    const termData = getStudentTermData(student);
    const totalPaid = termData.reduce((s, t) => s + t.paid, 0);
    return { student, termData, totalPaid };
  }).sort((a, b) => {
    const gradeComp = (a.student.grade || "").localeCompare(b.student.grade || "", undefined, { numeric: true });
    if (gradeComp !== 0) return gradeComp;
    return `${a.student.first_name} ${a.student.last_name}`.localeCompare(`${b.student.first_name} ${b.student.last_name}`);
  });

  return (
    <div className="space-y-4">
      {/* Grade filter chips */}
      <div className="flex flex-wrap gap-2">
        {grades.map(g => (
          <button
            key={g}
            onClick={() => setGradeFilter(g)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              gradeFilter === g
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {g === "all" ? "All Grades" : g}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {TERMS.map((term, i) => (
          <div key={term} className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 font-medium">{term}</p>
            <p className="text-lg font-bold text-blue-800">{fmtAmount(termTotals[i])}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {Object.entries(statusDot).map(([k, dot]) => (
          <span key={k}>{dot} {statusBadge[k].label}</span>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Student</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Class</th>
              {TERMS.map(t => (
                <th key={t} className="text-center py-3 px-4 font-semibold text-slate-600">{t}</th>
              ))}
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Total Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">No students found</td>
              </tr>
            ) : rows.map(({ student, termData, totalPaid }) => {
              const isExpanded = expandedStudent === student.id;
              const studentName = `${student.first_name} ${student.last_name}`;
              return (
                <>
                  <tr
                    key={student.id}
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${isExpanded ? "bg-emerald-50/50" : "hover:bg-slate-50"}`}
                    onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                  >
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        {studentName}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{student.grade}</td>
                    {termData.map(({ term, status }) => (
                      <td key={term} className="py-3 px-4 text-center">
                        <span className="text-base" title={statusBadge[status].label}>
                          {statusDot[status]}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {fmtAmount(totalPaid)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${student.id}-expanded`} className="bg-emerald-50/30 border-b border-emerald-100">
                      <td colSpan={6} className="px-8 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {termData.map(({ term, paid, fees, status, payments }) => (
                            <div key={term} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-700">{term}</span>
                                <Badge className={`${statusBadge[status].className} border text-xs`}>
                                  {statusDot[status]} {statusBadge[status].label}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">
                                Paid: <span className="font-medium text-slate-700">₦{paid.toLocaleString()}</span>
                                {fees > 0 && <> / ₦{fees.toLocaleString()}</>}
                              </p>
                              {payments.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {payments.map(p => (
                                    <div key={p.id} className="text-xs text-slate-400">
                                      ₦{Number(p.amount || 0).toLocaleString()} · {p.payment_date || "—"}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
