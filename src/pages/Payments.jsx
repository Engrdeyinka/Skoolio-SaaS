import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Payment, Student } from "@/entities/Payment";
import { Expense, AuditLog } from "@/entities/all";
import { ClassFee } from "@/entities/ClassFee";
import { notify } from "@/lib/notify";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";
import { sendSMS } from "@/functions/sendSMS";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Legend } from "recharts";
import {
  Search, DollarSign, AlertCircle, RefreshCw, LayoutList,
  TrendingDown, CheckSquare, Loader2, Zap, BarChart2, Calendar,
  MessageSquare, Send, BellRing, Clock, Download,
  ChevronDown, ChevronUp, Settings, Lock, Unlock,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/api/supabaseClient";
import { getEffectiveClassFee, getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { isAdminLike, isSuperAdmin as isSuperAdminRole } from "@/lib/permissions";
import { applyApprovedPaidAdjustment, applyStudentFeeGroups, getStudentArrearsTotal, getPaymentDiscountPct, isStudentActiveForTerm, loadPaymentDiscounts, loadStudentFeeGroups, loadStudentStartTerms, makePaymentDiscountKey, savePaymentDiscounts } from "@/lib/paymentBalances";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";
import { getSchoolDayStatus } from "@/lib/schoolCalendar";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { PageShell } from "@/components/ui/page-shell";
import { formatDateInLagos, getLagosDate, getLagosDateString, getLagosYear } from "@/lib/timezone";

import PaymentForm from "../components/payments/PaymentForm";
import PaymentFilters from "../components/payments/PaymentFilters";
import CarryForwardModal from "../components/payments/CarryForwardModal";
import QuickPayModal from "../components/payments/QuickPayModal";
import SaveToVaultButton from "@/components/ui/SaveToVaultButton";
import QuickPayStudentPicker from "../components/payments/QuickPayStudentPicker";
import FeeCollectionSummary from "../components/payments/FeeCollectionSummary";
import StudentHistoryDrawer from "../components/payments/StudentHistoryDrawer";
import FeeStructureManager from "../components/payments/FeeStructureManager";

function fmtAmount(n) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${Number(n || 0).toLocaleString()}`;
}

const TERMS = ["First Term", "Second Term", "Third Term"];
const CUR_YEAR = getLagosYear();
const ACADEMIC_YEARS = [
  `${CUR_YEAR - 1}/${CUR_YEAR}`,
  `${CUR_YEAR}/${CUR_YEAR + 1}`,
];
const DEFAULT_PAYMENT_FILTERS = {
  status: "all",
  method: "all",
  grade: "all",
  paymentDate: "",
};
const VALID_PAYMENT_VIEW_MODES = new Set(["cards", "balance", "summary", "fees"]);

function sanitizePaymentFilters(rawFilters) {
  if (!rawFilters || typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
    return { ...DEFAULT_PAYMENT_FILTERS };
  }

  return {
    status: typeof rawFilters.status === "string" ? rawFilters.status : DEFAULT_PAYMENT_FILTERS.status,
    method: typeof rawFilters.method === "string" ? rawFilters.method : DEFAULT_PAYMENT_FILTERS.method,
    grade: typeof rawFilters.grade === "string" ? rawFilters.grade : DEFAULT_PAYMENT_FILTERS.grade,
    paymentDate: typeof rawFilters.paymentDate === "string" ? rawFilters.paymentDate : DEFAULT_PAYMENT_FILTERS.paymentDate,
  };
}

function sanitizeStoredOption(value, validOptions, fallback) {
  return typeof value === "string" && validOptions.includes(value) ? value : fallback;
}

function getPaymentEntryTimestamp(payment) {
  const raw = payment?.created_at || payment?.created_date || payment?.updated_at || payment?.payment_date || "";
  const parsed = raw ? new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFirstName(value) {
  const name = String(value || "").trim();
  if (!name || name === "-" || name.includes("—")) return "-";
  return name.split(/\s+/)[0] || "-";
}

function getPaymentAdminName(payment, adminByPaymentId = {}) {
  const directName =
    payment?.recorded_by_name ||
    payment?.created_by_name ||
    payment?.entered_by_name ||
    payment?.received_by_name ||
    payment?.admin_name ||
    payment?.created_by;
  return directName || adminByPaymentId?.[payment?.id] || "—";
}

async function loadPaymentAdminNames() {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("entity_id, entity_type, performed_by, action, created_at, details")
      .order("created_at", { ascending: false })
      .limit(3000);
    if (error) throw error;

    const created = {};
    const fallback = {};
    for (const log of data || []) {
      const details = typeof log?.details === "string"
        ? (() => {
            try { return JSON.parse(log.details); } catch { return {}; }
          })()
        : (log?.details || {});
      const isPaymentLog =
        String(log?.entity_type || "").toLowerCase() === "payment" ||
        String(details?.module || "").toLowerCase() === "payments" ||
        Boolean(details?.payment_id || details?.payment?.id || details?.after?.id);
      if (!isPaymentLog) continue;
      const paymentId =
        log?.entity_id ||
        details?.payment_id ||
        details?.payment?.id ||
        details?.after?.id;
      const adminName =
        log?.performed_by ||
        details?.actor_name ||
        details?.payment?.recorded_by_name ||
        details?.after?.recorded_by_name ||
        "";
      if (!paymentId || !adminName) continue;
      if (!fallback[paymentId]) fallback[paymentId] = adminName;
      if ((log.action === "created" || log.action === "payment_created") && !created[paymentId]) {
        created[paymentId] = adminName;
      }
    }

    return { ...fallback, ...created };
  } catch (error) {
    console.warn("Payment admin names could not be loaded:", error);
    return {};
  }
}

const MANUAL_OPENING_PAID_TAG = "[opening_paid_before_app]";
const PAID_ADJUSTMENT_REQUEST_TYPE = "paid_adjustment_request";
const PAID_ADJUSTMENT_REMINDER_TYPE = "paid_adjustment_reminder";
const PAID_ADJUSTMENT_REQUEST_VERSION = 1;
const isManualOpeningPaid = (payment) =>
  typeof payment?.notes === "string" && payment.notes.includes(MANUAL_OPENING_PAID_TAG);

const isCarryForwardArrearsRecord = (payment) =>
  typeof payment?.notes === "string" && /arrears carried forward from/i.test(payment.notes);

const isCurrentTermAppPaymentRecord = (payment) =>
  !isManualOpeningPaid(payment) &&
  !isCarryForwardArrearsRecord(payment) &&
  ["paid", "partial"].includes(String(payment?.payment_status || "").toLowerCase());

function getLocalDateYMD() {
  return getLagosDateString();
}

function parsePaidAdjustmentPayload(notification) {
  if (!notification?.message) return null;
  try {
    const parsed = JSON.parse(notification.message);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      notification_id: notification.id,
      notification_created_at: notification.created_at,
      notification_is_read: notification.is_read,
    };
  } catch {
    return null;
  }
}

function buildPaidRequestKey(studentId, term, year) {
  return `${studentId || ""}::${term || ""}::${year || ""}`;
}

function sortRequestsByCreatedAtDesc(requests) {
  return [...(requests || [])].sort((a, b) => {
    const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });
}

class PaymentsSectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "This payment section could not load.",
    };
  }

  componentDidCatch(error) {
    console.error("Payments section crashed:", error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          <p className="font-semibold">This payment section could not load.</p>
          <p className="mt-1 text-red-600">{this.state.errorMessage}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {typeof this.props.onReset === "function" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={this.props.onReset}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                Reset to Cards
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

class PaymentsRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Payments could not load.",
    };
  }

  componentDidCatch(error) {
    console.error("Payments route crashed:", error);
  }

  handleReset = () => {
    try {
      localStorage.removeItem("payments_view_mode");
      localStorage.removeItem("payments_filters");
      localStorage.removeItem("payments_search");
    } catch {}
    this.setState({ hasError: false, errorMessage: "" });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <PageShell maxWidth="4xl" className="py-12">
        <Card className="border-red-200 bg-white shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-slate-900">Payments could not open</h1>
              <p className="text-sm text-slate-600">
                The page hit a bad state while loading. Reset the saved Payments view and reload.
              </p>
              {this.state.errorMessage ? (
                <p className="text-xs text-slate-400">{this.state.errorMessage}</p>
              ) : null}
            </div>
            <div className="flex justify-center">
              <Button onClick={this.handleReset} className="bg-blue-600 hover:bg-blue-700 text-white">
                Reset Payments and Reload
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
}

// ── Payment Analytics Panel ────────────────────────────────────────────────
// ── Series + period config ────────────────────────────────────────────────────
const SERIES_OPTIONS = [
  { key: "revenue",     label: "Revenue",     color: "#8b5cf6", type: "bar"  },
  { key: "outstanding", label: "Outstanding", color: "#f97316", type: "bar"  },
  { key: "expenses",    label: "Expenses",    color: "#ef4444", type: "bar"  },
  { key: "cumulative",  label: "Cumulative",  color: "#f59e0b", type: "line" },
];
const PERIODS = [
  { key: "daily",   label: "Daily",   span: "8 days"  },
  { key: "weekly",  label: "Weekly",  span: "8 weeks" },
  { key: "monthly", label: "Monthly", span: "8 months"},
];

function getMondayOf(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function getNextMonday(date = new Date()) {
  const d = getLagosDate(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntilNextMonday = day === 1 ? 7 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + daysUntilNextMonday);
  return d;
}

function formatShortDeadline(date) {
  return formatDateInLagos(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildBuckets(period) {
  const now = getLagosDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets = [];
  if (period === "monthly") {
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      buckets.push({ label: formatDateInLagos(start, { month: "short", year: "2-digit" }), start, end, revenue: 0, outstanding: 0, expenses: 0 });
    }
  } else if (period === "weekly") {
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(today); ref.setDate(today.getDate() - i * 7);
      const mon = getMondayOf(ref);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59);
      buckets.push({ label: formatDateInLagos(mon, { day: "numeric", month: "short" }), start: mon, end: sun, revenue: 0, outstanding: 0, expenses: 0 });
    }
  } else {
    for (let i = 7; i >= 0; i--) {
      const d   = new Date(today); d.setDate(today.getDate() - i);
      const end = new Date(d); end.setHours(23,59,59);
      buckets.push({ label: formatDateInLagos(d, { day: "numeric", month: "short" }), start: d, end, revenue: 0, outstanding: 0, expenses: 0 });
    }
  }
  return buckets;
}

function computeChartData(period, payments, expenses, students = [], classFees = [], term, academicYear) {
  const buckets = buildBuckets(period);

  // Build totalFee lookup per student so we can compute unpaid balance on partial records
  const studentFeeMap = {};
  for (const s of students) {
    const snapshot = getStudentFeeSnapshot({
      student: s,
      classFees,
      term,
      academicYear,
    });
    studentFeeMap[s.id] = snapshot.totalWithoutArrears;
  }

  for (const p of payments) {
    const isRevenue     = p.payment_status === "paid" || p.payment_status === "partial";
    const isOutstanding = p.payment_status === "pending" || p.payment_status === "overdue";
    const isPartial     = p.payment_status === "partial";
    const dateStr = isRevenue
      ? (p.payment_date  || p.created_date)
      : (p.created_date  || p.payment_date);
    if (!dateStr) continue;
    const d = new Date(dateStr);
    const b = buckets.find(bk => d >= bk.start && d <= bk.end);
    if (!b) continue;
    if (isRevenue)     b.revenue     += Number(p.amount) || 0;
    if (isOutstanding) b.outstanding += Number(p.amount) || 0;
    // For partial payments: outstanding = totalFee − amount already paid
    if (isPartial && p.student_id) {
      const totalFee  = studentFeeMap[p.student_id] || 0;
      const paid      = Number(p.amount) || 0;
      const remaining = Math.max(0, totalFee - paid);
      if (remaining > 0) b.outstanding += remaining;
    }
  }
  for (const e of (expenses || [])) {
    if (!e.expense_date) continue;
    const d = new Date(e.expense_date);
    const b = buckets.find(bk => d >= bk.start && d <= bk.end);
    if (b) b.expenses += Number(e.amount) || 0;
  }
  let cum = 0;
  return buckets.map(b => { cum += b.revenue; return { ...b, cumulative: cum }; });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const fmt = v => `₦${Number(v || 0).toLocaleString()}`;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs min-w-[160px]">
      <p className="font-bold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-800">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentAnalytics({
  payments,
  expenses,
  statusData,
  methodChartData,
  pendingAmount = 0,
  students = [],
  classFees = [],
  term,
  academicYear,
}) {
  const isMobile = useIsMobile();
  const [collapsed,    setCollapsed]    = useState(false);
  const [period,       setPeriod]       = useState("monthly");
  const [activeSeries, setActiveSeries] = useState(new Set(["revenue"]));

  const fmt = v => v >= 1_000_000 ? `₦${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `₦${(v/1_000).toFixed(0)}K` : `₦${v}`;

  const chartData = React.useMemo(
    () => computeChartData(period, payments, expenses, students, classFees, term, academicYear),
    [period, payments, expenses, students, classFees, term, academicYear]
  );

  const toggle = (key) => setActiveSeries(prev => {
    const next = new Set(prev);
    if (next.has(key)) { if (next.size > 1) next.delete(key); } else next.add(key);
    return next;
  });

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const paidCount    = statusData.find(s => s.name === "Paid")?.value || 0;
  const overdueCount = statusData.find(s => s.name === "Overdue")?.value || 0;
  const showDualAxis = activeSeries.has("cumulative") && (activeSeries.has("revenue") || activeSeries.has("outstanding") || activeSeries.has("expenses"));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm mb-8 overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="p-2 bg-emerald-50 rounded-xl">
            <BarChart2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-base">Payment Analytics</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs font-semibold text-emerald-600">{fmt(totalRevenue)} collected</span>
              <span className="text-xs font-semibold text-emerald-600">{paidCount} fully paid</span>
              {pendingAmount > 0 && <span className="text-xs font-semibold text-orange-500">{fmt(pendingAmount)} outstanding</span>}
              {overdueCount > 0 && <span className="text-xs font-semibold text-red-500">{overdueCount} overdue</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">{collapsed ? "Show" : "Hide"}</span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-6 pb-6 border-t border-slate-100">

          {/* ── Controls row: period + series ── */}
          <div className="flex flex-wrap items-center gap-3 pt-5 pb-4">

            {/* Period selector */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            <span className="text-slate-300 hidden sm:inline">|</span>

            {/* Series toggles */}
            <span className="text-xs font-semibold text-slate-400">Plot:</span>
            {SERIES_OPTIONS.map(s => {
              const active = activeSeries.has(s.key);
              return (
                <button key={s.key} onClick={() => toggle(s.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active ? "text-white border-transparent shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                  style={active ? { background: s.color, borderColor: s.color } : {}}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: active ? "rgba(255,255,255,0.7)" : s.color }} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* ── Main chart ── */}
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 290}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: showDualAxis ? (isMobile ? 36 : 56) : 8, left: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                interval={isMobile ? 1 : 0} />
              <YAxis yAxisId="left" tickFormatter={fmt} tick={{ fontSize: isMobile ? 9 : 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={isMobile ? 42 : 56} domain={[0, (dataMax) => Math.max(dataMax * 1.15, 1000)]} allowDataOverflow={false} />
              {showDualAxis && (
                <YAxis yAxisId="right" orientation="right" tickFormatter={fmt}
                  tick={{ fontSize: isMobile ? 9 : 11, fill: "#f59e0b" }} axisLine={false} tickLine={false} width={isMobile ? 36 : 56} />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 14 }}
                formatter={v => <span style={{ color: "#64748b" }}>{v}</span>} />
              {activeSeries.has("revenue") && (
                <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[4,4,0,0]} maxBarSize={36} />
              )}
              {activeSeries.has("outstanding") && (
                <Bar yAxisId="left" dataKey="outstanding" name="Outstanding" fill="#f97316" radius={[4,4,0,0]} maxBarSize={36} />
              )}
              {activeSeries.has("expenses") && (
                <Bar yAxisId="left" dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={36} />
              )}
              {activeSeries.has("cumulative") && (
                <Line yAxisId={showDualAxis ? "right" : "left"} type="monotone" dataKey="cumulative"
                  name="Cumulative" stroke="#f59e0b" strokeWidth={2.5} dot={false}
                  activeDot={{ r: 5, fill: "#f59e0b", strokeWidth: 0 }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* ── Bottom panels ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Payment Status</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={statusData.filter(s => s.value > 0)} cx="50%" cy="50%"
                      innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusData.map(s => (
                    <div key={s.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-slate-500">{s.name}</span>
                      <span className="text-xs font-bold text-slate-700 ml-auto pl-3">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Revenue by Method</p>
              {methodChartData.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={methodChartData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="method" type="category" width={56} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={v => [`₦${Number(v).toLocaleString()}`, "Amount"]} />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[0,4,4,0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsPageContent() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear, smsSenderId } = useSchoolSettings();
  const actorName = currentUser?.full_name || currentUser?.email || "Unknown user";
  const actorRole = currentUser?.school_role || "unknown";
  const actorId = currentUser?.id || null;
  const [payments, setPayments]               = useState([]);
  const [students, setStudents]               = useState([]);
  const [classFees, setClassFees]             = useState([]);
  const [expenses, setExpenses]               = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [paymentAdminById, setPaymentAdminById] = useState({});
  const [showForm, setShowForm]               = useState(false);
  const [showCarryForward, setShowCarryForward] = useState(false);
  const [editingPayment, setEditingPayment]   = useState(null);
  const [searchTerm, setSearchTerm]           = usePersistentState("payments_search", "");
  const [storedFilters, setStoredFilters]     = usePersistentState("payments_filters", DEFAULT_PAYMENT_FILTERS);
  const [isLoading, setIsLoading]             = useState(true);
  // "cards" | "balance" | "summary" | "fees"
  const [storedViewMode, setStoredViewMode]   = usePersistentState("payments_view_mode", "cards");
  const [selectedPayments, setSelectedPayments] = useState(new Set());
  const [isBulkUpdating, setIsBulkUpdating]   = useState(false);
  const [paidColumnLocked, setPaidColumnLocked] = useState(true);
  const [paidDrafts, setPaidDrafts] = useState({});
  const [savingPaidMap, setSavingPaidMap] = useState({});
  const paidAutosaveTimersRef = useRef({});
  const [paidAdjustmentRequests, setPaidAdjustmentRequests] = useState([]);

  // Global term / year — session-only override; always resets to school settings on page load
  const [_termOverride, setGlobalTerm] = useState(null);
  const [_yearOverride, setGlobalYear] = useState(null);

  const filters = React.useMemo(() => {
    return sanitizePaymentFilters(storedFilters);
  }, [storedFilters]);

  const effectiveTerm = TERMS.includes(_termOverride) ? _termOverride
    : (TERMS.includes(schoolTerm) ? schoolTerm : TERMS[0]);
  const effectiveYear = ACADEMIC_YEARS.includes(_yearOverride) ? _yearOverride
    : (ACADEMIC_YEARS.includes(schoolYear) ? schoolYear : ACADEMIC_YEARS[0]);
  const globalTerm = effectiveTerm;
  const globalYear = effectiveYear;

  const setFilters = useCallback((nextValue) => {
    const resolved = typeof nextValue === "function" ? nextValue(filters) : nextValue;
    if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
      setStoredFilters(DEFAULT_PAYMENT_FILTERS);
      return;
    }
    setStoredFilters(sanitizePaymentFilters(resolved));
  }, [filters, setStoredFilters]);

  const viewMode = VALID_PAYMENT_VIEW_MODES.has(storedViewMode) ? storedViewMode : "cards";
  const setViewMode = useCallback((nextMode) => {
    if (VALID_PAYMENT_VIEW_MODES.has(nextMode)) setStoredViewMode(nextMode);
    else setStoredViewMode("cards");
  }, [setStoredViewMode]);


  useEffect(() => {
    if (
      !storedFilters ||
      typeof storedFilters !== "object" ||
      Array.isArray(storedFilters) ||
      Object.keys(DEFAULT_PAYMENT_FILTERS).some((key) => !(key in storedFilters))
    ) {
      setStoredFilters(filters);
    }
  }, [storedFilters, filters, setStoredFilters]);

  useEffect(() => {
    if (!VALID_PAYMENT_VIEW_MODES.has(storedViewMode)) {
      setStoredViewMode("cards");
    }
  }, [storedViewMode, setStoredViewMode]);


  const [calendarEvents, setCalendarEvents] = useState([]);
  useEffect(() => {
    SchoolCalendarEvent.list("-event_date")
      .then((events) => setCalendarEvents(events || []))
      .catch(() => {});
  }, []);

  // Reminder SMS state
  const [reminderDialog, setReminderDialog]   = useState(null); // { rows: [{student, balance}], message, isBulk }
  const [reminderMsg, setReminderMsg]         = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [bulkReminderProgress, setBulkReminderProgress] = useState(null); // "3/12" while sending
  const nextReminderMondayLabel = useMemo(
    () => formatShortDeadline(getNextMonday(new Date())),
    []
  );

  const buildReminderMsg = (student, balance, term, year) =>
    `Dear Parent, fees of ₦${balance.toLocaleString()} for ${student.first_name || "your child"} (${student.grade}) for ${term} are outstanding. Please make payment before ${nextReminderMondayLabel}. — ${BRAND.shortCode}`;

  const buildCompactReminderMsg = (student, balance, term) =>
    `Dear Parent, fees of â‚¦${balance.toLocaleString()} for ${student.first_name || "your child"} (${student.grade}) for ${term} are outstanding. Please make payment before ${nextReminderMondayLabel}. â€” ${BRAND.shortCode}`;

  const buildShortReminderMsg = (student, balance, term) =>
    `Dear Parent, fees of N${balance.toLocaleString()} for ${student.first_name || "your child"} (${student.grade}) for ${term} are outstanding. Please make payment before ${nextReminderMondayLabel}. - ${BRAND.shortCode}`;

  const bulkReminderTemplate =
    `Dear Parent, fees for your child for ${globalTerm} are outstanding. Please make payment before ${nextReminderMondayLabel}. - ${BRAND.shortCode}`;

  const openSingleReminder = (row) => {
    const msg = buildShortReminderMsg(row.student, row.balance, globalTerm);
    setReminderMsg(msg);
    setReminderDialog({ rows: [row], isBulk: false });
  };

  const openBulkReminder = (outstandingRows) => {
    const sample = outstandingRows[0];
    // For bulk we store a template — actual message per parent is built at send time
    setReminderMsg(bulkReminderTemplate);
    setReminderDialog({ rows: outstandingRows, isBulk: true });
  };

  const handleSendReminders = async () => {
    if (!reminderDialog) return;
    setSendingReminder(true);
    setBulkReminderProgress(null);
    const rows = reminderDialog.rows.filter(r => r.student?.parent_phone);
    let sent = 0, failed = 0;
    for (let i = 0; i < rows.length; i++) {
      const { student, balance } = rows[i];
      const msg = reminderDialog.isBulk
        ? buildShortReminderMsg(student, balance, globalTerm)
        : reminderMsg;
      if (reminderDialog.isBulk) setBulkReminderProgress(`${i + 1}/${rows.length}`);
      try {
        const res = await sendSMS({ phoneNumbers: [student.parent_phone], message: msg, senderId: smsSenderId || BRAND.smsSenderId });
        if ((res?.data?.sent ?? 0) > 0) sent++; else failed++;
      } catch { failed++; }
    }
    setBulkReminderProgress(null);
    setSendingReminder(false);
    setReminderDialog(null);
    if (sent > 0) toast({ title: `${sent} reminder${sent !== 1 ? "s" : ""} sent`, description: failed > 0 ? `${failed} failed (no phone number or delivery error)` : "All SMS reminders delivered successfully.", className: "border-emerald-300 bg-emerald-50 text-emerald-900" });
    else toast({ title: "Reminders failed", description: "Could not send any reminders. Check phone numbers.", variant: "destructive" });
    logPaymentAudit({
      action: "created",
      entityType: "sms_reminder_batch",
      entityId: `${globalTerm}:${globalYear}`,
      summary: reminderDialog.isBulk
        ? `Sent bulk outstanding reminders for ${globalTerm} ${globalYear}.`
        : `Sent single outstanding reminder for ${globalTerm} ${globalYear}.`,
      details: {
        term: globalTerm,
        academic_year: globalYear,
        is_bulk: !!reminderDialog.isBulk,
        recipients_targeted: rows.length,
        sent,
        failed,
      },
    }).catch((err) => console.error("Audit log failed:", err));
  };

  // Student history drawer state (Feature 5)
  const [historyStudent, setHistoryStudent]   = useState(null);

  // Discounts state (Feature 6) — {[studentId]: percent}
  // Primary store: school_settings.payment_discounts (JSONB). Falls back to
  // localStorage for environments where the column hasn't been added yet.
  const [discounts, setDiscounts] = useState({});
  const [studentStartTerms, setStudentStartTerms] = useState({});
  useEffect(() => {
    let active = true;
    loadPaymentDiscounts()
      .then((loaded) => {
        if (active) setDiscounts(loaded || {});
      })
      .catch((err) => console.error("Failed to load payment discounts:", err));
    loadStudentStartTerms()
      .then((loaded) => {
        if (active) setStudentStartTerms(loaded || {});
      })
      .catch((err) => console.error("Failed to load student start terms:", err));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const legacyKeys = Object.keys(discounts).filter((key) => key && !key.includes("__"));
    if (!legacyKeys.length || !globalTerm || !globalYear) return;

    const migrated = { ...discounts };
    let changed = false;
    for (const studentId of legacyKeys) {
      const pct = Number(migrated[studentId] || 0);
      delete migrated[studentId];
      if (pct > 0) {
        migrated[makePaymentDiscountKey(studentId, globalTerm, globalYear)] = pct;
      }
      changed = true;
    }

    if (!changed) return;

    savePaymentDiscounts(migrated, {
      performedBy: actorName,
      summary: `Legacy payment discounts migrated into ${globalTerm} ${globalYear}.`,
    })
      .then((clean) => setDiscounts(clean))
      .catch((err) => console.error("Failed to migrate legacy payment discounts:", err));
  }, [discounts, globalTerm, globalYear, actorName]);

  const saveDiscount = async (studentId, pct) => {
    const scopedKey = makePaymentDiscountKey(studentId, globalTerm, globalYear);
    const previousPct = getPaymentDiscountPct(discounts, studentId, globalTerm, globalYear);
    const updated = { ...discounts };
    delete updated[studentId];
    if (pct === 0 || pct === null) {
      delete updated[scopedKey];
    } else {
      updated[scopedKey] = pct;
    }
    const cleanDiscounts = await savePaymentDiscounts(updated, {
      performedBy: actorName,
      summary: `Payment discounts updated by ${actorName}.`,
    });
    setDiscounts(cleanDiscounts);

    const student = students.find((s) => s.id === studentId);
    const studentLabel = student ? `${student.first_name} ${student.last_name}` : "Unknown student";
    if (previousPct !== Number(pct || 0)) {
      logPaymentAudit({
        action: Number(pct || 0) > 0 ? "updated" : "deleted",
        entityType: "student_discount",
        entityId: studentId,
        summary: `Discount ${Number(pct || 0)}% set for ${studentLabel}.`,
        details: {
          student_id: studentId,
          student_name: studentLabel,
          previous_discount_pct: previousPct,
          new_discount_pct: Number(pct || 0),
          term: globalTerm,
          academic_year: globalYear,
        },
      }).catch((err) => console.error("Audit log failed:", err));
    }
  };

  // Fee deadline + reminders state (Feature 7)
  const [feeDeadline, setFeeDeadline] = useState("");
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [sendingDeadlineReminders, setSendingDeadlineReminders] = useState(false);
  const [deadlineReminderProgress, setDeadlineReminderProgress] = useState(null);
  const [feeDeadlinesMap, setFeeDeadlinesMap] = useState({});

  // Load all fee deadlines from DB once, then update when term/year changes
  useEffect(() => {
    loadSchoolSetting("fee_deadlines", {}).then(map => {
      setFeeDeadlinesMap(map || {});
      setFeeDeadline(map?.[`${globalTerm}:${globalYear}`] || "");
    });
  }, []);

  useEffect(() => {
    setFeeDeadline(feeDeadlinesMap[`${globalTerm}:${globalYear}`] || "");
  }, [globalTerm, globalYear, feeDeadlinesMap]);

  const saveDeadline = async () => {
    const previousDeadline = feeDeadlinesMap[`${globalTerm}:${globalYear}`] || "";
    const nextMap = { ...feeDeadlinesMap, [`${globalTerm}:${globalYear}`]: feeDeadline };
    setFeeDeadlinesMap(nextMap);
    await saveSchoolSetting("fee_deadlines", nextMap);
    toast({ title: "Deadline saved", description: `Fee deadline set to ${feeDeadline}.`, className: "border-emerald-300 bg-emerald-50 text-emerald-900" });
    logPaymentAudit({
      action: "updated",
      entityType: "fee_deadline",
      entityId: `${globalTerm}:${globalYear}`,
      summary: `Fee deadline updated for ${globalTerm} ${globalYear}.`,
      details: {
        term: globalTerm,
        academic_year: globalYear,
        previous_deadline: previousDeadline,
        new_deadline: feeDeadline,
      },
    }).catch((err) => console.error("Audit log failed:", err));
  };

  const handleSendDeadlineReminders = async () => {
    const outstandingRows = buildBalanceRows().filter(r => r.balance > 0);
    const withPhone = outstandingRows.filter(r => r.student?.parent_phone);
    if (withPhone.length === 0) {
      toast({ title: "No contacts", description: "No outstanding students with phone numbers.", variant: "destructive" });
      return;
    }
    setSendingDeadlineReminders(true);
    let sent = 0, failed = 0;
    for (let i = 0; i < withPhone.length; i++) {
      const { student, balance } = withPhone[i];
      setDeadlineReminderProgress(`${i + 1}/${withPhone.length}`);
      const msg = `Dear Parent, school fees for ${student.first_name} ${student.last_name} (${student.grade}) for ${globalTerm} ${globalYear} are due by ${feeDeadline}. Outstanding balance: ₦${balance.toLocaleString()}. Please pay promptly. — ${BRAND.shortCode}`;
      try {
        const res = await sendSMS({ phoneNumbers: [student.parent_phone], message: msg, senderId: smsSenderId || BRAND.smsSenderId });
        if ((res?.data?.sent ?? 0) > 0) sent++; else failed++;
      } catch { failed++; }
    }
    setDeadlineReminderProgress(null);
    setSendingDeadlineReminders(false);
    toast({
      title: `${sent} reminder${sent !== 1 ? "s" : ""} sent`,
      description: failed > 0 ? `${failed} failed` : "All reminders delivered.",
      className: sent > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : undefined,
    });
    logPaymentAudit({
      action: "created",
      entityType: "sms_reminder_batch",
      entityId: `${globalTerm}:${globalYear}`,
      summary: `Sent deadline reminders for ${globalTerm} ${globalYear}.`,
      details: {
        term: globalTerm,
        academic_year: globalYear,
        fee_deadline: feeDeadline,
        recipients_with_phone: withPhone.length,
        sent,
        failed,
      },
    }).catch(() => {});
  };

  // Quick Pay modal state
  const [quickPayRow, setQuickPayRow]         = useState(null); // { student, totalFees, alreadyPaid, feeBreakdown }
  const [showQuickPayPicker, setShowQuickPayPicker] = useState(false);

  const isAdminOrSuperAdmin = isAdminLike(currentUser);
  const isSuperAdmin = isSuperAdminRole(currentUser);

  const logPaymentAudit = useCallback(async ({
    action,
    entityType,
    entityId,
    summary,
    details,
  }) => {
    await AuditLog.log({
      action,
      entityType,
      entityId,
      performedBy: actorName,
      summary,
      details: {
        module: "payments",
        actor_id: actorId,
        actor_role: actorRole,
        ...details,
      },
    });
  }, [actorName, actorId, actorRole]);

  useEffect(() => {
    if (viewMode === "approvals" || viewMode === "activitylog") {
      setViewMode("review");
    }
  }, [viewMode]);

  // Build a grade → classFee lookup scoped to the selected term/year
  const classFeeByGrade = React.useMemo(() => {
    const gradeSet = new Set(students.map((student) => student.grade).filter(Boolean));
    const map = {};
    for (const grade of gradeSet) {
      map[grade] = getEffectiveClassFee(classFees, {
        grade,
        term: globalTerm,
        academicYear: globalYear,
      });
    }
    return map;
  }, [classFees, students, globalTerm, globalYear]);

  const clearPaidAutosaveTimer = (studentId) => {
    const existing = paidAutosaveTimersRef.current[studentId];
    if (existing) {
      clearTimeout(existing);
      delete paidAutosaveTimersRef.current[studentId];
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [paymentsData, studentsData, classFeesData, expensesData, feeGroupRecords, paymentAdminNames] = await Promise.all([
        Payment.list("-payment_date"),
        Student.list(),
        ClassFee.list().catch(() => []),
        Expense.list("-expense_date").catch(() => []),
        loadStudentFeeGroups().catch(() => ({})),
        loadPaymentAdminNames(),
      ]);
      setPayments(Array.isArray(paymentsData) ? paymentsData.filter((row) => row && typeof row === "object") : []);
      setPaymentAdminById(paymentAdminNames || {});
      const cleanStudents = Array.isArray(studentsData) ? studentsData.filter((row) => row && typeof row === "object") : [];
      setStudents(applyStudentFeeGroups(cleanStudents, feeGroupRecords));
      setClassFees(Array.isArray(classFeesData) ? classFeesData.filter((row) => row && typeof row === "object") : []);
      setExpenses(Array.isArray(expensesData) ? expensesData.filter((row) => row && typeof row === "object") : []);
    } catch (error) {
      console.error("Error loading payments:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(paidAutosaveTimersRef.current).forEach(clearTimeout);
      paidAutosaveTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    setPaidDrafts({});
    setSavingPaidMap({});
    Object.values(paidAutosaveTimersRef.current).forEach(clearTimeout);
    paidAutosaveTimersRef.current = {};
  }, [globalTerm, globalYear]);

  const filterPayments = useCallback(() => {
    try {
      let filtered = Array.isArray(payments) ? payments.filter((payment) => payment && typeof payment === "object") : [];

      // Always filter by global term + year in cards view
      filtered = filtered.filter(
        (payment) => payment.term === effectiveTerm && payment.academic_year === effectiveYear
      );

      // Manual opening balances are for historical context only; hide from app transaction cards/list.
      filtered = filtered.filter((payment) => !isManualOpeningPaid(payment));

      if (searchTerm) {
        filtered = filtered.filter((payment) => {
          const student = students.find((studentRow) => studentRow?.id === payment.student_id);
          const studentName = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "";
          return (
            studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(payment.term || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(payment.academic_year || "").toLowerCase().includes(searchTerm.toLowerCase())
          );
        });
      }

      if (viewMode !== "cards" && filters.status !== "all") {
        filtered = filtered.filter((payment) => payment.payment_status === filters.status);
      }

      if (viewMode !== "cards" && filters.method !== "all") {
        filtered = filtered.filter((payment) => payment.payment_method === filters.method);
      }

      if (viewMode === "cards" && filters.paymentDate) {
        filtered = filtered.filter((payment) => {
          const paymentDate = payment.payment_date || payment.created_date || "";
          return String(paymentDate).slice(0, 10) === filters.paymentDate;
        });
      }

      if (filters.grade !== "all") {
        const gradeStudentIds = new Set(
          students
            .filter((student) => student?.grade === filters.grade)
            .map((student) => student.id)
        );
        filtered = filtered.filter((payment) => gradeStudentIds.has(payment.student_id));
      }

      filtered = [...filtered].sort((a, b) => getPaymentEntryTimestamp(b) - getPaymentEntryTimestamp(a));
      setFilteredPayments(filtered);
    } catch (error) {
      console.error("Payments filter failed:", error);
      setFilteredPayments([]);
    }
  }, [payments, students, searchTerm, filters, effectiveTerm, effectiveYear, viewMode]);

  useEffect(() => {
    filterPayments();
  }, [filterPayments]);

  // Check if student is fully paid after recording a payment
  const checkFullyPaid = async (studentId, term, academicYear) => {
    try {
      const student = students.find(s => s.id === studentId);
      if (!student) return;
      const feeSnapshot = getStudentFeeSnapshot({
        student,
        classFees,
        term,
        academicYear,
      });
      const totalFees = feeSnapshot.totalWithoutArrears;
      if (totalFees <= 0) return;

      const allPayments = await Payment.filter({ student_id: studentId, term, academic_year: academicYear });
      const totalPaid = allPayments
        .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      if (totalPaid >= totalFees) {
        toast({
          title: "✅ Fully Paid!",
          description: `${student.first_name} ${student.last_name} has now paid in full for ${term} ${academicYear}.`,
          className: "border-emerald-300 bg-emerald-50 text-emerald-900"
        });
      }
    } catch (err) {
      // silently ignore
    }
  };

  const handleSubmit = async (paymentData) => {
    try {
      let savedPayment = null;
      if (editingPayment) {
        const before = { ...editingPayment };
        savedPayment = await Payment.update(editingPayment.id, paymentData);
        toast({ title: "Payment updated", description: "Payment record has been updated." });
        await logPaymentAudit({
          action: "updated",
          entityType: "payment",
          entityId: editingPayment.id,
          summary: `Payment updated for ${savedPayment?.term || before.term} ${savedPayment?.academic_year || before.academic_year}.`,
          details: {
            before,
            after: savedPayment,
          },
        });
      } else {
        savedPayment = await Payment.create({
          ...paymentData,
          recorded_by_name: actorName,
          recorded_by_id: actorId,
          recorded_by_role: actorRole,
        });
        toast({ title: "Payment recorded", description: "Payment has been successfully recorded." });
        recordStreak(currentUser?.id, STREAK_TYPES.PAYMENTS);
        notify({
          title: `Payment recorded — ${paymentData.student_name || "Student"}`,
          message: `₦${Number(paymentData.amount || 0).toLocaleString()} received${paymentData.payment_type ? ` · ${paymentData.payment_type}` : ""}`,
          type: "payment",
          targetRole: "admin",
          link: "/payments",
        });
        await logPaymentAudit({
          action: "created",
          entityType: "payment",
          entityId: savedPayment?.id || null,
          summary: `Payment of â‚¦${Number(paymentData.amount || 0).toLocaleString()} recorded.`,
          details: {
            payment: savedPayment || paymentData,
          },
        });
      }
      setShowForm(false);
      setEditingPayment(null);
      await loadData();
      const finalStatus = savedPayment?.payment_status || paymentData.payment_status;
      if (finalStatus === "paid") {
        await checkFullyPaid(
          savedPayment?.student_id || paymentData.student_id,
          savedPayment?.term || paymentData.term,
          savedPayment?.academic_year || paymentData.academic_year
        );
      }
    } catch (error) {
      console.error("Error saving payment:", error);
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const handleEdit = (payment) => {
    setEditingPayment(payment);
    setShowForm(true);
  };

  // Bulk payment status update
  const handleToggleSelect = (id, checked) => {
    setSelectedPayments(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const pending = filteredPayments.filter(p => p.payment_status === "pending");
    if (selectedPayments.size === pending.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(pending.map(p => p.id)));
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedPayments.size === 0) return;
    setIsBulkUpdating(true);
    try {
      const selectedIds = Array.from(selectedPayments);
      const beforeRows = filteredPayments
        .filter((payment) => selectedIds.includes(payment.id))
        .map((payment) => ({
          id: payment.id,
          payment_status: payment.payment_status,
          payment_date: payment.payment_date,
          amount: payment.amount,
          student_id: payment.student_id,
        }));
      // Use local date (not UTC) — toISOString() shifts to UTC which can give yesterday in UTC+1
      const today = getLagosDateString();
      for (const id of selectedIds) {
        await Payment.update(id, { payment_status: "paid", payment_date: today });
      }
      toast({ title: `${selectedPayments.size} payment(s) marked as paid`, description: "Records have been updated." });
      setSelectedPayments(new Set());
      await loadData();
      logPaymentAudit({
        action: "updated",
        entityType: "payment_bulk",
        entityId: null,
        summary: `${selectedIds.length} payment(s) marked as paid in bulk.`,
        details: {
          ids: selectedIds,
          payment_date: today,
          before: beforeRows,
        },
      }).catch(() => {});
    } catch (err) {
      toast({ title: "Bulk update failed", description: err?.message, variant: "destructive" });
    }
    setIsBulkUpdating(false);
  };

  const loadPaidAdjustmentRequests = useCallback(async () => {
    if (!isAdminOrSuperAdmin) {
      setPaidAdjustmentRequests([]);
      return [];
    }
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("type", PAID_ADJUSTMENT_REQUEST_TYPE)
        .order("created_at", { ascending: false })
        .limit(300);

      const parsed = (data || [])
        .map((notification) => parsePaidAdjustmentPayload(notification))
        .filter(Boolean);
      setPaidAdjustmentRequests(parsed);
      return parsed;
    } catch {
      setPaidAdjustmentRequests([]);
      return [];
    }
  }, [isAdminOrSuperAdmin]);

  const maybeSendSuperAdminPendingReminder = useCallback(async (pendingCount) => {
    if (!pendingCount || pendingCount <= 0) return;
    try {
      const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", PAID_ADJUSTMENT_REMINDER_TYPE)
        .gte("created_at", cutoffIso)
        .limit(1);
      if (recent?.length) return;

      await supabase.from("notifications").insert({
        title: `${pendingCount} paid change request(s) pending review`,
        message: "Review pending paid-column changes in Payment Management before they can take effect.",
        type: PAID_ADJUSTMENT_REMINDER_TYPE,
        target_role: "super_admin",
        link: "/payments",
        is_read: false,
      });
    } catch {
      // non-blocking reminder flow
    }
  }, []);

  const persistPaidDraft = async (row, rawValue) => {
    if (!isAdminOrSuperAdmin || paidColumnLocked) return;
    const studentId = row?.student?.id;
    if (!studentId) return;

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;

    const requestedTotalPaid = Math.max(0, Math.round(parsed));
    const appRecordedPaid = Math.max(0, Math.round(Number(row.appRecordedPaid || 0)));
    const finalTotalPaid = Math.max(requestedTotalPaid, appRecordedPaid);

    if (finalTotalPaid !== requestedTotalPaid) {
      setPaidDrafts((prev) => ({ ...prev, [studentId]: String(finalTotalPaid) }));
      toast({
        title: "Cannot go below recorded payments",
        description: `This student already has N${appRecordedPaid.toLocaleString()} recorded in the app.`,
      });
    }

    const requestKey = buildPaidRequestKey(studentId, globalTerm, globalYear);
    const existingPending = paidAdjustmentRequests.find(
      (request) =>
        request?.status === "pending" &&
        buildPaidRequestKey(request.student_id, request.term, request.academic_year) === requestKey
    );
    if (!isSuperAdmin && existingPending && Number(existingPending.requested_total_paid) === finalTotalPaid) {
      setPaidDrafts((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      return;
    }

    setSavingPaidMap((prev) => ({ ...prev, [studentId]: true }));
    try {
      const nowIso = new Date().toISOString();

      if (existingPending?.notification_id) {
        const supersededPayload = {
          ...existingPending,
          status: "superseded",
          superseded_at: nowIso,
          superseded_by_id: currentUser?.id || null,
          superseded_by_name: currentUser?.full_name || currentUser?.email || "Unknown user",
          superseded_by_role: currentUser?.school_role || "",
          last_updated_at: nowIso,
        };
        await supabase
          .from("notifications")
          .update({
            title: `Superseded paid change: ${supersededPayload.student_name || "Student"}`,
            message: JSON.stringify(supersededPayload),
            is_read: true,
          })
          .eq("id", existingPending.notification_id);

        logPaymentAudit({
          action: "updated",
          entityType: "paid_adjustment_request",
          entityId: existingPending.notification_id,
          summary: `Superseded pending paid change for ${supersededPayload.student_name || "Student"}.`,
          details: {
            previous_request: existingPending,
            superseded_payload: supersededPayload,
          },
        }).catch(() => {});
      }

      if (isSuperAdmin) {
        await applyApprovedPaidAdjustment({
          notification_id: `direct-${currentUser?.id || "superadmin"}`,
          student_id: studentId,
          term: globalTerm,
          academic_year: globalYear,
          requested_total_paid: finalTotalPaid,
          app_recorded_paid: appRecordedPaid,
        });
        setPaidDrafts((prev) => {
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
        await Promise.all([loadData(), loadPaidAdjustmentRequests()]);
        logPaymentAudit({
          action: "updated",
          entityType: "paid_adjustment_direct",
          entityId: studentId,
          summary: `Superadmin directly set paid value for ${row.student.first_name} ${row.student.last_name}.`,
          details: {
            student_id: studentId,
            student_name: `${row.student.first_name} ${row.student.last_name}`,
            term: globalTerm,
            academic_year: globalYear,
            requested_total_paid: finalTotalPaid,
            app_recorded_paid: appRecordedPaid,
          },
        }).catch(() => {});
        toast({
          title: "Paid value saved",
          description: "Change applied immediately.",
        });
      } else {
        const payload = {
          version: PAID_ADJUSTMENT_REQUEST_VERSION,
          status: "pending",
          request_key: requestKey,
          student_id: studentId,
          student_name: `${row.student.first_name} ${row.student.last_name}`,
          student_grade: row.student.grade || "",
          term: globalTerm,
          academic_year: globalYear,
          current_total_paid: Math.max(0, Math.round(Number(row.totalPaid || 0))),
          requested_total_paid: finalTotalPaid,
          requested_opening_paid: Math.max(0, finalTotalPaid - appRecordedPaid),
          app_recorded_paid: appRecordedPaid,
          requested_by_id: currentUser?.id || null,
          requested_by_name: currentUser?.full_name || currentUser?.email || "Unknown user",
          requested_by_role: currentUser?.school_role || "",
          requested_at: nowIso,
          last_updated_at: nowIso,
          previous_request_id: existingPending?.notification_id || null,
        };

        const { data: insertedRequest } = await supabase.from("notifications").insert({
          title: `Paid change request: ${payload.student_name}`,
          message: JSON.stringify(payload),
          type: PAID_ADJUSTMENT_REQUEST_TYPE,
          target_role: "super_admin",
          link: "/payments",
          is_read: false,
        }).select("id").single();

        setPaidDrafts((prev) => {
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
        const refreshedRequests = await loadPaidAdjustmentRequests();
        const refreshedPendingCount = (refreshedRequests || []).filter(
          (request) => request?.status === "pending"
        ).length;
        await maybeSendSuperAdminPendingReminder(refreshedPendingCount);
        logPaymentAudit({
          action: "created",
          entityType: "paid_adjustment_request",
          entityId: insertedRequest?.id || null,
          summary: `Submitted paid change request for ${payload.student_name}.`,
          details: {
            request: payload,
          },
        }).catch(() => {});
        toast({
          title: "Pending superadmin approval",
          description: "Your paid change was submitted and will apply only after review.",
        });
      }
    } catch (error) {
      toast({
        title: "Auto-save failed",
        description: error?.message || "Could not submit paid change request.",
        variant: "destructive",
      });
    }
    setSavingPaidMap((prev) => ({ ...prev, [studentId]: false }));
  };

  const handlePaidDraftChange = (row, rawValue) => {
    if (!isAdminOrSuperAdmin || paidColumnLocked) return;
    const studentId = row?.student?.id;
    if (!studentId) return;
    const digitsOnly = String(rawValue || "").replace(/[^\d]/g, "");

    setPaidDrafts((prev) => ({ ...prev, [studentId]: digitsOnly }));
    clearPaidAutosaveTimer(studentId);
    paidAutosaveTimersRef.current[studentId] = setTimeout(() => {
      persistPaidDraft(row, digitsOnly);
    }, 700);
  };

  const handlePaidDraftBlur = (row) => {
    if (!isAdminOrSuperAdmin || paidColumnLocked) return;
    const studentId = row?.student?.id;
    if (!studentId) return;
    const currentDraft = paidDrafts[studentId];
    if (currentDraft === undefined) return;

    clearPaidAutosaveTimer(studentId);
    persistPaidDraft(row, currentDraft);
  };

  useEffect(() => {
    loadPaidAdjustmentRequests();
  }, [loadPaidAdjustmentRequests, globalTerm, globalYear]);

  // Build per-student balance view — filtered by globalTerm + globalYear
  const buildBalanceRows = () => {
    try {
      const safeStudents = Array.isArray(students) ? students.filter((student) => student && typeof student === "object") : [];
      const safePayments = Array.isArray(payments) ? payments.filter((payment) => payment && typeof payment === "object") : [];
      const activeStudents = filters.grade !== "all"
        ? safeStudents.filter(
            (student) =>
              student.enrollment_status === "active" &&
              student.grade === filters.grade &&
              isStudentActiveForTerm(student, effectiveTerm, effectiveYear, studentStartTerms)
          )
        : safeStudents.filter(
            (student) =>
              student.enrollment_status === "active" &&
              isStudentActiveForTerm(student, effectiveTerm, effectiveYear, studentStartTerms)
          );

      const termPayments = safePayments.filter(
        (payment) => payment.term === effectiveTerm && payment.academic_year === effectiveYear
      );

      return activeStudents.map((student) => {
        const studentPayments = termPayments.filter((payment) => payment.student_id === student.id);
        const totalPaid = studentPayments
          .filter((payment) => payment.payment_status === "paid" || payment.payment_status === "partial")
          .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        const manualOpeningPaid = studentPayments
          .filter(
            (payment) =>
              (payment.payment_status === "paid" || payment.payment_status === "partial") &&
              isManualOpeningPaid(payment)
          )
          .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        const appRecordedPaid = Math.max(0, totalPaid - manualOpeningPaid);

        const arrearsTotal = getStudentArrearsTotal({
          student,
          payments: safePayments,
          term: effectiveTerm,
          academicYear: effectiveYear,
          startTermRecords: studentStartTerms,
        });

        const discountPct = getPaymentDiscountPct(discounts, student.id, effectiveTerm, effectiveYear);
        const feeSnapshot = getStudentFeeSnapshot({
          student,
          classFees,
          term: effectiveTerm,
          academicYear: effectiveYear,
          discountPct,
        });
        const currentTermFees = Number(feeSnapshot.totalWithoutArrears || 0);
        const totalFees = currentTermFees + arrearsTotal;
        const balance = totalFees - totalPaid;
        return {
          student,
          totalPaid,
          appRecordedPaid,
          manualOpeningPaid,
          arrearsTotal,
          currentTermFees,
          totalFees,
          balance,
          discountPct,
          feeBreakdown: { tuition: feeSnapshot.tuition, otherFees: feeSnapshot.otherFees, arrears: arrearsTotal },
        };
      }).filter((row) =>
        searchTerm
          ? `${row.student.first_name || ""} ${row.student.last_name || ""}`.toLowerCase().includes(searchTerm.toLowerCase())
          : true
      ).sort((a, b) => {
        const nameA = `${a.student.first_name || ""} ${a.student.last_name || ""}`.toLowerCase();
        const nameB = `${b.student.first_name || ""} ${b.student.last_name || ""}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } catch (error) {
      console.error("buildBalanceRows failed:", error);
      return [];
    }
  };

  const allPendingPaidAdjustmentRequests = paidAdjustmentRequests.filter(
    (request) => request?.status === "pending"
  );
  const allPendingPaymentApprovalRequests = [];

  const pendingPaidAdjustmentRequests = allPendingPaidAdjustmentRequests.filter(
    (request) =>
      request.term === effectiveTerm &&
      request.academic_year === effectiveYear
  );

  const pendingPaidByStudent = pendingPaidAdjustmentRequests.reduce((acc, request) => {
    if (!acc[request.student_id]) acc[request.student_id] = request;
    return acc;
  }, {});

  useEffect(() => {
    if (!allPendingPaidAdjustmentRequests.length) return;
    maybeSendSuperAdminPendingReminder(allPendingPaidAdjustmentRequests.length);
    const interval = setInterval(() => {
      maybeSendSuperAdminPendingReminder(allPendingPaidAdjustmentRequests.length);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [allPendingPaidAdjustmentRequests.length, maybeSendSuperAdminPendingReminder]);

  // Analytics (based on term-filtered payments)
  // "partial" payments are real money received — count them in Total Collected
  const totalAmount = (Array.isArray(filteredPayments) ? filteredPayments : [])
    .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // True outstanding balance = total fees owed - total paid/partial received, per active student.
  // This correctly accounts for students who have only paid partially (no "pending" record exists
  // after a Quick Pay — only a "partial" record does).
  const { pendingAmount, studentsOwingCount } = React.useMemo(() => {
    try {
      const safePayments = Array.isArray(payments) ? payments.filter((payment) => payment && typeof payment === "object") : [];
      const safeStudents = Array.isArray(students) ? students.filter((student) => student && typeof student === "object") : [];
      const termPaymentsAll = safePayments.filter(
        (payment) => payment.term === effectiveTerm && payment.academic_year === effectiveYear
      );

      const aggregates = safeStudents
        .filter(
          (student) =>
            student.enrollment_status === "active" &&
            isStudentActiveForTerm(student, effectiveTerm, effectiveYear, studentStartTerms)
        )
        .reduce((acc, student) => {
          const feeSnapshot = getStudentFeeSnapshot({
            student,
            classFees,
            term: effectiveTerm,
            academicYear: effectiveYear,
            discountPct: getPaymentDiscountPct(discounts, student.id, effectiveTerm, effectiveYear),
          });
          const totalFees = Number(feeSnapshot.totalWithoutArrears || 0) + getStudentArrearsTotal({
            student,
            payments: safePayments,
            term: effectiveTerm,
            academicYear: effectiveYear,
            startTermRecords: studentStartTerms,
          });
          if (totalFees <= 0) return acc;
          const paid = termPaymentsAll
            .filter(
              (payment) =>
                payment.student_id === student.id &&
                (payment.payment_status === "paid" || payment.payment_status === "partial")
            )
            .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
          const balance = Math.max(0, totalFees - paid);
          acc.pendingAmount += balance;
          if (balance > 0) acc.studentsOwingCount += 1;
          return acc;
        }, { pendingAmount: 0, studentsOwingCount: 0 });

      return aggregates;
    } catch (error) {
      console.error("Payment analytics aggregation failed:", error);
      return { pendingAmount: 0, studentsOwingCount: 0 };
    }
  }, [payments, students, classFees, discounts, studentStartTerms, effectiveTerm, effectiveYear]);

  const statusData = [
    { name: "Paid",    value: (Array.isArray(filteredPayments) ? filteredPayments : []).filter(p => p.payment_status === "paid").length,    color: "#10b981" },
    { name: "Partial", value: (Array.isArray(filteredPayments) ? filteredPayments : []).filter(p => p.payment_status === "partial").length, color: "#3b82f6" },
    { name: "Pending", value: (Array.isArray(filteredPayments) ? filteredPayments : []).filter(p => p.payment_status === "pending").length, color: "#f59e0b" },
    { name: "Overdue", value: (Array.isArray(filteredPayments) ? filteredPayments : []).filter(p => p.payment_status === "overdue").length, color: "#ef4444" },
  ];

  const methodData = {};
  (Array.isArray(filteredPayments) ? filteredPayments : [])
    .filter(p => p.payment_status === "paid" || p.payment_status === "partial")
    .forEach(p => {
      methodData[p.payment_method] = (methodData[p.payment_method] || 0) + Number(p.amount || 0);
    });
  const methodChartData = Object.entries(methodData).map(([method, amount]) => ({ method, amount }));

  // Only truly-pending (not yet received) payments get the checkbox — partial = already received via app
  const cardsPayments = React.useMemo(
    () => filteredPayments.filter(isCurrentTermAppPaymentRecord),
    [filteredPayments]
  );
  const pendingNotPaid = cardsPayments.filter(p => p.payment_status === "pending");
  const sectionResetKey = `${viewMode}:${effectiveTerm}:${effectiveYear}`;

  // Feature 3: Print unpaid list
  const printUnpaidList = () => {
    const rows = buildBalanceRows().filter(r => r.balance > 0);
    const gradeMap = {};
    for (const r of rows) {
      const g = r.student.grade || "Unknown";
      if (!gradeMap[g]) gradeMap[g] = [];
      gradeMap[g].push(r);
    }
    const gradesSorted = Object.keys(gradeMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const totalFees = rows.reduce((s, r) => s + r.totalFees, 0);
    const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);

    const tableRows = gradesSorted.map(grade => {
      const gRows = gradeMap[grade];
      const header = `<tr style="background:#f1f5f9"><td colspan="4" style="padding:6px 10px;font-weight:700;font-size:13px;color:#334155;">${grade}</td></tr>`;
      const studentRows = gRows.map(r =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:5px 10px">${r.student.first_name} ${r.student.last_name}</td>
          <td style="padding:5px 10px;text-align:right">₦${r.totalFees.toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right">₦${r.totalPaid.toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right;color:#dc2626;font-weight:600">₦${r.balance.toLocaleString()}</td>
        </tr>`
      ).join("");
      return header + studentRows;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Unpaid List</title>
    <style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px;color:#1e293b}
    table{width:100%;border-collapse:collapse}th{background:#1e293b;color:white;padding:8px 10px;text-align:left}
    th:not(:first-child){text-align:right}@media print{button{display:none}}</style></head>
    <body>
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:18px;text-transform:uppercase">${BRAND.schoolName.toUpperCase()}</h2>
      <h3 style="margin:4px 0 0;font-size:15px">Unpaid Students — ${globalTerm} ${globalYear}</h3>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b">Printed: ${formatDateInLagos(new Date(), { day:"2-digit", month:"long", year:"numeric" })}</p>
    </div>
    <table>
      <thead><tr><th>Student Name</th><th style="text-align:right">Total Fees</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr style="background:#1e293b;color:white;font-weight:700">
        <td style="padding:8px 10px">TOTAL (${rows.length} students)</td>
        <td style="padding:8px 10px;text-align:right">₦${totalFees.toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">₦${totalPaid.toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">₦${totalBalance.toLocaleString()}</td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // Feature 8: Export to CSV/Excel
  const exportToExcel = () => {
    const rows = buildBalanceRows();
    const headers = ["Student Name", "Class", "Term", "Year", "Total Fees", "Already Paid", "Balance", "Status", "Parent Phone"];
    const csvRows = rows.map(r => {
      const status = r.balance <= 0 ? "Fully Paid" : r.totalPaid > 0 ? "Partial" : "Unpaid";
      return [
        `"${r.student.first_name} ${r.student.last_name}"`,
        `"${r.student.grade}"`,
        `"${globalTerm}"`,
        `"${globalYear}"`,
        r.totalFees,
        r.totalPaid,
        Math.max(0, r.balance),
        `"${status}"`,
        `"${r.student.parent_phone || ""}"`,
      ].join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${globalTerm}-${globalYear}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const rows = buildBalanceRows();

    // Sort by grade (class) then by student name within each class
    const sorted = [...rows].sort((a, b) => {
      const gradeCompare = (a.student.grade || "").localeCompare(b.student.grade || "", undefined, { numeric: true });
      if (gradeCompare !== 0) return gradeCompare;
      return `${a.student.last_name} ${a.student.first_name}`.localeCompare(
        `${b.student.last_name} ${b.student.first_name}`
      );
    });

    const totalExpected = sorted.reduce((s, r) => s + r.totalFees, 0);
    const totalCollected = sorted.reduce((s, r) => s + r.totalPaid, 0);
    const totalOutstanding = sorted.reduce((s, r) => s + Math.max(0, r.balance), 0);

    // Build rows with a class-group header whenever the grade changes
    let currentGrade = null;
    const tableRows = sorted.map(r => {
      const gradeHeader = r.student.grade !== currentGrade
        ? (() => { currentGrade = r.student.grade; return `
          <tr>
            <td colspan="6" style="background:#ede9fe;color:#4c1d95;font-weight:bold;font-size:11px;
              text-transform:uppercase;letter-spacing:0.5px;padding:6px 10px;border-bottom:2px solid #c4b5fd;">
              ${r.student.grade}
            </td>
          </tr>`; })()
        : "";
      return gradeHeader + `
      <tr>
        <td>${r.student.first_name} ${r.student.last_name}</td>
        <td>${r.student.grade}</td>
        <td style="text-align:right">₦${r.totalFees.toLocaleString()}</td>
        <td style="text-align:right">₦${r.totalPaid.toLocaleString()}</td>
        <td style="text-align:right;color:${r.balance > 0 ? '#dc2626' : '#16a34a'};font-weight:bold;">
          ${r.balance > 0 ? '₦' + r.balance.toLocaleString() : 'PAID'}
        </td>
        <td style="text-align:center">
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;
            background:${r.balance <= 0 ? '#dcfce7' : r.totalPaid > 0 ? '#dbeafe' : '#fef3c7'};
            color:${r.balance <= 0 ? '#15803d' : r.totalPaid > 0 ? '#1d4ed8' : '#92400e'}">
            ${r.balance <= 0 ? 'Paid' : r.totalPaid > 0 ? 'Partial' : 'Unpaid'}
          </span>
        </td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Fee Balance Report — ${globalTerm} ${globalYear}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px 32px; }
        h1 { font-size: 18px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; letter-spacing: 1px; }
        .subtitle { color: #64748b; font-size: 12px; margin-top: 2px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e3a8a; color: white; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        th:not(:first-child):not(:nth-child(2)) { text-align: right; }
        th:last-child { text-align: center; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .summary { display: flex; gap: 16px; margin-top: 20px; }
        .sum-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; text-align: center; }
        .sum-label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
        .sum-value { font-size: 18px; font-weight: bold; margin-top: 2px; }
        @media print { @page { size: A4 landscape; margin: 12mm; } button { display:none!important; } }
        .print-btn { position:fixed; top:16px; right:16px; background:#1e3a8a; color:white; border:none; border-radius:8px; padding:10px 20px; font-size:13px; cursor:pointer; }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
      <h1>${BRAND.schoolName.toUpperCase()}</h1>
      <div class="subtitle">Fee Balance Report &mdash; ${globalTerm} ${globalYear} &mdash; Generated ${formatDateInLagos(new Date(), {day:'2-digit',month:'short',year:'numeric'}, 'en-GB')}</div>
      <table>
        <thead><tr>
          <th>Student Name</th><th>Class</th>
          <th style="text-align:right">Total Fees</th>
          <th style="text-align:right">Amount Paid</th>
          <th style="text-align:right">Balance</th>
          <th style="text-align:center">Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="summary">
        <div class="sum-box"><div class="sum-label">Total Expected</div><div class="sum-value" style="color:#1e3a8a">₦${totalExpected.toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">Total Collected</div><div class="sum-value" style="color:#16a34a">₦${totalCollected.toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">Outstanding</div><div class="sum-value" style="color:#dc2626">₦${totalOutstanding.toLocaleString()}</div></div>
      </div>
    </body></html>`;

    const win = window.open("", "_blank", "width=1050,height=800");
    if (!win) { alert("Pop-up blocked! Please allow pop-ups."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const buildDetailedBalanceExportRows = () => {
    const rows = buildBalanceRows();
    return [...rows].sort((a, b) => {
      const gradeCompare = (a.student.grade || "").localeCompare(b.student.grade || "", undefined, { numeric: true });
      if (gradeCompare !== 0) return gradeCompare;
      return `${a.student.last_name} ${a.student.first_name}`.localeCompare(
        `${b.student.last_name} ${b.student.first_name}`
      );
    });
  };

  const printUnpaidListDetailed = () => {
    const rows = buildDetailedBalanceExportRows().filter((row) => row.balance > 0);
    const totalArrears = rows.reduce((sum, row) => sum + (row.arrearsTotal || 0), 0);
    const totalTermFees = rows.reduce((sum, row) => sum + (row.currentTermFees || 0), 0);
    const totalOwed = rows.reduce((sum, row) => sum + row.totalFees, 0);
    const totalPaid = rows.reduce((sum, row) => sum + row.totalPaid, 0);
    const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);

    let currentGrade = null;
    const tableRows = rows.map((row) => {
      const gradeHeader = row.student.grade !== currentGrade
        ? (() => {
            currentGrade = row.student.grade;
            return `<tr style="background:#f1f5f9"><td colspan="6" style="padding:6px 10px;font-weight:700;font-size:13px;color:#334155;">${row.student.grade || "Unknown"}</td></tr>`;
          })()
        : "";

      return gradeHeader + `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:5px 10px">${row.student.first_name} ${row.student.last_name}</td>
          <td style="padding:5px 10px;text-align:right">N${Math.round(row.arrearsTotal || 0).toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right">N${Math.round(row.currentTermFees || 0).toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right">N${Math.round(row.totalFees || 0).toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right">N${Math.round(row.totalPaid || 0).toLocaleString()}</td>
          <td style="padding:5px 10px;text-align:right;color:#dc2626;font-weight:600">N${Math.round(row.balance || 0).toLocaleString()}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Unpaid List</title>
    <style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px;color:#1e293b}
    table{width:100%;border-collapse:collapse}th{background:#1e293b;color:white;padding:8px 10px;text-align:left}
    th:not(:first-child){text-align:right}@media print{button{display:none}}</style></head>
    <body>
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:18px;text-transform:uppercase">${BRAND.schoolName.toUpperCase()}</h2>
      <h3 style="margin:4px 0 0;font-size:15px">Unpaid Students - ${globalTerm} ${globalYear}</h3>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b">Printed: ${formatDateInLagos(new Date(), { day:"2-digit", month:"long", year:"numeric" })}</p>
    </div>
    <table>
      <thead><tr><th>Student Name</th><th style="text-align:right">Arrears</th><th style="text-align:right">This Term</th><th style="text-align:right">Total Owed</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr style="background:#1e293b;color:white;font-weight:700">
        <td style="padding:8px 10px">TOTAL (${rows.length} students)</td>
        <td style="padding:8px 10px;text-align:right">N${Math.round(totalArrears).toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">N${Math.round(totalTermFees).toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">N${Math.round(totalOwed).toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">N${Math.round(totalPaid).toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:right">N${Math.round(totalBalance).toLocaleString()}</td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const exportToExcelDetailed = () => {
    const rows = buildDetailedBalanceExportRows();
    const headers = ["Student Name", "Class", "Term", "Year", "Arrears", "This Term", "Total Owed", "Already Paid", "Balance", "Status", "Parent Phone"];
    const csvRows = rows.map((row) => {
      const status = row.balance <= 0 ? "Fully Paid" : row.totalPaid > 0 ? "Partial" : "Unpaid";
      return [
        `"${row.student.first_name} ${row.student.last_name}"`,
        `"${row.student.grade}"`,
        `"${globalTerm}"`,
        `"${globalYear}"`,
        Math.round(row.arrearsTotal || 0),
        Math.round(row.currentTermFees || 0),
        Math.round(row.totalFees || 0),
        Math.round(row.totalPaid || 0),
        Math.max(0, Math.round(row.balance || 0)),
        `"${status}"`,
        `"${row.student.parent_phone || ""}"`,
      ].join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${globalTerm}-${globalYear}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCardsCsv = () => {
    const headers = ["Amount", "Term", "Year", "Student Name", "Class", "Method", "Payment Date", "Status", "Notes"];
    const csvRows = cardsPayments.map((payment) => {
      const student = students.find((item) => item.id === payment.student_id);
      const note = String(payment?.notes || "").trim();
      const visibleNote = !note || isManualOpeningPaid(payment) ? "" : note;
      return [
        Math.round(Number(payment.amount || 0)),
        `"${payment.term || ""}"`,
        `"${payment.academic_year || ""}"`,
        `"${student ? `${student.first_name} ${student.last_name}` : "Unknown student"}"`,
        `"${student?.grade || ""}"`,
        `"${String(payment.payment_method || "").replaceAll("_", " ")}"`,
        `"${payment.payment_date || payment.created_date || ""}"`,
        `"${payment.payment_status || ""}"`,
        `"${visibleNote.replaceAll('"', '""')}"`,
      ].join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-records-${globalTerm}-${globalYear}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDFDetailed = () => {
    const rows = buildDetailedBalanceExportRows();
    const totalArrears = rows.reduce((sum, row) => sum + (row.arrearsTotal || 0), 0);
    const totalTermFees = rows.reduce((sum, row) => sum + (row.currentTermFees || 0), 0);
    const totalExpected = rows.reduce((sum, row) => sum + row.totalFees, 0);
    const totalCollected = rows.reduce((sum, row) => sum + row.totalPaid, 0);
    const totalOutstanding = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0);

    let currentGrade = null;
    const tableRows = rows.map((row) => {
      const gradeHeader = row.student.grade !== currentGrade
        ? (() => {
            currentGrade = row.student.grade;
            return `
          <tr>
            <td colspan="8" style="background:#ede9fe;color:#4c1d95;font-weight:bold;font-size:11px;
              text-transform:uppercase;letter-spacing:0.5px;padding:6px 10px;border-bottom:2px solid #c4b5fd;">
              ${row.student.grade || "Unknown"}
            </td>
          </tr>`;
          })()
        : "";
      return gradeHeader + `
      <tr>
        <td>${row.student.first_name} ${row.student.last_name}</td>
        <td>${row.student.grade}</td>
        <td style="text-align:right">N${Math.round(row.arrearsTotal || 0).toLocaleString()}</td>
        <td style="text-align:right">N${Math.round(row.currentTermFees || 0).toLocaleString()}</td>
        <td style="text-align:right">N${Math.round(row.totalFees || 0).toLocaleString()}</td>
        <td style="text-align:right">N${Math.round(row.totalPaid || 0).toLocaleString()}</td>
        <td style="text-align:right;color:${row.balance > 0 ? '#dc2626' : '#16a34a'};font-weight:bold;">
          ${row.balance > 0 ? "N" + Math.round(row.balance || 0).toLocaleString() : "PAID"}
        </td>
        <td style="text-align:center">
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;
            background:${row.balance <= 0 ? '#dcfce7' : row.totalPaid > 0 ? '#dbeafe' : '#fef3c7'};
            color:${row.balance <= 0 ? '#15803d' : row.totalPaid > 0 ? '#1d4ed8' : '#92400e'}">
            ${row.balance <= 0 ? "Paid" : row.totalPaid > 0 ? "Partial" : "Unpaid"}
          </span>
        </td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Fee Balance Report - ${globalTerm} ${globalYear}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px 32px; }
        h1 { font-size: 18px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; letter-spacing: 1px; }
        .subtitle { color: #64748b; font-size: 12px; margin-top: 2px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e3a8a; color: white; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        th:nth-child(n+3):not(:last-child) { text-align: right; }
        th:last-child { text-align: center; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-top: 20px; }
        .sum-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; text-align: center; }
        .sum-label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
        .sum-value { font-size: 18px; font-weight: bold; margin-top: 2px; }
        @media print { @page { size: A4 landscape; margin: 12mm; } button { display:none!important; } }
        .print-btn { position:fixed; top:16px; right:16px; background:#1e3a8a; color:white; border:none; border-radius:8px; padding:10px 20px; font-size:13px; cursor:pointer; }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
      <h1>${BRAND.schoolName.toUpperCase()}</h1>
      <div class="subtitle">Fee Balance Report - ${globalTerm} ${globalYear} - Generated ${formatDateInLagos(new Date(), {day:"2-digit",month:"short",year:"numeric"}, "en-GB")}</div>
      <table>
        <thead><tr>
          <th>Student Name</th><th>Class</th>
          <th style="text-align:right">Arrears</th>
          <th style="text-align:right">This Term</th>
          <th style="text-align:right">Total Owed</th>
          <th style="text-align:right">Amount Paid</th>
          <th style="text-align:right">Balance</th>
          <th style="text-align:center">Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="summary">
        <div class="sum-box"><div class="sum-label">Arrears</div><div class="sum-value" style="color:#b45309">N${Math.round(totalArrears).toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">This Term</div><div class="sum-value" style="color:#1e3a8a">N${Math.round(totalTermFees).toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">Total Owed</div><div class="sum-value" style="color:#7c3aed">N${Math.round(totalExpected).toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">Total Collected</div><div class="sum-value" style="color:#16a34a">N${Math.round(totalCollected).toLocaleString()}</div></div>
        <div class="sum-box"><div class="sum-label">Outstanding</div><div class="sum-value" style="color:#dc2626">N${Math.round(totalOutstanding).toLocaleString()}</div></div>
      </div>
    </body></html>`;

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) { alert("Pop-up blocked! Please allow pop-ups."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <PageShell maxWidth="7xl" className="space-y-8">
      <Toaster />

      {/* ── Reminder SMS Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!reminderDialog} onOpenChange={(open) => { if (!open && !sendingReminder) setReminderDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="w-5 h-5 text-amber-500" />
              {reminderDialog?.isBulk
                ? `Send Fee Reminders — ${reminderDialog.rows.filter(r => r.student?.parent_phone).length} parents`
                : `Send Reminder to ${reminderDialog?.rows[0]?.student?.first_name} ${reminderDialog?.rows[0]?.student?.last_name}`}
            </DialogTitle>
            <DialogDescription>
              {reminderDialog?.isBulk
                ? <>Each parent will receive a <strong>personalised</strong> message with their child's name and exact balance.</>
                : <>Balance: <strong className="text-red-600">₦{reminderDialog?.rows[0]?.balance?.toLocaleString()}</strong> · To: {reminderDialog?.rows[0]?.student?.parent_phone || <span className="text-red-500">No phone on file</span>}</>}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                {reminderDialog?.isBulk ? "Message template (variables auto-filled per parent)" : "Message (editable)"}
              </label>
              <textarea
                value={reminderMsg}
                onChange={e => setReminderMsg(e.target.value)}
                rows={5}
                disabled={reminderDialog?.isBulk}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed disabled:opacity-60"
              />
              <p className="text-xs text-slate-400 mt-1">{reminderMsg.length} characters</p>
            </div>

            {reminderDialog?.isBulk && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 space-y-1">
                <p className="font-semibold">Each SMS will include:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Student's first name and class</li>
                  <li>Their exact outstanding balance</li>
                  <li>Term and next payment deadline</li>
                </ul>
                {reminderDialog.rows.filter(r => !r.student?.parent_phone).length > 0 && (
                  <p className="text-red-600 font-medium mt-1">
                    ⚠ {reminderDialog.rows.filter(r => !r.student?.parent_phone).length} student(s) have no phone number — they will be skipped.
                  </p>
                )}
              </div>
            )}

            {bulkReminderProgress && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                Sending {bulkReminderProgress}…
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReminderDialog(null)} disabled={sendingReminder}>
              Cancel
            </Button>
            <Button
              onClick={handleSendReminders}
              disabled={sendingReminder || (!reminderDialog?.isBulk && !reminderDialog?.rows[0]?.student?.parent_phone)}
              className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
            >
              {sendingReminder
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> Send {reminderDialog?.isBulk ? `${reminderDialog.rows.filter(r => r.student?.parent_phone).length} Reminders` : "Reminder"}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>

        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 text-[2rem] font-bold text-slate-900 sm:text-4xl">Payment Management</h1>
            <p className="text-slate-600">Track and manage all school fee payments</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:flex-wrap">
            {/* Global Term / Year selector */}
            <div className="flex w-full items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={globalTerm}
                onChange={e => setGlobalTerm(e.target.value)}
                className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              >
                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-slate-300">·</span>
              <select
                value={globalYear}
                onChange={e => setGlobalYear(e.target.value)}
                className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              >
                {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <SaveToVaultButton module="financial" term={globalTerm} year={globalYear} />
            {/* Quick Payment */}
            <Button
              onClick={() => setShowQuickPayPicker(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm sm:w-auto"
            >
              <Zap className="w-4 h-4" /> Quick Payment
            </Button>
          </div>
        </div>

        {/* Term status banner */}
        {(() => {
          const today = getLagosDateString();
          const status = getSchoolDayStatus(today, calendarEvents, globalTerm, globalYear);
          if (!status.closed || calendarEvents.length === 0) return null;
          return (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>
                <strong>{status.reason}</strong> — school may not be in session for {globalTerm} {globalYear}. Records are still accessible.
              </span>
            </div>
          );
        })()}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Total Collected</p>
                  <p className="text-3xl font-bold mt-1">{fmtAmount(totalAmount)}</p>
                  <p className="text-emerald-200 text-xs mt-1">{globalTerm} · {globalYear}</p>
                </div>
                <DollarSign className="w-12 h-12 text-emerald-200 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium">Outstanding Balance</p>
                  <p className="text-3xl font-bold mt-1">{fmtAmount(pendingAmount)}</p>
                  <p className="text-amber-200 text-xs mt-1">{globalTerm} · {globalYear}</p>
                </div>
                <AlertCircle className="w-12 h-12 text-amber-200 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">Students Owing</p>
                  <p className="text-3xl font-bold mt-1">{studentsOwingCount}</p>
                  <p className="text-indigo-200 text-xs mt-1">{globalTerm} · {globalYear}</p>
                </div>
                <CheckSquare className="w-12 h-12 text-indigo-200 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {showForm && (
            <PaymentForm
              payment={editingPayment}
              students={students}
              classFees={classFees}
              defaultTerm={globalTerm}
              defaultYear={globalYear}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingPayment(null);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCarryForward && (
            <CarryForwardModal
              students={students}
              onClose={() => setShowCarryForward(false)}
              onSuccess={() => {
                loadData();
                toast({ title: "Arrears transferred", description: "Outstanding balances have been carried forward as pending payments." });
              }}
            />
          )}
        </AnimatePresence>

        {/* Quick Payment student picker (header button) */}
        {showQuickPayPicker && (
          <QuickPayStudentPicker
            students={students}
            defaultTerm={globalTerm}
            defaultYear={globalYear}
            onClose={() => { setShowQuickPayPicker(false); loadData(); }}
          />
        )}

        {/* Quick Pay Modal */}
        {quickPayRow && (
          <QuickPayModal
            student={quickPayRow.student}
            term={globalTerm}
            academicYear={globalYear}
            totalFees={quickPayRow.totalFees}
            alreadyPaid={quickPayRow.totalPaid}
            feeBreakdown={quickPayRow.feeBreakdown}
            discountPct={quickPayRow.discountPct || 0}
            smsSenderId={smsSenderId}
            onClose={() => setQuickPayRow(null)}
            onSuccess={() => {
              loadData();
              toast({ title: "Payment recorded", description: "Payment successfully recorded." });
            }}
          />
        )}

        {/* Feature 5: Student History Drawer */}
        {historyStudent && (
          <StudentHistoryDrawer
            student={historyStudent}
            allPayments={payments}
            classFees={classFees}
            onClose={() => setHistoryStudent(null)}
          />
        )}

        {/* Payment Records Card */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60 mb-8">
          <CardHeader>
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle>Payment Records</CardTitle>
                {/* View toggle */}
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 flex-wrap">
                  {[
                    { key: "cards", label: "Cards", icon: <LayoutList className="w-3.5 h-3.5" /> },
                    { key: "balance", label: "Balance", icon: <TrendingDown className="w-3.5 h-3.5" /> },
                    { key: "summary", label: "Summary", icon: <BarChart2 className="w-3.5 h-3.5" /> },
                    { key: "fees", label: "Fee Schedule", icon: <Settings className="w-3.5 h-3.5" /> },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setViewMode(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        viewMode === tab.key
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                      }`}
                    >
                      {tab.icon} {tab.label}
                      {tab.badge ? (
                        <span className="ml-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                          {tab.badge}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk mark paid — floating highlight when selections exist */}
                {selectedPayments.size > 0 && (
                  <Button
                    onClick={handleBulkMarkPaid}
                    disabled={isBulkUpdating}
                    className="bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300"
                  >
                    {isBulkUpdating
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating…</>
                      : <><CheckSquare className="w-4 h-4 mr-2" /> Mark {selectedPayments.size} as Paid</>}
                  </Button>
                )}

                {/* Balance-tab only actions */}
                {isAdminOrSuperAdmin && viewMode === "balance" && (
                  <>
                    <button
                      onClick={() => {
                        const outstanding = buildBalanceRows().filter(r => r.balance > 0);
                        if (outstanding.length > 0) openBulkReminder(outstanding);
                        else toast({ title: "No outstanding balances", description: "All students are fully paid." });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors"
                    >
                      <BellRing className="w-3.5 h-3.5" /> Remind All
                    </button>
                    <button
                      onClick={printUnpaidListDetailed}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium transition-colors"
                    >
                      🖨️ Print Unpaid
                    </button>
                  </>
                )}

                {/* Export PDF — all tabs except Cards */}
                {isAdminOrSuperAdmin && viewMode !== "cards" && (
                  <button
                    onClick={handleExportPDFDetailed}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Export PDF
                  </button>
                )}

                {/* Cards-tab only: Export CSV + Carry Forward Arrears */}
                {isAdminOrSuperAdmin && viewMode === "cards" && (
                  <div className="flex items-center gap-2 flex-nowrap">
                    {/* Auto-Mark Overdue removed
                      variant="outline"
                      onClick={() => {}}
                      disabled={false}
                      className="border-red-200 text-red-700 hover:bg-red-50 gap-1.5"
                    >
                      {isMarkingOverdue
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
                        : <><Zap className="w-4 h-4" /> Auto-Mark Overdue</>}
                    */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportCardsCsv}
                      className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCarryForward(true)}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Carry Forward Arrears
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Feature 7: Fee Deadline & Reminders */}
            {isAdminOrSuperAdmin && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setDeadlineOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    📅 Fee Deadline &amp; Reminders
                    {feeDeadline && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        Due: {feeDeadline}
                      </Badge>
                    )}
                  </span>
                  {deadlineOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {deadlineOpen && (
                  <div className="px-4 py-4 border-t border-slate-200 bg-white space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-600">Payment Deadline:</label>
                        <input
                          type="date"
                          value={feeDeadline}
                          onChange={e => setFeeDeadline(e.target.value)}
                          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <Button size="sm" onClick={saveDeadline} className="bg-blue-600 hover:bg-blue-700 text-white">
                        Save
                      </Button>
                    </div>
                    {feeDeadline && (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-600">
                          Deadline: <strong>{feeDeadline}</strong> — send SMS reminders to all unpaid students.
                        </p>
                        <Button
                          size="sm"
                          onClick={handleSendDeadlineReminders}
                          disabled={sendingDeadlineReminders}
                          className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                        >
                          {sendingDeadlineReminders
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {deadlineReminderProgress || "Sending…"}</>
                            : <><Send className="w-3.5 h-3.5" /> Send Reminders to Unpaid</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Search + filters (hide for summary view) */}
            {viewMode !== "summary" && (
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Search by student name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-50/50"
                  />
                </div>
                <PaymentFilters filters={filters} onFilterChange={setFilters} viewMode={viewMode} />
              </div>
            )}

            {/* Pending approvals alert banner — visible to super-admin from any tab */}
            {isSuperAdmin && allPendingPaymentApprovalRequests.length > 0 && viewMode !== "review" && (
              <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800 flex-1">
                  <strong>{allPendingPaymentApprovalRequests.length}</strong> payment approval request{allPendingPaymentApprovalRequests.length !== 1 ? "s" : ""} awaiting your review.
                </p>
                <button
                  onClick={() => setViewMode("review")}
                  className="text-xs font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap"
                >
                  Review now →
                </button>
              </div>
            )}

            <PaymentsSectionErrorBoundary
              resetKey={sectionResetKey}
              onReset={() => {
                setViewMode("cards");
                setStoredFilters(DEFAULT_PAYMENT_FILTERS);
              }}
            >
              {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse bg-slate-200 rounded-xl h-32" />
                  ))}
                </div>
              ) : viewMode === "summary" ? (
                <FeeCollectionSummary
                  students={students}
                  payments={payments}
                  classFees={classFees}
                  term={effectiveTerm}
                  academicYear={effectiveYear}
                  discounts={discounts}
                />
              ) : viewMode === "fees" ? (
                <FeeStructureManager
                  classFees={classFees}
                  onRefresh={loadData}
                  term={effectiveTerm}
                  academicYear={effectiveYear}
                />
              ) : viewMode === "review" ? (
                <PaymentReviewLogView
                  isSuperAdmin={isSuperAdmin}
                  pendingRequests={allPendingPaymentApprovalRequests}
                  reviewingRequestsMap={reviewingRequestsMap}
                  bulkApproving={bulkApprovingPaidRequests}
                  onRefresh={handleReviewRefresh}
                  onApproveAll={handleApproveAllPaidAdjustments}
                  onApprove={handleApprovePaidAdjustment}
                  onReject={handleRejectPaidAdjustment}
                  refreshKey={reviewRefreshKey}
                />
              ) : viewMode === "balance" ? (
                <BalanceView
                  rows={buildBalanceRows()}
                  onQuickPay={setQuickPayRow}
                  onRemind={openSingleReminder}
                  onHistory={setHistoryStudent}
                  onDiscount={saveDiscount}
                  canTogglePaidLock={isAdminOrSuperAdmin}
                  isPaidLocked={!isAdminOrSuperAdmin || paidColumnLocked}
                  isSuperAdminUser={isSuperAdmin}
                  onTogglePaidLock={() => setPaidColumnLocked((prev) => !prev)}
                  paidDrafts={paidDrafts}
                  savingPaidMap={savingPaidMap}
                  onPaidDraftChange={handlePaidDraftChange}
                  onPaidDraftBlur={handlePaidDraftBlur}
                  pendingPaidByStudent={pendingPaidByStudent}
                />
              ) : (
                <PaymentRecordsTable
                  payments={cardsPayments}
                  students={students}
                  selectedPayments={selectedPayments}
                  pendingNotPaid={pendingNotPaid}
                  onSelectAll={handleSelectAll}
                  onToggleSelect={handleToggleSelect}
                  onEdit={handleEdit}
                  paymentAdminById={paymentAdminById}
                  term={effectiveTerm}
                  academicYear={effectiveYear}
                />
              )}
            </PaymentsSectionErrorBoundary>
          </CardContent>
        </Card>

        {/* Analytics Panel */}
        <PaymentsSectionErrorBoundary
          resetKey={`analytics:${sectionResetKey}`}
          onReset={() => window.location.reload()}
        >
          <PaymentAnalytics
            payments={filteredPayments}
            expenses={expenses}
            statusData={statusData}
            methodChartData={methodChartData}
            pendingAmount={pendingAmount}
            students={students}
            classFees={classFees}
            term={effectiveTerm}
            academicYear={effectiveYear}
          />
        </PaymentsSectionErrorBoundary>
      </div>
    </PageShell>
  );
}

export default function PaymentsPage() {
  return <PaymentsPageContent />;
}

function PaymentRecordsTable({
  payments,
  students,
  selectedPayments,
  pendingNotPaid,
  onSelectAll,
  onToggleSelect,
  onEdit,
  paymentAdminById = {},
  term,
  academicYear,
}) {
  const isMobile = useIsMobile();
  const getVisibleNote = (payment) => {
    const note = String(payment?.notes || "").trim();
    if (!note) return "—";
    if (isManualOpeningPaid(payment)) return "Manual input";
    return note;
  };

  const statusTone = (status) => {
    if (status === "paid") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "partial") return "bg-blue-100 text-blue-700 border-blue-200";
    if (status === "overdue") return "bg-red-100 text-red-700 border-red-200";
    return "bg-amber-100 text-amber-700 border-amber-200";
  };

  const formatDateLabel = (value) => {
    if (!value) return "—";
    const parsed = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return "—";
    return formatDateInLagos(parsed, { day: "numeric", month: "short", year: "numeric" });
  };

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>No payments found for {term} {academicYear}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingNotPaid.length > 0 && (
        <div className="flex items-center gap-3 py-2 border-b border-slate-100">
          <button
            onClick={onSelectAll}
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            {selectedPayments.size === pendingNotPaid.length
              ? "Deselect all"
              : `Select all unpaid (${pendingNotPaid.length})`}
          </button>
          {selectedPayments.size > 0 && (
            <span className="text-xs text-slate-500">{selectedPayments.size} selected</span>
          )}
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {payments.map((payment) => {
            const student = students.find((item) => item.id === payment.student_id);
            const adminName = getPaymentAdminName(payment, paymentAdminById);
            return (
              <div key={payment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900">
                      N{Number(payment.amount || 0).toLocaleString()}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {student ? `${student.first_name} ${student.last_name}` : "Unknown student"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {student?.grade || "—"} · {String(payment.payment_method || "—").replaceAll("_", " ")}
                    </p>
                  </div>
                  <Badge className={`${statusTone(payment.payment_status)} border font-medium capitalize flex-shrink-0`}>
                    {payment.payment_status || "pending"}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Term</p>
                    <p className="text-slate-700">{payment.term || "—"}</p>
                    <p className="text-xs text-slate-500">{payment.academic_year || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date</p>
                    <p className="text-slate-700">{formatDateLabel(payment.payment_date || payment.created_date)}</p>
                    {payment.due_date ? (
                      <p className="text-xs text-slate-500">Due {formatDateLabel(payment.due_date)}</p>
                    ) : null}
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</p>
                    <p className="text-slate-600 break-words">{getFirstName(adminName)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
                    <p className="text-slate-600 break-words">{getVisibleNote(payment)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(payment)}
                    className="ml-auto min-h-10 border-slate-300 px-4 text-slate-700 hover:bg-slate-50"
                  >
                    Edit Payment
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Admin</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Amount</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Term</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Student</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Class</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Method</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Date</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Status</th>
              <th className="py-3 px-4 text-left font-semibold text-slate-600">Notes</th>
              <th className="py-3 px-4 text-center font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const student = students.find((item) => item.id === payment.student_id);
              const adminName = getPaymentAdminName(payment, paymentAdminById);
              const canSelect = false;
              return (
                <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50/80 align-top">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-700 max-w-[150px] whitespace-normal break-words">
                      {getFirstName(adminName)}
                    </div>
                    <span className="hidden">
                    {canSelect ? (
                      <input
                        type="checkbox"
                        checked={selectedPayments.has(payment.id)}
                        onChange={(event) => onToggleSelect(payment.id, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">N{Number(payment.amount || 0).toLocaleString()}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-900 font-medium">{payment.term || "—"}</div>
                    <div className="text-xs text-slate-500 mt-1">{payment.academic_year || "—"}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">
                      {student ? `${student.first_name} ${student.last_name}` : "Unknown student"}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{student?.grade || "—"}</td>
                  <td className="py-3 px-4 text-slate-600 capitalize">
                    {String(payment.payment_method || "—").replaceAll("_", " ")}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-700">{formatDateLabel(payment.payment_date || payment.created_date)}</div>
                    {payment.due_date ? (
                      <div className="text-xs text-slate-500 mt-1">Due {formatDateLabel(payment.due_date)}</div>
                    ) : null}
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={`${statusTone(payment.payment_status)} border font-medium capitalize`}>
                      {payment.payment_status || "pending"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-[260px]">
                    <div className="whitespace-normal break-words leading-6">{getVisibleNote(payment)}</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(payment)}
                      className="border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Edit Payment
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

/* Superadmin Paid-Change Approval View */
function PaidAdjustmentsApprovalView({
  pendingRequests,
  reviewingRequestsMap,
  bulkApproving,
  onRefresh,
  onApproveAll,
  onApprove,
  onReject,
}) {
  return (
    <div className="space-y-4">
      <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-900">Superadmin Approval Queue</p>
            <p className="text-xs text-indigo-700">
              Review payment-related approvals here, including manual paid adjustments and fee schedule changes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={onApproveAll}
              disabled={bulkApproving || !pendingRequests.length}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {bulkApproving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Approving…</>
                : <>Approve All ({pendingRequests.length})</>}
            </Button>
          </div>
        </div>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border border-slate-200 rounded-xl">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-700">No pending payment approvals</p>
          <p className="text-xs text-slate-500 mt-1">Everything submitted from Payments has already been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingRequests.map((request) => {
            const busy = !!reviewingRequestsMap?.[request.notification_id];
            const isGenericApproval = request?.request_kind === "generic_approval";
            const scopeLabel = [request?.metadata?.term, request?.metadata?.academic_year].filter(Boolean).join(" ");
            return (
              <div key={request.notification_id} className="border border-slate-200 rounded-xl bg-white p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="text-sm text-slate-700 space-y-1">
                    <p className="font-semibold text-slate-900">
                      {isGenericApproval ? request.entity_label : request.student_name}{" "}
                      {!isGenericApproval ? (
                        <span className="text-slate-500 font-normal">({request.student_grade || "-"})</span>
                      ) : null}
                    </p>
                    {isGenericApproval ? (
                      <>
                        <p>{getApprovalSummary(request)}</p>
                        {scopeLabel ? <p>Scope: {scopeLabel}</p> : null}
                      </>
                    ) : (
                      <>
                        <p>Term: {request.term} {request.academic_year}</p>
                        <p>Paid: N{Number(request.current_total_paid || 0).toLocaleString()}{" -> "}N{Number(request.requested_total_paid || 0).toLocaleString()}</p>
                      </>
                    )}
                    <p className="text-xs text-slate-500">
                      Requested by: {request.requested_by_name || "Unknown"} ({request.requested_by_role || "unknown"})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => onApprove(request)}
                      disabled={busy || bulkApproving}
                    >
                      {busy ? "..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => onReject(request)}
                      disabled={busy || bulkApproving}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Balance View Component */
function BalanceView({
  rows,
  onQuickPay,
  onRemind,
  onHistory,
  onDiscount,
  canTogglePaidLock,
  isPaidLocked,
  isSuperAdminUser,
  onTogglePaidLock,
  paidDrafts,
  savingPaidMap,
  onPaidDraftChange,
  onPaidDraftBlur,
  pendingPaidByStudent,
}) {
  const [editingDiscountId, setEditingDiscountId] = useState(null);
  const [discountInput, setDiscountInput] = useState("");
  const getPaidInputValue = (studentId, totalPaid) =>
    paidDrafts?.[studentId] ?? String(Math.max(0, Math.round(Number(totalPaid || 0))));

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <TrendingDown className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>No students found</p>
      </div>
    );
  }

  const fullyPaid   = rows.filter(r => r.balance <= 0);
  const outstanding = rows.filter(r => r.balance > 0);
  const totalOutstanding = outstanding.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-4">
      {outstanding.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm font-semibold text-red-700">
            {outstanding.length} student{outstanding.length !== 1 ? "s" : ""} with outstanding balance
          </span>
          <Badge className="bg-red-100 text-red-800 border-red-300 font-semibold">
            Total: ₦{totalOutstanding.toLocaleString()}
          </Badge>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Student</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Class</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Arrears</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">This Term</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Total Owed</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">
                <div className="inline-flex items-center justify-end gap-1 w-full">
                  <span>Paid</span>
                  <button
                    type="button"
                    onClick={canTogglePaidLock ? onTogglePaidLock : undefined}
                    disabled={!canTogglePaidLock}
                    title={
                      canTogglePaidLock
                        ? (isPaidLocked ? "Unlock paid editing" : "Lock paid editing")
                        : "Only admin users can unlock paid editing"
                    }
                    className={`inline-flex items-center justify-center w-5 h-5 rounded ${
                      canTogglePaidLock
                        ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 cursor-not-allowed"
                    }`}
                  >
                    {isPaidLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Balance</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-600">Status</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, totalPaid, totalFees, balance, feeBreakdown, discountPct, appRecordedPaid, arrearsTotal, currentTermFees }) => {
              const pendingRequest = pendingPaidByStudent?.[student.id];
              return (
              <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-slate-900">{student.first_name} {student.last_name}</span>
                    {discountPct > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                        🎓 {discountPct}% disc.
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-600">{student.grade}</td>
                <td className="py-3 px-4 text-right text-slate-700">N{Math.round(arrearsTotal || 0).toLocaleString()}</td>
                <td className="py-3 px-4 text-right text-slate-700">N{Math.round(currentTermFees || 0).toLocaleString()}</td>
                <td className="py-3 px-4 text-right text-slate-700">₦{totalFees.toLocaleString()}</td>
                <td className="py-3 px-4 text-right text-emerald-700 font-medium">
                  {isPaidLocked ? (
                    <>N{Math.round(totalPaid).toLocaleString()}</>
                  ) : (
                    <div className="flex flex-col items-end">
                      <Input
                        value={getPaidInputValue(student.id, totalPaid)}
                        onChange={(event) => onPaidDraftChange?.({ student, totalPaid, totalFees, balance, feeBreakdown, discountPct, appRecordedPaid }, event.target.value)}
                        onBlur={() => onPaidDraftBlur?.({ student, totalPaid, totalFees, balance, feeBreakdown, discountPct, appRecordedPaid })}
                        inputMode="numeric"
                        className={`h-8 w-28 text-right text-sm bg-white ${Number(getPaidInputValue(student.id, totalPaid)) > totalFees ? "border-amber-400 ring-1 ring-amber-300" : ""}`}
                        placeholder="0"
                      />
                      {Number(getPaidInputValue(student.id, totalPaid)) > totalFees && (
                        <span className="text-[10px] mt-0.5 text-amber-600 font-medium">⚠ Exceeds total fees</span>
                      )}
                      {savingPaidMap?.[student.id] && (
                        <span className="text-[10px] text-slate-400 mt-0.5">Saving...</span>
                      )}
                      {!isSuperAdminUser && !savingPaidMap?.[student.id] && pendingRequest && (
                        <span className="text-[10px] mt-0.5 text-amber-600">Pending superadmin approval</span>
                      )}
                    </div>
                  )}
                </td>
                <td className={`py-3 px-4 text-right font-bold ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {balance > 0 ? `₦${balance.toLocaleString()}` : "—"}
                </td>
                <td className="py-3 px-4 text-center">
                  {balance <= 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Fully Paid</Badge>
                  ) : totalPaid > 0 ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">Partial</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 border-red-200">Unpaid</Badge>
                  )}
                </td>
                {/* Actions — History, Discount, Quick Pay, Remind */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                    {/* History — icon only with tooltip */}
                    <button
                      onClick={() => onHistory?.(student)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-500 transition-colors"
                      title="View payment history"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>

                    {/* Discount — icon only with tooltip, or inline input when editing */}
                    {editingDiscountId === student.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discountInput}
                          onChange={e => setDiscountInput(e.target.value)}
                          className="w-14 border border-slate-300 rounded px-1.5 py-1 text-xs"
                          placeholder="0-100"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            onDiscount?.(student.id, Math.min(100, Math.max(0, Number(discountInput) || 0)));
                            setEditingDiscountId(null);
                          }}
                          className="text-emerald-600 hover:text-emerald-800 font-bold text-xs px-1"
                        >✓</button>
                        <button
                          onClick={() => setEditingDiscountId(null)}
                          className="text-slate-400 hover:text-slate-600 text-xs px-1"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingDiscountId(student.id); setDiscountInput(String(discountPct || 0)); }}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold transition-colors ${discountPct > 0 ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        title={discountPct > 0 ? `Discount: ${discountPct}% — click to edit` : "Set scholarship/discount"}
                      >
                        %
                      </button>
                    )}

                    {/* Pay — only when balance > 0 */}
                    {balance > 0 && (
                      <button
                        onClick={() => onQuickPay({ student, totalFees, totalPaid, balance, feeBreakdown, discountPct })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                      >
                        <Zap className="w-3 h-3" /> Pay
                      </button>
                    )}

                    {/* Remind — only when balance > 0 */}
                    {balance > 0 && (
                      <button
                        onClick={() => onRemind({ student, totalFees, totalPaid, balance, feeBreakdown })}
                        title={student.parent_phone ? `Send SMS to ${student.parent_phone}` : "No phone number on file"}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                          student.parent_phone
                            ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                            : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" /> Remind
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {fullyPaid.length > 0 && (
        <p className="text-xs text-slate-500 text-center pt-2">
          {fullyPaid.length} student{fullyPaid.length !== 1 ? "s" : ""} fully paid — shown above with "—" balance
        </p>
      )}
    </div>
  );
}

function PaymentReviewLogView({
  isSuperAdmin,
  pendingRequests,
  reviewingRequestsMap,
  bulkApproving,
  onRefresh,
  onApproveAll,
  onApprove,
  onReject,
  refreshKey,
}) {
  return (
    <div className="space-y-6">
      {isSuperAdmin ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Pending approvals</h3>
            <p className="text-xs text-slate-500">Review payment-related approvals first, then inspect the full school audit trail below.</p>
          </div>
          <PaidAdjustmentsApprovalView
            pendingRequests={pendingRequests}
            reviewingRequestsMap={reviewingRequestsMap}
            bulkApproving={bulkApproving}
            onRefresh={onRefresh}
            onApproveAll={onApproveAll}
            onApprove={onApprove}
            onReject={onReject}
          />
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Audit trail</h3>
          <p className="text-xs text-slate-500">Sensitive actions across the app, visible only to superadmin.</p>
        </div>
        <SystemAuditLogView refreshKey={refreshKey} />
      </div>
    </div>
  );
}

function SystemAuditLogView({ refreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const allLogs = Array.isArray(data) ? data : [];
        setLogs(allLogs.filter((log) => isVisibleAuditLog(log)));
      })
      .catch((error) => {
        console.error("Load system audit logs failed:", error);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  if (!logs.length) {
    return <div className="text-center py-16 text-slate-400 text-sm">No audit activity recorded yet.</div>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const tone = getAuditTone(log);
        const moduleLabel = getAuditModuleLabel(log);
        const beforeSnapshot = log?.details?.before;
        const afterSnapshot = log?.details?.after;
        const hasSnapshot = beforeSnapshot !== undefined || afterSnapshot !== undefined;

        return (
          <div key={log.id} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg text-sm">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${tone.dot}`} />
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-medium">{log.summary}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{moduleLabel}</span>
                <span>|</span>
                <span>{new Date(log.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span>|</span>
                <span>by {log.performed_by || "System"}</span>
                {hasSnapshot ? (
                  <>
                    <span>|</span>
                    <span>before/after captured</span>
                  </>
                ) : null}
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${tone.badge}`}>
              {String(log.action || "updated").replaceAll("_", " ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AuditLogView({ refreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const allLogs = Array.isArray(data) ? data : [];
        const filtered = allLogs.filter((log) => {
          const moduleName = log?.details?.module;
          if (moduleName === "payments") return true;
          return PAYMENT_ACTIVITY_ENTITY_TYPES.has(log?.entity_type);
        });
        setLogs(filtered);
      })
      .catch((error) => {
        console.error("Load payment activity logs failed:", error);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (!logs.length) return <div className="text-center py-16 text-slate-400 text-sm">No activity recorded yet.</div>;

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg text-sm">
          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.action === 'created' ? 'bg-emerald-500' : log.action === 'deleted' ? 'bg-red-500' : 'bg-amber-500'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 font-medium">{log.summary}</p>
            <p className="text-xs text-slate-400 mt-0.5">{new Date(log.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })} · by {log.performed_by}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${log.action === 'created' ? 'bg-emerald-100 text-emerald-700' : log.action === 'deleted' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{log.action}</span>
        </div>
      ))}
    </div>
  );
}
