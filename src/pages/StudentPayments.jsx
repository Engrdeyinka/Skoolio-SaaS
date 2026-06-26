import React, { useState, useEffect, useRef } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Payment, Student } from "@/entities/Payment";
import { ClassFee } from "@/entities/ClassFee";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabase } from "@/api/supabaseClient";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { applyStudentFeeGroups, isStudentActiveForTerm, loadStudentFeeGroups, loadStudentStartTerms } from "@/lib/paymentBalances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Calendar, CreditCard, CheckCircle, Clock, AlertTriangle, TrendingUp, Tag, ChevronDown, ChevronUp, ArrowLeft, CreditCard as CardIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const statusColors = {
  paid:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100  text-amber-800  border-amber-200",
  overdue: "bg-red-100    text-red-800    border-red-200",
  partial: "bg-blue-100   text-blue-800   border-blue-200",
};

const statusIcons = {
  paid:    CheckCircle,
  pending: Clock,
  overdue: AlertTriangle,
  partial: TrendingUp,
};

const methodLabels = {
  cash:          "Cash",
  check:         "Cheque",
  credit_card:   "Credit Card",
  bank_transfer: "Bank Transfer",
  online:        "Online Transfer",
};

const MANUAL_OPENING_PAID_TAG = "[opening_paid_before_app]";

function getStudentPaymentNoteLabel(notes) {
  if (!notes) return "";
  const noteText = String(notes).trim();
  if (!noteText) return "";
  if (noteText.includes(MANUAL_OPENING_PAID_TAG)) return "Manual Input";
  return noteText;
}

