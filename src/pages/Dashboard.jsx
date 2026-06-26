import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BRAND } from "@/config/brand";
import { Student, Payment, Attendance, AttendanceCheckIn, BirthdaySmsLog, ClassAssignment, Teacher, TimetableSlot, SchemeOfWork } from "@/entities/all";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, DollarSign, AlertTriangle, Calendar, BookOpen, CheckCircle, Zap, UserPlus, ArrowRight, ShieldCheck, ShieldAlert, BellRing, Loader2, Cake, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { sendBulkEmail } from "@/functions/sendBulkEmail";
import { sendSMS } from "@/functions/sendSMS";
import { useToast } from "@/components/ui/use-toast";
import { findBirthdays } from "@/lib/birthdays";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ClassFee } from "@/entities/ClassFee";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import QuickPayStudentPicker from "@/components/payments/QuickPayStudentPicker";
import QuickEnrollmentModal from "@/components/students/QuickEnrollmentModal";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { approveRequest, getApprovalSummary, listPendingApprovalRequests, rejectRequest } from "@/lib/approvalRequests";
import { canApproveChanges } from "@/lib/permissions";
import { getSchoolDayStatus, getUpcomingCalendarEvents, getScopedTermWindow, hasCalendarType, matchesCalendarValue } from "@/lib/schoolCalendar";
import { applyStudentFeeGroups, buildStudentBalanceRows, getPaymentDiscountPct, getStudentArrearsTotal, isStudentActiveForTerm, loadPaymentDiscounts, loadStudentFeeGroups, loadStudentStartTerms } from "@/lib/paymentBalances";
import { formatCompactCurrency, formatCurrency } from "@/lib/formatters";
import { PageLoadingState, PageSection, PageShell } from "@/components/ui/page-shell";
import DailyMotivationQuote from "@/components/dashboard/DailyMotivationQuote";
import { useToday } from "@/hooks/useToday";
import { formatDateInLagos, formatTimeInLagos, getLagosDate, getLagosDateString, getLagosWeekdayIndex } from "@/lib/timezone";

const fmtMoney = (n) => formatCompactCurrency(n);

function fmtAmount(n) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
}

// ─── Stat card ───────────────────────────────────────────────────────────────
const STAT_COLORS = {
  blue:    { border: "border-l-blue-500",    text: "text-blue-600",    bg: "bg-blue-50",    icon: "text-blue-500"    },
  emerald: { border: "border-l-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50", icon: "text-emerald-500" },
  amber:   { border: "border-l-amber-500",   text: "text-amber-600",   bg: "bg-amber-50",   icon: "text-amber-500"   },
  red:     { border: "border-l-red-500",     text: "text-red-600",     bg: "bg-red-50",     icon: "text-red-500"     },
};

