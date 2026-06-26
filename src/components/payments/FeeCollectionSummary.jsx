import { useMemo } from "react";
import { TrendingUp, Users, AlertCircle } from "lucide-react";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { getPaymentDiscountPct, getStudentArrearsTotal } from "@/lib/paymentBalances";

function fmtAmount(n) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${Number(n || 0).toLocaleString()}`;
}

/**
 * Grade-by-grade fee collection progress for a specific term/year.
 *
 * Props:
 *  students    — all Student records
 *  payments    — all Payment records (already filtered by term + academicYear externally or here)
 *  classFees   — all ClassFee records
 *  term        — e.g. "First Term"
 *  academicYear — e.g. "2024/2025"
 */
export default function FeeCollectionSummary({ students, payments, classFees, term, academicYear, discounts = {} }) {
  // Filter payments to this term/year — same as buildBalanceRows
  const termPayments = useMemo(
    () => payments.filter(p => p.term === term && p.academic_year === academicYear),
    [payments, term, academicYear]
  );

  const gradeRows = useMemo(() => {
    const activeStudents = students.filter(s => s.enrollment_status === "active");

    // Group by grade
    const gradeMap = {};
    for (const student of activeStudents) {
      if (!gradeMap[student.grade]) gradeMap[student.grade] = [];
      gradeMap[student.grade].push(student);
    }

    return Object.entries(gradeMap)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([grade, gradeStudents]) => {
        let totalExpected = 0;
        let totalCollected = 0;
        let fullyPaidCount = 0;
        let partialCount = 0;
        let unpaidCount = 0;

        for (const student of gradeStudents) {
          const stuPayments = termPayments.filter(p => p.student_id === student.id);

          // Total paid — identical to buildBalanceRows (includes manual opening paid)
          const paid = stuPayments
            .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

          // Arrears — payments with "arrears" in notes, same as buildBalanceRows
          const discountPct = getPaymentDiscountPct(discounts, student.id, term, academicYear);
          const feeSnapshot = getStudentFeeSnapshot({
            student,
            classFees,
            term,
            academicYear,
            discountPct,
          });
          const arrearsTotal = getStudentArrearsTotal({
            student,
            payments,
            term,
            academicYear,
          });
          const fees = feeSnapshot.totalWithoutArrears + arrearsTotal;

          totalExpected += fees;
          totalCollected += paid;

          if (paid >= fees && fees > 0) fullyPaidCount++;
          else if (paid > 0) partialCount++;
          else unpaidCount++;
        }

        const pct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
        return {
          grade,
          total: gradeStudents.length,
          fullyPaidCount,
          partialCount,
          unpaidCount,
          totalExpected,
          totalCollected,
          outstanding: Math.max(0, totalExpected - totalCollected),
          pct,
        };
      });
  }, [students, classFees, termPayments, discounts, term, academicYear]);

  if (gradeRows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Users className="w-14 h-14 mx-auto mb-4 opacity-30" />
        <p className="text-sm">No active students found</p>
      </div>
    );
  }

  const grandExpected = gradeRows.reduce((s, r) => s + r.totalExpected, 0);
  const grandCollected = gradeRows.reduce((s, r) => s + r.totalCollected, 0);
  const grandOutstanding = gradeRows.reduce((s, r) => s + r.outstanding, 0);
  const grandPct = grandExpected > 0 ? Math.round((grandCollected / grandExpected) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overall summary banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Total Expected</p>
          <p className="text-2xl font-bold text-emerald-800">{fmtAmount(grandExpected)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Collected</p>
          <p className="text-2xl font-bold text-blue-800">{fmtAmount(grandCollected)}</p>
          <p className="text-xs text-blue-500 mt-1">{grandPct}% of total</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-red-800">{fmtAmount(grandOutstanding)}</p>
        </div>
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Overall collection progress</span>
          <span className="font-semibold text-slate-700">{grandPct}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${grandPct >= 80 ? "bg-emerald-500" : grandPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${grandPct}%` }}
          />
        </div>
      </div>

      {/* Per-grade breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Grade</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Students</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Fully Paid</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Partial</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Unpaid</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Expected</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Collected</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Outstanding</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600 min-w-[120px]">Progress</th>
            </tr>
          </thead>
          <tbody>
            {gradeRows.map((row) => (
              <tr key={row.grade} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-3 font-semibold text-slate-900">{row.grade}</td>
                <td className="py-3 px-3 text-center text-slate-600">{row.total}</td>
                <td className="py-3 px-3 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                    {row.fullyPaidCount}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  {row.partialCount > 0 ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs">
                      {row.partialCount}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 px-3 text-center">
                  {row.unpaidCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {row.unpaidCount}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 px-3 text-right text-slate-700">{fmtAmount(row.totalExpected)}</td>
                <td className="py-3 px-3 text-right text-emerald-700 font-medium">{fmtAmount(row.totalCollected)}</td>
                <td className={`py-3 px-3 text-right font-bold ${row.outstanding > 0 ? "text-red-600" : "text-slate-300"}`}>
                  {row.outstanding > 0 ? fmtAmount(row.outstanding) : "—"}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${row.pct >= 80 ? "bg-emerald-500" : row.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-9 text-right">{row.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="py-3 px-3 font-bold text-slate-900" colSpan={2}>All Grades</td>
              <td colSpan={3} />
              <td className="py-3 px-3 text-right font-bold text-slate-800">{fmtAmount(grandExpected)}</td>
              <td className="py-3 px-3 text-right font-bold text-emerald-700">{fmtAmount(grandCollected)}</td>
              <td className={`py-3 px-3 text-right font-bold ${grandOutstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {grandOutstanding > 0 ? fmtAmount(grandOutstanding) : "—"}
              </td>
              <td className="py-3 px-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">{grandPct}%</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
