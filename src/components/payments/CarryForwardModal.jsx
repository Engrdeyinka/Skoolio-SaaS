import React, { useState, useEffect } from "react";
import { Payment } from "@/entities/Payment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, ArrowRight, AlertTriangle, CheckCircle, Loader2, RefreshCw, Users } from "lucide-react";
import { motion } from "framer-motion";
import { ClassFee } from "@/entities/ClassFee";
import { buildStudentBalanceRows, loadPaymentDiscounts, loadStudentStartTerms } from "@/lib/paymentBalances";
import { isFeeGroupEffectiveForTerm } from "@/lib/feeGroups";

const TERMS = ["First Term", "Second Term", "Third Term"];
const YEARS = ["2023/2024", "2024/2025", "2025/2026", "2026/2027"];

// Determine the "next" term/year automatically
function nextTerm(term, year) {
  const idx = TERMS.indexOf(term);
  if (idx < 2) return { term: TERMS[idx + 1], year };
  // Third Term → First Term of next academic year
  const [start, end] = year.split("/").map(Number);
  return { term: "First Term", year: `${start + 1}/${end + 1}` };
}

export default function CarryForwardModal({ students, onClose, onSuccess }) {
  const [fromTerm, setFromTerm]       = useState("First Term");
  const [fromYear, setFromYear]       = useState("2024/2025");
  const [toTerm, setToTerm]           = useState("Second Term");
  const [toYear, setToYear]           = useState("2024/2025");
  const [existingMode, setExistingMode] = useState("keep_existing");
  const [preview, setPreview]         = useState(null);   // null = not yet previewed
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isTransferring, setIsTransferring]     = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [error, setError]             = useState(null);

  // Keep "to" term in sync when "from" changes (default to next term)
  useEffect(() => {
    const nxt = nextTerm(fromTerm, fromYear);
    setToTerm(nxt.term);
    setToYear(nxt.year);
    setPreview(null);
  }, [fromTerm, fromYear]);

  const handlePreview = async () => {
    setIsLoadingPreview(true);
    setError(null);
    setPreview(null);
    try {
      // Fetch all payments and fee schedules for the source term/year
      const [allPayments, allClassFees, discounts, studentStartTerms] = await Promise.all([
        Payment.list("-payment_date"),
        ClassFee.list().catch(() => []),
        loadPaymentDiscounts().catch(() => ({})),
        loadStudentStartTerms().catch(() => ({})),
      ]);

      const fromPayments = allPayments.filter(
        (payment) => payment.term === fromTerm && payment.academic_year === fromYear
      );

      // If no payment records exist at all for this term, report it clearly
      // instead of treating every student as fully unpaid.
      if (!fromPayments || fromPayments.length === 0) {
        setPreview({ rows: [], alreadyCarried: new Set(), noRecords: true });
        setIsLoadingPreview(false);
        return;
      }

      // Use the same balance engine as the main Payments page so scholarships
      // and prior arrears are handled consistently.
      const carryForwardNote = `Arrears carried forward from ${fromTerm} ${fromYear}`;
      const sourceTermSupportsFeeGroups = isFeeGroupEffectiveForTerm(fromTerm, fromYear);

      const rows = buildStudentBalanceRows({
        students,
        payments: allPayments,
        classFees: allClassFees,
        term: fromTerm,
        academicYear: fromYear,
        discounts,
        startTermRecords: studentStartTerms,
        includeFeeGroups: sourceTermSupportsFeeGroups,
      })
        .filter((row) => row.balance > 0)
        .map((row) => ({
          student: row.student,
          paid: row.totalPaid,
          balance: row.balance,
          termFee: Number(row.feeSnapshot?.totalWithoutArrears || 0),
          arrearsTotal: Number(row.arrearsTotal || 0),
          discountPct: Number(row.discountPct || 0),
        }));

      // Check which students already have a carry-forward record in the to-term
      const toPayments = await Payment.filter({ term: toTerm, academic_year: toYear });
      const existingRows = toPayments.filter(
        (payment) => String(payment.notes || "").includes(carryForwardNote)
      );
      const alreadyCarried = new Set(existingRows.map((payment) => payment.student_id));

      setPreview({ rows, alreadyCarried, existingRows, carryForwardNote, noRecords: false });
    } catch (err) {
      setError("Failed to load payment data. Please try again.");
      console.error(err);
    }
    setIsLoadingPreview(false);
  };

  const handleTransfer = async () => {
    if (!preview) return;
    setIsTransferring(true);
    setError(null);
    try {
      if (existingMode === "clean_target_only" && (preview.existingRows?.length || 0) > 0) {
        setError(`Target term already has ${preview.existingRows.length} carried-forward row(s) from ${fromTerm} ${fromYear}. Change the mode or clear them first.`);
        setIsTransferring(false);
        return;
      }

      if (existingMode === "replace_existing" && (preview.existingRows?.length || 0) > 0) {
        const idsToDelete = preview.existingRows.map((row) => row.id).filter(Boolean);
        if (idsToDelete.length > 0) {
          await Payment.bulkDelete(idsToDelete);
        }
      }

      const rowsToTransfer = preview.rows.filter((row) =>
        existingMode === "replace_existing" || existingMode === "clean_target_only"
          ? true
          : !preview.alreadyCarried.has(row.student.id)
      );

      for (const { student, balance } of rowsToTransfer) {
        await Payment.create({
          student_id:     student.id,
          amount:         balance,
          payment_status: "pending",
          term:           toTerm,
          academic_year:  toYear,
          notes:          preview.carryForwardNote,
          payment_date:   null,
          payment_method: "cash",
          due_date:       null,
        });
      }
      setTransferred(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError("Some records could not be transferred. Please try again.");
      console.error(err);
    }
    setIsTransferring(false);
  };

  const previewRowsByMode = preview
    ? preview.rows.filter((row) =>
        existingMode === "replace_existing" || existingMode === "clean_target_only"
          ? true
          : !preview.alreadyCarried.has(row.student.id)
      )
    : [];
  const newRows = previewRowsByMode;
  const skippedRows = preview ? preview.rows.filter((r) => preview.alreadyCarried.has(r.student.id)) : [];
  const totalBalance = newRows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <Card className="bg-white shadow-2xl border border-slate-200">
          {/* Header */}
          <CardHeader className="border-b border-slate-200 sticky top-0 bg-white z-10">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-slate-900 text-xl flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-amber-600" />
                  Carry Forward Fee Arrears
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Transfer unpaid balances from a previous term into a new term as pending records.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Term selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* FROM */}
              <div className="space-y-3 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-sm font-semibold text-red-700 uppercase tracking-wide">From (defaulted term)</p>
                <div className="space-y-2">
                  <label className="text-xs text-red-600 font-medium">Term</label>
                  <Select value={fromTerm} onValueChange={v => { setFromTerm(v); setPreview(null); }}>
                    <SelectTrigger className="bg-white border-red-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-red-600 font-medium">Academic Year</label>
                  <Select value={fromYear} onValueChange={v => { setFromYear(v); setPreview(null); }}>
                    <SelectTrigger className="bg-white border-red-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* TO */}
              <div className="space-y-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">To (new term)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-emerald-600 font-medium">Term</label>
                  <Select value={toTerm} onValueChange={v => { setToTerm(v); setPreview(null); }}>
                    <SelectTrigger className="bg-white border-emerald-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-emerald-600 font-medium">Academic Year</label>
                  <Select value={toYear} onValueChange={v => { setToYear(v); setPreview(null); }}>
                    <SelectTrigger className="bg-white border-emerald-200"><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Validation warning */}
            {fromTerm === toTerm && fromYear === toYear && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Source and destination cannot be the same term.</span>
              </div>
            )}

            {/* Preview button */}
            {!transferred && (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handlePreview}
                disabled={isLoadingPreview || (fromTerm === toTerm && fromYear === toYear)}
              >
                {isLoadingPreview
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading preview…</>
                  : <><Users className="w-4 h-4 mr-2" /> Preview Students with Arrears</>
                }
              </Button>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success state */}
            {transferred && (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">Transfer Complete</h3>
                <p className="text-slate-600 text-sm">
                  {newRows.length} student{newRows.length !== 1 ? "s'" : "'s"} arrears (₦{totalBalance.toLocaleString()}) have been carried forward to <strong>{toTerm} {toYear}</strong> as pending payment records.
                </p>
                <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={onClose}>
                  Done
                </Button>
              </div>
            )}

            {/* Preview results */}
            {preview && !transferred && (
              <div className="space-y-4">
                {!preview.noRecords && (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Existing carry-forward rows in {toTerm} {toYear}
                    </label>
                    <Select value={existingMode} onValueChange={setExistingMode}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep_existing">Keep existing rows and add only missing students</SelectItem>
                        <SelectItem value="replace_existing">Replace existing rows with recalculated balances</SelectItem>
                        <SelectItem value="clean_target_only">Only proceed if target term has no existing carry-forward rows</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">
                      {existingMode === "replace_existing"
                        ? "Existing carried-forward rows from this source term will be removed and recreated using the latest balances."
                        : existingMode === "clean_target_only"
                          ? "Transfer will only run if the destination term has no carried-forward rows from this source term already."
                          : "Existing carried-forward rows stay untouched. Only students without one yet will be added."}
                    </p>
                  </div>
                )}

                {/* Summary banner */}
                {preview.noRecords ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-700">No payment records found</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        There are no payment records for <strong>{fromTerm} {fromYear}</strong>. Nothing to carry forward.
                      </p>
                    </div>
                  </div>
                ) : newRows.length > 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="font-semibold text-amber-800">
                          {newRows.length} student{newRows.length !== 1 ? "s" : ""} with outstanding arrears
                        </span>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-sm font-semibold">
                        Total: ₦{totalBalance.toLocaleString()}
                      </Badge>
                    </div>
                    <p className="text-xs text-amber-700 mt-2">
                      These will be added as <strong>pending</strong> payment records in <strong>{toTerm} {toYear}</strong>.
                    </p>
                    {(preview.existingRows?.length || 0) > 0 && (
                      <p className="text-xs text-amber-700 mt-1">
                        {existingMode === "replace_existing"
                          ? `${preview.existingRows.length} existing carried-forward row(s) from ${fromTerm} ${fromYear} will be replaced.`
                          : existingMode === "clean_target_only"
                            ? `${preview.existingRows.length} existing carried-forward row(s) already exist. Transfer is blocked until target is clean or you choose another mode.`
                            : `${skippedRows.length} existing carried-forward row(s) will be left untouched.`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-800">No outstanding arrears found</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        All active students have fully paid their fees for {fromTerm} {fromYear}.
                      </p>
                    </div>
                  </div>
                )}

                {/* Student list */}
                {newRows.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {newRows.map(({ student, paid, balance, termFee }) => (
                      <div key={student.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{student.first_name} {student.last_name}</p>
                          <p className="text-xs text-slate-500">{student.grade}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-red-600">₦{balance.toLocaleString()} owed</p>
                          <p className="text-xs text-slate-500">paid ₦{paid.toLocaleString()} of ₦{termFee.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Skipped (already transferred) */}
                {skippedRows.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      ⏭ {skippedRows.length} student{skippedRows.length !== 1 ? "s" : ""} skipped — carry-forward already exists in {toTerm} {toYear}:
                    </p>
                    <div className="space-y-1">
                      {skippedRows.map(({ student }) => (
                        <p key={student.id} className="text-xs text-slate-500">
                          • {student.first_name} {student.last_name} ({student.grade})
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                {newRows.length > 0 && (
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 mt-2"
                    onClick={handleTransfer}
                    disabled={isTransferring || (existingMode === "clean_target_only" && (preview.existingRows?.length || 0) > 0)}
                  >
                    {isTransferring
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transferring…</>
                      : <><ArrowRight className="w-4 h-4 mr-2" /> Confirm — Carry Forward {newRows.length} Student{newRows.length !== 1 ? "s'" : "'s"} Arrears</>
                    }
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
