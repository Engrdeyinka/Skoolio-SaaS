import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Student, Attendance, AttendanceCheckIn, ClassAssignment, Teacher } from "@/entities/all";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/lib/AuthContext";
import { sendSMS } from "@/functions/sendSMS";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronLeft, ChevronRight, Users, Download, Loader2, BarChart2, TableProperties, MessageSquare, Settings2, ChevronDown, ChevronUp, CalendarX2, Trash2, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, addDays, startOfWeek } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { getSchoolDayStatus, getScopedTermWindow, listSchoolDaysForTerm } from "@/lib/schoolCalendar";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";
import { logChange } from "@/lib/changeHistory";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";
import { getLagosDateString } from "@/lib/timezone";

// â"€â"€â"€ SMS Template â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const SMS_TEMPLATE_KEY = "attendance_absent_sms_template";
const LEGACY_DEFAULT_SMS_TEMPLATE =
  "Dear Parent/Guardian, this is to inform you that {{name}} ({{grade}}) was absent from school today, {{date}}. Please contact the school if you have any concerns. — TOPS";
const DEFAULT_SMS_TEMPLATE =
  "Parent, {{name}} ({{grade}}) was absent today, {{date}}. Contact {{school}} if needed.";

function loadSmsTemplateFromCache() {
  try { return localStorage.getItem(SMS_TEMPLATE_KEY) || DEFAULT_SMS_TEMPLATE; } catch { return DEFAULT_SMS_TEMPLATE; }
}
async function saveSmsTemplate(tpl) {
  try { localStorage.setItem(SMS_TEMPLATE_KEY, tpl); } catch {}
  await saveSchoolSetting("attendance_sms_template", tpl);
}
function resolveAbsenceTpl(tpl, { name, grade, date, school }) {
  return tpl
    .replace(/{{name}}/g, name)
    .replace(/{{grade}}/g, grade)
    .replace(/{{date}}/g, date)
    .replace(/{{school}}/g, school || BRAND.shortCode);
}

// â"€â"€â"€ Constants â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const GRADES = [
  "JSS 1","JSS 2","JSS 3","SSS 1","SSS 2","SSS 3",
];
const TERMS = ["First Term","Second Term","Third Term"];
const YEARS = ["2023/2024","2024/2025","2025/2026","2026/2027"];
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri"];

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function getMondayOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return startOfWeek(d, { weekStartsOn: 1 });
}

function weekDatesFrom(monday) {
  return Array.from({ length: 5 }, (_, i) =>
    format(addDays(monday, i), "yyyy-MM-dd")
  );
}

function todayStr() {
  return getLagosDateString();
}

function exportCsv(students, weekDates, attendanceMap, grade) {
  const header = ["#", "Student Name", ...weekDates.map((d, i) => `${DAY_LABELS[i]} ${d}`), "Present", "Absent"];
  const rows = students.map((s, idx) => {
    const days = weekDates.map(d => attendanceMap[s.id]?.[d]?.status || "");
    const presentCount = days.filter(d => d === "present").length;
    const absentCount  = days.filter(d => d === "absent").length;
    return [idx + 1, `${s.first_name} ${s.last_name}`, ...days, presentCount, absentCount];
  });
  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `attendance-${grade}-${weekDates[0]}.csv`;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(url); a.remove();
}