export default function StudentPayments() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { term: schoolTerm, year: schoolYear, loading: settingsLoading, flutterwavePublicKey, schoolName } = useSchoolSettings();
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [classFees, setClassFees] = useState([]);
  const [studentStartTerms, setStudentStartTerms] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [filters, setFilters] = usePersistentState("student_payments_filters", { term: "", academic_year: "" });
  const [hasTouchedFilters, setHasTouchedFilters] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [payError, setPayError] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const flwScriptRef = useRef(false);

  // Dynamically load Flutterwave Inline SDK once
  useEffect(() => {
    if (flwScriptRef.current || document.getElementById("flw-inline-sdk")) return;
    flwScriptRef.current = true;
    const script = document.createElement("script");
    script.id = "flw-inline-sdk";
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (currentUser !== null) loadData();
  }, [currentUser]);

  useEffect(() => {
    if (hasTouchedFilters) return;
    if (!schoolTerm || !schoolYear) return;
    setFilters({ term: schoolTerm, academic_year: schoolYear });
  }, [schoolTerm, schoolYear, hasTouchedFilters]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const studentId = currentUser?.preview_student_id || currentUser?.linked_student_id;
      if (!studentId) { setIsLoading(false); return; }

      const [students, allPayments, classFees, startTerms, feeGroupRecords] = await Promise.all([
        Student.list(),
        Payment.filter({ student_id: studentId }),
        ClassFee.list().catch(() => []),
        loadStudentStartTerms().catch(() => ({})),
        loadStudentFeeGroups().catch(() => ({})),
      ]);

      const studentData = applyStudentFeeGroups(students || [], feeGroupRecords).find(s => s.id === studentId);
      if (studentData) {
        setStudent(studentData);
      }
      setClassFees(Array.isArray(classFees) ? classFees : []);
      setStudentStartTerms(startTerms || {});
      setPayments(allPayments);
    } catch (error) {
      console.error("Error loading payments:", error);
    }
    setIsLoading(false);
  };

  const filteredPayments = payments.filter(
    p => p.term === filters.term && p.academic_year === filters.academic_year
  );

  const feeSnapshot = getStudentFeeSnapshot({
    student,
    classFees,
    term: filters.term,
    academicYear: filters.academic_year,
  });

  const isActiveForSelectedTerm = isStudentActiveForTerm(
    student,
    filters.term,
    filters.academic_year,
    studentStartTerms
  );

  // Fee breakdown
  const tuitionFee = feeSnapshot.tuition || 0;
  const otherFees = feeSnapshot.otherFees || [];
  const otherTotal = feeSnapshot.otherTotal || 0;

  // Carry-forward arrear records created by the admin (pending + note contains "Arrears carried forward")
  const arrearPayments = filteredPayments.filter(
    p => p.payment_status === "pending" && p.notes?.includes("Arrears carried forward from")
  );
  const arrearsTotal   = arrearPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Total fees = current term fees + any carried-forward arrears
  const totalFees    = isActiveForSelectedTerm ? tuitionFee + otherTotal + arrearsTotal : 0;

  const amountPaid   = filteredPayments
    .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance      = Math.max(0, totalFees - amountPaid);

  const availableAcademicYears = Array.from(
    new Set(
      [
        schoolYear,
        ...payments.map((payment) => payment?.academic_year),
        ...classFees
          .filter((fee) => !student?.grade || fee?.grade === student.grade)
          .map((fee) => fee?.academic_year),
      ].filter(Boolean)
    )
  ).sort((a, b) => {
    const aStart = Number(String(a).split("/")[0]) || 0;
    const bStart = Number(String(b).split("/")[0]) || 0;
    return bStart - aStart;
  });

  const handlePayNow = () => {
    setPayError(null);
    if (!flutterwavePublicKey) {
      setPayError("Online payment is not configured. Please contact the school admin.");
      return;
    }
    if (!window.FlutterwaveCheckout) {
      setPayError("Payment SDK is still loading. Please wait a moment and try again.");
      return;
    }
    if (balance <= 0) return;

    const amountToPay = payAmount ? parseFloat(payAmount) : balance;
    if (!amountToPay || amountToPay <= 0) {
      setPayError("Please enter a valid amount.");
      return;
    }
    if (amountToPay > balance) {
      setPayError(`Amount cannot exceed your balance of ₦${balance.toLocaleString()}.`);
      return;
    }

    setPayingNow(true);
    const txRef = `${BRAND.shortCode}-${Date.now()}-${student?.id?.slice(0, 8) || "stu"}`;

    window.FlutterwaveCheckout({
      public_key: flutterwavePublicKey,
      tx_ref: txRef,
      amount: amountToPay,
      currency: "NGN",
      payment_options: "card,ussd,banktransfer",
      customer: {
        email: student?.parent_email || `${student?.id || "student"}@tops.internal`,
        phone_number: student?.parent_phone || "",
        name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Student",
      },
      customizations: {
        title: schoolName || "School Fee Payment",
        description: `${filters.term} ${filters.academic_year} fees`,
        logo: "",
      },
      callback: async (response) => {
        if (response.status === "successful" || response.status === "completed") {
          try {
            const { data, error } = await supabase.functions.invoke("record-flw-payment", {
              body: {
                transaction_id: response.transaction_id,
                tx_ref:         txRef,
                student_id:     student.id,
                term:           filters.term,
                academic_year:  filters.academic_year,
              },
            });
            if (error || !data?.success) {
              throw new Error(data?.error || error?.message || "Recording failed.");
            }
            await loadData();
          } catch (err) {
            console.error("Failed to record online payment:", err);
            setPayError(
              `Payment of ₦${amountToPay.toLocaleString()} was received but could not be recorded. ` +
              `Show this to the admin — Transaction ID: ${response.transaction_id || txRef}`
            );
          }
        }
        setPayingNow(false);
      },
      onclose: () => setPayingNow(false),
    });
  };

  if (isLoading || settingsLoading || !filters.term || !filters.academic_year) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-2">My Payments</h1>
          <p className="text-slate-600 text-lg">View your school fee payments and balance</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
            <Select value={filters.term} onValueChange={v => {
              setHasTouchedFilters(true);
              setFilters(prev => ({ ...prev, term: v }));
            }}>
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
            <Select value={filters.academic_year} onValueChange={v => {
              setHasTouchedFilters(true);
              setFilters(prev => ({ ...prev, academic_year: v }));
            }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableAcademicYears.map((year) => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Student banner */}
        {student && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="font-semibold text-blue-900">{student.first_name} {student.last_name}</p>
            <p className="text-sm text-blue-700">{student.grade} · {filters.term} · {filters.academic_year}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {/* Total Fees */}
          <Card className="border border-slate-200 bg-white shadow-sm sm:col-span-1">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-600">Total Term Fees</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">₦{totalFees.toLocaleString()}</p>

              {/* Fee breakdown toggle */}
              {(otherFees.length > 0 || tuitionFee > 0) && (
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showBreakdown ? "Hide breakdown" : "See breakdown"}
                </button>
              )}

              {showBreakdown && (
                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {/* Tuition line */}
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                      Termly Tuition
                    </span>
                    <span className="font-medium">₦{tuitionFee.toLocaleString()}</span>
                  </div>
                  {/* Additional fee lines */}
                  {otherFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-amber-700">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3" />
                        {f.name || "Additional Fee"}
                      </span>
                      <span className="font-medium">₦{(parseFloat(f.amount) || 0).toLocaleString()}</span>
                    </div>
                  ))}
                  {/* Carry-forward arrear lines */}
                  {arrearPayments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-red-600">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        {p.notes || "Carried-forward Arrears"}
                      </span>
                      <span className="font-medium">₦{(p.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                  {/* Total line */}
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-t border-slate-200 pt-1.5 mt-1">
                    <span>Total</span>
                    <span>₦{totalFees.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Amount Paid */}
          <Card className="border border-emerald-200 bg-emerald-50 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-emerald-700">Amount Paid</p>
              </div>
              <p className="text-2xl font-bold text-emerald-800">₦{amountPaid.toLocaleString()}</p>
              {totalFees > 0 && (
                <p className="text-xs text-emerald-600 mt-1">
                  {Math.round((amountPaid / totalFees) * 100)}% of total fees
                </p>
              )}
            </CardContent>
          </Card>

          {/* Balance */}
          <Card className={`border shadow-sm ${
            balance === 0 ? "border-emerald-200 bg-emerald-50"
            : balance > 0 && amountPaid > 0 ? "border-amber-200 bg-amber-50"
            : "border-red-200 bg-red-50"
          }`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  balance === 0 ? "bg-emerald-100"
                  : balance > 0 && amountPaid > 0 ? "bg-amber-100"
                  : "bg-red-100"
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${
                    balance === 0 ? "text-emerald-600"
                    : balance > 0 && amountPaid > 0 ? "text-amber-600"
                    : "text-red-600"
                  }`} />
                </div>
                <p className={`text-sm font-medium ${
                  balance === 0 ? "text-emerald-700"
                  : balance > 0 && amountPaid > 0 ? "text-amber-700"
                  : "text-red-700"
                }`}>Balance Remaining</p>
              </div>
              <p className={`text-2xl font-bold ${
                balance === 0 ? "text-emerald-800"
                : balance > 0 && amountPaid > 0 ? "text-amber-800"
                : "text-red-800"
              }`}>
                {balance === 0 ? "Fully Paid ✓" : `₦${balance.toLocaleString()}`}
              </p>
              {balance > 0 && flutterwavePublicKey && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₦</span>
                    <input
                      type="number"
                      min="1"
                      max={balance}
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      placeholder={balance.toLocaleString()}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    Leave blank to pay full balance
                  </p>
                  <Button
                    size="sm"
                    onClick={handlePayNow}
                    disabled={payingNow}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                  >
                    {payingNow
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                      : <><CardIcon className="w-3.5 h-3.5" /> Pay {payAmount ? `₦${Number(payAmount).toLocaleString()}` : "Full Balance"}</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment error */}
        {payError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{payError}</span>
          </div>
        )}

        {/* Carry-forward arrears notice */}
        {arrearPayments.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex flex-wrap gap-2 items-center">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-red-700">Outstanding arrears carried forward:</span>
            {arrearPayments.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 text-red-700 rounded-full px-2.5 py-0.5 font-medium">
                ₦{(p.amount || 0).toLocaleString()} — {p.notes}
              </span>
            ))}
          </div>
        )}

        {/* Additional fees notice */}
        {otherFees.length > 0 && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap gap-2 items-center">
            <Tag className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-700">Additional fees for {student?.grade}:</span>
            {otherFees.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-amber-200 text-amber-700 rounded-full px-2.5 py-0.5 font-medium">
                {f.name} — ₦{(parseFloat(f.amount) || 0).toLocaleString()}
              </span>
            ))}
          </div>
        )}

        {/* Payment Records */}
        <Card className="bg-white/80 border border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-slate-900">Payment Records</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPayments.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-700 mb-1">No payments found</h3>
                <p className="text-sm text-slate-500">
                  No payment records for {filters.term}, {filters.academic_year}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPayments.map(payment => {
                  const StatusIcon = statusIcons[payment.payment_status] || Clock;
                  return (
                    <div
                      key={payment.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          payment.payment_status === "paid"    ? "bg-emerald-100" :
                          payment.payment_status === "overdue" ? "bg-red-100"     :
                          payment.payment_status === "partial" ? "bg-blue-100"    :
                                                                  "bg-amber-100"
                        }`}>
                          <StatusIcon className={`w-5 h-5 ${
                            payment.payment_status === "paid"    ? "text-emerald-600" :
                            payment.payment_status === "overdue" ? "text-red-600"     :
                            payment.payment_status === "partial" ? "text-blue-600"    :
                                                                    "text-amber-600"
                          }`} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-base">
                            ₦{(payment.amount || 0).toLocaleString()}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                            {payment.payment_date && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(payment.payment_date), "MMM d, yyyy")}
                              </span>
                            )}
                            {payment.payment_method && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <CreditCard className="w-3.5 h-3.5" />
                                {methodLabels[payment.payment_method] || payment.payment_method}
                              </span>
                            )}
                            {payment.due_date && payment.payment_status !== "paid" && (
                              <span className={`flex items-center gap-1 text-xs ${
                                new Date(payment.due_date) < new Date() ? "text-red-500 font-medium" : "text-slate-500"
                              }`}>
                                <Clock className="w-3.5 h-3.5" />
                                Due: {format(new Date(payment.due_date), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                          {getStudentPaymentNoteLabel(payment.notes) && (
                            <p className="text-xs text-slate-500 mt-1 italic">{getStudentPaymentNoteLabel(payment.notes)}</p>
                          )}
                        </div>
                      </div>
                      <Badge className={`${statusColors[payment.payment_status] || statusColors.pending} border capitalize self-start sm:self-center whitespace-nowrap`}>
                        {payment.payment_status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