function StatCard({ label, value, icon: Icon, color = "blue", subValue }) {
  const c = STAT_COLORS[color] || STAT_COLORS.blue;
  return (
    <Card className={`bg-white border border-slate-200 border-l-4 ${c.border} shadow-sm hover:shadow-md transition-shadow`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
            <p className={`text-2xl font-bold tracking-tight ${c.text}`}>{value}</p>
            {subValue && <p className="text-xs mt-1.5 text-slate-400">{subValue}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0 ml-3`}>
            <Icon className={`w-5 h-5 ${c.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user: currentUser, isLoadingAuth } = useAuth();
  const [dashboardData, setDashboardData] = useState({ students: [], payments: [], attendance: [] });

  useEffect(() => {
    if (currentUser) loadData();
  }, [currentUser]);

  const loadData = async () => {
    try {
      if (currentUser?.school_role === "student") {
        window.location.href = createPageUrl("StudentDashboard");
        return;
      }
      const isPreviewingTeacher = currentUser?.school_role !== "teacher" && sessionStorage.getItem('previewRole') === 'teacher';
      const effectiveTeacherId = isPreviewingTeacher
        ? sessionStorage.getItem('preview_teacher_id')
        : currentUser?.linked_teacher_id;

      if (currentUser?.school_role === "teacher" || isPreviewingTeacher) {
        // Fetch teacher record, students, fee groups, and attendance all in parallel
        const [myTeacher, allStudentsRaw, feeGroupRecords, attendanceData] = await Promise.all([
          effectiveTeacherId ? Teacher.get(effectiveTeacherId).catch(() => null) : Promise.resolve(null),
          Student.list("-created_date"),
          loadStudentFeeGroups().catch(() => ({})),
          Attendance.list("-attendance_date").catch(() => []),
        ]);
        const myClasses = myTeacher?.classes_assigned || [];
        const allStudents = applyStudentFeeGroups(allStudentsRaw || [], feeGroupRecords);
        const myStudents = myClasses.length > 0
          ? allStudents.filter(s => myClasses.includes(s.grade))
          : allStudents;
        const myAttendance = myClasses.length > 0
          ? attendanceData.filter(a => myClasses.includes(a.grade))
          : attendanceData;
        setDashboardData({ students: myStudents, payments: [], attendance: myAttendance, myTeacher });
        return;
      }
      const [studentsData, paymentsData, attendanceData, classFeesData, feeGroupRecords] = await Promise.all([
        Student.list("-created_date"),
        Payment.list("-payment_date"),
        Attendance.list("-attendance_date"),
        ClassFee.list().catch(() => []),
        loadStudentFeeGroups().catch(() => ({})),
      ]);
      setDashboardData({ students: applyStudentFeeGroups(studentsData || [], feeGroupRecords), payments: paymentsData, attendance: attendanceData, classFees: classFeesData });
    } catch (error) {
      console.error("Error loading dashboard:", error);
    }
  };

  // Block only on auth load — once the user's role is known, render the
  // correct dashboard shell immediately while data loads in the background.
  if (isLoadingAuth || !currentUser) {
    return <PageLoadingState label="Loading dashboard..." />;
  }

  const role = currentUser?.school_role;
  const isPreviewingTeacher = role !== "teacher" && sessionStorage.getItem('previewRole') === 'teacher';
  const previewTeacherId = isPreviewingTeacher ? sessionStorage.getItem('preview_teacher_id') : null;

  if (role === "student") {
    // Redirect is already in-flight from loadData(); show spinner instead of admin UI
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (role === "teacher" || isPreviewingTeacher)
    ? <TeacherDashboard user={currentUser} data={dashboardData} previewTeacherId={previewTeacherId} />
    : <AdminDashboard  user={currentUser} data={dashboardData} onRefresh={loadData} />;
}

function ApprovalQueueCard({ requests, user, onApprove, onReject, loading }) {
  if (!canApproveChanges(user)) return null;
  if (!loading && requests.length === 0) return null;
  return (
    <Card className="border border-indigo-200 bg-indigo-50/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-indigo-900">Approval Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-500">Loading approval requests…</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-slate-500">No pending approvals right now.</div>
        ) : (
          requests.slice(0, 6).map((request) => (
            <div key={request.notification_id} className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{request.entity_label}</p>
                  <p className="text-xs text-slate-500 mt-1">{getApprovalSummary(request)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {request.operation} · {request.entity_type} · {format(new Date(request.created_at), "d MMM, yyyy h:mm a")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onApprove(request)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(request)} className="border-red-200 text-red-600 hover:bg-red-50">
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DashboardMetricCard({ label, value, hint, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: {
      iconWrap: "bg-blue-100 text-blue-600",
      value: "text-slate-950",
      border: "border-blue-100",
      bar: "bg-blue-500",
      ring: "ring-blue-100",
    },
    emerald: {
      iconWrap: "bg-emerald-100 text-emerald-600",
      value: "text-slate-950",
      border: "border-emerald-100",
      bar: "bg-emerald-500",
      ring: "ring-emerald-100",
    },
    amber: {
      iconWrap: "bg-amber-100 text-amber-600",
      value: "text-slate-950",
      border: "border-amber-100",
      bar: "bg-amber-500",
      ring: "ring-amber-100",
    },
    violet: {
      iconWrap: "bg-emerald-100 text-emerald-600",
      value: "text-slate-950",
      border: "border-emerald-100",
      bar: "bg-emerald-500",
      ring: "ring-emerald-100",
    },
  };
  const palette = tones[tone] || tones.blue;

  return (
    <Card className={`border-0 shadow-none bg-white ring-1 ${palette.ring || 'ring-slate-200/60'}`}>
      <div className={`h-0.5 ${palette.bar}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-3 text-4xl font-bold tracking-tight ${palette.value}`}>{value}</p>
            {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
          </div>
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${palette.iconWrap}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PulseCard({ label, value, hint, accent = "slate", ctaLabel, ctaTo }) {
  const accents = {
    slate: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-200 bg-blue-50/70 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    amber: "border-amber-200 bg-amber-50/70 text-amber-900",
    violet: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  };
  return (
    <div className={`rounded-2xl border p-4 ${accents[accent] || accents.slate}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      {ctaLabel && ctaTo ? (
        <Link to={createPageUrl(ctaTo)} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900">
          {ctaLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
// ─── Calendar event type metadata ────────────────────────────────────────────
const CAL_TYPE_DOT = {
  term_start:  "bg-emerald-500",
  term_end:    "bg-rose-500",
  mid_term:    "bg-orange-500",
  open_day:    "bg-blue-500",
  holiday:     "bg-emerald-500",
  vacation:    "bg-teal-500",
  celebration: "bg-amber-500",
  event:       "bg-slate-400",
};
const CAL_TYPE_LABEL = {
  term_start: "Term Start", term_end: "Term End", mid_term: "Mid-Term",
  open_day: "Open Day", holiday: "Holiday", vacation: "Vacation",
  celebration: "Celebration", event: "Event",
};

// ─── Today's Attendance Check-in Widget ──────────────────────────────────────
// Live roll-call of which class teachers have opened their attendance for
// today. A class that has NOT checked in by close of business means every
// student in that class is being counted as absent in reports — the admin
// can call the teacher in real time and get it sorted before parents notice.
const ALL_GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

function TodayCheckInWidget() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { smsSenderId } = useSchoolSettings();
  // Admin who is ALSO a class teacher: they appear in class_assignments under
  // their own linked_teacher_id. The widget marks those rows with a "YOU"
  // badge so they can see at a glance which class is on them personally.
  const myTeacherId = currentUser?.linked_teacher_id || null;
  const [checkIns, setCheckIns]             = useState([]);
  const [classAssignments, setAssignments]  = useState([]);
  const [teachers, setTeachers]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [lastLoadedAt, setLastLoadedAt]     = useState(null);
  // Per-grade "currently sending SMS" set so the bell can show a spinner
  // and prevent rapid-fire duplicate texts to the same teacher.
  const [sendingFor, setSendingFor]         = useState(new Set());
  const [collapsed, setCollapsed]           = useState(true);
  const today = useToday();
  const todayDate = useMemo(() => getLagosDate(today), [today]);
  const isWeekend = useMemo(() => {
    const day = getLagosWeekdayIndex(todayDate);
    return day === 0 || day === 6;
  }, [todayDate]);

  // `silent` mode skips the spinner so the periodic auto-refresh doesn't
  // flash "Loading…" every minute — only the first load and the manual
  // Refresh button show it.
  const reload = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return Promise.all([
      AttendanceCheckIn.filter({ attendance_date: today }).catch(() => []),
      ClassAssignment.list().catch(() => []),
      Teacher.list().catch(() => []),
    ])
      .then(([ci, ca, t]) => {
        setCheckIns(ci || []);
        setAssignments(ca || []);
        setTeachers(t || []);
        setLastLoadedAt(new Date());
      })
      .finally(() => { if (!silent) setLoading(false); });
  }, [today]);

  // Initial load + auto-refresh: poll every 30 s, and also re-fetch whenever
  // the tab returns to focus. Together this gives admins a near-live view of
  // teachers checking in across every class without forcing them to tap
  // Refresh manually.
  useEffect(() => {
    reload();
    const interval = setInterval(() => reload(true), 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  // Index check-ins by grade and class-teacher assignment by grade.
  const checkInByGrade = useMemo(() => {
    const map = {};
    for (const ci of checkIns) {
      if (ci.grade) map[ci.grade] = ci;
    }
    return map;
  }, [checkIns]);
  // Class-teacher resolution is defensive in two ways:
  //   1. Primary match: row where (grade matches AND teacher_id set AND subject
  //      is null/empty/whitespace). This is the canonical class-teacher row.
  //   2. Fallback: if no primary row exists for a grade but SOME row in that
  //      grade has a teacher_id set, treat that as the class teacher. This
  //      catches legacy / quirky rows where the data shape was different.
  // The fallback's only purpose is to avoid showing "no class teacher" when
  // there clearly IS a teacher attached to that grade.
  const classTeacherByGrade = useMemo(() => {
    const map = {};
    const fallback = {};
    for (const a of classAssignments) {
      if (!a?.grade || !a?.teacher_id) continue;
      const hasSubject = !!(a.subject && String(a.subject).trim().length > 0);
      if (!hasSubject) {
        map[a.grade] = a.teacher_id; // canonical class-teacher row
      } else if (!fallback[a.grade]) {
        fallback[a.grade] = a.teacher_id;
      }
    }
    // Apply fallback only where canonical match was missing.
    for (const grade of Object.keys(fallback)) {
      if (!map[grade]) map[grade] = fallback[grade];
    }
    return map;
  }, [classAssignments]);
  const teacherById = useMemo(() => {
    const map = {};
    for (const t of teachers) map[t.id] = t;
    return map;
  }, [teachers]);

  const formatTime = (iso) => {
    try {
      return formatTimeInLagos(iso, { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  const rows = ALL_GRADES.map((grade) => {
    const ci = checkInByGrade[grade];
    const teacherId = classTeacherByGrade[grade];
    const teacher   = teacherId ? teacherById[teacherId] : null;
    // teacherName precedence: full_name → first+last → fallback to teacher_id
    // (tells admin who it points to even if Teacher row can't be loaded).
    const fullName  = teacher?.full_name
      || [teacher?.first_name, teacher?.last_name].filter(Boolean).join(" ").trim()
      || null;
    return {
      grade,
      checkedIn: !!ci,
      checkedInAt: ci?.checked_in_at || ci?.created_date || null,
      teacherId: teacherId || null,
      teacherName: fullName,
      teacherPhone: teacher?.phone || null,
      teacherEmail: teacher?.email || null,
      isYou: !!myTeacherId && teacherId === myTeacherId,
    };
  });
  const openedCount = rows.filter(r => r.checkedIn).length;
  const unassignedCount = rows.filter(r => !r.teacherId).length;

  // One-tap reminder: SMS + email the class teacher of a not-yet-opened
  // class. Both channels are fired in parallel and reported independently —
  // if one succeeds and the other fails the admin still sees what got
  // through. No confirmation dialog (admin is busy in the morning rush).
  const sendReminder = async (row) => {
    if (sendingFor.has(row.grade)) return;
    if (!row.teacherPhone && !row.teacherEmail) return;
    setSendingFor(prev => new Set(prev).add(row.grade));

    // Greeting logic: a name like "Mr Adejinmi Adeyinka" would otherwise
    // collapse to "Hi Mr, …" because split(' ')[0] is just the title. Detect
    // honorifics and switch to the Nigerian-standard "title + last name"
    // form: "Hi Mr Adeyinka, …".
    const TITLES = ["mr", "mrs", "ms", "miss", "dr", "prof", "rev", "pastor", "engr", "chief"];
    const tokens = String(row.teacherName || "").trim().split(/\s+/).filter(Boolean);
    let greetingName = "";
    if (tokens.length > 0) {
      const firstStripped = tokens[0].replace(/\./g, "").toLowerCase();
      const firstIsTitle  = TITLES.includes(firstStripped);
      greetingName = firstIsTitle && tokens.length >= 2
        ? `${tokens[0]} ${tokens[tokens.length - 1]}` // e.g. "Mr Adeyinka"
        : tokens[0];                                  // e.g. "Adeyinka"
    }
    const greeting = greetingName ? `Hi ${greetingName}, ` : "";

    const smsBody  = `${greeting}please mark attendance for ${row.grade} now. If you do not check in today, all students in ${row.grade} will be counted absent. — School Admin`;
    const emailSubject = `Attendance reminder — ${row.grade}`;
    const emailBody    =
      `${greeting}\n\n` +
      `This is a reminder to mark attendance for ${row.grade} now.\n\n` +
      `If you do not check in today, every student in ${row.grade} will be counted absent in our reports for today.\n\n` +
      `Please open the ${BRAND.appName} app and check in for your class.\n\n` +
      `- School Admin`;

    const smsPromise = row.teacherPhone
      ? sendSMS({
          phoneNumbers: [row.teacherPhone],
          message: smsBody,
          messageType: "attendance_reminder",
          senderId: smsSenderId || BRAND.smsSenderId,
        }).then(() => ({ channel: "SMS", ok: true }))
          .catch(e => ({ channel: "SMS", ok: false, error: e?.message || "send failed" }))
      : Promise.resolve({ channel: "SMS", ok: false, skipped: true });

    const emailPromise = row.teacherEmail
      ? sendBulkEmail({
          emails: [row.teacherEmail],
          subject: emailSubject,
          body: emailBody,
        }).then(() => ({ channel: "Email", ok: true }))
          .catch(e => ({ channel: "Email", ok: false, error: e?.message || "send failed" }))
      : Promise.resolve({ channel: "Email", ok: false, skipped: true });

    try {
      const results = await Promise.all([smsPromise, emailPromise]);
      const sent    = results.filter(r => r.ok).map(r => r.channel);
      const failed  = results.filter(r => !r.ok && !r.skipped);
      const teacherLabel = `${row.teacherName || "Teacher"} (${row.grade})`;

      if (sent.length > 0 && failed.length === 0) {
        toast({
          title: "Reminder sent",
          description: `${teacherLabel} — ${sent.join(" + ")} dispatched.`,
        });
      } else if (sent.length > 0 && failed.length > 0) {
        toast({
          title: "Partly sent",
          description: `${teacherLabel} — ${sent.join(" + ")} OK · ${failed.map(f => `${f.channel}: ${f.error}`).join("; ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Could not send reminder",
          description: failed.length > 0
            ? failed.map(f => `${f.channel}: ${f.error}`).join("; ")
            : "No phone or email on file for this teacher.",
          variant: "destructive",
        });
      }
    } finally {
      setSendingFor(prev => {
        const next = new Set(prev);
        next.delete(row.grade);
        return next;
      });
    }
  };

  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Today's attendance check-in
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateInLagos(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB")} · {openedCount}/{ALL_GRADES.length} classes opened
              {lastLoadedAt && (
                <span className="ml-1 text-slate-400">· updated {formatTimeInLagos(lastLoadedAt, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => reload(false)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand attendance check-in" : "Collapse attendance check-in"}
            >
              {collapsed ? "Expand" : "Collapse"}
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardHeader>
      {!collapsed && <CardContent className="space-y-1.5">
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : isWeekend ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-800">School is closed for the weekend.</p>
            <p className="mt-1 text-xs text-slate-500">Attendance check-in will resume on Monday.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.grade}
              className={
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 border " +
                (r.checkedIn
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200")
              }
            >
              <div className="flex items-center gap-2 min-w-0">
                {r.checkedIn
                  ? <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  : <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className={"text-sm font-semibold flex items-center gap-1.5 " + (r.checkedIn ? "text-emerald-900" : "text-red-900")}>
                    <span>{r.grade}</span>
                    {/* YOU pill — admin is also the class teacher of this
                        class, so the check-in is on them personally. */}
                    {r.isYou && (
                      <span className="text-[9px] font-bold uppercase tracking-wide bg-blue-600 text-white px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {r.teacherName
                      ? r.teacherName
                      : r.teacherId
                        ? <span title={r.teacherId}>teacher record missing (id: {String(r.teacherId).slice(0, 8)}…)</span>
                        : <em>no class teacher assigned</em>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className={"text-xs font-semibold " + (r.checkedIn ? "text-emerald-700" : "text-red-700")}>
                  {r.checkedIn ? formatTime(r.checkedInAt) : "Not opened"}
                </div>
                {/* SMS reminder — only meaningful for not-yet-opened classes
                    where we know the teacher's phone. Disabled cleanly in
                    every other case so the icon stays put for visual rhythm. */}
                {!r.checkedIn && (() => {
                  const hasChannel = !!(r.teacherPhone || r.teacherEmail);
                  const channels   = [r.teacherPhone && "SMS", r.teacherEmail && "email"].filter(Boolean).join(" + ");
                  const tooltip =
                    !r.teacherId                ? "No class teacher assigned" :
                    !hasChannel                 ? "Teacher has no phone or email on file" :
                    sendingFor.has(r.grade)     ? "Sending…" :
                    `Send a reminder (${channels}) to ${r.teacherName || "this teacher"}`;
                  return (
                    <button
                      type="button"
                      onClick={() => sendReminder(r)}
                      disabled={!hasChannel || sendingFor.has(r.grade)}
                      title={tooltip}
                      className={
                        "w-8 h-8 rounded-md inline-flex items-center justify-center transition-colors " +
                        (!hasChannel
                          ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                          : "bg-white border border-red-200 text-red-600 hover:bg-red-100 active:bg-red-200")
                      }
                    >
                      {sendingFor.has(r.grade)
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <BellRing className="w-4 h-4" />}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-slate-500">
            {isWeekend
              ? "Attendance is expected on school weekdays only."
              : <>Classes that don't open attendance today are counted as <strong>all absent</strong> in reports.</>}
          </p>
          {!loading && !isWeekend && unassignedCount > 0 && (
            <Link
              to={createPageUrl("Settings")}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Assign class teachers →
            </Link>
          )}
        </div>
      </CardContent>}
    </Card>
  );
}

// ─── Upcoming Birthdays Widget ───────────────────────────────────────────────
// Admin awareness only:
//   1. Shows today + next 7 days of student birthdays.
//   2. Reflects whether today's birthday SMS has already gone out.
function UpcomingBirthdaysWidget({ allStudents }) {
  const { toast } = useToast();
  const today = useMemo(() => getLagosDate(), []);
  const todayISO = useMemo(() => getLagosDateString(today), [today]);

  const [todaysLog, setTodaysLog]     = useState([]); // BirthdaySmsLog rows where sent_date = today
  const [loadingLog, setLoadingLog]   = useState(true);
  // Master kill-switch. Loaded from school_settings.birthday_sms_enabled.
  // When false: cron is a no-op (function bails early) AND the manual Send
  // buttons in this widget are disabled. Use case: admin auditing DOBs.
  const [enabled, setEnabled]         = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [collapsed, setCollapsed]     = useState(true);

  const refreshLog = useCallback(() => {
    setLoadingLog(true);
    return BirthdaySmsLog.filter({ sent_date: todayISO })
      .then((rows) => setTodaysLog(Array.isArray(rows) ? rows : []))
      .catch(() => setTodaysLog([]))
      .finally(() => setLoadingLog(false));
  }, [todayISO]);

  useEffect(() => { refreshLog(); }, [refreshLog]);

  // Sync the local toggle state with the DB on mount.
  useEffect(() => {
    loadSchoolSetting("birthday_sms_enabled", true)
      .then((val) => setEnabled(val !== false));
  }, []);

  const toggleEnabled = async () => {
    if (savingToggle) return;
    const next = !enabled;
    setSavingToggle(true);
    setEnabled(next);
    try {
      await saveSchoolSetting("birthday_sms_enabled", next);
      toast({
        title: next ? "Birthday SMS is ON" : "Birthday SMS is OFF",
        description: next
          ? "Daily 7 AM auto-send is back on."
          : "The daily cron is paused. Toggle it on again when you're done auditing DOBs.",
      });
    } catch (e) {
      setEnabled(!next);
      toast({ title: "Could not save toggle", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSavingToggle(false);
    }
  };

  const { todays, upcoming } = useMemo(
    () => findBirthdays({ students: allStudents || [], today, upcomingDays: 7 }),
    [allStudents, today]
  );

  const sentStudentIds = useMemo(
    () => new Set(todaysLog.filter((r) => r.status === "sent").map((r) => r.student_id)),
    [todaysLog]
  );

  const hasTodays   = todays.length > 0;
  const hasUpcoming = upcoming.length > 0;

  if (!hasTodays && !hasUpcoming) {
    return null; // No birthdays this week — widget hides itself.
  }

  const fmtAge = (a) => (a == null ? "" : ` · turns ${a}`);

  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-600" />
              Upcoming birthdays
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateInLagos(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB")}
              {hasTodays && (
                <span className="ml-1 text-pink-700 font-medium">
                  · {todays.length} today
                </span>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand upcoming birthdays" : "Collapse upcoming birthdays"}
            >
              {collapsed ? "Expand" : "Collapse"}
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardHeader>
      {!collapsed && <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-slate-800">Automatic birthday SMS</p>
            <p className="text-[11px] text-slate-500">Controls the daily 7:00 AM birthday message.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={toggleEnabled}
            disabled={savingToggle}
            title={enabled ? "Birthday SMS is ON" : "Birthday SMS is OFF"}
            className={
              "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors " +
              (enabled ? "bg-pink-600" : "bg-slate-300") +
              (savingToggle ? " opacity-60 cursor-wait" : " cursor-pointer")
            }
          >
            <span
              className={
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
                (enabled ? "translate-x-5" : "translate-x-0.5")
              }
            />
          </button>
        </div>

        {/* OFF banner — keeps the kill-switch state impossible to miss. */}
        {!enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Birthday SMS is currently OFF.</strong> The daily 7 AM auto-send is paused. Turn it back on at the top right when you've finished verifying student dates of birth.
          </div>
        )}

        {hasTodays && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Today</p>
            {todays.map((entry) => {
              const s = entry.student;
              const alreadySent = sentStudentIds.has(s.id);
              const noPhone     = !s.parent_phone;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 border bg-pink-50 border-pink-200"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-pink-900 truncate">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {s.grade || "—"}{fmtAge(entry.age)}
                      {s.parent_phone && <span className="ml-1 text-slate-400">· {s.parent_phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {alreadySent ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle className="w-4 h-4" /> Sent
                      </span>
                    ) : noPhone ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                        No phone
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        Pending auto-send
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasUpcoming && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Coming up (next 7 days)</p>
            {upcoming.map((entry) => {
              const s = entry.student;
              return (
                <div
                  key={`${s.id}-${entry.mmdd}`}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-slate-700 font-medium">{s.first_name} {s.last_name}</span>
                    <span className="text-slate-400"> · {s.grade || "—"}{fmtAge(entry.age)}</span>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{entry.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {hasTodays && (
          <p className="text-[11px] text-slate-500 pt-1">
            Birthday SMS is sent automatically at 7:00 AM. This widget now only shows delivery status and upcoming birthdays.
          </p>
        )}
      </CardContent>}
    </Card>
  );
}

// ─── Quick-action buttons with self-contained open/close state ───────────────
// Keeping open/close state here (not in AdminDashboard) means clicking these
// buttons only re-renders this tiny component — not the entire dashboard tree.
function QuickPayButton({ students, user }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30 flex items-center gap-2 sm:w-auto"
      >
        <Zap className="w-4 h-4" />
        Quick Payment
      </Button>
      {open && (
        <QuickPayStudentPicker
          students={students}
          defaultTerm={user?.current_term}
          defaultYear={user?.current_academic_year}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EnrollButton({ user }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full justify-center bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/30 flex items-center gap-2 sm:w-auto"
      >
        <UserPlus className="w-4 h-4" />
        Student Enrollment
      </Button>
      {open && (
        <QuickEnrollmentModal
          currentUser={user}
          isSuperAdminUser={user?.school_role === "super_admin"}
          onClose={() => setOpen(false)}
          onEnrolled={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AdminDashboard({ user, data, onRefresh }) {
  const { students, payments, classFees = [] } = data;
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();
  const [allCalendarEvents, setAllCalendarEvents] = useState([]);
  const [upcomingCalEvents, setUpcomingCalEvents] = useState([]);
  const [approvalRequests,  setApprovalRequests]  = useState([]);
  const [loadingApprovals,  setLoadingApprovals]  = useState(false);
  const [discounts,         setDiscounts]         = useState({});
  const [studentStartTerms, setStudentStartTerms] = useState({});

  useEffect(() => {
    SchoolCalendarEvent.list("-event_date")
      .then(all => {
        const today = getLagosDateString();
        setAllCalendarEvents(all || []);
        const upcoming = getUpcomingCalendarEvents(all, schoolYear, today).slice(0, 5);
        setUpcomingCalEvents(upcoming);
      })
      .catch((err) => console.error("Calendar events load failed:", err));
  }, [schoolYear]);

  useEffect(() => {
    if (!canApproveChanges(user)) return;
    setLoadingApprovals(true);
    listPendingApprovalRequests()
      .then((requests) => setApprovalRequests(requests))
      .catch(() => setApprovalRequests([]))
      .finally(() => setLoadingApprovals(false));
  }, [user]);

  useEffect(() => {
    let active = true;
    loadPaymentDiscounts()
      .then((data) => {
        if (active) setDiscounts(data || {});
      })
      .catch((err) => console.error("Payment discounts load failed:", err));
    loadStudentStartTerms()
      .then((data) => {
        if (active) setStudentStartTerms(data || {});
      })
      .catch((err) => console.error("Student start terms load failed:", err));

    return () => {
      active = false;
    };
  }, []);

  const activeStudents = students.filter(s => s.enrollment_status === "active");

  // Total Revenue = paid + partial (partial = real money received)
  // True outstanding balance = total fees per student − what they've paid/partially paid
  // Uses the admin's current term/year if set, otherwise all-time
  const currentTerm = schoolTerm || user?.current_term;
  const currentYear = schoolYear || user?.current_academic_year;
  const termActiveStudents = activeStudents.filter((student) =>
    isStudentActiveForTerm(student, currentTerm, currentYear, studentStartTerms)
  );
  const todaySchoolStatus = getSchoolDayStatus(getLagosDateString(), allCalendarEvents, currentTerm, currentYear);

  const handleApproveRequest = async (request) => {
    await approveRequest(request, user);
    const refreshed = await listPendingApprovalRequests().catch(() => []);
    setApprovalRequests(refreshed);
    await onRefresh?.();
  };

  const handleRejectRequest = async (request) => {
    await rejectRequest(request, user);
    const refreshed = await listPendingApprovalRequests().catch(() => []);
    setApprovalRequests(refreshed);
  };
  const termPayments = currentTerm && currentYear
    ? payments.filter(p => p.term === currentTerm && p.academic_year === currentYear)
    : payments;

  const pendingAmount = termActiveStudents.reduce((total, student) => {
    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees,
      term: currentTerm,
      academicYear: currentYear,
      discountPct: getPaymentDiscountPct(discounts, student.id, currentTerm, currentYear),
    });
    const totalFees = Number(feeSnapshot.totalWithoutArrears || 0) + getStudentArrearsTotal({
      student,
      payments,
      term: currentTerm,
      academicYear: currentYear,
      startTermRecords: studentStartTerms,
    });
    if (totalFees <= 0) return total;
    const paid = termPayments
      .filter(p => p.student_id === student.id &&
                   (p.payment_status === "paid" || p.payment_status === "partial"))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return total + Math.max(0, totalFees - paid);
  }, 0);

  // Fee collection progress ring
  const totalExpected = termActiveStudents.reduce((sum, student) => {
    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees,
      term: currentTerm,
      academicYear: currentYear,
      discountPct: getPaymentDiscountPct(discounts, student.id, currentTerm, currentYear),
    });
    return sum + feeSnapshot.totalWithoutArrears;
  }, 0);

  // Exclude manual opening-balance entries (tagged [opening_paid_before_app]) to match
  // the Payments page analytics which also excludes these from the "collected" figure.
  const termCollected = termPayments
    .filter(p =>
      (p.payment_status === "paid" || p.payment_status === "partial") &&
      !p.notes?.includes("[opening_paid_before_app]")
    )
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const collectionPct = totalExpected > 0 ? Math.round((termCollected / totalExpected) * 100) : 0;
  const defaulterCount = termActiveStudents.filter((student) => {
    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees,
      term: currentTerm,
      academicYear: currentYear,
      discountPct: getPaymentDiscountPct(discounts, student.id, currentTerm, currentYear),
    });
    const totalFees = Number(feeSnapshot.totalWithoutArrears || 0) + getStudentArrearsTotal({
      student,
      payments,
      term: currentTerm,
      academicYear: currentYear,
      startTermRecords: studentStartTerms,
    });
    if (totalFees <= 0) return false;
    const paid = termPayments
      .filter(p => p.student_id === student.id &&
                   (p.payment_status === "paid" || p.payment_status === "partial"))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return paid < totalFees;
  }).length;

  const topDefaulters = buildStudentBalanceRows({
      students: termActiveStudents,
      payments: termPayments,
      classFees,
      term: currentTerm,
      academicYear: currentYear,
      discounts,
      startTermRecords: studentStartTerms,
    })
    .map((row) => ({
      student: row.student,
      expected: row.totalFees,
      paid: row.totalPaid,
      balance: row.balance,
    }))
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // Payment trend — last 7 days (paid + partial = actual money collected)
  const trendData = Array.from({ length: 7 }).map((_, i) => {
      const d = getLagosDate();
      d.setDate(d.getDate() - (6 - i));
      const label = formatDateInLagos(d, { month: "short", day: "numeric" }, "en-US");
    const amount = payments
      .filter(p => {
        // Append T12:00:00 so date-only strings (e.g. "2026-03-21") are
        // parsed as local noon instead of UTC midnight, which would shift
        // the date back by 1 day in UTC+ timezones like Nigeria (UTC+1).
        const rawDate = p.payment_date || "";
        const pd = formatDateInLagos(
          rawDate.includes("T") ? rawDate : rawDate + "T12:00:00",
          { month: "short", day: "numeric" },
          "en-US"
        );
        return pd === label && (p.payment_status === "paid" || p.payment_status === "partial");
      })
      .reduce((s, p) => s + (p.amount || 0), 0);
    return { date: label, amount };
  });

  // Grade distribution
  const gradeData = students.reduce((acc, s) => {
    const ex = acc.find(g => g.grade === s.grade);
    if (ex) ex.count++;
    else acc.push({ grade: s.grade, count: 1 });
    return acc;
  }, []);

  // Recently enrolled
  const recentStudents = [...activeStudents]
    .sort((a, b) => new Date(b.enrollment_date || b.created_date || 0) - new Date(a.enrollment_date || a.created_date || 0))
    .slice(0, 6);
  const todayLabel = formatDateInLagos(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB");
  const nextCalendarEvent = upcomingCalEvents[0] || null;
  const canReviewChanges = canApproveChanges(user);
  const reviewHint = canReviewChanges
    ? approvalRequests.length > 0
      ? `${approvalRequests.length} item${approvalRequests.length === 1 ? "" : "s"} waiting on superadmin`
      : "No pending reviews right now"
    : "Superadmin handles approval review";
  const trendWindowLabel = trendData.length > 1 ? `${trendData[0].date} to ${trendData[trendData.length - 1].date}` : "Last 7 days";

  return (
    <PageShell maxWidth="7xl">
      <PageSection>

        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="grid xl:grid-cols-[1.55fr,0.95fr]">
              <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.06),_transparent_26%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-5 sm:px-6 md:px-7 xl:border-b-0 xl:border-r">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Executive Dashboard</p>
                      <h1 className="mt-3 text-[2rem] font-bold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">Dashboard</h1>
                      <p className="mt-2 text-sm text-slate-500">{todayLabel}</p>
                      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                        A clear view of school operations, collections, and the items that need follow-up.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <QuickPayButton students={students} user={user} />
                      <EnrollButton user={user} />
                      <Link
                        to={createPageUrl("Payments")}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors sm:w-auto"
                      >
                        Open Payments
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">School Today</p>
                          <p className="mt-3 text-2xl font-bold text-slate-950">{todaySchoolStatus.closed ? "Closed" : "Open"}</p>
                          <p className="mt-1 text-sm text-slate-500">{todaySchoolStatus.reason || "Normal school day"}</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <Calendar className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Term</p>
                          <p className="mt-3 text-2xl font-bold text-slate-950">{currentTerm || "Not set"}</p>
                          <p className="mt-1 text-sm text-slate-500">{currentYear || "Academic year not set"}</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                          <BookOpen className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next Calendar Date</p>
                          <p className="mt-3 text-xl font-bold leading-tight text-slate-950">
                            {nextCalendarEvent?.title || "Nothing scheduled"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {nextCalendarEvent?.event_date
                              ? formatDateInLagos(`${nextCalendarEvent.event_date}T12:00:00`, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, "en-GB")
                              : "No upcoming event"}
                          </p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <Calendar className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <DailyMotivationQuote role={user?.school_role} />
                </div>
              </div>

              <div className="bg-slate-50/70 px-4 py-5 sm:px-6 md:px-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Operations Snapshot</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">Collection Rate</p>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{collectionPct}%</p>
                        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700"
                            style={{ width: `${Math.min(collectionPct, 100)}%` }} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Of expected fees for {currentTerm || "this term"}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                        {fmtMoney(termCollected)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Pending Reviews</p>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{approvalRequests.length}</p>
                        <p className="mt-1 text-sm text-slate-500">{reviewHint}</p>
                      </div>
                      <Link
                        to={createPageUrl("Payments")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                      >
                        Open →
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900">What matters now</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-semibold">
                        {activeStudents.length} active students
                      </span>
                      <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 text-xs font-semibold">
                        {defaulterCount} students owing
                      </span>
                      <span className="rounded-full bg-red-100 text-red-700 border border-red-200 px-3 py-1 text-xs font-semibold">
                        {fmtMoney(pendingAmount)} outstanding
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardMetricCard
            label="Active Students"
            value={activeStudents.length}
            hint={`${students.length} enrolled records`}
            icon={Users}
            tone="blue"
          />
          <DashboardMetricCard
            label="Collected This Term"
            value={fmtMoney(termCollected)}
            hint={`Across ${termPayments.filter(p => p.payment_status === "paid" || p.payment_status === "partial").length} payment records`}
            icon={DollarSign}
            tone="emerald"
          />
          <DashboardMetricCard
            label="Outstanding Fees"
            value={fmtMoney(pendingAmount)}
            hint={`${defaulterCount} students still owe`}
            icon={AlertTriangle}
            tone="amber"
          />
          <DashboardMetricCard
            label="Collection Rate"
            value={`${collectionPct}%`}
            hint={currentTerm ? `${currentTerm} ${currentYear || ""}`.trim() : "Current fee cycle"}
            icon={CheckCircle}
            tone="violet"
          />
        </div>

        <TodayCheckInWidget />

        <UpcomingBirthdaysWidget allStudents={students} />

        <div className="grid xl:grid-cols-[1.6fr,0.95fr] gap-5">
          <Card className="border border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Fee Collection Trend</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">{trendWindowLabel}</p>
                </div>
                <Link to={createPageUrl("Payments")} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  Payments
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                  <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                  <Line type="monotone" dataKey="amount" stroke="#059669" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{currentTerm || "Current term"}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{collectionPct}% collection rate</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{fmtMoney(termCollected)} collected</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Needs Attention</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Largest outstanding balances to follow up</p>
                </div>
                <Link
                  to={createPageUrl("Payments")}
                  onClick={() => {
                    try {
                      sessionStorage.setItem("payments_view_mode", "balance");
                    } catch {}
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Balances
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {topDefaulters.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-emerald-800">No urgent payment follow-up</p>
                  <p className="mt-1 text-xs text-emerald-700">Everyone expected for this term is fully paid.</p>
                </div>
              ) : (
                topDefaulters.map(({ student, balance, expected, paid }) => (
                  <div key={student.id} className="rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white transition-colors px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{student.first_name} {student.last_name}</p>
                        <p className="text-xs text-slate-500 mt-1">{student.grade} · Paid {fmtAmount(paid)} of {fmtAmount(expected)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-red-600">{fmtAmount(balance)}</p>
                        <p className="text-[11px] text-slate-400">left</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.6fr,0.95fr] items-stretch">
          <Card className="border border-slate-200 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Students by Class</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Active student distribution across classes</p>
                </div>
                <Link to={createPageUrl("Students")} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Students
                </Link>
              </div>
            </CardHeader>
              <CardContent className="pb-5">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={gradeData} margin={{ bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="grade" angle={-35} textAnchor="end" tick={{ fontSize: 10 }} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                  <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="h-full">
            <Card className="border border-slate-200 h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-blue-500" />
                      Recently Enrolled
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-500">Latest student additions to the school</p>
                  </div>
                  <Link to={createPageUrl("Students")} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                    Students
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentStudents.length === 0 ? (
                  <div className="text-center text-slate-400 py-8 text-sm">No recent enrollments</div>
                ) : (
                  recentStudents.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{s.first_name?.[0]}{s.last_name?.[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-slate-500">{s.grade}</p>
                      </div>
                      {s.enrollment_date && (
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {format(new Date(s.enrollment_date + "T12:00:00"), "d MMM")}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <ApprovalQueueCard
          requests={approvalRequests}
          user={user}
          onApprove={handleApproveRequest}
          onReject={handleRejectRequest}
          loading={loadingApprovals}
        />

      </PageSection>
    </PageShell>
  );
}

// ─── Weekly Scheme Card ───────────────────────────────────────────────────────
function weeksBetween(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(`${startDateStr}T12:00:00`);
  const end   = new Date(`${endDateStr}T12:00:00`);
  const days  = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(days / 7));
}

function calcWeekFromTermStart(termStartDateStr) {
  if (!termStartDateStr) return 1;
  const start    = new Date(`${termStartDateStr}T12:00:00`);
  const todayStr = getLagosDateString();
  const today    = new Date(`${todayStr}T12:00:00`);
  const days     = Math.round((today - start) / (1000 * 60 * 60 * 24));
  if (days < 0) return 1;
  return Math.max(1, Math.floor(days / 7) + 1);
}

function findTermBounds(calendarEvents, term, year) {
  const todayStr = getLagosDateString();
  // Try exact match (term + year) first; fall back to term-name only
  if (year) {
    const { termStart, termEnd } = getScopedTermWindow(calendarEvents, term, year);
    if (termStart?.event_date) return { startDate: termStart.event_date, endDate: termEnd?.event_date || null };
  }
  // Fallback: find most-recent past term_start matching the term name
  const starts = calendarEvents
    .filter(e => hasCalendarType(e, "term_start") && matchesCalendarValue(e.term, term) && e.event_date <= todayStr)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const startEvent = starts[0];
  if (!startEvent) {
    // Final fallback: ignore term name entirely — use the most-recent past term_start
    const anyStart = calendarEvents
      .filter(e => hasCalendarType(e, "term_start") && e.event_date <= todayStr)
      .sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
    if (!anyStart) return { startDate: null, endDate: null };
    const anyEnd = calendarEvents
      .filter(e => hasCalendarType(e, "term_end") && e.event_date >= anyStart.event_date)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
    return { startDate: anyStart.event_date, endDate: anyEnd?.event_date || null };
  }
  // Find a matching term_end with the same term (and academic_year if stored)
  const endEvent = calendarEvents
    .filter(e =>
      hasCalendarType(e, "term_end") &&
      matchesCalendarValue(e.term, term) &&
      (!startEvent.academic_year || matchesCalendarValue(e.academic_year, startEvent.academic_year)) &&
      e.event_date >= startEvent.event_date
    )
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  return { startDate: startEvent.event_date, endDate: endEvent?.event_date || null };
}

function WeeklySchemeCard({ user, term, year, teacherIdOverride }) {
  const [pairs,    setPairs]    = useState([]);
  const [schemes,  setSchemes]  = useState({});
  const [weekNum,  setWeekNum]  = useState(1);
  const [maxWeek,  setMaxWeek]  = useState(null); // null = unknown (no end date)
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!term) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [allAssignments, calendarEvents] = await Promise.all([
          ClassAssignment.list().catch(() => []),
          SchoolCalendarEvent.list().catch(() => []),
        ]);

        // Derive current week and term length from school calendar
        const { startDate, endDate } = findTermBounds(calendarEvents, term, year);
        const currentWeek = calcWeekFromTermStart(startDate);
        const termWeeks   = weeksBetween(startDate, endDate);
        if (!cancelled) {
          setWeekNum(currentWeek);
          setMaxWeek(termWeeks);
        }

        // Load this teacher's class/subject assignments
        const teacherId = teacherIdOverride || user?.linked_teacher_id;
        const mine = teacherId
          ? allAssignments.filter(a => a.subject_teacher_id === teacherId && a.subject && a.grade)
          : [];
        const seen = new Set();
        const uniquePairs = mine.filter(a => {
          const k = `${a.grade}|${a.subject}`;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        }).map(a => ({ grade: a.grade, subject: a.subject }));

        if (cancelled) return;
        setPairs(uniquePairs);

        const map = {};
        await Promise.all(uniquePairs.map(async ({ grade, subject }) => {
          const res = await SchemeOfWork.filter({ grade, subject, term }).catch(() => []);
          if (res[0]?.weeks?.length) map[`${grade}|${subject}`] = res[0].weeks;
        }));
        if (!cancelled) setSchemes(map);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [teacherIdOverride, user?.linked_teacher_id, term, year]);

  const getWeekEntry = (grade, subject) => {
    const weeks = schemes[`${grade}|${subject}`] || [];
    return weeks.find(w => {
      const n = String(w.week_number || "").trim();
      if (n === String(weekNum)) return true;
      if (n.includes("-")) {
        const [s, e] = n.split("-").map(Number);
        return weekNum >= s && weekNum <= e;
      }
      return false;
    }) || null;
  };

  const hasSomeScheme = Object.keys(schemes).length > 0;

  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-500" />
            Weekly Schedule
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekNum(w => Math.max(1, w - 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
              disabled={weekNum <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-700 min-w-[60px] text-center">Week {weekNum}</span>
            <button
              onClick={() => setWeekNum(w => maxWeek ? Math.min(maxWeek, w + 1) : w + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
              disabled={maxWeek !== null && weekNum >= maxWeek}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {term && <p className="text-xs text-slate-400 mt-0.5">{term}</p>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading schemes…
          </div>
        ) : pairs.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No class assignments found</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pairs.map(({ grade, subject }) => {
              const entry = getWeekEntry(grade, subject);
              return (
                <div key={`${grade}|${subject}`} className={`rounded-xl border px-4 py-3 ${entry ? "border-indigo-100 bg-indigo-50/50" : "border-slate-100 bg-slate-50"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-indigo-700 text-center leading-tight">{grade.replace(" ", "\n")}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">{subject}</p>
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{grade}</span>
                      </div>
                      {entry ? (
                        <>
                          <p className="text-sm font-medium text-indigo-800 mt-0.5">{entry.topic}</p>
                          {entry.content && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.content}</p>}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5 italic">
                          {hasSomeScheme || schemes[`${grade}|${subject}`] !== undefined
                            ? "No topic for this week"
                            : "Scheme not uploaded yet"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && hasSomeScheme && (
          <Link to={createPageUrl("SchemeOfWork")} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            View full scheme <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Teacher Dashboard ────────────────────────────────────────────────────────
function TeacherDashboard({ user, data, previewTeacherId }) {
  const { students, attendance, myTeacher } = data;
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();

  const myStudents    = students.filter(s => s.enrollment_status === "active");
  const totalMarked   = attendance.length;
  const presentCount  = attendance.filter(a => a.status === "present").length;
  const attendanceRate = totalMarked > 0 ? ((presentCount / totalMarked) * 100).toFixed(1) : "—";

  const handleExitPreview = () => {
    sessionStorage.removeItem('previewRole');
    sessionStorage.removeItem('preview_teacher_id');
    window.location.href = createPageUrl('Teachers');
  };

  const displayName = previewTeacherId
    ? `${myTeacher?.first_name || ""} ${myTeacher?.last_name || ""}`.trim() || "Teacher"
    : user?.full_name || "Teacher";

  return (
    <PageShell maxWidth="5xl">
      <PageSection>

        {/* Preview banner */}
        {previewTeacherId && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-indigo-600 text-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="opacity-75">Previewing as</span>
              <span className="font-bold">{displayName}</span>
            </div>
            <button
              onClick={handleExitPreview}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              <X className="w-3.5 h-3.5" /> Exit Preview
            </button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Welcome, {displayName}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{formatDateInLagos(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, "en-GB")}</p>
        </div>
        <DailyMotivationQuote role="teacher" />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label="My Students"
            value={myStudents.length}
            icon={Users}
            color="blue"
            subValue={myTeacher?.classes_assigned?.join(", ") || "your classes"}
          />
          <StatCard
            label="Attendance Rate"
            value={attendanceRate === "—" ? "—" : `${attendanceRate}%`}
            icon={CheckCircle}
            color="emerald"
            subValue={`${presentCount} present of ${totalMarked} records`}
          />
        </div>

        {/* Weekly Schedule + Quick links */}
        <div className="grid lg:grid-cols-2 gap-5">
          <WeeklySchemeCard user={user} term={schoolTerm} year={schoolYear} teacherIdOverride={previewTeacherId} />

          {/* Quick links */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Take Attendance",  sub: "Mark student attendance",  to: "Attendance",      color: "bg-blue-50 hover:bg-blue-100" },
                { label: "Record Grades",    sub: "Update exam results",       to: "AcademicRecords", color: "bg-emerald-50 hover:bg-emerald-100" },
                { label: "Manage CBT Tests", sub: "Create and grade quizzes",  to: "CBT",             color: "bg-emerald-50 hover:bg-emerald-100" },
              ].map(({ label, sub, to, color }) => (
                <Link key={to} to={createPageUrl(to)} className={`flex items-center justify-between p-3 rounded-lg transition ${color}`}>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{label}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </div>
                  <span className="text-slate-400 text-sm">→</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

      </PageSection>
    </PageShell>
  );
}
