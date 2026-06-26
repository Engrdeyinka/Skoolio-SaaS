import { useMemo } from "react";
import { X, Receipt, CreditCard, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { formatDateInLagos } from "@/lib/timezone";

const statusColors = {
  paid:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-blue-100 text-blue-800 border-blue-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
};

const methodLabel = {
  cash:          "Cash",
  bank_transfer: "Bank Transfer",
  online:        "Online",
  check:         "Cheque",
  credit_card:   "Card",
};
const MANUAL_OPENING_PAID_TAG = "[opening_paid_before_app]";

function getPaymentNoteLabel(notes) {
  if (!notes) return "";
  const noteText = String(notes).trim();
  if (!noteText) return "";
  if (noteText.includes(MANUAL_OPENING_PAID_TAG)) return "Manual input";
  return noteText;
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    const str = String(d);
    // Date-only strings (YYYY-MM-DD) must be parsed as local time, not UTC,
    // to avoid showing the wrong day in non-UTC timezones.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + "T00:00:00") : new Date(str);
    return formatDateInLagos(date, { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

export default function StudentHistoryDrawer({ student, allPayments, classFees, onClose }) {
  const studentName = `${student?.first_name || ""} ${student?.last_name || ""}`.trim();
  const initials = [student?.first_name?.[0], student?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  // Get this student's payments, grouped by term+year
  const studentPayments = useMemo(() => {
    if (!student?.id) return [];
    return (allPayments || []).filter(p => p.student_id === student.id);
  }, [allPayments, student?.id]);

  const grouped = useMemo(() => {
    const map = {};
    for (const p of studentPayments) {
      const key = `${p.term}||${p.academic_year}`;
      if (!map[key]) map[key] = { term: p.term, year: p.academic_year, payments: [] };
      map[key].payments.push(p);
    }
    // Sort newest first by year+term order
    const termOrder = { "Third Term": 3, "Second Term": 2, "First Term": 1 };
    return Object.values(map).sort((a, b) => {
      const yearDiff = b.year?.localeCompare(a.year || "") || 0;
      if (yearDiff !== 0) return yearDiff;
      return (termOrder[b.term] || 0) - (termOrder[a.term] || 0);
    });
  }, [studentPayments]);

  // Compute total fees for a given year
  const getTermFees = (term, year) => {
    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees,
      term,
      academicYear: year,
    });
    return feeSnapshot.totalWithoutArrears;
  };

  if (!student) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow">
              {initials}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{studentName}</h2>
              <p className="text-xs text-slate-500">{student.grade}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/70 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {grouped.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Receipt className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No payment history found</p>
            </div>
          ) : (
            grouped.map(({ term, year, payments }) => {
              const termFees = getTermFees(term, year);
              const termPaid = payments
                .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
                .reduce((s, p) => s + (Number(p.amount) || 0), 0);
              const termBalance = Math.max(0, termFees - termPaid);
              const pct = termFees > 0 ? Math.min(100, Math.round((termPaid / termFees) * 100)) : 0;

              return (
                <div key={`${term}||${year}`} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Term header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-800 text-sm">{term} · {year}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Paid: <span className="font-semibold text-emerald-700">₦{termPaid.toLocaleString()}</span>
                      {termFees > 0 && (
                        <> / <span className="text-slate-600">₦{termFees.toLocaleString()}</span></>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  {termFees > 0 && (
                    <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-slate-300"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{pct}%</span>
                        {termBalance > 0 && (
                          <span className="text-xs text-red-500 font-medium">₦{termBalance.toLocaleString()} left</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Individual payments */}
                  <div className="divide-y divide-slate-100">
                    {payments
                      .sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""))
                      .map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <CreditCard className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                ₦{Number(p.amount || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-slate-400">
                                {fmtDate(p.payment_date || p.created_at)} · {methodLabel[p.payment_method] || p.payment_method}
                              </p>
                              {getPaymentNoteLabel(p.notes) && (
                                <p className="text-xs text-slate-400 italic">{getPaymentNoteLabel(p.notes)}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={`${statusColors[p.payment_status] || ""} border text-xs`}>
                            {p.payment_status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-400 text-center">
            {studentPayments.length} payment record{studentPayments.length !== 1 ? "s" : ""} across {grouped.length} term{grouped.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </>
  );
}