// â"€â"€â"€ Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function AttendancePage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear, smsSenderId } = useSchoolSettings();

  const isTeacher = currentUser?.school_role === "teacher";

  // Teacher-specific state
  const [teacherClasses, setTeacherClasses] = useState([]); // classes this teacher owns

  const [selectedGrade, setSelectedGrade] = usePersistentState("attendance_grade", "JSS 1");
  const [term,          setTerm]          = usePersistentState("attendance_term", schoolTerm || "Second Term");
  const [academicYear,  setAcademicYear]  = usePersistentState("attendance_year", schoolYear || "2025/2026");
  const [weekMonday,    setWeekMonday]    = useState(() => getMondayOf(todayStr()));

  const [students,        setStudents]        = useState([]);
  const [attendanceMap,   setAttendanceMap]   = useState({});
  const [calendarEvents,  setCalendarEvents]  = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingWeek,     setLoadingWeek]     = useState(false);
  const [savingKeys,      setSavingKeys]      = useState(new Set());
  const [viewMode,        setViewMode]        = usePersistentState("attendance_view_mode", "weekly"); // "weekly" | "summary"
  const [termSummary,     setTermSummary]     = useState([]);
  const [loadingSummary,  setLoadingSummary]  = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // â"€â"€â"€ Check-in gate state (raw setters here; derived values defined further
  // down once `dayClosureMap` is in scope) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Map of attendance_date (yyyy-mm-dd) ->’ check-in row (or undefined).
  // We populate it for the visible week alongside loadWeekAttendance().
  // If the current user is the class teacher of selectedGrade and TODAY's date
  // has no check-in row yet, the grid is hidden behind a "Tap to mark
  // attendance" gate. Reports + dashboard count every student in a class with
  // no check-in for a school day as ABSENT regardless of any other state.
  const [weekCheckIns, setWeekCheckIns] = useState({}); // { [date]: row }
  const [checkingIn,   setCheckingIn]   = useState(false);
  // class_assignments is the source of truth for who the class teacher of
  // each grade is. We resolve "is this user the class teacher of the selected
  // grade" against this table directly so the gate works even when the
  // denormalised teacher.classes_assigned array is missing / out of sync.
  const [allClassAssignments, setAllClassAssignments] = useState([]);

  // SMS confirmation dialog state
  const [smsDialog, setSmsDialog] = useState(null); // { studentName, phone, message } | null
  const [sendingSms, setSendingSms] = useState(false);
  const [editedMessage, setEditedMessage] = useState(""); // editable copy in dialog
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [rawTemplate, setRawTemplate] = useState(loadSmsTemplateFromCache);
  const [templateSaved, setTemplateSaved] = useState(false);

  // Sync SMS template from DB on mount
  useEffect(() => {
    loadSchoolSetting("attendance_sms_template").then(tpl => {
      if (tpl && typeof tpl === "string") {
        const normalizedTemplate = tpl === LEGACY_DEFAULT_SMS_TEMPLATE ? DEFAULT_SMS_TEMPLATE : tpl;
        setRawTemplate(normalizedTemplate);
        try { localStorage.setItem(SMS_TEMPLATE_KEY, normalizedTemplate); } catch {}
        if (normalizedTemplate !== tpl) {
          saveSchoolSetting("attendance_sms_template", normalizedTemplate).catch(() => {});
        }
      }
    });
  }, []);

  const weekDates = useMemo(() => weekDatesFrom(weekMonday), [weekMonday]);
  const isCurrentWeek = useMemo(() => weekDates.includes(todayStr()), [weekDates]);
  const { termStart: termStartEvent, termEnd: termEndEvent } = useMemo(
    () => getScopedTermWindow(calendarEvents, term, academicYear),
    [calendarEvents, academicYear, term]
  );
  const dayClosureMap = useMemo(() => {
    const map = {};
    weekDates.forEach((date) => {
      map[date] = getSchoolDayStatus(date, calendarEvents, term, academicYear);
    });
    return map;
  }, [weekDates, calendarEvents, term, academicYear]);
  const weekHasSchoolDay = weekDates.some((date) => !dayClosureMap[date]?.closed);
  const todayClosure = dayClosureMap[todayStr()]?.closed ? dayClosureMap[todayStr()] : null;

  // Derived check-in gate values (must come AFTER dayClosureMap is in scope -
  // otherwise reading dayClosureMap[todayDate] in module-eval order throws a
  // temporal-dead-zone error and the whole Attendance page renders blank).
  const todayDate = todayStr();

  // All grades for which the current user is recorded as the CLASS teacher in
  // class_assignments. The same two-tier match used for the gate:
  //   1. Canonical row: teacher_id matches AND no subject set.
  //   2. Fallback row : teacher_id matches even if subject is also set
  //                     (catches legacy data shapes).
  // This list - not teacher.classes_assigned - drives both the grade dropdown
  // restriction and the access-control message for teachers with no class.
  const myClassTeacherGrades = useMemo(() => {
    const myTeacherId = currentUser?.linked_teacher_id;
    if (!myTeacherId) return [];
    const canonical = new Set();
    const fallback  = new Set();
    for (const a of allClassAssignments) {
      if (a?.teacher_id !== myTeacherId || !a?.grade) continue;
      const hasSubject = !!(a.subject && String(a.subject).trim().length > 0);
      if (!hasSubject) canonical.add(a.grade);
      else             fallback.add(a.grade);
    }
    return Array.from(canonical.size > 0 ? canonical : fallback);
  }, [allClassAssignments, currentUser?.linked_teacher_id]);

  const isClassTeacherForSelected = myClassTeacherGrades.includes(selectedGrade);

  // Teachers (non-admin) who have NO class teacher assignment at all must NOT
  // be able to mark attendance for any class. We surface this clearly instead
  // of letting them stumble into a grid they can't legitimately use.
  const teacherWithoutClass = isTeacher && myClassTeacherGrades.length === 0;

  const todayIsSchoolDay = !dayClosureMap[todayDate]?.closed;
  const todayCheckIn     = weekCheckIns[todayDate] || null;
  const showCheckInGate  = isClassTeacherForSelected && todayIsSchoolDay && !todayCheckIn;

  // Load teacher's assigned classes and lock grade selector
  useEffect(() => { if (schoolTerm) setTerm(schoolTerm); }, [schoolTerm]);
  useEffect(() => { if (schoolYear) setAcademicYear(schoolYear); }, [schoolYear]);

  useEffect(() => {
    if (!isTeacher || !currentUser?.linked_teacher_id) return;
    Teacher.get(currentUser.linked_teacher_id)
      .then(teacher => {
        if (teacher) {
          const classes = teacher.classes_assigned || [];
          setTeacherClasses(classes);
          if (classes.length > 0) {
            setSelectedGrade(classes[0]); // auto-select first assigned class
          }
        }
      })
      .catch(() => {
        toast({ title: "Could not load class assignments", description: "Your assigned classes could not be fetched. Contact the admin.", variant: "destructive" });
      });
  }, [isTeacher, currentUser?.linked_teacher_id]);

  useEffect(() => {
    SchoolCalendarEvent.list("-event_date")
      .then((events) => setCalendarEvents(Array.isArray(events) ? events : []))
      .catch(() => setCalendarEvents([]));
  }, [academicYear]);

  // Class assignments - fetched once on mount and used to decide whether the
  // current user is the class teacher of the selected grade (gate check).
  useEffect(() => {
    ClassAssignment.list()
      .then((rows) => setAllClassAssignments(Array.isArray(rows) ? rows : []))
      .catch(() => setAllClassAssignments([]));
  }, []);

  // For teachers: if the persisted selectedGrade is one they're NOT the class
  // teacher of (e.g. left over from another user on the same device, or a
  // class they used to teach), snap them onto their first real class. Admins
  // are unaffected.
  useEffect(() => {
    if (!isTeacher) return;
    if (myClassTeacherGrades.length === 0) return;
    if (!myClassTeacherGrades.includes(selectedGrade)) {
      setSelectedGrade(myClassTeacherGrades[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, myClassTeacherGrades.join("|")]);

  // Load students
  useEffect(() => {
    (async () => {
      setLoadingStudents(true);
      try {
        const data = await Student.filter({ grade: selectedGrade, enrollment_status: "active" });
        setStudents(data.sort((a, b) => a.last_name.localeCompare(b.last_name)));
      } catch (e) {
        console.error(e);
      }
      setLoadingStudents(false);
    })();
  }, [selectedGrade]);

  // Load week attendance - 5 parallel queries, one per day
  const loadWeekAttendance = useCallback(async () => {
    setLoadingWeek(true);
    try {
      const [absenceResults, checkInResults] = await Promise.all([
        Promise.all(weekDates.map(date => Attendance.filter({ grade: selectedGrade, attendance_date: date }))),
        Promise.all(weekDates.map(date => AttendanceCheckIn.filter({ grade: selectedGrade, attendance_date: date }))),
      ]);
      const map = {};
      absenceResults.forEach((dayRecords, i) => {
        const date = weekDates[i];
        if (dayClosureMap[date]?.closed) return;
        dayRecords.forEach(rec => {
          if (!map[rec.student_id]) map[rec.student_id] = {};
          map[rec.student_id][date] = rec;
        });
      });
      setAttendanceMap(map);

      // Build per-date check-in map. There is at most one row per (grade, date)
      // thanks to the UNIQUE constraint, so we just take the first match.
      const ciMap = {};
      checkInResults.forEach((rows, i) => {
        const date = weekDates[i];
        if (rows && rows.length > 0) ciMap[date] = rows[0];
      });
      setWeekCheckIns(ciMap);
    } catch (e) {
      console.error(e);
    }
    setLoadingWeek(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade, weekMonday.toISOString(), dayClosureMap]);

  useEffect(() => { loadWeekAttendance(); }, [loadWeekAttendance]);

  // Default-present model:
  //   No record       ->’ student is PRESENT (default)
  //   Click green v   ->’ creates an "absent" record
  //   Click red x     ->’ deletes the "absent" record (restores to default present)
  const toggleCell = async (studentId, date) => {
    if (dayClosureMap[date]?.closed) {
      toast({ title: "School closed", description: dayClosureMap[date].reason, variant: "destructive" });
      return;
    }
    const key = `${studentId}|${date}`;
    if (savingKeys.has(key)) return;
    setSavingKeys(prev => new Set(prev).add(key));

    const existing = attendanceMap[studentId]?.[date];

    if (existing?.status === "absent") {
      // Remove absent record ->’ back to default present
      setAttendanceMap(prev => {
        const studentDays = { ...(prev[studentId] || {}) };
        delete studentDays[date];
        return { ...prev, [studentId]: studentDays };
      });
      try {
        await Attendance.bulkDelete([existing.id]);
        toast({ title: "Marked present", description: "Absence removed - student is now present." });
      } catch (e) {
        toast({ title: "Error saving", description: e?.message, variant: "destructive" });
        // Revert
        setAttendanceMap(prev => ({
          ...prev,
          [studentId]: { ...(prev[studentId] || {}), [date]: existing },
        }));
      }
    } else {
      // No record (or legacy "present") ->’ create absent record
      const optimistic = { student_id: studentId, attendance_date: date, status: "absent", grade: selectedGrade };
      setAttendanceMap(prev => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [date]: optimistic },
      }));
      try {
        let created;
        if (existing) {
          // Legacy "present" record - update it to absent
          created = await Attendance.update(existing.id, { status: "absent" });
        } else {
          created = await Attendance.create({
            student_id: studentId, attendance_date: date, status: "absent",
            grade: selectedGrade, term, academic_year: academicYear,
          });
        }
        setAttendanceMap(prev => ({
          ...prev,
          [studentId]: { ...(prev[studentId] || {}), [date]: created },
        }));
        recordStreak(currentUser?.id, STREAK_TYPES.ATTENDANCE);

        // Prompt SMS for absence
        const student = students.find(s => s.id === studentId);
        const phone = student?.parent_phone;
        const studentName =
          student?.first_name ||
          student?.last_name ||
          `${student?.first_name || ""} ${student?.last_name || ""}`.trim() ||
          "Student";
        const displayDate = format(new Date(date + "T12:00:00"), "EEEE, do MMMM yyyy");
        const currentTpl = rawTemplate || loadSmsTemplateFromCache();
        const smsMessage = resolveAbsenceTpl(currentTpl, {
          name: studentName,
          grade: selectedGrade,
          date: displayDate,
        });

        toast({ title: "Marked absent", description: `${studentName} marked absent.` });

        if (phone) {
          setEditedMessage(smsMessage);
          setShowTemplateEditor(false);
          setTemplateSaved(false);
          setSmsDialog({ studentName, phone, message: smsMessage });
        }
      } catch (e) {
        toast({ title: "Error saving", description: e?.message, variant: "destructive" });
        // Revert
        setAttendanceMap(prev => {
          const studentDays = { ...(prev[studentId] || {}) };
          delete studentDays[date];
          return { ...prev, [studentId]: studentDays };
        });
      }
    }

    setSavingKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
  };

  // Check the current class teacher in for today. One row per (grade, date)
  // thanks to the DB UNIQUE constraint - if it already exists this is a no-op.
  const handleCheckIn = async () => {
    if (checkingIn || todayCheckIn) return;
    if (!isClassTeacherForSelected) return;        // gate only applies to class teachers
    if (!todayIsSchoolDay) return;                  // can't check in on a closed day
    setCheckingIn(true);
    try {
      const row = await AttendanceCheckIn.create({
        grade:           selectedGrade,
        attendance_date: todayDate,
        term,
        academic_year:   academicYear,
        teacher_id:      currentUser?.linked_teacher_id || null,
        checked_in_at:   new Date().toISOString(),
      });
      setWeekCheckIns(prev => ({ ...prev, [todayDate]: row }));
      toast({
        title: "Attendance opened",
        description: `${selectedGrade} | ${format(new Date(todayDate + "T12:00:00"), "EEEE, do MMMM")}`,
      });
      recordStreak(currentUser?.id, STREAK_TYPES.ATTENDANCE);
    } catch (e) {
      const msg = String(e?.message || "");
      if (/duplicate|unique/i.test(msg)) {
        // Already checked in from another device/tab - just reload.
        await loadWeekAttendance();
      } else if (/attendance_check_ins/i.test(msg) && /not.*find|does not exist|schema cache/i.test(msg)) {
        // Migration hasn't been applied yet - surface a clear instruction
        // rather than a raw Supabase error.
        toast({
          title: "Check-in not yet enabled",
          description: "The admin needs to apply the attendance_check_ins migration in Supabase before teachers can check in.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Could not check in", description: msg, variant: "destructive" });
      }
    } finally {
      setCheckingIn(false);
    }
  };

  // Mark all students present - removes all absent records for the day (default-present model)
  const markAllPresent = async (date) => {
    if (dayClosureMap[date]?.closed) {
      toast({ title: "School closed", description: dayClosureMap[date].reason, variant: "destructive" });
      return;
    }
    const absentStudents = students.filter(s => attendanceMap[s.id]?.[date]?.status === "absent");
    if (absentStudents.length === 0) {
      toast({ title: "All already present", description: `No absences recorded for ${format(new Date(date + "T12:00:00"), "EEE, MMM d")}.` });
      return;
    }

    // Optimistic: remove absent records
    setAttendanceMap(prev => {
      const next = { ...prev };
      absentStudents.forEach(s => {
        const studentDays = { ...(next[s.id] || {}) };
        delete studentDays[date];
        next[s.id] = studentDays;
      });
      return next;
    });

    try {
      const ids = absentStudents.map(s => attendanceMap[s.id]?.[date]?.id).filter(Boolean);
      if (ids.length > 0) await Attendance.bulkDelete(ids);
      await loadWeekAttendance();
      toast({ title: "All marked present", description: `${absentStudents.length} absence${absentStudents.length !== 1 ? "s" : ""} cleared | ${format(new Date(date + "T12:00:00"), "EEE, MMM d")}` });
    } catch (e) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
      loadWeekAttendance();
    }
  };

  const clearAttendanceForSelection = async () => {
    try {
      const weeklyRecords = await Promise.all(
        weekDates
          .filter((date) => !dayClosureMap[date]?.closed)
          .map((date) => Attendance.filter({
            grade: selectedGrade,
            term,
            academic_year: academicYear,
            attendance_date: date,
          }))
      );
      const records = weeklyRecords.flat();
      const ids = records.map((record) => record.id).filter(Boolean);

      if (ids.length === 0) {
        toast({ title: "Nothing to clear", description: "There are no marked attendance records on this weekly list." });
        return;
      }

      await Attendance.bulkDelete(ids);
      await logChange({
        action: "attendance_cleared",
        entityType: "attendance",
        entityId: `${selectedGrade}:${term}:${academicYear}:${weekDates[0]}`,
        performedBy: currentUser?.school_role || currentUser?.full_name || "admin",
        summary: `Cleared weekly attendance list for ${selectedGrade}.`,
        before: records,
        after: [],
        details: { grade: selectedGrade, term, academicYear, weekDates },
      });
      setAttendanceMap({});
      setTermSummary([]);
      await loadWeekAttendance();
      if (viewMode === "summary" && students.length > 0) {
        await loadTermSummary();
      }

      toast({
        title: "Attendance cleared",
        description: `${ids.length} attendance record${ids.length !== 1 ? "s" : ""} removed from the current list.`,
      });
    } catch (e) {
      toast({ title: "Clear failed", description: e?.message || "Could not clear attendance records.", variant: "destructive" });
    }
  };

  // â"€â"€â"€ Term Summary â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const loadTermSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      // Fetch all attendance records for this grade+term+year
      const records = await Attendance.filter({
        grade: selectedGrade,
        term,
        academic_year: academicYear,
      });

      // Use actual school days from the calendar so holidays and pre-term dates do not count.
      const todayDate = todayStr();
      const allDates = listSchoolDaysForTerm(calendarEvents, term, academicYear, todayDate);
      const totalDays = allDates.length;

      // Default-present model: count only absent/late records; rest of school days = present
      const byStudent = {};
      records.forEach(r => {
        if (!r.attendance_date || !allDates.includes(r.attendance_date)) return;
        if (!byStudent[r.student_id]) byStudent[r.student_id] = { absent: 0, late: 0 };
        if (r.status === "absent") byStudent[r.student_id].absent++;
        else if (r.status === "late") byStudent[r.student_id].late++;
      });

      const rows = students.map(s => {
        const stats  = byStudent[s.id] || { absent: 0, late: 0 };
        const absent = stats.absent;
        const late   = stats.late;
        const present = totalDays - absent - late;
        const total  = totalDays;
        const pct = total > 0 ? Math.round(((present + late) / total) * 100) : null;
        return { student: s, present, absent, late, total, pct };
      }).sort((a, b) => {
        if (a.pct === null && b.pct === null) return 0;
        if (a.pct === null) return 1;
        if (b.pct === null) return -1;
        return a.pct - b.pct; // lowest first (problem students at top)
      });

      setTermSummary(rows);
    } catch (e) {
      console.error(e);
    }
    setLoadingSummary(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade, term, academicYear, students, calendarEvents]);

  useEffect(() => {
    if (viewMode === "summary" && students.length > 0) loadTermSummary();
  }, [viewMode, loadTermSummary]);

  // Week navigation
  const goToPrevWeek = () => setWeekMonday(d => addDays(d, -7));
  const goToNextWeek = () => setWeekMonday(d => addDays(d,  7));
  const goToThisWeek = () => setWeekMonday(getMondayOf(todayStr()));

  const today = todayStr();

  // Per-day stats - default-present model: no record = present
  const dayStats = weekDates.map(date => {
    if (date > today || dayClosureMap[date]?.closed) return { present: 0, absent: 0, closed: dayClosureMap[date]?.closed, reason: dayClosureMap[date]?.reason };
    const absentCount = students.filter(s => attendanceMap[s.id]?.[date]?.status === "absent").length;
    return {
      present: students.length - absentCount,
      absent:  absentCount,
      closed:  false,
      reason:  null,
    };
  });

  // Per-student weekly summary - default-present model
  const weekSummary = (studentId) => {
    const pastDates = weekDates.filter(d => d <= today && !dayClosureMap[d]?.closed);
    const absent = pastDates.filter(d => attendanceMap[studentId]?.[d]?.status === "absent").length;
    const present = pastDates.length - absent;
    return { present, total: pastDates.length, absent };
  };

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleSaveTemplate = () => {
    saveSmsTemplate(rawTemplate);
    setRawTemplate(rawTemplate);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2500);
  };

  const handleSendSms = async () => {
    if (!smsDialog) return;
    setSendingSms(true);
    try {
      const result = await sendSMS({ phoneNumbers: [smsDialog.phone], message: editedMessage, senderId: smsSenderId || BRAND.smsSenderId });
      const sent = result?.data?.sent ?? 0;
      if (sent > 0) {
        toast({ title: "SMS sent", description: `Parent of ${smsDialog.studentName} notified at ${smsDialog.phone}.` });
      } else {
        toast({ title: "SMS failed", description: `Could not deliver to ${smsDialog.phone}. Check the number.`, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "SMS error", description: err?.message || "Unknown error", variant: "destructive" });
    }
    setSendingSms(false);
    setSmsDialog(null);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <Toaster />

      {/* SMS Confirmation Dialog */}
      <Dialog open={!!smsDialog} onOpenChange={(open) => { if (!open) { setSmsDialog(null); setShowTemplateEditor(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-500" />
              Notify Parent by SMS?
            </DialogTitle>
            <DialogDescription className="pt-1">
              <strong>{smsDialog?.studentName}</strong> has been marked absent.
              Edit the message below before sending, or update the default template.
            </DialogDescription>
          </DialogHeader>

          {smsDialog && (
            <div className="space-y-3">
              {/* Editable resolved message */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                  Message to send <span className="text-slate-400 normal-case font-normal">(editable)</span>
                </label>
                <textarea
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"
                />
                <p className="text-xs text-slate-400 mt-1">To: {smsDialog.phone} | {editedMessage.length} chars</p>
              </div>

              {/* Template editor toggle */}
              <button
                type="button"
                onClick={() => setShowTemplateEditor(v => !v)}
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Edit default template
                {showTemplateEditor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showTemplateEditor && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-emerald-700 font-semibold">Default template</p>
                  <p className="text-[11px] text-emerald-500 leading-relaxed">
                    Use <code className="bg-emerald-100 px-1 rounded">{"{{name}}"}</code>,{" "}
                    <code className="bg-emerald-100 px-1 rounded">{"{{grade}}"}</code>,{" "}
                    <code className="bg-emerald-100 px-1 rounded">{"{{date}}"}</code>,{" "}
                    <code className="bg-emerald-100 px-1 rounded">{"{{school}}"}</code> as placeholders.
                  </p>
                  <textarea
                    value={rawTemplate}
                    onChange={e => setRawTemplate(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveTemplate}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 h-7"
                    >
                      {templateSaved ? "Saved!" : "Save as default"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        const resolved = resolveAbsenceTpl(rawTemplate, {
                          name: smsDialog.studentName,
                          grade: selectedGrade,
                          date: editedMessage.match(/today, (.+)\./)?.[1] || "today",
                        });
                        setEditedMessage(resolved);
                      }}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      Apply to this message
                    </button>
                    <button
                      type="button"
                      onClick={() => setRawTemplate(DEFAULT_SMS_TEMPLATE)}
                      className="text-xs text-slate-400 hover:text-slate-600 hover:underline ml-auto"
                    >
                      Reset to default
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setSmsDialog(null); setShowTemplateEditor(false); }} disabled={sendingSms}>
              Don't Send
            </Button>
            <Button
              onClick={handleSendSms}
              disabled={sendingSms || !editedMessage.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {sendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {sendingSms ? "Sending..." : "Send SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear attendance for {selectedGrade}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all marked attendance records on the current weekly list for <strong>{selectedGrade}</strong>.
              Only records from the displayed week will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowClearConfirm(false); clearAttendanceForSelection(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Yes, clear records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">Attendance</h1>
          <p className="text-slate-500">Weekly register - all students are present by default. Click the check mark to mark absent.</p>
        </div>

        {/* Controls */}
        <Card className="mb-5 bg-white border border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Term</label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger className="w-36 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Year</label>
                <Select value={academicYear} onValueChange={setAcademicYear}>
                  <SelectTrigger className="w-36 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Class
                  {isTeacher && myClassTeacherGrades.length > 0 && (
                    <span className="ml-1.5 text-emerald-600 normal-case font-normal">({myClassTeacherGrades.length} assigned)</span>
                  )}
                </label>
                <Select
                  value={selectedGrade}
                  onValueChange={setSelectedGrade}
                  disabled={isTeacher && myClassTeacherGrades.length === 1}
                >
                  <SelectTrigger className="w-36 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isTeacher && myClassTeacherGrades.length > 0 ? myClassTeacherGrades : GRADES)
                      .map(g => {
                        // Mark the user's OWN class so an admin who is also a
                        // class teacher can instantly see which class is on
                        // them personally to check in for.
                        const isYourClass = myClassTeacherGrades.includes(g);
                        return (
                          <SelectItem key={g} value={g}>
                            <span className="inline-flex items-center gap-1.5">
                              <span>{g}</span>
                              {isYourClass && (
                                <span className="text-[9px] font-bold uppercase tracking-wide bg-blue-600 text-white px-1.5 py-0.5 rounded">
                                  Your class
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1" />
              {/* View mode toggle */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                <button
                  onClick={() => setViewMode("weekly")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === "weekly"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <TableProperties className="w-3.5 h-3.5" />
                  Weekly Register
                </button>
                <button
                  onClick={() => setViewMode("summary")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === "summary"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Term Summary
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => exportCsv(students, weekDates, attendanceMap, selectedGrade)} disabled={students.length === 0 || viewMode === "summary"}>
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* â"€â"€ Weekly Register view â"€â"€ */}
        {viewMode === "weekly" && (<>
          {/* Week navigator */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button onClick={goToPrevWeek} className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 min-w-[200px] text-center">
                {format(weekMonday, "MMM d")} - {format(addDays(weekMonday, 4), "MMM d, yyyy")}
              </div>
              <button onClick={goToNextWeek} className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
              {!isCurrentWeek && (
                <button onClick={goToThisWeek} className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium hover:bg-blue-200 transition-colors">
                  Today's week
                </button>
              )}
              {isCurrentWeek && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Current week</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Users className="w-4 h-4" />
              <span>{students.length} student{students.length !== 1 ? "s" : ""} | {selectedGrade}</span>
              {loadingWeek && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            </div>
          </div>

          {(todayClosure || !weekHasSchoolDay) && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <CalendarX2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">
                  {todayClosure ? `Attendance is closed today: ${todayClosure.reason}.` : "This week has no open school days on the calendar."}
                </p>
                {termStartEvent?.event_date && todayStr() < termStartEvent.event_date && (
                  <p className="text-xs text-amber-700 mt-1">
                    {term} starts on {format(new Date(termStartEvent.event_date + "T12:00:00"), "EEEE, d MMMM yyyy")}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Teachers without any class-teacher assignment cannot mark
              attendance for anyone. Replace the whole grid with an explainer
              so they don't wander into a class they don't own. */}
          {teacherWithoutClass && (
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
              <div className="inline-flex w-14 h-14 rounded-full bg-slate-400 text-white items-center justify-center mb-4">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">No class assigned to you</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Only class teachers can mark attendance. You are not listed as the class teacher of any class.
              </p>
              <p className="text-xs text-slate-500 mt-3 max-w-md mx-auto">
                If this is a mistake, ask the admin to assign you to your class in <strong>Settings - Class Assignments</strong>.
              </p>
            </div>
          )}

          {/* Check-in gate - class teacher must explicitly open the class
              before the grid is revealed. If they don't, every student in this
              class is counted as ABSENT in reports for today, so admin will
              see this class flagged before close of business. */}
          {!teacherWithoutClass && showCheckInGate && !loadingStudents && students.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
              <div className="inline-flex w-14 h-14 rounded-full bg-amber-500 text-white items-center justify-center mb-4">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-amber-900 mb-1">Confirm you are marking attendance</h3>
              <p className="text-sm text-amber-800 mb-1">
                <span className="font-semibold">Class:</span> {selectedGrade}
              </p>
              <p className="text-sm text-amber-800 mb-1">
                <span className="font-semibold">Date:</span> {format(new Date(todayDate + "T12:00:00"), "EEEE, do MMMM yyyy")}
              </p>
              {currentUser?.full_name && (
                <p className="text-sm text-amber-800 mb-4">
                  <span className="font-semibold">You:</span> {currentUser.full_name} (Class Teacher)
                </p>
              )}
              <p className="text-xs text-amber-700 max-w-md mx-auto mb-5">
                If you do not check in today, every student in {selectedGrade} will be recorded as <strong>absent</strong> for {format(new Date(todayDate + "T12:00:00"), "EEE d MMM")}. The admin sees a live status of every class.
              </p>
              <Button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 text-sm font-semibold"
              >
                {checkingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Tap to mark attendance for today
              </Button>
            </div>
          )}

          {/* Attendance grid */}
          {(teacherWithoutClass || showCheckInGate) ? null : loadingStudents ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-slate-200 rounded-2xl">
              <Users className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No active students found in {selectedGrade}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">

                  {/* Column headers */}
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      {/* Student name column */}
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide min-w-[200px] border-r border-slate-200">
                        Student
                      </th>

                      {/* Mon-Fri columns */}
                      {weekDates.map((date, i) => {
                        const isToday = date === todayStr();
                        const dayDate = new Date(date + "T12:00:00");
                        const dayClosed = dayClosureMap[date]?.closed;
                        const closedReason = dayClosureMap[date]?.reason;
                        return (
                          <th key={date} className={`px-2 py-2 text-center min-w-[88px] ${isToday ? "bg-blue-50" : ""}`}>
                            <div className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-blue-700" : "text-slate-600"}`}>
                              {DAY_LABELS[i]}
                            </div>
                            <div className={`text-xs mt-0.5 ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                              {format(dayDate, "d MMM")}
                            </div>
                            {dayClosed ? (
                              <span
                                title={closedReason}
                                className="mt-1.5 inline-flex text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold"
                              >
                                Closed
                              </span>
                            ) : (
                              <button
                                onClick={() => markAllPresent(date)}
                                title="Mark all present for this day"
                                className="mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold hover:bg-emerald-200 transition-colors"
                              >
                                All clear
                              </button>
                            )}
                          </th>
                        );
                      })}

                      {/* Week summary column */}
                      <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide min-w-[72px] border-l border-slate-100">
                        Week
                      </th>
                    </tr>
                  </thead>

                  {/* Student rows */}
                  <tbody className="divide-y divide-slate-100">
                    {students.map((student, idx) => {
                      const { present, total } = weekSummary(student.id);
                      const weekRate = total > 0 ? Math.round((present / total) * 100) : null;

                      return (
                        <tr key={student.id} className={`hover:bg-slate-50/70 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/30" : ""}`}>

                          {/* Name */}
                          <td className="sticky left-0 z-10 bg-white px-4 py-2.5 border-r border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-xs font-bold">
                                  {student.first_name?.[0]}{student.last_name?.[0]}
                                </span>
                              </div>
                              <p className="font-semibold text-slate-900 text-sm truncate">
                                {student.first_name} {student.last_name}
                              </p>
                            </div>
                          </td>

                          {/* Day cells */}
                          {weekDates.map(date => {
                            const key      = `${student.id}|${date}`;
                            const isSaving = savingKeys.has(key);
                            const record   = attendanceMap[student.id]?.[date];
                            const status   = record?.status;
                            const isToday  = date === todayStr();
                            const isFuture = date > todayStr();
                            const dayClosed = dayClosureMap[date]?.closed;

                            return (
                              <td key={date} className={`px-2 py-2 text-center ${isToday ? "bg-blue-50/40" : ""}`}>
                                {dayClosed ? (
                                  <span
                                    title={dayClosureMap[date]?.reason || "School closed"}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto bg-amber-50 border border-amber-200 text-amber-500 text-[10px] font-bold"
                                  >
                                    C
                                  </span>
                                ) : isFuture && !status ? (
                                  <span className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto bg-slate-50 border border-slate-100 text-slate-300 text-xs">-</span>
                                ) : status === "absent" ? (
                                  // Explicit absent record - red x, click to remove (restore to present)
                                  <button
                                    onClick={() => toggleCell(student.id, date)}
                                    disabled={isSaving}
                                    title="Absent - click to mark Present"
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 ${
                                      isSaving ? "opacity-50 cursor-wait" : "cursor-pointer hover:scale-110 active:scale-95"
                                    }`}
                                  >
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-4 h-4" strokeWidth={3} />}
                                  </button>
                                ) : (
                                  // No record or legacy present - green v (default present), click to mark absent
                                  <button
                                    onClick={() => toggleCell(student.id, date)}
                                    disabled={isSaving}
                                    title="Present - click to mark Absent"
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 ${
                                      isSaving ? "opacity-50 cursor-wait" : "cursor-pointer hover:scale-110 active:scale-95"
                                    }`}
                                  >
                                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={3} />}
                                  </button>
                                )}
                              </td>
                            );
                          })}

                          {/* Weekly summary badge */}
                          <td className="px-3 py-2 text-center border-l border-slate-100">
                            {total === 0 ? (
                              <span className="text-xs text-slate-400">-</span>
                            ) : (
                              <Badge className={`text-xs font-semibold border ${
                                weekRate === 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                weekRate  >= 60  ? "bg-amber-100  text-amber-800  border-amber-200"  :
                                                   "bg-red-100    text-red-800    border-red-200"
                              }`}>
                                {present}/{total}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Summary footer */}
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide border-r border-slate-200">
                        Total
                      </td>
                      {dayStats.map((stat, i) => (
                        <td key={i} className={`px-2 py-3 text-center ${weekDates[i] === todayStr() ? "bg-blue-50/40" : ""}`}>
                          {stat.closed ? (
                            <div className="text-[10px] font-semibold text-amber-700">Closed</div>
                          ) : (
                            <>
                          <div className="text-xs font-bold text-emerald-600 leading-tight">Present {stat.present}</div>
                          <div className="text-xs font-bold text-red-500 leading-tight">Absent {stat.absent}</div>
                            </>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-500 border-l border-slate-100">
                        {students.length} students
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-5 mt-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-emerald-700" strokeWidth={3} />
              </div>
              Present (default)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-red-100 border border-red-300 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-red-700" strokeWidth={3} />
              </div>
              Absent
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
                <span className="text-amber-600 text-[10px] font-bold">C</span>
              </div>
              School closed
            </div>
            <span className="text-slate-400 hidden sm:inline">Click the check mark to mark absent | Click the X to restore to present | "All clear" clears all absences</span>
          </div>
        </>)}

        {/* â"€â"€ Term Summary view â"€â"€ */}
        {viewMode === "summary" && (
          <div>
            {/* Sub-header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <p className="text-sm text-slate-500">
                Cumulative attendance for <strong>{selectedGrade}</strong> | <strong>{term}</strong> | <strong>{academicYear}</strong>
                <span className="ml-2 text-slate-400">(worst first)</span>
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Users className="w-4 h-4" />
                <span>{students.length} student{students.length !== 1 ? "s" : ""}</span>
                {loadingSummary && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
              </div>
            </div>

            {loadingStudents || loadingSummary ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed border-slate-200 rounded-2xl">
                <Users className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No active students found in {selectedGrade}</p>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                {termSummary.length > 0 && (() => {
                  const withData  = termSummary.filter(r => r.total > 0);
                  const avgPct    = withData.length > 0 ? Math.round(withData.reduce((s, r) => s + r.pct, 0) / withData.length) : null;
                  const atRisk    = termSummary.filter(r => r.pct !== null && r.pct < 60).length;
                  const perfect   = termSummary.filter(r => r.pct === 100).length;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: "Class Average", value: avgPct !== null ? `${avgPct}%` : "-", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
                        { label: "Students Tracked", value: withData.length, color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
                        { label: "At Risk (<60%)", value: atRisk, color: "text-red-700", bg: "bg-red-50 border-red-200" },
                        { label: "Perfect Attendance", value: perfect, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} className={`rounded-xl border p-3 text-center ${bg}`}>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
                          <div className={`text-2xl font-bold ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Summary table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">#</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Student</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-emerald-600 uppercase tracking-wide">Present</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-red-500 uppercase tracking-wide">Absent</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-amber-600 uppercase tracking-wide">Late</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Total Days</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Attendance %</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {termSummary.map((row, idx) => {
                        const { student, present, absent, late, total, pct } = row;
                        const statusLabel = pct === null ? "No data" : pct >= 80 ? "Good" : pct >= 60 ? "Fair" : "At Risk";
                        const statusStyle = pct === null
                          ? "bg-slate-100 text-slate-500 border-slate-200"
                          : pct >= 80
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : pct >= 60
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-red-100 text-red-800 border-red-200";
                        const pctColor = pct === null ? "text-slate-400" : pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";

                        return (
                          <tr key={student.id} className={`hover:bg-slate-50/70 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                            <td className="px-4 py-3 text-xs text-slate-400 font-mono">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs font-bold">
                                    {student.first_name?.[0]}{student.last_name?.[0]}
                                  </span>
                                </div>
                                <p className="font-semibold text-slate-900 text-sm">
                                  {student.first_name} {student.last_name}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-bold text-emerald-700">{present}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-bold text-red-600">{absent}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-semibold text-amber-600">{late || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm text-slate-600">{total}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {pct === null ? (
                                <span className="text-slate-400 text-sm">-</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className={`h-2 rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-500"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className={`text-sm font-bold ${pctColor}`}>{pct}%</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={`text-xs font-semibold border ${statusStyle}`}>
                                {statusLabel}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-5 mt-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Good 80% and above</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />Fair 60-79%</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />At Risk &lt;60%</div>
                  <span className="text-slate-400 hidden sm:inline">Sorted by lowest attendance first</span>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}






