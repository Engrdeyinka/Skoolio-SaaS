/**
 * QuickPayStudentPicker
 * Step-1 modal: pick a student → loads fees → hands off to QuickPayModal.
 * Used by both Dashboard and the Payments page "Quick Payment" button.
 */
import React, { useEffect, useState } from "react";
import { X, CreditCard, Search } from "lucide-react";
import { ClassFee } from "@/entities/ClassFee";
import { Payment } from "@/entities/Payment";
import QuickPayModal from "./QuickPayModal";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { getPaymentDiscountPct, getStudentArrearsTotal, isStudentActiveForTerm, loadPaymentDiscounts, loadStudentStartTerms } from "@/lib/paymentBalances";
import { getLagosYear } from "@/lib/timezone";

const CUR_YEAR   = getLagosYear();
const DEFAULT_YR = `${CUR_YEAR - 1}/${CUR_YEAR}`;

export default function QuickPayStudentPicker({
  students,
  onClose,
  defaultTerm,
  defaultYear,
}) {
  const [search,       setSearch]       = useState("");
  const [term,         setTerm]         = useState(defaultTerm || "First Term");
  const [academicYear, setAcademicYear] = useState(defaultYear || DEFAULT_YR);
  const [selected,     setSelected]     = useState(null);
  const [feeData,      setFeeData]      = useState(null);
  const [alreadyPaid,  setAlreadyPaid]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [studentStartTerms, setStudentStartTerms] = useState({});
  const [discountCache,     setDiscountCache]     = useState({});

  // Pre-fetch both start-terms and discounts in parallel at mount so
  // handleSelect doesn't need to fetch discounts at student-tap time.
  useEffect(() => {
    let active = true;
    Promise.all([
      loadStudentStartTerms().catch(() => ({})),
      loadPaymentDiscounts().catch(() => ({})),
    ]).then(([terms, discounts]) => {
      if (!active) return;
      setStudentStartTerms(terms || {});
      setDiscountCache(discounts || {});
    });
    return () => { active = false; };
  }, []);

  const active   = (students || []).filter(s =>
    s.enrollment_status === "active" &&
    isStudentActiveForTerm(s, term, academicYear, studentStartTerms)
  );
  const filtered = search.trim()
    ? active.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        (s.grade || "").toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : active.slice(0, 6);

  async function handleSelect(student) {
    setLoading(true);
    try {
      const [feeRecords, payments] = await Promise.all([
        ClassFee.filter({ grade: student.grade }).catch(() => []),
        Payment.filter({ student_id: student.id }).catch(() => []),
      ]);

      const discountPct = getPaymentDiscountPct(discountCache, student.id, term, academicYear);
      const arrears = getStudentArrearsTotal({
        student,
        payments,
        term,
        academicYear,
        startTermRecords: studentStartTerms,
      });

      const feeSnapshot = getStudentFeeSnapshot({
        student,
        classFees: feeRecords,
        term,
        academicYear,
        discountPct,
      });
      const total = feeSnapshot.totalWithoutArrears + arrears;

      const termPaid  = payments
        .filter(p => p.term === term && p.academic_year === academicYear &&
                     (p.payment_status === "paid" || p.payment_status === "partial"))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);

      setFeeData({
        tuition: Number(feeSnapshot.tuition) || 0,
        otherFees: feeSnapshot.otherFees,
        arrears,
        total,
        discountPct,
      });
      setAlreadyPaid(termPaid);
      setSelected(student);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Step 2 — hand off to real QuickPayModal
  if (selected && feeData) {
    return (
      <QuickPayModal
        student={selected}
        term={term}
        academicYear={academicYear}
        totalFees={feeData.total}
        alreadyPaid={alreadyPaid}
        feeBreakdown={{ tuition: feeData.tuition, otherFees: feeData.otherFees, arrears: feeData.arrears }}
        discountPct={feeData.discountPct || 0}
        onClose={onClose}
        onSuccess={() => {}}
      />
    );
  }

  // Step 1 — student picker
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <CreditCard className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Quick Payment</h2>
              <p className="text-xs text-gray-500">Select a student to record payment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Term / Year selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
              <select
                value={term}
                onChange={e => setTerm(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {["First Term", "Second Term", "Third Term"].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Academic Year</label>
              <input
                value={academicYear}
                onChange={e => setAcademicYear(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. 2025/2026"
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or class…"
              autoFocus
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Student list */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No students found</p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 transition-colors text-left group"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">
                        {s.first_name?.[0]}{s.last_name?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-gray-400">{s.grade}</p>
                    </div>
                    <span className="text-xs text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      Pay →
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
