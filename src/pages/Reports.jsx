import React, { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Attendance, AttendanceCheckIn, AuditLog, ExamResult, Expense, Payment, Student, Teacher } from "@/entities/all";
import { ClassFee } from "@/entities/ClassFee";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { buildCheckInIndex, resolveAttendanceStatus, tallyAttendance } from "@/lib/attendanceStatus";
import { getSchoolDayStatus, getUpcomingCalendarEvents, listSchoolDaysForTerm } from "@/lib/schoolCalendar";
import { applyStudentFeeGroups, buildStudentBalanceRows, loadPaymentDiscounts, loadStudentFeeGroups, loadStudentStartTerms } from "@/lib/paymentBalances";
import { formatCurrency as formatMoney } from "@/lib/formatters";
import { PageHeader, PageLoadingState, PageSection, PageShell } from "@/components/ui/page-shell";
import Gradebook from "@/components/academics/Gradebook";
import { getLagosDateString } from "@/lib/timezone";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  BookOpen,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Download,
  CalendarDays,
  GraduationCap,
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

const TERMS = ["First Term", "Second Term", "Third Term"];
const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3",
];

const CATEGORY_META = {
  academic: {
    label: "Academic",
    description: "Results, classroom performance, and academic workflows.",
  },
  finance: {
    label: "Finance",
    description: "Revenue, balances, and school spending.",
  },
  operations: {
    label: "Operations",
    description: "Attendance, enrollment, and school activity levels.",
  },
};

const REPORT_LIBRARY = [
  {
    id: "gradebook",
    label: "Gradebook",
    description: "Open the live broadsheet to review CA, exam, total, grade, and remarks.",
    insight: "Which scores need review or entry before reports are produced?",
    category: "academic",
    kind: "tool",
    icon: BookOpen,
    color: "indigo",
    filters: ["term", "year"],
  },
  {
    id: "payment",
    label: "Fee Collection",
    description: "Track expected fees, amounts collected, balances, and payment status.",
    insight: "How much has the school collected versus what is still outstanding?",
    category: "finance",
    kind: "report",
    icon: DollarSign,
    color: "emerald",
    filters: ["grade", "term", "year"],
  },
  {
    id: "defaulters",
    label: "Fee Defaulters",
    description: "Surface students with unpaid or partially paid balances for follow-up.",
    insight: "Who needs reminders or payment follow-up right now?",
    category: "finance",
    kind: "report",
    icon: AlertTriangle,
    color: "red",
    filters: ["grade", "term", "year"],
  },
  {
    id: "finance-overview",
    label: "Finance Overview",
    description: "Compare revenue, outstanding balances, expenses, and class-by-class performance.",
    insight: "Is the school financially healthy for the selected year and term?",
    category: "finance",
    kind: "report",
    icon: Wallet,
    color: "amber",
    filters: ["term", "year"],
  },
  {
    id: "daily-collection",
    label: "Daily Collection",
    description: "List real payments received, who entered them, method, date, class, and totals.",
    insight: "What money actually came into the school for the selected period?",
    category: "finance",
    kind: "report",
    icon: CalendarDays,
    color: "emerald",
    filters: ["grade", "term", "year"],
  },
  {
    id: "student-progress",
    label: "Student Progress",
    description: "Compare each student's selected-term average with the previous term.",
    insight: "Who improved, declined, or needs academic support?",
    category: "academic",
    kind: "report",
    icon: GraduationCap,
    color: "blue",
    filters: ["grade", "term", "year"],
  },
  {
    id: "attendance",
    label: "Attendance Report",
    description: "Measure present, absent, late, and excused rates by class or school-wide.",
    insight: "Which students or classes are showing attendance risk?",
    category: "operations",
    kind: "report",
    icon: UserCheck,
    color: "purple",
    filters: ["grade", "term", "year"],
  },
  {
    id: "audit-activity",
    label: "Audit / Activity",
    description: "Review sensitive app actions, approvals, edits, and system activity.",
    insight: "Who changed what, and when did it happen?",
    category: "operations",
    kind: "report",
    icon: ClipboardList,
    color: "slate",
    filters: [],
    roles: ["super_admin"],
  },
  {
    id: "enrollment",
    label: "Enrollment Report",
    description: "Show active student counts by class for planning and staffing decisions.",
    insight: "Where are class sizes growing or thinning out?",
    category: "operations",
    kind: "report",
    icon: Users,
    color: "slate",
    filters: ["grade"],
  },
];

