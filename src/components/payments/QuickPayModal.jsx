import { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { createPortal } from "react-dom";
import { X, CreditCard, CheckCircle, AlertCircle, Printer, Send, Loader2 } from "lucide-react";
import { Payment } from "@/entities/all";
import { AuditLog } from "@/entities/AuditLog";
import { sendSMS } from "@/functions/sendSMS";
import { getNextReceiptNumber } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/lib/AuthContext";
import { formatDateInLagos, formatTimeInLagos, getLagosDateString, getLagosYear } from "@/lib/timezone";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online" },
  { value: "check", label: "Cheque" },
  { value: "credit_card", label: "Card" },
];

const SCHOOL_NAME = BRAND.schoolName;

function ThermalReceipt({ receipt, onClose, student, smsSenderId, cashierName }) {
  const newBalance = Math.max(0, receipt.totalFees - receipt.alreadyPaid - receipt.amountPaid);
  const methodLabel =
    PAYMENT_METHODS.find((m) => m.value === receipt.method)?.label || receipt.method;

  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent]       = useState(false);
  const [smsError, setSmsError]     = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (!isPrinting) return;
    // Double rAF ensures React has painted the fullscreen print view
    // before the browser captures it for printing.
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.print();
      });
    });
    const restore = () => setIsPrinting(false);
    window.addEventListener("afterprint", restore, { once: true });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("afterprint", restore);
    };
  }, [isPrinting]);

  // Due date = 7 days from payment date (only shown when balance remains)
  const dueDate = new Date(receipt.date);
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = formatDateInLagos(dueDate, { day: "numeric", month: "short", year: "numeric" });

  const handleSendNotification = async () => {
    const phone = student?.parent_phone;
    if (!phone) {
      setSmsError("No parent phone number on file.");
      return;
    }
    setSmsSending(true);
    setSmsError(null);
    try {
      const smsMessage = `Payment received: ₦${receipt.amountPaid.toLocaleString()} for ${receipt.studentName} (${receipt.grade}) for ${receipt.term} ${receipt.academicYear}. New balance: ₦${newBalance.toLocaleString()}. Thank you. — ${BRAND.shortCode}`;
      await sendSMS({ phoneNumbers: [phone], message: smsMessage, senderId: smsSenderId || BRAND.smsSenderId });
      setSmsSent(true);
    } catch (_) {
      setSmsError("Failed to send. Please try again.");
    } finally {
      setSmsSending(false);
    }
  };

  // Build fee breakdown for the popup receipt
  const feeBreakdown = [
    ...(receipt.tuition > 0 ? [{ name: "Termly Tuition", amount: receipt.tuition }] : []),
    ...(receipt.otherFees || []).map(f => ({ name: f.name, amount: Number(f.amount) || 0 })),
    ...(receipt.arrears > 0 ? [{ name: "Arrears", amount: receipt.arrears }] : []),
  ];

  const handlePrint = () => setIsPrinting(true);

  // ── Fullscreen print view — replaces the modal completely while printing ──
  // The @media print CSS in index.css hides everything except #__receipt_print_view__.
  // React unmounting the modal means nothing bleeds through on any browser.
  if (isPrinting) {
    const fmt = (n) => "N" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const balance = Math.max(0, receipt.totalFees - receipt.alreadyPaid - receipt.amountPaid);
    const totalPaid = receipt.alreadyPaid + receipt.amountPaid;
    const dueDate = new Date(receipt.date);
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = formatDateInLagos(dueDate, { day: "numeric", month: "short", year: "numeric" });
    const dateStr = formatDateInLagos(new Date(receipt.date), { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = formatTimeInLagos(new Date(), { hour: "2-digit", minute: "2-digit" });
    const LBL = { fontSize: 26, fontWeight: "bold", padding: "4px 0", verticalAlign: "top", width: "52%", wordBreak: "break-word" };
    const VAL = { fontSize: 26, fontWeight: "bold", padding: "4px 0", textAlign: "right", verticalAlign: "top", width: "48%", wordBreak: "break-word" };
    const DIV = <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />;
    const SOLID = <div style={{ borderTop: "4px solid #000", margin: "8px 0" }} />;
    const breakdownRows = feeBreakdown.length > 0 ? feeBreakdown : [{ name: "Termly Tuition", amount: receipt.totalFees }];
    return createPortal(
      <div id="__receipt_print_view__" style={{ fontFamily: "Arial,Helvetica,sans-serif", color: "#000", background: "#fff", padding: "4px", width: "100%", boxSizing: "border-box", lineHeight: 1.4 }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 30, fontWeight: "bold", textTransform: "uppercase", lineHeight: 1.3 }}>{BRAND.schoolName.toUpperCase()}</div>
          <div style={{ fontSize: 28, fontWeight: "bold", marginTop: 4 }}>PAYMENT RECEIPT</div>
          {receipt.receiptNo && <div style={{ fontSize: 24, fontWeight: "bold" }}>No: {receipt.receiptNo}</div>}
        </div>
        {DIV}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={LBL}>Date</td><td style={VAL}>{dateStr}</td></tr>
            <tr><td style={LBL}>Time</td><td style={VAL}>{timeStr}</td></tr>
            <tr><td style={LBL}>Student</td><td style={VAL}>{receipt.studentName}</td></tr>
            <tr><td style={LBL}>Class</td><td style={VAL}>{receipt.grade}</td></tr>
            <tr><td style={LBL}>Term</td><td style={VAL}>{receipt.term}</td></tr>
            <tr><td style={LBL}>Year</td><td style={VAL}>{receipt.academicYear}</td></tr>
          </tbody>
        </table>
        {DIV}
        <div style={{ fontSize: 24, fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>Fee Breakdown</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {breakdownRows.map((f, i) => (
              <tr key={i}><td style={LBL}>{f.name}</td><td style={VAL}>{fmt(f.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        {SOLID}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody><tr><td style={LBL}>Total Fees</td><td style={VAL}>{fmt(receipt.totalFees)}</td></tr></tbody>
        </table>
        {DIV}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {receipt.alreadyPaid > 0 && <tr><td style={LBL}>Prev. Paid</td><td style={VAL}>{fmt(receipt.alreadyPaid)}</td></tr>}
            <tr>
              <td style={{ fontSize: 44, fontWeight: "bold", padding: "6px 0" }}>AMT PAID</td>
              <td style={{ fontSize: 44, fontWeight: "bold", padding: "6px 0", textAlign: "right" }}>{fmt(receipt.amountPaid)}</td>
            </tr>
            {receipt.alreadyPaid > 0 && <tr><td style={LBL}>Total Paid</td><td style={VAL}>{fmt(totalPaid)}</td></tr>}
          </tbody>
        </table>
        {SOLID}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ fontSize: 30, fontWeight: "bold", padding: "4px 0" }}>Balance</td>
              <td style={{ fontSize: 30, fontWeight: "bold", padding: "4px 0", textAlign: "right" }}>{balance <= 0 ? "PAID" : fmt(balance)}</td>
            </tr>
            <tr><td style={LBL}>Method</td><td style={VAL}>{methodLabel}</td></tr>
            <tr><td style={LBL}>Cashier</td><td style={VAL}>{cashierName || "Admin"}</td></tr>
          </tbody>
        </table>
        {receipt.notes ? <div style={{ fontSize: 24, fontWeight: "bold", marginTop: 6, wordBreak: "break-word" }}>Note: {receipt.notes}</div> : null}
        {DIV}
        {balance <= 0
          ? <div style={{ textAlign: "center", fontSize: 32, fontWeight: "bold", margin: "8px 0" }}>*** PAID IN FULL ***</div>
          : <>
              <div style={{ textAlign: "center", fontSize: 30, fontWeight: "bold", margin: "6px 0" }}>PARTIAL PAYMENT</div>
              <div style={{ textAlign: "center", fontSize: 24, fontWeight: "bold", margin: "4px 0" }}>Pay balance by {dueDateStr}</div>
            </>
        }
        <div style={{ textAlign: "center", fontSize: 28, fontWeight: "bold", marginTop: 8 }}>Thank you!</div>
        {DIV}
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: "bold" }}>{new Date().getFullYear()} &copy; {BRAND.schoolName.toUpperCase()}</div>
      </div>,
      document.body
    );
  }

  // Print only when user clicks "Print Receipt" — no auto-print

  return (
      <div
        id="thermal-receipt-root"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
          {/* Modal header — hidden on print */}
          <div className="receipt-no-print flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Payment Recorded</h2>
                <p className="text-xs text-gray-500">Receipt ready to print</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Receipt paper */}
          <div className="receipt-paper px-6 py-5 font-mono text-xs text-gray-800 space-y-1">
            {/* School header */}
            <p className="text-center font-bold text-sm uppercase tracking-tight leading-tight">
              {SCHOOL_NAME}
            </p>
            <p className="text-center text-gray-500">PAYMENT RECEIPT</p>
            {receipt.receiptNo && (
              <p className="text-center text-gray-500 text-[10px]">Receipt #{receipt.receiptNo}</p>
            )}
            <div className="border-t border-dashed border-gray-300 my-2" />

            {/* Receipt meta */}
            <div className="flex justify-between">
              <span className="text-gray-500">Date:</span>
              <span>{formatDateInLagos(receipt.date, { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Time:</span>
              <span>{formatTimeInLagos(receipt.date, { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            <div className="border-t border-dashed border-gray-300 my-2" />

            {/* Student info */}
            <div className="flex justify-between">
              <span className="text-gray-500">Student:</span>
              <span className="text-right max-w-[55%] leading-tight">{receipt.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Class:</span>
              <span>{receipt.grade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Term:</span>
              <span>{receipt.term}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Year:</span>
              <span>{receipt.academicYear}</span>
            </div>

            <div className="border-t border-dashed border-gray-300 my-2" />

            {/* Fee breakdown */}
            <p className="font-semibold uppercase text-gray-500 text-[10px] tracking-widest">Fee Breakdown</p>
            {receipt.tuition > 0 && (
              <div className="flex justify-between">
                <span>Tuition</span>
                <span>₦{receipt.tuition.toLocaleString()}</span>
              </div>
            )}
            {receipt.otherFees?.map((fee, i) => (
              <div key={i} className="flex justify-between">
                <span className="truncate max-w-[55%]">{fee.name}</span>
                <span>₦{Number(fee.amount || 0).toLocaleString()}</span>
              </div>
            ))}
            {receipt.arrears > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Arrears</span>
                <span>₦{receipt.arrears.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1">
              <span>Total Fees</span>
              <span>₦{receipt.totalFees.toLocaleString()}</span>
            </div>

            <div className="border-t border-dashed border-gray-300 my-2" />

            {/* Payment summary */}
            <div className="flex justify-between text-gray-500">
              <span>Prev. Paid</span>
              <span>₦{receipt.alreadyPaid.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-700 text-sm">
              <span>Amount Paid</span>
              <span>₦{receipt.amountPaid.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Balance</span>
              <span className={newBalance > 0 ? "text-red-600" : "text-emerald-600"}>
                ₦{newBalance.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Method</span>
              <span>{methodLabel}</span>
            </div>
            {receipt.notes && (
              <div className="flex justify-between text-gray-500">
                <span>Note</span>
                <span className="text-right max-w-[55%]">{receipt.notes}</span>
              </div>
            )}

            <div className="border-t border-dashed border-gray-300 my-2" />

            {/* Status badge */}
            <p className={`text-center font-bold uppercase tracking-widest text-sm ${
              newBalance === 0 ? "text-emerald-600" : "text-amber-600"
            }`}>
              {newBalance === 0 ? "★ FULLY PAID ★" : "PARTIAL PAYMENT"}
            </p>

            <div className="border-t border-dashed border-gray-300 my-2" />
            {newBalance > 0 && (
              <p className="text-center text-amber-700 text-[10px] font-semibold">
                Please pay the balance by {dueDateStr}.
              </p>
            )}
            <p className="text-center text-gray-400 text-[10px]">Thank you!</p>
            <p className="text-center text-gray-400 text-[10px]">
              {getLagosYear()} © {SCHOOL_NAME}
            </p>
          </div>

          {/* Action buttons — hidden on print */}
          <div className="receipt-no-print flex gap-3 px-6 pb-5">
            <button
              onClick={handleSendNotification}
              disabled={smsSending || smsSent}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                smsSent
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : smsError
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {smsSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : smsSent ? (
                <><CheckCircle className="w-4 h-4" /> Sent!</>
              ) : (
                <><Send className="w-4 h-4" /> Send Notification</>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
          </div>
          {smsError && (
            <p className="receipt-no-print text-center text-xs text-red-500 pb-4 -mt-2">{smsError}</p>
          )}
        </div>
      </div>
  );
}

export default function QuickPayModal({
  student,
  term,
  academicYear,
  totalFees,
  alreadyPaid,
  feeBreakdown,
  discountPct = 0,
  smsSenderId,
  onClose,
  onSuccess,
}) {
  const { user: currentUser } = useAuth();
  const balance = Math.max(0, (totalFees || 0) - (alreadyPaid || 0));

  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);

  const numAmount = parseFloat(amount) || 0;
  const isFullPayment = numAmount >= balance && balance > 0;
  const isPartial = numAmount > 0 && numAmount < balance;
  const status = isFullPayment ? "paid" : numAmount > 0 ? "partial" : "pending";

  async function handleSubmit(e) {
    e.preventDefault();
    if (numAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (numAmount > balance + 0.01) {
      setError(`Amount cannot exceed the remaining balance of ₦${balance.toLocaleString()}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const receiptNo = await getNextReceiptNumber().catch(() => null);

      const savedPayment = await Payment.create({
        student_id: student.id,
        amount: numAmount,
        payment_date: getLagosDateString(),
        payment_method: method,
        payment_status: status,
        term,
        academic_year: academicYear,
        notes: notes.trim() || undefined,
        receipt_number: receiptNo || undefined,
        recorded_by_name: currentUser?.full_name || currentUser?.email || "admin",
        recorded_by_id: currentUser?.id || null,
        recorded_by_role: currentUser?.school_role || "admin",
      });

      await AuditLog.log({
        action: "created",
        entityType: "payment",
        entityId: savedPayment?.id || null,
        performedBy: currentUser?.full_name || currentUser?.email || "admin",
        summary: `Payment of ₦${numAmount.toLocaleString()} recorded for ${student.first_name} ${student.last_name} (${student.grade}) — ${term} ${academicYear}`,
        details: { module: "payments", amount: numAmount, student_id: student.id, payment_id: savedPayment?.id || null, method, status, term, academicYear, receiptNo },
      });

      // Build receipt data and show receipt view
      setReceipt({
        date: new Date().toISOString(),
        studentName: student.full_name || `${student.first_name || ""} ${student.last_name || ""}`.trim(),
        grade: student.grade,
        term,
        academicYear,
        tuition: feeBreakdown?.tuition || 0,
        otherFees: feeBreakdown?.otherFees || [],
        arrears: feeBreakdown?.arrears || 0,
        totalFees: totalFees || 0,
        alreadyPaid: alreadyPaid || 0,
        amountPaid: numAmount,
        method,
        notes: notes.trim(),
        receiptNo: receiptNo || "",
      });

      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to save payment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Show thermal receipt after successful payment
  if (receipt) {
    return <ThermalReceipt receipt={receipt} onClose={onClose} student={student} smsSenderId={smsSenderId} cashierName={currentUser?.full_name || currentUser?.email || "Admin"} />;
  }

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
              <p className="text-xs text-gray-500">
                {student?.full_name || `${student?.first_name || ""} ${student?.last_name || ""}`.trim()} · {term} · {academicYear}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Fee Breakdown */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            {feeBreakdown?.tuition > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tuition fee</span>
                <span>₦{(feeBreakdown.tuition || 0).toLocaleString()}</span>
              </div>
            )}
            {feeBreakdown?.otherFees?.map((fee, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{fee.name}</span>
                <span>₦{(fee.amount || 0).toLocaleString()}</span>
              </div>
            ))}
            {feeBreakdown?.arrears > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Arrears (carried forward)</span>
                <span>₦{feeBreakdown.arrears.toLocaleString()}</span>
              </div>
            )}
            {discountPct > 0 && (() => {
              // Discount applies to tuition only
              const discountAmt = Math.round((feeBreakdown?.tuition || 0) * (discountPct / 100));
              return (
                <div className="flex justify-between text-green-700 font-medium">
                  <span className="flex items-center gap-1">🎓 Scholarship ({discountPct}% off tuition)</span>
                  <span>−₦{discountAmt.toLocaleString()}</span>
                </div>
              );
            })()}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-medium text-gray-800">
              <span>Total fees</span>
              <span>₦{(totalFees || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Already paid</span>
              <span>−₦{(alreadyPaid || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
              <span>Balance remaining</span>
              <span className={balance > 0 ? "text-red-600" : "text-emerald-600"}>
                ₦{balance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Amount to Pay (₦)
            </label>
            <input
              type="number"
              min="1"
              max={balance}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="0.00"
              required
            />
            {isFullPayment && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" />
                Full balance — will mark as <strong>Paid</strong>
              </p>
            )}
            {isPartial && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle className="w-3.5 h-3.5" />
                Partial payment — ₦{(balance - numAmount).toLocaleString()} still owed
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`py-2 px-1 rounded-lg text-xs font-medium border transition-all ${
                    method === m.value
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="e.g. Instalment 2 of 3"
            />
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || numAmount <= 0}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : `Record ₦${numAmount > 0 ? numAmount.toLocaleString() : "0"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