const colorMap = {
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "bg-red-100 text-red-600",
    badge: "bg-red-100 text-red-700",
    btn: "bg-red-600 hover:bg-red-700",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "bg-blue-100 text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    btn: "bg-blue-600 hover:bg-blue-700",
  },
  indigo: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    icon: "bg-indigo-100 text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700",
    btn: "bg-indigo-600 hover:bg-indigo-700",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-700",
    badge: "bg-amber-100 text-amber-800",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  purple: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
  slate: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    icon: "bg-slate-100 text-slate-600",
    badge: "bg-slate-200 text-slate-700",
    btn: "bg-slate-700 hover:bg-slate-800",
  },
};

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  URL.revokeObjectURL(url);
  anchor.remove();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPdfTable(headers, rows) {
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.length > 0 ? rows.map((row) => `
          <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
        `).join("") : `<tr><td colspan="${headers.length}" class="empty">No data available</td></tr>`}
      </tbody>
    </table>
  `;
}

function openReportPdf(title, subtitle, sections) {
  const sectionHtml = sections.map((section) => {
    if (section.type === "metrics") {
      return `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          <div class="metric-grid">
            ${section.items.map((item) => `
              <div class="metric-card">
                <div class="metric-label">${escapeHtml(item.label)}</div>
                <div class="metric-value">${escapeHtml(item.value)}</div>
                ${item.hint ? `<div class="metric-hint">${escapeHtml(item.hint)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }

    if (section.type === "table") {
      return `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          ${section.description ? `<p class="section-copy">${escapeHtml(section.description)}</p>` : ""}
          ${renderPdfTable(section.headers, section.rows)}
        </section>
      `;
    }

    return "";
  }).join("");

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 28px 32px 40px;
          background: #ffffff;
        }
        .header {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 14px;
          margin-bottom: 20px;
        }
        h1 {
          margin: 0;
          font-size: 22px;
          color: #0f172a;
        }
        .subtitle {
          margin-top: 6px;
          color: #475569;
          font-size: 12px;
        }
        .section {
          margin-top: 20px;
        }
        .section h2 {
          margin: 0 0 10px;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #334155;
        }
        .section-copy {
          margin: 0 0 10px;
          color: #64748b;
          font-size: 12px;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .metric-card {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          background: #f8fafc;
        }
        .metric-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
        }
        .metric-value {
          font-size: 20px;
          font-weight: 700;
          margin-top: 6px;
          color: #0f172a;
        }
        .metric-hint {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background: #0f172a;
          color: white;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          text-align: left;
          padding: 8px 10px;
        }
        td {
          padding: 8px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
          vertical-align: top;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .empty {
          text-align: center;
          color: #64748b;
          padding: 18px 10px;
        }
        .print-btn {
          position: fixed;
          top: 16px;
          right: 16px;
          border: none;
          border-radius: 10px;
          background: #0f172a;
          color: white;
          padding: 10px 18px;
          font-size: 13px;
          cursor: pointer;
        }
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        @media print {
          .print-btn { display: none !important; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <div class="subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${sectionHtml}
    </body>
  </html>`;

  const win = window.open("", "_blank", "width=1100,height=900");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function formatCurrency(value) {
  return formatMoney(value);
}

function formatPercent(value) {
  return value == null ? "N/A" : `${Math.round(value)}%`;
}

function extractAcademicYears(collections, schoolYear) {
  const years = new Set();
  if (schoolYear) years.add(schoolYear);

  collections.flat().forEach((item) => {
    if (item?.academic_year && /^\d{4}\/\d{4}$/.test(item.academic_year)) {
      years.add(item.academic_year);
    }
  });

  const sorted = [...years].sort((a, b) => a.localeCompare(b));
  return sorted.length > 0 ? sorted : ["2024/2025", "2025/2026", "2026/2027"];
}

function expenseMatchesYear(expense, year) {
  if (year === "all") return true;
  if (expense?.academic_year) return expense.academic_year === year;
  const rawDate = String(expense?.expense_date || "");
  const [startYear, endYear] = year.split("/");
  return rawDate.includes(startYear) || rawDate.includes(endYear);
}

function getScoreTotal(result) {
  const directTotal = Number(result?.total_score);
  if (Number.isFinite(directTotal)) return directTotal;

  const ca1 = Number(result?.ca1_score || 0);
  const ca2 = Number(result?.ca2_score || 0);
  const ca3 = Number(result?.ca3_score || 0);
  const exam = Number(result?.exam_score || 0);
  return ca1 + ca2 + ca3 + exam;
}

function getStudentName(student) {
  return [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim() || "Unknown Student";
}

function getPaymentDate(payment) {
  return payment?.payment_date || payment?.created_date || payment?.created_at || "";
}

function isRealCollectionPayment(payment) {
  const status = String(payment?.payment_status || "").toLowerCase();
  const notes = String(payment?.notes || "").toLowerCase();
  return (
    ["paid", "partial"].includes(status) &&
    !notes.includes("[opening_paid_before_app]") &&
    !notes.includes("arrears carried forward")
  );
}

function getPaymentAdminName(payment) {
  const raw =
    payment?.recorded_by_name ||
    payment?.created_by_name ||
    payment?.entered_by_name ||
    payment?.admin_name ||
    payment?.created_by ||
    "Unknown";
  return String(raw).trim().split(/\s+/)[0] || "Unknown";
}

function getPreviousTerm(term, year) {
  const index = TERMS.indexOf(term);
  if (index > 0) return { term: TERMS[index - 1], year };
  if (index === 0 && /^\d{4}\/\d{4}$/.test(year || "")) {
    const [start, end] = year.split("/").map((value) => Number(value));
    return { term: "Third Term", year: `${start - 1}/${end - 1}` };
  }
  return null;
}

function MetricCard({ label, value, hint, icon: Icon, accent = "slate" }) {
  const styles = colorMap[accent] || colorMap.slate;
  return (
    <Card className="bg-white border border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportTemplateCard({ item, onOpen }) {
  const Icon = item.icon;
  const colors = colorMap[item.color];
  const actionLabel = item.kind === "tool" ? "Open Tool" : "Configure Report";

  return (
    <button
      onClick={() => onOpen(item.id)}
      className={`text-left p-5 rounded-2xl border-2 ${colors.bg} ${colors.border} hover:shadow-lg hover:-translate-y-0.5 transition-all group`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`w-11 h-11 rounded-xl ${colors.icon} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <Badge className="bg-white/70 text-slate-700 border-slate-200">
          {item.kind === "tool" ? "Tool" : "Report"}
        </Badge>
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{item.label}</h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.description}</p>
      <p className="text-xs text-slate-500 mb-4">{item.insight}</p>
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 group-hover:text-slate-800">
        {actionLabel}
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

function EmptyState({ icon: Icon, title, text, colors }) {
  return (
    <div className={`text-center py-16 rounded-2xl border-2 border-dashed ${colors.border} ${colors.bg}`}>
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
      <p className="text-slate-700 font-medium mb-1">{title}</p>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

function buildPaymentRows(filters, allStudents, allPayments, classFees, discounts = {}, startTermRecords = {}) {
  return buildStudentBalanceRows({
    students: allStudents,
    payments: allPayments,
    classFees,
    term: filters.term === "all" ? null : filters.term,
    academicYear: filters.year === "all" ? null : filters.year,
    grade: filters.grade,
    discounts,
    startTermRecords,
  }).map((row) => ({
    student: row.student,
    expected: row.totalFees,
    paid: row.totalPaid,
    balance: row.balance,
    status: row.status,
  }));
}

async function generatePaymentReport(filters, allStudents, allPayments, classFees, discounts, startTermRecords = {}) {
  const rows = buildPaymentRows(filters, allStudents, allPayments, classFees, discounts, startTermRecords);

  return {
    rows,
    totalExpected: rows.reduce((sum, row) => sum + Number(row.expected || 0), 0),
    totalCollected: rows.reduce((sum, row) => sum + row.paid, 0),
    totalBalance: rows.reduce((sum, row) => sum + row.balance, 0),
  };
}

async function generateDefaultersReport(filters, allStudents, allPayments, classFees, discounts, startTermRecords = {}) {
  const base = await generatePaymentReport(filters, allStudents, allPayments, classFees, discounts, startTermRecords);
  return { rows: base.rows.filter((row) => row.balance > 0) };
}

async function generateAttendanceReport(filters, allStudents, allAttendance, allCheckIns, calendarEvents) {
  const students = allStudents.filter((student) =>
    student.enrollment_status === "active" &&
    (filters.grade === "all" || student.grade === filters.grade)
  );

  const records = allAttendance.filter((attendance) =>
    (filters.grade === "all" || attendance.grade === filters.grade) &&
    (filters.term === "all" || attendance.term === filters.term) &&
    (filters.year === "all" || attendance.academic_year === filters.year || !attendance.academic_year)
  );

  // School days in the selected term — used as the universe of days each
  // student is expected to be in class. We can only enforce the
  // "no-check-in = absent" rule when we know which days were school days.
  const today = getLagosDateString();
  const schoolDays =
    filters.term !== "all" && filters.year !== "all"
      ? listSchoolDaysForTerm(calendarEvents || [], filters.term, filters.year, today)
      : [];

  const checkInIndex = buildCheckInIndex(
    allCheckIns.filter((ci) =>
      (filters.grade === "all" || ci.grade === filters.grade) &&
      (filters.term === "all" || ci.term === filters.term) &&
      (filters.year === "all" || ci.academic_year === filters.year || !ci.academic_year)
    )
  );

  // Index absence records once: (student_id|date) → row.
  const recordIndex = new Map();
  for (const rec of records) {
    if (rec?.student_id && rec?.attendance_date) {
      recordIndex.set(`${rec.student_id}|${rec.attendance_date}`, rec);
    }
  }

  const rows = students
    .map((student) => {
      // If we know the term's school days, walk them and resolve each day
      // through the check-in gate (no check-in for that (grade, day) → absent).
      // Otherwise fall back to record-only counting so all-time filters still
      // produce something useful.
      let present = 0, absent = 0, late = 0, excused = 0;
      if (schoolDays.length > 0) {
        const studentRecords = records.filter((r) =>
          r.student_id === student.id &&
          r.attendance_date &&
          schoolDays.includes(r.attendance_date)
        );
        absent  = studentRecords.filter((r) => r.status === "absent").length;
        late    = studentRecords.filter((r) => r.status === "late").length;
        excused = studentRecords.filter((r) => r.status === "excused").length;
        present = Math.max(0, schoolDays.length - absent - late);
      } else {
        const studentRecords = records.filter((r) => r.student_id === student.id);
        present = studentRecords.filter((r) => r.status === "present").length;
        absent  = studentRecords.filter((r) => r.status === "absent").length;
        late    = studentRecords.filter((r) => r.status === "late").length;
        excused = studentRecords.filter((r) => r.status === "excused").length;
      }

      const total = present + absent + late + excused;
      const expectedDays = schoolDays.length > 0 ? schoolDays.length : null;
      const denominator = expectedDays || total;
      return {
        student,
        present,
        absent,
        late,
        excused,
        total,
        expectedDays,
        rate: denominator > 0 ? Math.round(((present + late) / denominator) * 100) : null,
      };
    })
    .filter((row) => row.total > 0 || (row.expectedDays ?? 0) > 0);

  const overallExpected = rows.reduce((sum, row) => sum + Number(row.expectedDays || 0), 0);
  const overallPresent = rows.reduce((sum, row) => sum + Number(row.present || 0) + Number(row.late || 0), 0);
  const overall = overallExpected > 0
    ? Math.round((overallPresent / overallExpected) * 100)
    : null;

  return { rows, overall };
}

async function generateEnrollmentReport(filters, allStudents) {
  const students = allStudents.filter((student) =>
    student.enrollment_status === "active" &&
    (filters.grade === "all" || student.grade === filters.grade)
  );

  const byGrade = {};
  students.forEach((student) => {
    if (!byGrade[student.grade]) byGrade[student.grade] = { total: 0 };
    byGrade[student.grade].total += 1;
  });

  const rows = Object.entries(byGrade)
    .map(([grade, data]) => ({ grade, ...data }))
    .sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));

  return { rows, total: students.length };
}

async function generateFinanceOverview(filters, allStudents, allPayments, allExpenses, classFees, discounts = {}, startTermRecords = {}) {
  const paymentReport = await generatePaymentReport(
    { ...filters, grade: "all" },
    allStudents,
    allPayments,
    classFees,
    discounts,
    startTermRecords
  );
  const relevantExpenses = allExpenses.filter((expense) => expenseMatchesYear(expense, filters.year));

  const classBuckets = {};
  paymentReport.rows.forEach((row) => {
    const grade = row.student.grade || "Unassigned";
    if (!classBuckets[grade]) {
      classBuckets[grade] = {
        grade,
        students: 0,
        collected: 0,
        outstanding: 0,
        expected: 0,
      };
    }
    classBuckets[grade].students += 1;
    classBuckets[grade].collected += row.paid;
    classBuckets[grade].outstanding += row.balance;
    classBuckets[grade].expected += Number(row.expected || 0);
  });

  const classRows = Object.values(classBuckets)
    .map((row) => ({
      ...row,
      collectionRate: row.expected > 0 ? Math.round((row.collected / row.expected) * 100) : 0,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const expenseTypeBuckets = {};
  relevantExpenses.forEach((expense) => {
    const type = expense.expense_type || "other";
    expenseTypeBuckets[type] = (expenseTypeBuckets[type] || 0) + Number(expense.amount || 0);
  });

  const expenseTypeRows = Object.entries(expenseTypeBuckets)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = relevantExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const statusData = [
    { name: "Paid", value: paymentReport.rows.filter((row) => row.status === "Paid").length, color: "#10b981" },
    { name: "Partial", value: paymentReport.rows.filter((row) => row.status === "Partial").length, color: "#3b82f6" },
    { name: "Unpaid", value: paymentReport.rows.filter((row) => row.status === "Unpaid").length, color: "#ef4444" },
  ].filter((item) => item.value > 0);

  return {
    classRows,
    expenseTypeRows,
    statusData,
    totalRevenue: paymentReport.totalCollected,
    totalOutstanding: paymentReport.totalBalance,
    totalExpected: paymentReport.totalExpected,
    totalExpenses,
    netBalance: paymentReport.totalCollected - totalExpenses,
    collectionRate: paymentReport.totalExpected > 0
      ? Math.round((paymentReport.totalCollected / paymentReport.totalExpected) * 100)
      : 0,
  };
}

async function generateDailyCollectionReport(filters, allStudents, allPayments) {
  const studentMap = Object.fromEntries(allStudents.map((student) => [student.id, student]));
  const rows = allPayments
    .filter(isRealCollectionPayment)
    .map((payment) => {
      const student = studentMap[payment.student_id] || {};
      return {
        payment,
        student,
        studentName: payment.student_name || getStudentName(student),
        grade: payment.grade || student.grade || "Unassigned",
        amount: Number(payment.amount || 0),
        method: payment.payment_method || "Unspecified",
        date: getPaymentDate(payment),
        status: payment.payment_status || "paid",
        admin: getPaymentAdminName(payment),
      };
    })
    .filter((row) =>
      (filters.grade === "all" || row.grade === filters.grade) &&
      (filters.term === "all" || row.payment.term === filters.term) &&
      (filters.year === "all" || row.payment.academic_year === filters.year)
    )
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const byMethod = {};
  const byAdmin = {};
  rows.forEach((row) => {
    byMethod[row.method] = (byMethod[row.method] || 0) + row.amount;
    byAdmin[row.admin] = (byAdmin[row.admin] || 0) + row.amount;
  });

  return {
    rows,
    totalCollected: rows.reduce((sum, row) => sum + row.amount, 0),
    paymentCount: rows.length,
    byMethod: Object.entries(byMethod).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    byAdmin: Object.entries(byAdmin).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  };
}

async function generateStudentProgressReport(filters, allStudents, allExamResults) {
  const previous = filters.term !== "all" && filters.year !== "all" ? getPreviousTerm(filters.term, filters.year) : null;
  const activeStudents = allStudents.filter((student) =>
    student.enrollment_status === "active" &&
    (filters.grade === "all" || student.grade === filters.grade)
  );
  const studentMap = Object.fromEntries(activeStudents.map((student) => [student.id, student]));

  const bucketFor = (term, year) => {
    const buckets = {};
    allExamResults.forEach((result) => {
      const student = studentMap[result.student_id];
      if (!student) return;
      if (term && result.term !== term) return;
      if (year && result.academic_year !== year) return;
      const score = getScoreTotal(result);
      if (!Number.isFinite(score)) return;
      if (!buckets[student.id]) buckets[student.id] = { total: 0, subjects: 0 };
      buckets[student.id].total += score;
      buckets[student.id].subjects += 1;
    });
    return buckets;
  };

  const currentBuckets = bucketFor(filters.term === "all" ? null : filters.term, filters.year === "all" ? null : filters.year);
  const previousBuckets = previous ? bucketFor(previous.term, previous.year) : {};

  const rows = activeStudents
    .map((student) => {
      const current = currentBuckets[student.id];
      const prior = previousBuckets[student.id];
      const currentAverage = current?.subjects ? Math.round(current.total / current.subjects) : null;
      const previousAverage = prior?.subjects ? Math.round(prior.total / prior.subjects) : null;
      const change = currentAverage != null && previousAverage != null ? currentAverage - previousAverage : null;
      return {
        student,
        studentName: getStudentName(student),
        grade: student.grade,
        currentAverage,
        previousAverage,
        change,
        subjects: current?.subjects || 0,
        status: change == null ? "No comparison" : change > 0 ? "Improved" : change < 0 ? "Declined" : "No change",
      };
    })
    .filter((row) => row.subjects > 0 || row.previousAverage != null)
    .sort((a, b) => (b.change ?? -999) - (a.change ?? -999));

  const assessed = rows.filter((row) => row.currentAverage != null);
  const improved = rows.filter((row) => (row.change ?? 0) > 0).length;
  const declined = rows.filter((row) => (row.change ?? 0) < 0).length;
  const average = assessed.length
    ? Math.round(assessed.reduce((sum, row) => sum + Number(row.currentAverage || 0), 0) / assessed.length)
    : 0;

  return { rows, improved, declined, assessed: assessed.length, average, previous };
}

async function generateAuditActivityReport(allAuditLogs) {
  const rows = (allAuditLogs || [])
    .map((log) => ({
      id: log.id,
      date: log.created_at || log.created_date || "",
      actor: log.performed_by || "Unknown",
      action: log.action || "activity",
      entityType: log.entity_type || "system",
      summary: log.summary || "",
      module: log.details?.module || log.entity_type || "system",
    }))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const byActor = {};
  const byModule = {};
  rows.forEach((row) => {
    byActor[row.actor] = (byActor[row.actor] || 0) + 1;
    byModule[row.module] = (byModule[row.module] || 0) + 1;
  });

  return {
    rows,
    totalActions: rows.length,
    activeUsers: Object.keys(byActor).length,
    byActor: Object.entries(byActor).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byModule: Object.entries(byModule).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

async function generateAcademicSummary(filters, allStudents, allExamResults) {
  const PASS_MARK = 40;

  const activeStudents = allStudents.filter((student) =>
    student.enrollment_status === "active" &&
    (filters.grade === "all" || student.grade === filters.grade)
  );

  const studentMap = Object.fromEntries(activeStudents.map((student) => [student.id, student]));
  const relevantResults = allExamResults.filter((result) => {
    const student = studentMap[result.student_id];
    if (!student) return false;
    if (filters.term !== "all" && result.term !== filters.term) return false;
    if (filters.year !== "all" && result.academic_year !== filters.year) return false;
    return true;
  });

  const subjectBuckets = {};
  // studentBuckets now stores per-subject scores too for detail table
  const studentBuckets = {};

  relevantResults.forEach((result) => {
    const total = getScoreTotal(result);
    if (!Number.isFinite(total)) return;

    const student = studentMap[result.student_id];
    if (!student) return;

    const subject = result.subject_name || "Unknown Subject";

    // Subject aggregates
    if (!subjectBuckets[subject]) {
      subjectBuckets[subject] = { subject, entries: 0, totalScore: 0, passCount: 0, failCount: 0 };
    }
    subjectBuckets[subject].entries += 1;
    subjectBuckets[subject].totalScore += total;
    if (total >= PASS_MARK) subjectBuckets[subject].passCount += 1;
    else subjectBuckets[subject].failCount += 1;

    // Per-student aggregates + subject breakdown
    if (!studentBuckets[student.id]) {
      studentBuckets[student.id] = {
        studentId: student.id,
        studentName: `${student.first_name} ${student.last_name}`,
        grade: student.grade,
        subjects: 0,
        totalScore: 0,
        failedSubjects: 0,
        subjectScores: {}, // subject → score
      };
    }
    studentBuckets[student.id].subjects += 1;
    studentBuckets[student.id].totalScore += total;
    if (total < PASS_MARK) studentBuckets[student.id].failedSubjects += 1;
    studentBuckets[student.id].subjectScores[subject] = total;
  });

  const subjectRows = Object.values(subjectBuckets)
    .map((bucket) => ({
      subject: bucket.subject,
      entries: bucket.entries,
      average: Math.round(bucket.totalScore / bucket.entries),
      passRate: Math.round((bucket.passCount / bucket.entries) * 100),
      failCount: bucket.failCount,
    }))
    .sort((a, b) => b.average - a.average);

  // Full ranked student list (by average descending)
  const allStudentRows = Object.values(studentBuckets)
    .map((bucket) => ({
      ...bucket,
      average: Math.round(bucket.totalScore / bucket.subjects),
    }))
    .sort((a, b) => b.average - a.average)
    .map((row, i) => ({ ...row, position: i + 1 }));

  const topStudents = allStudentRows.slice(0, 10);
  const atRiskStudents = allStudentRows.filter((s) => s.average < PASS_MARK || s.failedSubjects > 0);

  const uniqueStudents = allStudentRows.length;
  const totalEntries = relevantResults.length;
  const overallPassRate = totalEntries > 0
    ? Math.round((relevantResults.filter((result) => getScoreTotal(result) >= PASS_MARK).length / totalEntries) * 100)
    : 0;
  const classAverage = uniqueStudents > 0
    ? Math.round(allStudentRows.reduce((s, r) => s + r.average, 0) / uniqueStudents)
    : 0;

  return {
    subjectRows,
    topStudents,
    allStudentRows,
    atRiskStudents,
    totalEntries,
    uniqueStudents,
    overallPassRate,
    classAverage,
    passMark: PASS_MARK,
  };
}

export default function ReportsPage() {
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();

  const [masterStudents, setMasterStudents] = useState([]);
  const [masterPayments, setMasterPayments] = useState([]);
  const [masterAttendance, setMasterAttendance] = useState([]);
  const [masterCheckIns,   setMasterCheckIns]   = useState([]);
  const [masterExpenses, setMasterExpenses] = useState([]);
  const [masterExamResults, setMasterExamResults] = useState([]);
  const [masterClassFees, setMasterClassFees] = useState([]);
  const [masterAuditLogs, setMasterAuditLogs] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [studentStartTerms, setStudentStartTerms] = useState({});
  const [isMasterLoading, setIsMasterLoading] = useState(true);

  const [activeReport, setActiveReport] = usePersistentState("reports_active", null);
  const [filters, setFilters] = usePersistentState("reports_filters", { grade: "all", term: "all", year: "all" });
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [teacherSubject, setTeacherSubject] = useState(null);
  const [teacherClasses, setTeacherClasses] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const [loadedDiscounts, loadedStartTerms, feeGroupRecords] = await Promise.all([
          loadPaymentDiscounts().catch(() => ({})),
          loadStudentStartTerms().catch(() => ({})),
          loadStudentFeeGroups().catch(() => ({})),
        ]);
        const [students, payments, attendance, checkIns, expenses, examResults, classFees, schoolCalendarEvents, auditLogs] = await Promise.all([
          Student.list(),
          Payment.list("-payment_date"),
          Attendance.list("-attendance_date"),
          AttendanceCheckIn.list("-attendance_date").catch(() => []),
          Expense.list("-expense_date").catch(() => []),
          ExamResult.list("-created_date").catch(() => []),
          ClassFee.list().catch(() => []),
          SchoolCalendarEvent.list("-event_date").catch(() => []),
          AuditLog.list(500).catch(() => []),
        ]);
        setMasterStudents(applyStudentFeeGroups(students || [], feeGroupRecords));
        setMasterPayments(payments || []);
        setMasterAttendance(attendance || []);
        setMasterCheckIns(checkIns || []);
        setMasterExpenses(expenses || []);
        setMasterExamResults(examResults || []);
        setMasterClassFees(classFees || []);
        setMasterAuditLogs(auditLogs || []);
        setCalendarEvents(schoolCalendarEvents || []);
        setDiscounts(loadedDiscounts || {});
        setStudentStartTerms(loadedStartTerms || {});
      } catch (error) {
        console.error("Error loading report data:", error);
      }
      setIsMasterLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (currentUser?.school_role !== "teacher" || !currentUser?.linked_teacher_id) {
        setTeacherSubject(null);
        setTeacherClasses([]);
        return;
      }

      const teacher = await Teacher.get(currentUser.linked_teacher_id).catch(() => null);
      setTeacherSubject(teacher?.subject_specialization || null);
      setTeacherClasses(teacher?.classes_assigned || []);
    })();
  }, [currentUser]);

  const availableYears = useMemo(
    () => extractAcademicYears([masterPayments, masterExamResults, masterClassFees, calendarEvents], schoolYear),
    [masterPayments, masterExamResults, masterClassFees, calendarEvents, schoolYear]
  );

  const activeTemplate = REPORT_LIBRARY.find((item) => item.id === activeReport) || null;
  const colors = activeTemplate ? colorMap[activeTemplate.color] : colorMap.slate;

  const overview = useMemo(() => {
    const activeStudents = masterStudents.filter((student) => student.enrollment_status === "active");
    const totalRevenue = masterPayments
      .filter((payment) => payment.payment_status === "paid" || payment.payment_status === "partial")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalExpenses = masterExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    // Term-scoped attendance rate using the new check-in-gated model:
    //   - Universe = (active students) × (school days in the current term so
    //     far, capped at today)
    //   - A student is "present" on a school day only if (a) the class teacher
    //     checked in for that (grade, day) AND (b) no absence record exists.
    //   - No check-in for that (grade, day) → every student in that class is
    //     ABSENT for that day. That makes silent neglect show up loudly here.
    const todayISO = getLagosDateString();
    const currentSchoolDays =
      schoolYear && schoolTerm
        ? listSchoolDaysForTerm(calendarEvents || [], schoolTerm, schoolYear, todayISO)
        : [];
    let attendanceRate = null;
    if (currentSchoolDays.length > 0 && activeStudents.length > 0) {
      const checkInIndex = buildCheckInIndex(masterCheckIns);
      const tally = tallyAttendance({
        records: masterAttendance,
        checkInIndex,
        expectedDates: currentSchoolDays,
        students: activeStudents,
      });
      attendanceRate = tally.expected > 0
        ? Math.round((tally.present / tally.expected) * 100)
        : null;
    }

    return {
      activeStudents: activeStudents.length,
      totalRevenue,
      totalExpenses,
      attendanceRate,
      templates: REPORT_LIBRARY.length,
    };
  }, [masterAttendance, masterCheckIns, masterExpenses, masterPayments, masterStudents, schoolTerm, schoolYear, calendarEvents]);

  const schoolPulse = useMemo(() => {
    const today = getLagosDateString();
    const selectedTerm = schoolTerm || TERMS[0];
    const selectedYear = schoolYear || availableYears[availableYears.length - 1] || "all";
    const schoolDays = selectedYear && selectedYear !== "all"
      ? listSchoolDaysForTerm(calendarEvents, selectedTerm, selectedYear, today)
      : [];
    const todayStatus = selectedYear && selectedYear !== "all"
      ? getSchoolDayStatus(today, calendarEvents, selectedTerm, selectedYear)
      : { closed: false, reason: null };
    const upcomingClosures = (selectedYear && selectedYear !== "all"
      ? getUpcomingCalendarEvents(calendarEvents, selectedYear, today)
      : []
    ).filter((event) => ["holiday", "vacation", "mid_term"].includes(String(event?.event_type || "").toLowerCase())).slice(0, 3);

    return {
      selectedTerm,
      selectedYear,
      schoolDaysCompleted: schoolDays.length,
      todayClosed: Boolean(todayStatus?.closed),
      todayReason: todayStatus?.reason || "Open school day",
      upcomingClosures,
    };
  }, [availableYears, calendarEvents, schoolTerm, schoolYear]);

  const groupedTemplates = useMemo(() => {
    return Object.keys(CATEGORY_META).map((category) => ({
      id: category,
      meta: CATEGORY_META[category],
      items: REPORT_LIBRARY.filter((item) =>
        item.category === category &&
        (!item.roles || item.roles.includes(currentUser?.school_role))
      ),
    }));
  }, [currentUser?.school_role]);

  const handleSelectReport = (id) => {
    const template = REPORT_LIBRARY.find((item) => item.id === id);
    if (!template) return;

    setActiveReport(id);
    setFilters({
      grade: "all",
      term: template.filters.includes("term") ? (schoolTerm || TERMS[0]) : "all",
      year: template.filters.includes("year") ? (schoolYear || availableYears[availableYears.length - 1] || "all") : "all",
    });
    setReportData(null);
  };

  const handleBack = () => {
    setActiveReport(null);
    setReportData(null);
  };

  const handleGenerate = async () => {
    if (!activeTemplate || activeTemplate.kind === "tool") return;

    setIsGenerating(true);
    setReportData(null);
    try {
      let data = null;
        if (activeReport === "academic-summary") data = await generateAcademicSummary(filters, masterStudents, masterExamResults);
      if (activeReport === "payment") data = await generatePaymentReport(filters, masterStudents, masterPayments, masterClassFees, discounts, studentStartTerms);
      if (activeReport === "defaulters") data = await generateDefaultersReport(filters, masterStudents, masterPayments, masterClassFees, discounts, studentStartTerms);
        if (activeReport === "finance-overview") data = await generateFinanceOverview(filters, masterStudents, masterPayments, masterExpenses, masterClassFees, discounts, studentStartTerms);
        if (activeReport === "daily-collection") data = await generateDailyCollectionReport(filters, masterStudents, masterPayments);
        if (activeReport === "student-progress") data = await generateStudentProgressReport(filters, masterStudents, masterExamResults);
        if (activeReport === "attendance") data = await generateAttendanceReport(filters, masterStudents, masterAttendance, masterCheckIns, calendarEvents);
        if (activeReport === "enrollment") data = await generateEnrollmentReport(filters, masterStudents);
        if (activeReport === "audit-activity") data = await generateAuditActivityReport(masterAuditLogs);
      setReportData(data);
    } catch (error) {
      console.error("Error generating report:", error);
    }
    setIsGenerating(false);
  };

  const handleExport = () => {
    if (!reportData || !activeTemplate) return;

    const label = filters.grade === "all" ? "all-classes" : filters.grade.replace(/\s+/g, "-").toLowerCase();
    const term = filters.term === "all" ? "all-terms" : filters.term.replace(/\s+/g, "-").toLowerCase();
    const year = filters.year === "all" ? "all-years" : filters.year.replace(/\//g, "-");

    if (activeReport === "academic-summary") {
      const subjectSection = [
        ["Academic Performance Report", filters.grade === "all" ? "All Classes" : filters.grade, filters.term, filters.year],
        [`Class Average: ${reportData.classAverage}`, `Pass Rate: ${reportData.overallPassRate}%`, `Pass Mark: ${reportData.passMark}`, `At-Risk: ${reportData.atRiskStudents.length}`],
        [],
        ["SUBJECT BREAKDOWN"],
        ["Subject", "Students", "Average", "Pass Rate", "Failed"],
        ...reportData.subjectRows.map((row) => [row.subject, row.entries, row.average, `${row.passRate}%`, row.failCount]),
        [],
        ["FULL CLASS RANKING"],
        ["Position", "Student", "Class", "Subjects", "Total Score", "Average", "Subjects Failed", "Status"],
        ...reportData.allStudentRows.map((row) => [
          row.position,
          row.studentName,
          row.grade,
          row.subjects,
          row.totalScore,
          row.average,
          row.failedSubjects,
          row.average >= reportData.passMark && row.failedSubjects === 0 ? "Passing" : row.average >= reportData.passMark ? "Partial Fail" : "At Risk",
        ]),
        ...(reportData.atRiskStudents.length > 0 ? [
          [],
          ["AT-RISK STUDENTS"],
          ["Student", "Class", "Average", "Subjects Failed", "Failed Subjects"],
          ...reportData.atRiskStudents.map((row) => [
            row.studentName,
            row.grade,
            row.average,
            row.failedSubjects,
            Object.entries(row.subjectScores).filter(([, s]) => s < reportData.passMark).map(([subj, s]) => `${subj} (${s})`).join("; ") || "—",
          ]),
        ] : []),
      ];
      downloadCsv(`academic-performance-${label}-${term}-${year}.csv`, subjectSection);
    }

    if (activeReport === "payment" || activeReport === "defaulters") {
      const header = ["Student Name", "Class", "Term Fees (N)", "Paid (N)", "Balance (N)", "Status"];
      const rows = reportData.rows.map((row) => [
        `${row.student.first_name} ${row.student.last_name}`,
        row.student.grade,
        row.expected || 0,
        row.paid,
        row.balance,
        row.status,
      ]);
      downloadCsv(`${activeReport}-${label}-${term}-${year}.csv`, [header, ...rows]);
    }

    if (activeReport === "finance-overview") {
      const rows = [
        ["Finance Overview", filters.term, filters.year],
        [],
        ["Summary", "Value"],
        ["Revenue", reportData.totalRevenue],
        ["Outstanding", reportData.totalOutstanding],
        ["Expenses", reportData.totalExpenses],
        ["Net Balance", reportData.netBalance],
        ["Collection Rate", `${reportData.collectionRate}%`],
        [],
        ["Class", "Students", "Expected", "Collected", "Outstanding", "Collection Rate"],
        ...reportData.classRows.map((row) => [
          row.grade,
          row.students,
          row.expected,
          row.collected,
          row.outstanding,
          `${row.collectionRate}%`,
        ]),
      ];
      downloadCsv(`finance-overview-${term}-${year}.csv`, rows);
    }

    if (activeReport === "daily-collection") {
      const header = ["Date", "Student", "Class", "Amount", "Method", "Status", "Admin"];
      const rows = reportData.rows.map((row) => [
        row.date,
        row.studentName,
        row.grade,
        row.amount,
        row.method,
        row.status,
        row.admin,
      ]);
      downloadCsv(`daily-collection-${label}-${term}-${year}.csv`, [header, ...rows]);
    }

    if (activeReport === "student-progress") {
      const header = ["Student", "Class", "Previous Average", "Current Average", "Change", "Subjects", "Status"];
      const rows = reportData.rows.map((row) => [
        row.studentName,
        row.grade,
        row.previousAverage ?? "",
        row.currentAverage ?? "",
        row.change ?? "",
        row.subjects,
        row.status,
      ]);
      downloadCsv(`student-progress-${label}-${term}-${year}.csv`, [header, ...rows]);
    }

    if (activeReport === "audit-activity") {
      const header = ["Date", "Actor", "Action", "Module", "Entity Type", "Summary"];
      const rows = reportData.rows.map((row) => [
        row.date,
        row.actor,
        row.action,
        row.module,
        row.entityType,
        row.summary,
      ]);
      downloadCsv(`audit-activity.csv`, [header, ...rows]);
    }

    if (activeReport === "attendance") {
      const header = ["Student Name", "Class", "Recorded Days", "Expected School Days", "Present", "Absent", "Attendance %"];
      const rows = reportData.rows.map((row) => [
        `${row.student.first_name} ${row.student.last_name}`,
        row.student.grade,
        row.total,
        row.expectedDays ?? "",
        row.present,
        row.absent,
        row.rate != null ? `${row.rate}%` : "N/A",
      ]);
      downloadCsv(`attendance-${label}-${term}-${year}.csv`, [header, ...rows]);
    }

    if (activeReport === "enrollment") {
      const header = ["Class", "Active Students"];
      const rows = reportData.rows.map((row) => [row.grade, row.total]);
      downloadCsv(`enrollment-${label}.csv`, [header, ...rows]);
    }
  };

  const handleExportPdf = () => {
    if (!reportData || !activeTemplate) return;

    const gradeLabel = filters.grade === "all" ? "All Classes" : filters.grade;
    const termLabel = filters.term === "all" ? "All Terms" : filters.term;
    const yearLabel = filters.year === "all" ? "All Academic Years" : filters.year;
    const subtitle = `${gradeLabel} • ${termLabel} • ${yearLabel}`;

    if (activeReport === "academic-summary") {
      openReportPdf("Academic Performance Report", subtitle, [
        {
          type: "metrics",
          title: "Summary",
          items: [
            { label: "Students Assessed", value: reportData.uniqueStudents, hint: "Students with result entries" },
            { label: "Class Average", value: reportData.classAverage, hint: "Average score across all students" },
            { label: "Overall Pass Rate", value: formatPercent(reportData.overallPassRate), hint: `Pass mark: ${reportData.passMark}` },
            { label: "At-Risk Students", value: reportData.atRiskStudents.length, hint: "Failed ≥1 subject or avg below pass mark" },
          ],
        },
        {
          type: "table",
          title: "Subject Breakdown",
          headers: ["Subject", "Students", "Average", "Pass Rate", "Failed"],
          rows: reportData.subjectRows.map((row) => [row.subject, row.entries, row.average, `${row.passRate}%`, row.failCount]),
        },
        {
          type: "table",
          title: "Full Class Ranking",
          headers: ["Pos.", "Student", "Class", "Subjects", "Total", "Average", "Failed Subj.", "Status"],
          rows: reportData.allStudentRows.map((row) => [
            row.position,
            row.studentName,
            row.grade,
            row.subjects,
            row.totalScore,
            row.average,
            row.failedSubjects,
            row.average >= reportData.passMark && row.failedSubjects === 0 ? "Passing" : row.average >= reportData.passMark ? "Partial Fail" : "At Risk",
          ]),
        },
        ...(reportData.atRiskStudents.length > 0 ? [{
          type: "table",
          title: `Students Needing Attention (${reportData.atRiskStudents.length})`,
          description: `Students who failed one or more subjects or have an average below ${reportData.passMark}.`,
          headers: ["Student", "Class", "Average", "Subjects Failed", "Failed Subjects"],
          rows: reportData.atRiskStudents.map((row) => [
            row.studentName,
            row.grade,
            row.average,
            row.failedSubjects,
            Object.entries(row.subjectScores).filter(([, s]) => s < reportData.passMark).map(([subj, s]) => `${subj} (${s})`).join(", ") || "—",
          ]),
        }] : []),
      ]);
      return;
    }

    if (activeReport === "payment" || activeReport === "defaulters") {
      const rows = reportData.rows;
      const totalExpected = activeReport === "payment" ? reportData.totalExpected : rows.reduce((sum, row) => sum + Number(row.expected || 0), 0);
      const totalCollected = activeReport === "payment" ? reportData.totalCollected : rows.reduce((sum, row) => sum + Number(row.paid || 0), 0);
      const totalBalance = activeReport === "payment" ? reportData.totalBalance : rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
      openReportPdf(
        activeReport === "defaulters" ? "Fee Defaulters Report" : "Fee Collection Report",
        subtitle,
        [
          {
            type: "metrics",
            title: "Summary",
            items: [
              { label: "Students", value: rows.length, hint: "Included in this report" },
              { label: "Expected", value: formatCurrency(totalExpected), hint: "Scheduled term fees" },
              { label: "Collected", value: formatCurrency(totalCollected), hint: "Paid so far" },
              { label: "Outstanding", value: formatCurrency(totalBalance), hint: "Balance left" },
            ],
          },
          {
            type: "table",
            title: activeReport === "defaulters" ? "Students With Outstanding Balances" : "Fee Collection Details",
            headers: ["Student", "Class", "Term Fees", "Paid", "Balance", "Status"],
            rows: rows.map((row) => [
              `${row.student.first_name} ${row.student.last_name}`,
              row.student.grade,
              formatCurrency(row.expected || 0),
              formatCurrency(row.paid || 0),
              formatCurrency(row.balance || 0),
              row.status,
            ]),
          },
        ]
      );
      return;
    }

    if (activeReport === "finance-overview") {
      openReportPdf("Finance Overview Report", subtitle, [
        {
          type: "metrics",
          title: "Financial Summary",
          items: [
            { label: "Revenue", value: formatCurrency(reportData.totalRevenue), hint: "Paid and partial payments" },
            { label: "Outstanding", value: formatCurrency(reportData.totalOutstanding), hint: "Uncollected tuition balance" },
            { label: "Expenses", value: formatCurrency(reportData.totalExpenses), hint: "Expenses in selected scope" },
            { label: "Net Balance", value: formatCurrency(reportData.netBalance), hint: "Revenue minus expenses" },
            { label: "Collection Rate", value: formatPercent(reportData.collectionRate), hint: "Against expected fees" },
          ],
        },
        {
          type: "table",
          title: "Class Performance",
          headers: ["Class", "Students", "Expected", "Collected", "Outstanding", "Collection Rate"],
          rows: reportData.classRows.map((row) => [
            row.grade,
            row.students,
            formatCurrency(row.expected),
            formatCurrency(row.collected),
            formatCurrency(row.outstanding),
            `${row.collectionRate}%`,
          ]),
        },
      ]);
      return;
    }

    if (activeReport === "daily-collection") {
      openReportPdf("Daily Collection Report", subtitle, [
        {
          type: "metrics",
          title: "Collection Summary",
          items: [
            { label: "Total Collected", value: formatCurrency(reportData.totalCollected), hint: "Real payments received" },
            { label: "Payment Count", value: reportData.paymentCount, hint: "Number of payment entries" },
            { label: "Top Method", value: reportData.byMethod[0]?.name || "N/A", hint: reportData.byMethod[0] ? formatCurrency(reportData.byMethod[0].amount) : "No payments" },
            { label: "Top Admin", value: reportData.byAdmin[0]?.name || "N/A", hint: reportData.byAdmin[0] ? formatCurrency(reportData.byAdmin[0].amount) : "No payments" },
          ],
        },
        {
          type: "table",
          title: "Collections",
          headers: ["Date", "Student", "Class", "Amount", "Method", "Status", "Admin"],
          rows: reportData.rows.map((row) => [
            row.date,
            row.studentName,
            row.grade,
            formatCurrency(row.amount),
            row.method,
            row.status,
            row.admin,
          ]),
        },
      ]);
      return;
    }

    if (activeReport === "student-progress") {
      openReportPdf("Student Progress Report", subtitle, [
        {
          type: "metrics",
          title: "Progress Summary",
          items: [
            { label: "Students Assessed", value: reportData.assessed, hint: "Students with current scores" },
            { label: "Current Average", value: reportData.average, hint: "Average across assessed students" },
            { label: "Improved", value: reportData.improved, hint: "Students above previous term" },
            { label: "Declined", value: reportData.declined, hint: "Students below previous term" },
          ],
        },
        {
          type: "table",
          title: "Progress Details",
          headers: ["Student", "Class", "Previous Avg", "Current Avg", "Change", "Subjects", "Status"],
          rows: reportData.rows.map((row) => [
            row.studentName,
            row.grade,
            row.previousAverage ?? "N/A",
            row.currentAverage ?? "N/A",
            row.change == null ? "N/A" : row.change > 0 ? `+${row.change}` : row.change,
            row.subjects,
            row.status,
          ]),
        },
      ]);
      return;
    }

    if (activeReport === "audit-activity") {
      openReportPdf("Audit / Activity Report", "Sensitive activity across the school app", [
        {
          type: "metrics",
          title: "Activity Summary",
          items: [
            { label: "Actions Logged", value: reportData.totalActions, hint: "Recent audit entries" },
            { label: "Active Users", value: reportData.activeUsers, hint: "Users represented in logs" },
            { label: "Top Module", value: reportData.byModule[0]?.name || "N/A", hint: reportData.byModule[0] ? `${reportData.byModule[0].count} actions` : "No activity" },
            { label: "Top Actor", value: reportData.byActor[0]?.name || "N/A", hint: reportData.byActor[0] ? `${reportData.byActor[0].count} actions` : "No activity" },
          ],
        },
        {
          type: "table",
          title: "Recent Activity",
          headers: ["Date", "Actor", "Action", "Module", "Entity", "Summary"],
          rows: reportData.rows.map((row) => [
            row.date,
            row.actor,
            row.action,
            row.module,
            row.entityType,
            row.summary,
          ]),
        },
      ]);
      return;
    }

    if (activeReport === "attendance") {
      openReportPdf("Attendance Report", subtitle, [
        {
          type: "metrics",
          title: "Attendance Summary",
          items: [
            { label: "Students With Records", value: reportData.rows.length, hint: "Students in this report" },
            { label: "Overall Attendance", value: formatPercent(reportData.overall), hint: "Present rate" },
            { label: "Expected School Days", value: reportData.rows[0]?.expectedDays ?? 0, hint: "Calendar-based days" },
            { label: "Absence Flags", value: reportData.rows.filter((row) => (row.rate ?? 100) < 75).length, hint: "Below 75%" },
            { label: "Late Cases", value: reportData.rows.reduce((sum, row) => sum + Number(row.late || 0), 0), hint: "Total late marks" },
          ],
        },
        {
          type: "table",
          title: "Attendance Details",
          headers: ["Student", "Class", "Recorded Days", "Expected Days", "Present", "Absent", "Attendance %"],
          rows: reportData.rows.map((row) => [
            `${row.student.first_name} ${row.student.last_name}`,
            row.student.grade,
            row.total,
            row.expectedDays ?? "",
            row.present,
            row.absent,
            row.rate != null ? `${row.rate}%` : "N/A",
          ]),
        },
      ]);
      return;
    }

    if (activeReport === "enrollment") {
      openReportPdf("Enrollment Report", subtitle, [
        {
          type: "metrics",
          title: "Enrollment Summary",
          items: [
            { label: "Active Students", value: reportData.total, hint: "Current active enrollment" },
            { label: "Classes Represented", value: reportData.rows.length, hint: "Classes with students" },
            { label: "Largest Class", value: reportData.rows[0]?.grade || "N/A", hint: reportData.rows[0] ? `${reportData.rows[0].total} students` : "No data" },
            { label: "Smallest Class", value: reportData.rows[reportData.rows.length - 1]?.grade || "N/A", hint: reportData.rows[reportData.rows.length - 1] ? `${reportData.rows[reportData.rows.length - 1].total} students` : "No data" },
          ],
        },
        {
          type: "table",
          title: "Enrollment By Class",
          headers: ["Class", "Active Students"],
          rows: reportData.rows.map((row) => [row.grade, row.total]),
        },
      ]);
    }
  };

  if (isMasterLoading) {
    return <PageLoadingState label="Loading reporting center..." />;
  }

  if (!activeTemplate) {
    return (
      <PageShell maxWidth="6xl">
        <PageSection className="space-y-8">
          <PageHeader
            eyebrow="Reporting Center"
            title="Reports"
            description="Use reporting templates that answer practical school questions across academics, finance, and operations."
            meta={`${schoolPulse.selectedTerm} · ${schoolPulse.selectedYear}`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              label="Current Term"
              value={`${schoolPulse.selectedTerm}`}
              hint={schoolPulse.selectedYear}
              icon={CalendarDays}
              accent="slate"
            />
            <MetricCard
              label="School Status Today"
              value={schoolPulse.todayClosed ? "Closed" : "Open"}
              hint={schoolPulse.todayReason}
              icon={schoolPulse.todayClosed ? AlertTriangle : CheckCircle}
              accent={schoolPulse.todayClosed ? "amber" : "emerald"}
            />
            <MetricCard
              label="Open Days So Far"
              value={schoolPulse.schoolDaysCompleted}
              hint="Calendar-based school days in current term"
              icon={ClipboardList}
              accent="blue"
            />
            <MetricCard
              label="Closures Ahead"
              value={schoolPulse.upcomingClosures.length}
              hint="Upcoming holidays or breaks"
              icon={AlertTriangle}
              accent="purple"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard label="Active Students" value={overview.activeStudents} hint="Current enrolled learners" icon={Users} accent="blue" />
            <MetricCard label="Revenue Collected" value={formatCurrency(overview.totalRevenue)} hint="Across recorded payments" icon={DollarSign} accent="emerald" />
            <MetricCard label="Expenses Logged" value={formatCurrency(overview.totalExpenses)} hint="Across recorded expenses" icon={Wallet} accent="amber" />
            <MetricCard label="Attendance Rate" value={formatPercent(overview.attendanceRate)} hint="School-wide present rate" icon={UserCheck} accent="purple" />
          </div>

          {schoolPulse.upcomingClosures.length > 0 && (
            <Card className="bg-white border border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-900">Upcoming Calendar Closures</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {schoolPulse.upcomingClosures.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {event.event_date}
                      {event.end_date && event.end_date !== event.event_date ? ` to ${event.end_date}` : ""}
                    </p>
                    <Badge className="mt-3 bg-slate-100 text-slate-700 border-slate-200 capitalize">
                      {String(event.event_type || "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {groupedTemplates.map((group) => (
            <section key={group.id} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{group.meta.label}</h2>
                  <p className="text-slate-600">{group.meta.description}</p>
                </div>
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                  {group.items.length} template{group.items.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {group.items.map((item) => (
                  <ReportTemplateCard key={item.id} item={item} onOpen={handleSelectReport} />
                ))}
              </div>
            </section>
          ))}
        </PageSection>
      </PageShell>
    );
  }

  const hasGrade = activeTemplate.filters.includes("grade");
  const hasTerm = activeTemplate.filters.includes("term");
  const hasYear = activeTemplate.filters.includes("year");
  const ActiveIcon = activeTemplate.icon;

  return (
    <PageShell maxWidth="6xl">
      <PageSection>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Templates
          </button>
          <span className="text-slate-300">/</span>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${colors.badge}`}>
            <ActiveIcon className="w-4 h-4" />
            {activeTemplate.label}
          </div>
          <Badge className="bg-white text-slate-700 border-slate-200">
            {activeTemplate.kind === "tool" ? "Tool" : "Report"}
          </Badge>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            {CATEGORY_META[activeTemplate.category].label}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{activeTemplate.label}</h1>
          <p className="text-slate-600 mb-2">{activeTemplate.description}</p>
          <p className="text-sm text-slate-500">{activeTemplate.insight}</p>
        </div>

        <Card className="bg-white border border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-800">Configure {activeTemplate.kind === "tool" ? "View" : "Report"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              {hasGrade && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</label>
                  <Select value={filters.grade} onValueChange={(value) => { setFilters((current) => ({ ...current, grade: value })); setReportData(null); }}>
                    <SelectTrigger className="w-44 bg-slate-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {hasTerm && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Term</label>
                  <Select value={filters.term} onValueChange={(value) => { setFilters((current) => ({ ...current, term: value })); setReportData(null); }}>
                    <SelectTrigger className="w-40 bg-slate-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Terms</SelectItem>
                      {TERMS.map((term) => (
                        <SelectItem key={term} value={term}>{term}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {hasYear && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Academic Year</label>
                  <Select value={filters.year} onValueChange={(value) => { setFilters((current) => ({ ...current, year: value })); setReportData(null); }}>
                    <SelectTrigger className="w-44 bg-slate-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {availableYears.map((year) => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {activeTemplate.kind === "report" ? (
                <Button onClick={handleGenerate} disabled={isGenerating} className={`${colors.btn} min-w-40`}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BarChart2 className="w-4 h-4 mr-2" />
                      Generate Report
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {activeTemplate.kind === "tool" && (
          <div className="space-y-4">
            <Card className="bg-indigo-50 border border-indigo-200">
              <CardContent className="p-4">
                <p className="text-sm text-indigo-800">
                  This is a live academic workflow, not a static report. Use it to review or update scores before you print report cards or transcripts.
                </p>
              </CardContent>
            </Card>
            <Gradebook
              term={filters.term === "all" ? (schoolTerm || "") : filters.term}
              academicYear={filters.year === "all" ? (schoolYear || "") : filters.year}
              currentUser={currentUser}
              teacherSubject={teacherSubject}
              teacherClasses={teacherClasses}
            />
          </div>
        )}

        {activeTemplate.kind === "report" && !reportData && !isGenerating && (
          <EmptyState
            icon={activeTemplate.icon}
            title={`Ready to generate ${activeTemplate.label}`}
            text="Choose your filters above and generate the report."
            colors={colors}
          />
        )}

        {reportData && activeTemplate.kind === "report" && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleExportPdf}>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        )}

        {reportData && activeReport === "academic-summary" && (
          <div className="space-y-6">
            {/* Summary metrics */}
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <MetricCard label="Students Assessed" value={reportData.uniqueStudents} hint="Students with result entries" icon={Users} accent="blue" />
              <MetricCard label="Class Average" value={reportData.classAverage} hint={`Out of 100 · Pass mark ${reportData.passMark}`} icon={TrendingUp} accent="indigo" />
              <MetricCard label="Overall Pass Rate" value={formatPercent(reportData.overallPassRate)} hint="% of subject entries above pass mark" icon={CheckCircle} accent="emerald" />
              <MetricCard label="At-Risk Students" value={reportData.atRiskStudents.length} hint={`Failed ≥1 subject or avg < ${reportData.passMark}`} icon={AlertTriangle} accent="red" />
              <MetricCard label="Subjects" value={reportData.subjectRows.length} hint="Subjects with recorded scores" icon={BookOpen} accent="slate" />
            </div>

            {reportData.subjectRows.length === 0 ? (
              <Card className="bg-white border border-slate-200">
                <CardContent className="p-8 text-center text-slate-500">
                  No academic result data matched these filters.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Subject chart + top performers */}
                <div className="grid xl:grid-cols-3 gap-6">
                  <Card className="bg-white border border-slate-200 xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm">Subject Averages (top 8)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={reportData.subjectRows.slice(0, 8)} margin={{ left: 8, right: 8, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="subject" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [`${v}`, "Average"]} />
                          <Bar dataKey="average" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="bg-white border border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-sm">Top 10 Performers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-4">
                      {reportData.topStudents.length === 0 ? (
                        <p className="text-sm text-slate-500">No student ranking data yet.</p>
                      ) : reportData.topStudents.map((student) => (
                        <div key={student.studentId} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
                          <span className="w-6 text-xs font-bold text-slate-400 text-right flex-shrink-0">{student.position}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{student.studentName}</p>
                            <p className="text-xs text-slate-500">{student.grade} · {student.subjects} subjects</p>
                          </div>
                          <Badge className={student.average >= 70 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : student.average >= 50 ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-amber-100 text-amber-800 border-amber-200"}>
                            {student.average}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Subject breakdown table */}
                <Card className="bg-white border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-sm">Subject Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Subject</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Students</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Average</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Pass Rate</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Failed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.subjectRows.map((row) => (
                            <tr key={row.subject} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">{row.subject}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{row.entries}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-bold ${row.average >= 70 ? "text-emerald-700" : row.average >= 50 ? "text-blue-700" : "text-red-700"}`}>
                                  {row.average}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge className={row.passRate >= 75 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.passRate >= 50 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200"}>
                                  {row.passRate}%
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {row.failCount > 0 ? (
                                  <span className="text-red-600 font-semibold">{row.failCount}</span>
                                ) : (
                                  <span className="text-emerald-600">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Full class ranking */}
                <Card className="bg-white border border-slate-200">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Full Class Ranking ({reportData.allStudentRows.length} students)</CardTitle>
                    <span className="text-xs text-slate-500">Sorted by average score · Pass mark: {reportData.passMark}</span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[480px]">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700 w-12">Pos.</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Class</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Subjects</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Total</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Average</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Failed Subj.</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.allStudentRows.map((row) => (
                            <tr key={row.studentId} className={`hover:bg-slate-50 ${row.average < reportData.passMark ? "bg-red-50/40" : ""}`}>
                              <td className="px-4 py-3 text-center font-bold text-slate-500 text-xs">{row.position}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{row.studentName}</td>
                              <td className="px-4 py-3 text-slate-600">{row.grade}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{row.subjects}</td>
                              <td className="px-4 py-3 text-center text-slate-700 font-medium">{row.totalScore}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-bold ${row.average >= 70 ? "text-emerald-700" : row.average >= 50 ? "text-blue-700" : row.average >= reportData.passMark ? "text-amber-700" : "text-red-700"}`}>
                                  {row.average}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {row.failedSubjects > 0 ? (
                                  <span className="text-red-600 font-semibold">{row.failedSubjects}</span>
                                ) : (
                                  <span className="text-emerald-600 text-xs">✓ None</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge className={row.average >= reportData.passMark && row.failedSubjects === 0 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.average >= reportData.passMark ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200"}>
                                  {row.average >= reportData.passMark && row.failedSubjects === 0 ? "Passing" : row.average >= reportData.passMark ? "Partial Fail" : "At Risk"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* At-risk students callout */}
                {reportData.atRiskStudents.length > 0 && (
                  <Card className="bg-red-50 border border-red-200">
                    <CardHeader>
                      <CardTitle className="text-sm text-red-800">⚠ {reportData.atRiskStudents.length} Students Need Attention</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-red-100 border-b border-red-200">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold text-red-800">Student</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-800">Class</th>
                              <th className="px-4 py-3 text-center font-semibold text-red-800">Average</th>
                              <th className="px-4 py-3 text-center font-semibold text-red-800">Subjects Failed</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-800">Failed Subjects</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100">
                            {reportData.atRiskStudents.map((row) => {
                              const failedList = Object.entries(row.subjectScores)
                                .filter(([, score]) => score < reportData.passMark)
                                .map(([subj, score]) => `${subj} (${score})`)
                                .join(", ");
                              return (
                                <tr key={row.studentId} className="hover:bg-red-100/40">
                                  <td className="px-4 py-3 font-semibold text-slate-900">{row.studentName}</td>
                                  <td className="px-4 py-3 text-slate-600">{row.grade}</td>
                                  <td className="px-4 py-3 text-center font-bold text-red-700">{row.average}</td>
                                  <td className="px-4 py-3 text-center font-bold text-red-700">{row.failedSubjects}</td>
                                  <td className="px-4 py-3 text-xs text-red-700">{failedList || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {reportData && (activeReport === "payment" || activeReport === "defaulters") && (() => {
          const rows = reportData.rows;
          const totalExpected = activeReport === "payment" ? reportData.totalExpected : rows.reduce((sum, row) => sum + Number(row.expected || 0), 0);
          const totalCollected = activeReport === "payment" ? reportData.totalCollected : rows.reduce((sum, row) => sum + row.paid, 0);
          const totalBalance = activeReport === "payment" ? reportData.totalBalance : rows.reduce((sum, row) => sum + row.balance, 0);
          const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
          const pieData = [
            { name: "Paid", value: rows.filter((row) => row.status === "Paid").length, color: "#10b981" },
            { name: "Partial", value: rows.filter((row) => row.status === "Partial").length, color: "#3b82f6" },
            { name: "Unpaid", value: rows.filter((row) => row.status === "Unpaid").length, color: "#ef4444" },
          ].filter((item) => item.value > 0);

          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <MetricCard label="Students" value={rows.length} hint="Included in this report" icon={Users} accent="slate" />
                <MetricCard label="Expected Fees" value={formatCurrency(totalExpected)} hint="Based on fee schedule for selected term/year" icon={DollarSign} accent="slate" />
                <MetricCard label="Collected" value={formatCurrency(totalCollected)} hint={`Collection rate ${collectionRate}%`} icon={CheckCircle} accent="emerald" />
                <MetricCard label="Outstanding" value={formatCurrency(totalBalance)} hint="Still unpaid" icon={AlertTriangle} accent="red" />
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <Card className="bg-white border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-sm">Payment Status Mix</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={78} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-slate-200 lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {activeReport === "defaulters" ? "Students With Outstanding Balances" : "Fee Collection Details"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rows.length === 0 ? (
                      <div className="text-center py-10 text-slate-500">No payment records matched the current filters.</div>
                    ) : (
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Class</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-700">Fees</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
                              <th className="px-4 py-3 text-right font-semibold text-slate-700">Balance</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rows.map((row) => (
                              <tr key={row.student.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{row.student.first_name} {row.student.last_name}</td>
                                <td className="px-4 py-3 text-slate-600">{row.student.grade}</td>
                                <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.expected || 0)}</td>
                                <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{formatCurrency(row.paid)}</td>
                                <td className="px-4 py-3 text-right text-red-700 font-semibold">{formatCurrency(row.balance)}</td>
                                <td className="px-4 py-3">
                                  <Badge className={row.status === "Paid" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.status === "Partial" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-red-100 text-red-800 border-red-200"}>
                                    {row.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })()}

        {reportData && activeReport === "finance-overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <MetricCard label="Revenue" value={formatCurrency(reportData.totalRevenue)} hint="Paid and partial payments" icon={DollarSign} accent="emerald" />
              <MetricCard label="Outstanding" value={formatCurrency(reportData.totalOutstanding)} hint="Uncollected tuition balance" icon={AlertTriangle} accent="red" />
              <MetricCard label="Expenses" value={formatCurrency(reportData.totalExpenses)} hint="Expenses in selected year" icon={Wallet} accent="amber" />
              <MetricCard label="Net Balance" value={formatCurrency(reportData.netBalance)} hint="Revenue minus expenses" icon={TrendingUp} accent={reportData.netBalance >= 0 ? "blue" : "red"} />
              <MetricCard label="Collection Rate" value={formatPercent(reportData.collectionRate)} hint="Revenue against expected fees" icon={CheckCircle} accent="indigo" />
            </div>

            <div className="grid xl:grid-cols-2 gap-6">
              <Card className="bg-white border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">Class Financial Pressure Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={reportData.classRows.slice(0, 8)} margin={{ left: 8, right: 8, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="grade" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="collected" fill="#10b981" radius={[5, 5, 0, 0]} />
                      <Bar dataKey="outstanding" fill="#ef4444" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">Class Summary Table</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Class</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Students</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Collected</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Outstanding</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.classRows.map((row) => (
                          <tr key={row.grade} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{row.grade}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{row.students}</td>
                            <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{formatCurrency(row.collected)}</td>
                            <td className="px-4 py-3 text-right text-red-700 font-semibold">{formatCurrency(row.outstanding)}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={row.collectionRate >= 75 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.collectionRate >= 50 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200"}>
                                {row.collectionRate}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {reportData && activeReport === "daily-collection" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Total Collected" value={formatCurrency(reportData.totalCollected)} hint="Real payments received" icon={DollarSign} accent="emerald" />
              <MetricCard label="Payment Entries" value={reportData.paymentCount} hint="Payments in this report" icon={ClipboardList} accent="blue" />
              <MetricCard label="Top Method" value={reportData.byMethod[0]?.name || "N/A"} hint={reportData.byMethod[0] ? formatCurrency(reportData.byMethod[0].amount) : "No payments"} icon={Wallet} accent="amber" />
              <MetricCard label="Top Admin" value={reportData.byAdmin[0]?.name || "N/A"} hint={reportData.byAdmin[0] ? formatCurrency(reportData.byAdmin[0].amount) : "No payments"} icon={UserCheck} accent="slate" />
            </div>

            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm">Collection Entries</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {reportData.rows.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">No real collection payments matched the selected filters.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Class</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Method</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Admin</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.rows.map((row) => (
                          <tr key={row.payment.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-600">{row.date}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                            <td className="px-4 py-3 text-slate-600">{row.grade}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(row.amount)}</td>
                            <td className="px-4 py-3 text-slate-600">{row.method}</td>
                            <td className="px-4 py-3 text-slate-600">{row.admin}</td>
                            <td className="px-4 py-3">
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 capitalize">{row.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {reportData && activeReport === "student-progress" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Students Assessed" value={reportData.assessed} hint="Students with current scores" icon={Users} accent="blue" />
              <MetricCard label="Current Average" value={reportData.average} hint="Average score this term" icon={TrendingUp} accent="indigo" />
              <MetricCard label="Improved" value={reportData.improved} hint="Above previous term" icon={CheckCircle} accent="emerald" />
              <MetricCard label="Declined" value={reportData.declined} hint="Below previous term" icon={AlertTriangle} accent="red" />
            </div>

            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm">
                  Student Progress Detail
                  {reportData.previous ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      Compared with {reportData.previous.term} {reportData.previous.year}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {reportData.rows.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">No academic progress data matched the selected filters.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Class</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Previous Avg</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Current Avg</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Change</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Subjects</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.rows.map((row) => (
                          <tr key={row.student.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                            <td className="px-4 py-3 text-slate-600">{row.grade}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{row.previousAverage ?? "N/A"}</td>
                            <td className="px-4 py-3 text-center font-semibold text-slate-900">{row.currentAverage ?? "N/A"}</td>
                            <td className={`px-4 py-3 text-center font-bold ${row.change > 0 ? "text-emerald-700" : row.change < 0 ? "text-red-700" : "text-slate-500"}`}>
                              {row.change == null ? "N/A" : row.change > 0 ? `+${row.change}` : row.change}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">{row.subjects}</td>
                            <td className="px-4 py-3">
                              <Badge className={row.status === "Improved" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.status === "Declined" ? "bg-red-100 text-red-800 border-red-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                                {row.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {reportData && activeReport === "audit-activity" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Actions Logged" value={reportData.totalActions} hint="Recent audit entries" icon={ClipboardList} accent="slate" />
              <MetricCard label="Active Users" value={reportData.activeUsers} hint="Users represented" icon={Users} accent="blue" />
              <MetricCard label="Top Module" value={reportData.byModule[0]?.name || "N/A"} hint={reportData.byModule[0] ? `${reportData.byModule[0].count} actions` : "No activity"} icon={BookOpen} accent="indigo" />
              <MetricCard label="Top Actor" value={reportData.byActor[0]?.name || "N/A"} hint={reportData.byActor[0] ? `${reportData.byActor[0].count} actions` : "No activity"} icon={UserCheck} accent="emerald" />
            </div>

            <Card className="bg-white border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {reportData.rows.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">No audit activity has been recorded yet.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Actor</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Module</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.rows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-600">{row.date}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.actor}</td>
                            <td className="px-4 py-3 text-slate-600">{row.action}</td>
                            <td className="px-4 py-3 text-slate-600">{row.module}</td>
                            <td className="px-4 py-3 text-slate-700">{row.summary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {reportData && activeReport === "attendance" && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <MetricCard label="Students With Records" value={reportData.rows.length} hint="Students with attendance entries" icon={Users} accent="blue" />
                <MetricCard label="Overall Attendance" value={formatPercent(reportData.overall)} hint="Present rate across records" icon={UserCheck} accent="emerald" />
                <MetricCard label="Expected School Days" value={reportData.rows[0]?.expectedDays ?? 0} hint="Calendar-based days in selected term" icon={CalendarDays} accent="slate" />
                <MetricCard label="Absence Flags" value={reportData.rows.filter((row) => (row.rate ?? 100) < 75).length} hint="Students under 75%" icon={AlertTriangle} accent="amber" />
                <MetricCard label="Late Cases" value={reportData.rows.reduce((sum, row) => sum + row.late, 0)} hint="Total late marks" icon={ClipboardList} accent="purple" />
              </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="bg-white border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">Attendance Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const attendanceMix = [
                      { name: "Present", value: reportData.rows.reduce((sum, row) => sum + row.present, 0), color: "#10b981" },
                      { name: "Absent", value: reportData.rows.reduce((sum, row) => sum + row.absent, 0), color: "#ef4444" },
                      { name: "Late", value: reportData.rows.reduce((sum, row) => sum + row.late, 0), color: "#f59e0b" },
                      { name: "Excused", value: reportData.rows.reduce((sum, row) => sum + row.excused, 0), color: "#3b82f6" },
                    ].filter((item) => item.value > 0);

                    return (
                      <ResponsiveContainer width="100%" height={230}>
                        <PieChart>
                          <Pie data={attendanceMix} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                            {attendanceMix.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Student Attendance Detail</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {reportData.rows.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No attendance data matched the selected filters.</div>
                  ) : (
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700">Expected Days</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700">Present</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700">Absent</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700">Late</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.rows
                            .slice()
                            .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))
                            .map((row) => (
                              <tr key={row.student.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-900">{row.student.first_name} {row.student.last_name}</p>
                                  <p className="text-xs text-slate-500">{row.student.grade}</p>
                                </td>
                                <td className="px-4 py-3 text-center text-slate-600">{row.expectedDays ?? "-"}</td>
                                <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{row.present}</td>
                                <td className="px-4 py-3 text-center text-red-700 font-semibold">{row.absent}</td>
                                <td className="px-4 py-3 text-center text-amber-700 font-semibold">{row.late}</td>
                                <td className="px-4 py-3 text-center">
                                  {row.rate != null ? (
                                    <Badge className={row.rate >= 75 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : row.rate >= 50 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200"}>
                                      {row.rate}%
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400">N/A</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {reportData && activeReport === "enrollment" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Active Students" value={reportData.total} hint="Based on current enrollment status" icon={Users} accent="blue" />
              <MetricCard label="Classes Represented" value={reportData.rows.length} hint="Classes with at least one student" icon={BookOpen} accent="indigo" />
              <MetricCard label="Largest Class" value={reportData.rows[0]?.grade || "N/A"} hint={reportData.rows[0] ? `${reportData.rows[0].total} students` : "No data"} icon={TrendingUp} accent="emerald" />
              <MetricCard label="Smallest Class" value={reportData.rows[reportData.rows.length - 1]?.grade || "N/A"} hint={reportData.rows[reportData.rows.length - 1] ? `${reportData.rows[reportData.rows.length - 1].total} students` : "No data"} icon={AlertTriangle} accent="amber" />
            </div>

            <div className="grid xl:grid-cols-2 gap-6">
              <Card className="bg-white border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">Enrollment by Class</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={reportData.rows} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="grade" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-sm">Class Sizes</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {reportData.rows.map((row) => (
                      <div key={row.grade} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                        <span className="font-medium text-slate-900">{row.grade}</span>
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                          {row.total} student{row.total !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
