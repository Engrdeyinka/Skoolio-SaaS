import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Student, Teacher, Subject, TimetableSlot, TeacherAvailability, ClassAssignment } from "@/entities/all";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Loader2, Printer, Eraser, Zap, BarChart2, Settings2, User, Video, ExternalLink, CalendarX2, Undo2, History, Lock, LockOpen, Pencil, Check } from "lucide-react";
import { startAndJoin, isMeetingRunning, toMeetingId } from "@/lib/bbb";
import TimetableGrid from "@/components/timetable/TimetableGrid";
import SlotModal from "@/components/timetable/SlotModal";
import GenerateModal from "@/components/timetable/GenerateModal";
import TeacherConstraintPanel from "@/components/timetable/TeacherConstraintPanel";
import SubjectSetupPanel from "@/components/timetable/SubjectSetupPanel";
import WorkloadReport from "@/components/timetable/WorkloadReport";
import { DEFAULT_SS_PAIRINGS, normalizeSSPairings } from "@/components/timetable/ssPairings";
import { DAYS, PERIODS, PERIOD_TIMES as DEFAULT_PERIOD_TIMES } from "@/components/timetable/constants";
import { usePeriodTimes } from "@/hooks/usePeriodTimes";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { createApprovalRequest } from "@/lib/approvalRequests";
import { logChange } from "@/lib/changeHistory";
import { canBrowseTeacherTimetables, canViewTeacherWorkload, isAdmin as isAdminRole, isStudent as isStudentRole, isSuperAdmin, isTeacher as isTeacherRole } from "@/lib/permissions";
import { formatDateInLagos, getLagosDateString, getLagosWeekdayIndex } from "@/lib/timezone";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";

const GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];
const TERMS = ["First Term", "Second Term", "Third Term"];
const SS_PAIRINGS_STORAGE_KEY = "tunmise_timetable_ss_pairings_v1";
const BULK_HISTORY_STORAGE_KEY = "tunmise_timetable_bulk_history_v1";
const TIMETABLE_LOCK_STORAGE_KEY = "tunmise_timetable_locks_v1";
const MAX_BULK_HISTORY = 5;

const DAY_COLORS = {
  Monday: "bg-blue-50 border-blue-200 text-blue-800",
  Tuesday: "bg-emerald-50 border-emerald-200 text-emerald-800",
  Wednesday: "bg-emerald-50 border-emerald-200 text-emerald-800",
  Thursday: "bg-amber-50 border-amber-200 text-amber-800",
  Friday: "bg-rose-50 border-rose-200 text-rose-800",
};

function TeacherTimetableView({
  teachers,
  allSlots,
  selectedTeacherId,
  onSelectTeacher,
  term,
  academicYear,
  isRestrictedToSelectedTeacher = false,
  periodTimes = DEFAULT_PERIOD_TIMES,
}) {
  const visibleTeachers = isRestrictedToSelectedTeacher
    ? teachers.filter((t) => t.id === selectedTeacherId)
    : teachers;
  const teacher = visibleTeachers.find(t => t.id === selectedTeacherId) || teachers.find(t => t.id === selectedTeacherId);

  // All slots for this teacher in current term/year
  const teacherSlots = allSlots.filter(s =>
    !s.is_blocked &&
    (s.teacher_id === selectedTeacherId || s.second_teacher_id === selectedTeacherId)
  );

  // Total periods per week
  const totalPeriods = teacherSlots.length;
  const daysActive = [...new Set(teacherSlots.map(s => s.day))].length;

  const getSlot = (day, period) =>
    teacherSlots.find(s => s.day === day && s.period === period) || null;

  return (
    <div className="space-y-5">
      {/* Teacher picker */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {isRestrictedToSelectedTeacher ? "Your Timetable" : "Select Teacher"}
            </p>
            <div className="flex flex-wrap gap-2">
              {visibleTeachers.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelectTeacher(t.id)}
                  disabled={isRestrictedToSelectedTeacher}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    selectedTeacherId === t.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
                  } ${isRestrictedToSelectedTeacher ? "cursor-default" : ""}`}
                >
                  {t.first_name} {t.last_name}
                </button>
              ))}
            </div>
          </div>
          {teacher && (
            <div className="flex gap-4 text-center flex-shrink-0">
              <div className="bg-blue-50 rounded-xl px-4 py-2">
                <div className="text-xl font-bold text-blue-700">{totalPeriods}</div>
                <div className="text-xs text-blue-500 font-medium">periods/week</div>
              </div>
              <div className="bg-emerald-50 rounded-xl px-4 py-2">
                <div className="text-xl font-bold text-emerald-700">{daysActive}</div>
                <div className="text-xs text-emerald-500 font-medium">days active</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!selectedTeacherId ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 flex items-center justify-center h-48">
          <div className="text-center text-slate-400">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a teacher to view their timetable</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm print:shadow-none">
          {/* Print header */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">{teacher?.first_name} {teacher?.last_name}</h2>
              <p className="text-xs text-slate-500">{teacher?.subject} · {term} · {academicYear}</p>
            </div>
            <button
              onClick={() => {
                const rows = PERIODS.map(period => {
                  const cells = DAYS.map(day => {
                    const slot = getSlot(day, period);
                    return slot
                      ? `<td style="padding:6px;border:1px solid #e2e8f0;text-align:center">
                           <div style="font-weight:700;font-size:11px">${slot.subject_name || slot.subject || "—"}</div>
                           <div style="font-size:10px;color:#64748b">${slot.grade}</div>
                         </td>`
                      : `<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1">—</td>`;
                  }).join("");
                  return `<tr>
                    <td style="padding:6px 10px;border:1px solid #e2e8f0;white-space:nowrap;background:#f8fafc">
                      <div style="font-weight:700;font-size:11px">P${period}</div>
                      <div style="font-size:10px;color:#94a3b8">${periodTimes[period]}</div>
                    </td>${cells}</tr>`;
                }).join("");

                const html = `<!DOCTYPE html><html><head><title>${teacher?.first_name} ${teacher?.last_name} — Timetable</title>
                <style>body{font-family:sans-serif;padding:20px} table{border-collapse:collapse;width:100%} th{background:#1e293b;color:white;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em} @page{size:A4 landscape;margin:10mm}</style>
                </head><body>
                <h2 style="margin-bottom:4px">${teacher?.first_name} ${teacher?.last_name}</h2>
                <p style="color:#64748b;font-size:12px;margin-bottom:12px">${teacher?.subject || ""} &middot; ${term} &middot; ${academicYear}</p>
                <table><thead><tr><th>Period / Time</th>${DAYS.map(d => `<th>${d}</th>`).join("")}</tr></thead>
                <tbody>${rows}</tbody></table>
                </body></html>`;

                const win = window.open("", "_blank");
                win.document.write(html);
                win.document.close();
                win.focus();
                setTimeout(() => { win.print(); win.close(); }, 400);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 w-28">Period / Time</th>
                  {DAYS.map(day => (
                    <th key={day} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period, pi) => (
                  <tr key={period} className={pi % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <div className="font-bold text-slate-700 text-xs">P{period}</div>
                      <div className="text-slate-400 text-[10px]">{periodTimes[period]}</div>
                    </td>
                    {DAYS.map(day => {
                      const slot = getSlot(day, period);
                      return (
                        <td key={day} className="px-2 py-2 border-b border-slate-100 text-center">
                          {slot ? (
                            <div className={`rounded-lg border px-2 py-1.5 ${DAY_COLORS[day]}`}>
                              <div className="font-bold text-xs leading-tight">{slot.subject_name || slot.subject || "—"}</div>
                              <div className="text-[10px] font-semibold opacity-70 mt-0.5">{slot.grade}</div>
                            </div>
                          ) : (
                            <div className="text-slate-200 text-xs">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveClassesPanel({ allSlots, term, academicYear, teachers, userRole, fullName, activeGrade, isStudent, periodTimes = DEFAULT_PERIOD_TIMES }) {
  const todayIndex = getLagosWeekdayIndex(); // 0=Sun … 6=Sat
  const todayName  = todayIndex >= 1 && todayIndex <= 5 ? DAYS[todayIndex - 1] : null;
  const [selectedDay,  setSelectedDay]  = useState(todayName || "Monday");
  const [liveStatuses, setLiveStatuses] = useState({});
  const [joining,      setJoining]      = useState(null);

  const isModerator = ["admin", "super_admin", "teacher"].includes(userRole);

  const todaySlots = allSlots
    .filter(s =>
      s.day === selectedDay &&
      s.term === term &&
      s.academic_year === academicYear &&
      !s.is_blocked
    )
    .sort((a, b) => {
      if (a.grade !== b.grade) return GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
      return a.period - b.period;
    });

  const visibleSlots = isStudent
    ? todaySlots.filter(s => s.grade === activeGrade)
    : todaySlots;

  // Group by grade
  const gradeGroups = {};
  visibleSlots.forEach(slot => {
    if (!gradeGroups[slot.grade]) gradeGroups[slot.grade] = [];
    gradeGroups[slot.grade].push(slot);
  });

  function getMeetingId(grade, subject) {
    return toMeetingId(`tunmise-${grade}-${subject}`);
  }

  // Poll live statuses for all visible slots
  useEffect(() => {
    if (visibleSlots.length === 0) return;
    const ids = [...new Set(
      visibleSlots.map(s => getMeetingId(s.grade, s.subject_name || s.subject || "class"))
    )];
    async function checkAll() {
      const results = await Promise.all(ids.map(id => isMeetingRunning(id)));
      const map = {};
      ids.forEach((id, i) => { map[id] = results[i]; });
      setLiveStatuses(map);
    }
    checkAll();
    const iv = setInterval(checkAll, 30_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, term, academicYear, visibleSlots.length]);

  async function handleJoin(slot) {
    const subj = slot.subject_name || slot.subject || "class";
    const mid  = getMeetingId(slot.grade, subj);
    const name = `${slot.grade} — ${subj}`;
    setJoining(mid);
    try {
      await startAndJoin(mid, name, fullName || "Student", isModerator ? "moderator" : "attendee");
      setTimeout(async () => {
        const running = await isMeetingRunning(mid);
        setLiveStatuses(prev => ({ ...prev, [mid]: running }));
      }, 3000);
    } catch (err) {
      alert(`Could not join: ${err.message}`);
    } finally {
      setJoining(null);
    }
  }

  function getTeacher(id) {
    if (!id) return null;
    return teachers.find(t => t.id === id);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-500" />
            Live Classes
          </h2>
          <p className="text-sm text-slate-500">
            Start or join BigBlueButton virtual classes straight from the timetable
          </p>
        </div>
        {Object.values(liveStatuses).some(Boolean) && (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            {Object.values(liveStatuses).filter(Boolean).length} live now
          </div>
        )}
      </div>

      {/* Day selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {DAYS.map(d => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              selectedDay === d
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : d === todayName
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {d}
            {d === todayName && <span className="ml-1 text-[10px] opacity-60">Today</span>}
          </button>
        ))}
      </div>

      {visibleSlots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 flex items-center justify-center h-40">
          <div className="text-center text-slate-400">
            <Video className="w-10 h-10 mx-auto mb-2 opacity-25" />
            <p className="text-sm font-medium">No classes scheduled for {selectedDay}</p>
            {!isStudent && <p className="text-xs mt-1">Set up the timetable first to see classes here</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(gradeGroups).map(([grade, slots]) => (
            <div key={grade} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {!isStudent && (
                <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="font-bold text-slate-700 text-sm">{grade}</h3>
                  <span className="text-xs text-slate-400">{slots.length} period{slots.length !== 1 ? "s" : ""}</span>
                </div>
              )}
              <div className="px-3 py-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {slots.map(slot => {
                  const subj    = slot.subject_name || slot.subject || "—";
                  const mid     = getMeetingId(slot.grade, subj === "—" ? "class" : subj);
                  const isLive  = liveStatuses[mid] === true;
                  const isJoin  = joining === mid;
                  const teacher = getTeacher(slot.teacher_id);
                  return (
                    <div
                      key={slot.id || `${grade}-${slot.day}-${slot.period}`}
                      className={`flex flex-col rounded-lg border p-2 gap-1.5 transition-all ${
                        isLive ? "bg-emerald-50 border-emerald-200 shadow-sm" : "bg-slate-50 border-slate-200 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      {/* Period + live */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 rounded px-1 py-0.5 leading-tight">P{slot.period}</span>
                        {isLive && (
                          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </span>
                        )}
                      </div>

                      {/* Subject + teacher */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-[10px] leading-tight line-clamp-2">{subj}</p>
                        {teacher && (
                          <p className="text-[9px] text-slate-400 mt-0.5 truncate">{teacher.last_name}</p>
                        )}
                      </div>

                      {/* Button */}
                      <Button
                        size="sm"
                        onClick={() => handleJoin(slot)}
                        disabled={isJoin}
                        className={`w-full h-6 text-[9px] font-bold gap-0.5 px-1 ${
                          isLive
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : isModerator
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {isJoin
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <Video className="w-2.5 h-2.5" />
                        }
                        {isLive ? "Join" : isModerator ? "Start" : "Join"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pt-1">
        Classes open in a new tab. Teachers click <em>Start</em> to open the room; students click <em>Join</em> to enter.
      </p>
    </div>
  );
}

export default function TimetablePage() {
  const { toast } = useToast();
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();
  const [activeGrade, setActiveGrade] = usePersistentState("timetable_grade", "JSS 1");
  const [term, setTerm] = usePersistentState("timetable_term", "Third Term");
  const [academicYear, setAcademicYear] = usePersistentState("timetable_year", "2025/2026");
  const [activeTab, setActiveTab] = usePersistentState("timetable_tab", "timetable");
  // JSS 3 SSS mode + subjects — lifted here so the tab badge always reflects
  // the current state (GenerateModal receives these as props and calls back)
  const [jss3SSSMode, _setJss3SSSModeRaw] = useState(false);
  const [jss3SSSSubjects, _setJss3SSSSubjectsRaw] = useState([]);

  const setJss3SSSMode = (val) => {
    _setJss3SSSModeRaw(prev => {
      const next = typeof val === "function" ? val(prev) : val;
      saveSchoolSetting("jss3_sss_mode", next).catch(() => {});
      return next;
    });
  };
  const setJss3SSSSubjects = (val) => {
    _setJss3SSSSubjectsRaw(prev => {
      const next = typeof val === "function" ? val(prev) : val;
      saveSchoolSetting("jss3_sss_subjects", next).catch(() => {});
      return next;
    });
  };
  const { user: currentUser } = useAuth();

  const [allSlots, setAllSlots] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [availabilities, setAvailabilities] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const { periodTimes, breakTime, savePeriodTimes, saveBreakTime } = usePeriodTimes();

  const [modal, setModal] = useState({ open: false, day: null, period: null, slot: null });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [ssPairings, setSsPairings] = useState(DEFAULT_SS_PAIRINGS);
  const [bulkHistory, setBulkHistory] = useState([]);
  const [pendingConfirm, setPendingConfirm] = useState(null); // { title, desc, onConfirm, danger? }
  const [snapshotPicker, setSnapshotPicker] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState(null); // { id, label }
  const [lockedTerms, setLockedTerms] = useState({}); // { "First Term:2025/2026": true, ... }

  const isReadOnly = currentUser ? !["admin", "super_admin"].includes(currentUser.school_role) : true;
  const isStudent  = isStudentRole(currentUser);
  const isTeacher  = isTeacherRole(currentUser);
  const isAdminUser = isAdminRole(currentUser);
  const isSuperAdminUser = isSuperAdmin(currentUser);
  const userLoaded = currentUser !== null;
  const userRole   = currentUser?.school_role || "student";
  const fullName   = currentUser?.full_name   || "User";
  const restrictedStudentTabs = ["teacher-tt", "report"];
  const restrictedTeacherTabs = ["report"];

  // Auto-set active grade to the student's own class
  useEffect(() => {
    if (!isStudent) return;
    const linkedId = currentUser?.linked_student_id;
    if (!linkedId || linkedId === "0000" || linkedId.length <= 4) return;
    Student.get(linkedId)
      .then(s => { if (s?.grade) setActiveGrade(s.grade); })
      .catch(() => {});
  }, [isStudent, currentUser?.linked_student_id]);

  useEffect(() => {
    if (isStudent && restrictedStudentTabs.includes(activeTab)) {
      setActiveTab("timetable");
    }
  }, [isStudent, activeTab]);

  useEffect(() => {
    if (isTeacher && restrictedTeacherTabs.includes(activeTab)) {
      setActiveTab("teacher-tt");
    }
  }, [isTeacher, activeTab]);

  useEffect(() => {
    if (!isTeacher) return;
    const linkedTeacherId = currentUser?.linked_teacher_id;
    if (!linkedTeacherId) return;
    setSelectedTeacherId(linkedTeacherId);
  }, [isTeacher, currentUser?.linked_teacher_id]);

  const loadData = async () => {
    setIsLoading(true);
    let [teachersData, subjectsData, allSlotsData, availData, assignData, eventsData] = await Promise.all([
      Teacher.list(),
      Subject.list(),
      TimetableSlot.list(null, 2000),
      TeacherAvailability.list(),
      ClassAssignment.list(),
      SchoolCalendarEvent.list().catch(() => []),
    ]);

    // ── Auto-fix subject name casing in class_assignments ─────────────────
    // If a subject was renamed (e.g. "ECONOMICS" → "Economics"), old
    // class_assignment rows still hold the old name.  Detect and silently
    // migrate them so they don't appear as phantom duplicates.
    const canonicalMap = {};   // { "economics": "Economics" }
    for (const s of subjectsData) {
      if (s.subject_name) canonicalMap[s.subject_name.toLowerCase()] = s.subject_name;
    }
    const wrongCase = assignData.filter(a => {
      if (!a.subject) return false;
      const canonical = canonicalMap[a.subject.toLowerCase()];
      return canonical !== undefined && canonical !== a.subject;
    });
    if (wrongCase.length > 0) {
      await Promise.all(
        wrongCase.map(a =>
          ClassAssignment.update(a.id, { subject: canonicalMap[a.subject.toLowerCase()] })
        )
      ).catch(() => {});
      // Reload assignments with corrected names
      assignData = await ClassAssignment.list().catch(() => assignData);
    }
    // ─────────────────────────────────────────────────────────────────────

    // DB stores `subject`, but all UI components read `subject_name` — normalize here
    const normalizedSlots = allSlotsData.map(s =>
      s.subject_name ? s : { ...s, subject_name: s.subject ?? null }
    );
    setTeachers(teachersData);
    setSubjects(subjectsData);
    setAllSlots(normalizedSlots);
    setAvailabilities(availData);
    setAssignments(assignData);
    setCalendarEvents(eventsData || []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // When the user switches to the Subject Setup tab, silently re-fetch
  // assignments + teachers so any changes made in Class Assignments are
  // immediately visible without a full page reload.
  useEffect(() => {
    if (activeTab !== "subjects") return;
    Promise.all([
      ClassAssignment.list(),
      Teacher.list(),
      TeacherAvailability.list(),
      Subject.list(),
    ]).then(async ([assignData, teacherData, availData, subjectsData]) => {
      // Re-apply the casing fix in case subjects were renamed since last full load
      const canonicalMap = {};
      for (const s of subjectsData) {
        if (s.subject_name) canonicalMap[s.subject_name.toLowerCase()] = s.subject_name;
      }
      const wrongCase = assignData.filter(a => {
        if (!a.subject) return false;
        const canonical = canonicalMap[a.subject.toLowerCase()];
        return canonical !== undefined && canonical !== a.subject;
      });
      let finalAssignments = assignData;
      if (wrongCase.length > 0) {
        await Promise.all(
          wrongCase.map(a =>
            ClassAssignment.update(a.id, { subject: canonicalMap[a.subject.toLowerCase()] })
          )
        ).catch(() => {});
        finalAssignments = await ClassAssignment.list().catch(() => assignData);
      }
      setAssignments(finalAssignments);
      setTeachers(teacherData);
      setAvailabilities(availData);
      setSubjects(subjectsData);
    }).catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    // Seed UI instantly from localStorage cache while Supabase loads
    try {
      const rawHistory = localStorage.getItem(BULK_HISTORY_STORAGE_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) setBulkHistory(parsed);
      }
    } catch { setBulkHistory([]); }

    // SS pairings + timetable locks + snapshot history + jss3 mode
    // Primary store: Supabase (cross-device). Fallback: localStorage.
    (async () => {
      try {
        const [dbPairings, dbLocks, dbHistory, dbJss3Mode, dbJss3Subjects] = await Promise.all([
          loadSchoolSetting("timetable_ss_pairings"),
          loadSchoolSetting("timetable_locks"),
          loadSchoolSetting("snapshot_history", null),
          loadSchoolSetting("jss3_sss_mode", null),
          loadSchoolSetting("jss3_sss_subjects", null),
        ]);
        if (dbPairings) {
          setSsPairings(normalizeSSPairings(dbPairings));
        } else {
          // migrate from localStorage if present
          const raw = localStorage.getItem(SS_PAIRINGS_STORAGE_KEY);
          if (raw) setSsPairings(normalizeSSPairings(JSON.parse(raw)));
        }
        if (dbLocks) {
          setLockedTerms(dbLocks);
        } else {
          const raw = localStorage.getItem(TIMETABLE_LOCK_STORAGE_KEY);
          if (raw) setLockedTerms(JSON.parse(raw) || {});
        }
        // Snapshot history — Supabase is authoritative (contains lock/rename state)
        if (Array.isArray(dbHistory) && dbHistory.length > 0) {
          setBulkHistory(dbHistory);
          try { localStorage.setItem(BULK_HISTORY_STORAGE_KEY, JSON.stringify(dbHistory)); } catch {}
        } else if (dbHistory === null) {
          // null = never saved to Supabase; migrate from localStorage
          try {
            const raw = localStorage.getItem(BULK_HISTORY_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setBulkHistory(parsed);
                saveSchoolSetting("snapshot_history", parsed).catch(() => {});
              }
            }
          } catch {}
        }
        // JSS 3 SSS mode — null = never saved to Supabase yet
        // Migrate from sessionStorage (usePersistentState used sessionStorage, not localStorage)
        if (dbJss3Mode !== null && dbJss3Mode !== undefined) {
          _setJss3SSSModeRaw(!!dbJss3Mode);
        } else {
          try {
            const raw = sessionStorage.getItem("timetable.jss3SSSMode");
            if (raw !== null) {
              const val = JSON.parse(raw);
              _setJss3SSSModeRaw(!!val);
              saveSchoolSetting("jss3_sss_mode", !!val).catch(() => {});
            }
          } catch {}
        }
        // JSS 3 SSS subjects
        if (Array.isArray(dbJss3Subjects)) {
          _setJss3SSSSubjectsRaw(dbJss3Subjects);
        } else {
          try {
            const raw = sessionStorage.getItem("timetable.jss3SSSSubjects");
            if (raw !== null) {
              const val = JSON.parse(raw);
              if (Array.isArray(val) && val.length > 0) {
                _setJss3SSSSubjectsRaw(val);
                saveSchoolSetting("jss3_sss_subjects", val).catch(() => {});
              }
            }
          } catch {}
        }
      } catch {
        // fall back to localStorage on network error
        try {
          const raw = localStorage.getItem(SS_PAIRINGS_STORAGE_KEY);
          if (raw) setSsPairings(normalizeSSPairings(JSON.parse(raw)));
        } catch {}
        try {
          const raw = localStorage.getItem(TIMETABLE_LOCK_STORAGE_KEY);
          if (raw) setLockedTerms(JSON.parse(raw) || {});
        } catch {}
      }
    })();
  }, []);

  // Sync term/year from global school settings once they load
  useEffect(() => {
    if (schoolTerm) setTerm(schoolTerm);
    if (schoolYear) setAcademicYear(schoolYear);
  }, [schoolTerm, schoolYear]);

  const gradeSlots = allSlots.filter(
    s => s.grade === activeGrade && s.term === term && s.academic_year === academicYear
  );

  const openModal = (day, period, slot) => {
    if (isTimetableLocked) {
      toast({ title: "Timetable is locked", description: "Unlock the timetable to make changes.", variant: "destructive" });
      return;
    }
    setModal({ open: true, day, period, slot });
  };
  const closeModal = () => setModal({ open: false, day: null, period: null, slot: null });

  const handleSaveSlot = async (rawData) => {
    setIsSaving(true);
    try {
      const { day, period, slot } = modal;
      const blockAllClasses = rawData.block_all_classes;
      // Remap subject_name → subject (DB column) and ensure teacher_id is null not ""
      const { block_all_classes: _bac, subject_name, teacher_id, second_teacher_id, ...rest } = rawData;
      const data = {
        ...rest,
        subject: subject_name ?? rest.subject ?? null,
        teacher_id: teacher_id || null,
        second_teacher_id: second_teacher_id || null,
      };

      if (blockAllClasses && data.is_blocked) {
        // Block this period across all classes
        const grades = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];
        const recordsToCreate = grades.map(g => ({
          grade: g, day, period, term, academic_year: academicYear, ...data
        }));
        const toDelete = allSlots
          .filter(s => s.day === day && s.period === period && s.term === term && s.academic_year === academicYear && s.id)
          .map(s => s.id);
        await deleteInBatches(toDelete);
        await TimetableSlot.bulkCreate(recordsToCreate);
      } else {
        // Single class slot
        const record = { grade: activeGrade, day, period, term, academic_year: academicYear, ...data };
        if (slot?.id) {
          await TimetableSlot.update(slot.id, record);
        } else {
          await TimetableSlot.create(record);
        }
      }
      await loadData();
      closeModal();
      toast({ title: "Slot saved", description: "Timetable slot has been saved." });
      recordStreak(currentUser?.id, STREAK_TYPES.TIMETABLE);
    } catch (error) {
      console.error('Failed to save slot:', error);
      toast({ title: "Save failed", description: error?.message || "Could not save slot. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSlot = async (slot) => {
    if (slot?.id) {
      await TimetableSlot.delete(slot.id);
      await loadData();
    }
  };

  const handleToggleLock = async (slot) => {
    if (slot?.id) {
      await TimetableSlot.update(slot.id, { is_locked: !slot.is_locked });
      await loadData();
    }
  };

  const deleteInBatches = async (ids) => {
    if (ids.length > 0) {
      await TimetableSlot.bulkDelete(ids);
    }
  };

  const mapSlotForCreate = (slot) => ({
    grade: slot.grade,
    day: slot.day,
    period: slot.period,
    term: slot.term,
    academic_year: slot.academic_year,
    subject: slot.subject ?? slot.subject_name ?? null,
    teacher_id: slot.teacher_id || null,
    second_teacher_id: slot.second_teacher_id || null,
    is_blocked: Boolean(slot.is_blocked),
    block_label: slot.block_label || "",
    is_locked: Boolean(slot.is_locked),
  });

  const requestTimetableApproval = async ({
    actionType,
    actionLabel,
    generatedSlots = [],
    fillEmptyOnly = false,
    grade = null,
  }) => {
    const normalizedSlots = generatedSlots.map(({ subject_name, teacher_id, ...slot }) => ({
      ...slot,
      subject: slot.subject ?? subject_name ?? null,
      teacher_id: teacher_id || slot.teacher_id || null,
      term,
      academic_year: academicYear,
    }));

    const affectedGrades = actionType === "clear_all"
      ? GRADES
      : actionType === "clear_grade"
      ? [grade].filter(Boolean)
      : [...new Set(normalizedSlots.map((slot) => slot.grade).filter(Boolean))];

    const currentScoped = allSlots.filter((slot) => {
      if (slot.term !== term || slot.academic_year !== academicYear) return false;
      if (actionType === "clear_all") return true;
      if (actionType === "clear_grade") return slot.grade === grade;
      return affectedGrades.includes(slot.grade);
    });

    await createApprovalRequest({
      entityType: "timetable_term",
      entityLabel: `${term} ${academicYear} timetable`,
      operation: "update",
      recordId: `${term}:${academicYear}:${actionType}:${grade || "all"}`,
      currentData: {
        action_type: actionType,
        term,
        academic_year: academicYear,
        affected_grades: affectedGrades,
        existing_slot_count: currentScoped.length,
      },
      proposedData: {
        action_type: actionType,
        action_label: actionLabel,
        term,
        academic_year: academicYear,
        grade: grade || null,
        fill_empty_only: fillEmptyOnly,
        slots: normalizedSlots,
      },
      requestedBy: currentUser?.id || null,
      requestedByRole: currentUser?.school_role || "admin",
      requestedByName: currentUser?.full_name || currentUser?.email || "Admin",
      summary: `${actionLabel} requested for ${term} ${academicYear}.`,
      metadata: {
        action_type: actionType,
        action_label: actionLabel,
        term,
        academic_year: academicYear,
        affected_grades: affectedGrades,
        requested_slot_count: normalizedSlots.length,
      },
    });

    toast({
      title: "Approval requested",
      description: `${actionLabel} was submitted for superadmin approval.`,
    });
  };

  const updateBulkHistory = (updater) => {
    setBulkHistory((prev) => {
      const nextRaw = typeof updater === "function" ? updater(prev) : updater;
      if (!Array.isArray(nextRaw)) {
        try { localStorage.setItem(BULK_HISTORY_STORAGE_KEY, JSON.stringify([])); } catch {}
        saveSchoolSetting("snapshot_history", []).catch(() => {});
        return [];
      }
      // Locked snapshots are never trimmed; unlocked ones capped at MAX_BULK_HISTORY
      const locked   = nextRaw.filter(s => s.locked);
      const unlocked = nextRaw.filter(s => !s.locked).slice(0, MAX_BULK_HISTORY);
      const next = [...locked, ...unlocked].sort(
        (a, b) => new Date(b.capturedAt) - new Date(a.capturedAt)
      );
      try {
        localStorage.setItem(BULK_HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // no-op: preserve in-memory history if localStorage is unavailable
      }
      // Save to Supabase so lock/rename state syncs across all devices
      saveSchoolSetting("snapshot_history", next).catch(() => {});
      return next;
    });
  };

  const renameSnapshot = (id, newLabel) => {
    updateBulkHistory(prev =>
      prev.map(s => s.id === id ? { ...s, actionLabel: newLabel.trim() || s.actionLabel } : s)
    );
    setEditingSnapshot(null);
  };

  const toggleSnapshotLock = (id) => {
    updateBulkHistory(prev =>
      prev.map(s => s.id === id ? { ...s, locked: !s.locked } : s)
    );
  };

  const lockKey = `${term}:${academicYear}`;
  const isTimetableLocked = !!lockedTerms[lockKey];

  const handleToggleTimetableLock = () => {
    if (!isTimetableLocked) {
      setPendingConfirm({
        title: "Lock timetable?",
        desc: `This will prevent the timetable for ${term} ${academicYear} from being regenerated or edited. You can unlock it at any time.`,
        onConfirm: async () => {
          const next = { ...lockedTerms, [lockKey]: true };
          setLockedTerms(next);
          await saveSchoolSetting("timetable_locks", next);
          try { localStorage.setItem(TIMETABLE_LOCK_STORAGE_KEY, JSON.stringify(next)); } catch {}
          toast({ title: "Timetable locked", description: `${term} ${academicYear} is now protected from changes.` });
        },
      });
    } else {
      const next = { ...lockedTerms };
      delete next[lockKey];
      setLockedTerms(next);
      saveSchoolSetting("timetable_locks", next);
      try { localStorage.setItem(TIMETABLE_LOCK_STORAGE_KEY, JSON.stringify(next)); } catch {}
      toast({ title: "Timetable unlocked", description: `${term} ${academicYear} can now be edited and regenerated.` });
    }
  };

  const captureBulkSnapshot = async (actionLabel) => {
    const fresh = await TimetableSlot.filter({ term, academic_year: academicYear });
    const payload = (fresh || []).map(mapSlotForCreate);
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actionLabel,
      capturedAt: new Date().toISOString(),
      term,
      academicYear,
      slots: payload,
    };
    updateBulkHistory((prev) => [snapshot, ...prev]);
  };

  const restoreBulkSnapshot = async (snapshot) => {
    if (!snapshot?.slots) return;
    setPendingConfirm({
      title: `Restore snapshot?`,
      desc: `"${snapshot.actionLabel}" — saved ${new Date(snapshot.capturedAt).toLocaleString()}. The current timetable will be replaced with this snapshot.`,
      onConfirm: () => doRestoreBulkSnapshot(snapshot),
    });
  };

  const doRestoreBulkSnapshot = async (snapshot) => {
    setIsLoading(true);
    try {
      const current = await TimetableSlot.filter({
        term: snapshot.term,
        academic_year: snapshot.academicYear,
      });
      const ids = (current || []).map((slot) => slot.id).filter(Boolean);
      await deleteInBatches(ids);
      if (snapshot.slots.length > 0) {
        await TimetableSlot.bulkCreate(snapshot.slots);
      }
      await loadData();
      updateBulkHistory((prev) => prev.filter((item) => item.id !== snapshot.id));
      await logChange({
        action: "timetable_snapshot_restored",
        entityType: "timetable_term",
        entityId: `${snapshot.term}:${snapshot.academicYear}`,
        performedBy: currentUser?.school_role || fullName,
        summary: `Restored timetable snapshot "${snapshot.actionLabel}".`,
        before: null,
        after: {
          action_label: snapshot.actionLabel,
          restored_slot_count: snapshot.slots.length,
          term: snapshot.term,
          academic_year: snapshot.academicYear,
        },
      });
      toast({
        title: "Snapshot restored",
        description: "Previous timetable version has been restored.",
      });
    } catch (error) {
      console.error("Failed to undo bulk action:", error);
      toast({
        title: "Restore failed",
        description: error?.message || "Could not restore saved timetable snapshot.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const restoreLastBulkSnapshot = async () => {
    const latest = bulkHistory[0];
    if (!latest) return;
    await restoreBulkSnapshot(latest);
  };

  const openBulkHistoryPicker = () => {
    if (bulkHistory.length === 0) return;
    setSnapshotPicker(true);
  };

  const handleSaveSSPairings = async (nextPairings) => {
    const normalized = normalizeSSPairings(nextPairings);
    setSsPairings(normalized);
    await saveSchoolSetting("timetable_ss_pairings", normalized);
    try { localStorage.setItem(SS_PAIRINGS_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    toast({ title: "Pairings saved", description: "Solver pairing rules updated." });
  };

  const handleClearAll = () => {
    if (isTimetableLocked) {
      toast({ title: "Timetable is locked", description: "Unlock the timetable to clear slots.", variant: "destructive" });
      return;
    }
    setPendingConfirm({
      title: `Clear ${activeGrade} timetable?`,
      desc: `All slots for ${activeGrade} — ${term} ${academicYear} will be deleted. Blocked periods are kept. This action can be undone via the snapshot history.`,
      danger: true,
      onConfirm: () => executeClearAll(),
    });
  };

  const executeClearAll = async () => {
    if (isAdminUser && !isSuperAdminUser) {
      await requestTimetableApproval({
        actionType: "clear_grade",
        actionLabel: `Clear ${activeGrade} timetable`,
        grade: activeGrade,
      });
      return;
    }
    setIsLoading(true);
    await captureBulkSnapshot(`Clear ${activeGrade} timetable`);
    const fresh = await TimetableSlot.filter({ grade: activeGrade, term, academic_year: academicYear });
    const toDelete = fresh.filter(s => s.id && !s.is_blocked).map(s => s.id);
    await deleteInBatches(toDelete);
    await loadData();
    await logChange({
      action: "timetable_cleared_grade",
      entityType: "timetable_term",
      entityId: `${term}:${academicYear}:${activeGrade}`,
      performedBy: currentUser?.school_role || fullName,
      summary: `Cleared ${activeGrade} timetable for ${term} ${academicYear}.`,
      before: { grade: activeGrade, deleted_slots: toDelete.length, term, academic_year: academicYear },
      after: { grade: activeGrade, remaining_slots: 0, term, academic_year: academicYear },
    });
  };

  const handleClearAllGrades = () => {
    if (isTimetableLocked) {
      toast({ title: "Timetable is locked", description: "Unlock the timetable to clear slots.", variant: "destructive" });
      return;
    }
    setPendingConfirm({
      title: `Clear ALL classes?`,
      desc: `Every timetable slot for all grades in ${term} ${academicYear} will be deleted. Blocked periods are kept. This action can be undone via the snapshot history.`,
      danger: true,
      onConfirm: () => executeClearAllGrades(),
    });
  };

  const executeClearAllGrades = async () => {
    if (isAdminUser && !isSuperAdminUser) {
      await requestTimetableApproval({
        actionType: "clear_all",
        actionLabel: "Clear all classes",
      });
      return;
    }
    setIsLoading(true);
    await captureBulkSnapshot("Clear all classes");
    // Fetch all non-locked, non-blocked slots across every grade for this term/year
    const fresh = await TimetableSlot.list(null, 5000);
    const toDelete = fresh
      .filter(s => s.term === term && s.academic_year === academicYear && s.id && !s.is_blocked)
      .map(s => s.id);
    await deleteInBatches(toDelete);
    await loadData();
    await logChange({
      action: "timetable_cleared_all",
      entityType: "timetable_term",
      entityId: `${term}:${academicYear}:all`,
      performedBy: currentUser?.school_role || fullName,
      summary: `Cleared timetable for all classes in ${term} ${academicYear}.`,
      before: { deleted_slots: toDelete.length, term, academic_year: academicYear, affected_grades: GRADES },
      after: { remaining_slots: 0, term, academic_year: academicYear, affected_grades: GRADES },
    });
    toast({ title: "Timetable cleared", description: `All classes cleared for ${term} ${academicYear}. Blocked periods kept.` });
  };

  const handleApplyGenerated = async (generatedSlots, options = {}) => {
    const fillEmptyOnly = Boolean(options.fillEmptyOnly);
    if (isAdminUser && !isSuperAdminUser) {
      await requestTimetableApproval({
        actionType: fillEmptyOnly ? "fill_empty" : "replace",
        actionLabel: fillEmptyOnly ? "Fill empty timetable slots" : "Replace timetable with generated result",
        generatedSlots,
        fillEmptyOnly,
      });
      return;
    }
    setIsLoading(true);
    try {
      const grades = [...new Set(generatedSlots.map(s => s.grade))];
      await captureBulkSnapshot(fillEmptyOnly ? "Generate (fill empty only)" : "Generate (replace timetable)");
      // Fetch fresh slots — delete all non-locked, non-blocked across affected grades in one query
      const freshSlots = await TimetableSlot.filter({ term, academic_year: academicYear });
      const slotsToCreateRaw = generatedSlots.map(({ subject_name, teacher_id, ...s }) => ({
        ...s,
        subject: subject_name || null,
        teacher_id: teacher_id || null,
        term,
        academic_year: academicYear,
      }));

      let slotsToCreate = slotsToCreateRaw;
      if (fillEmptyOnly) {
        const occupied = new Set(
          freshSlots
            .filter((slot) => slot.term === term && slot.academic_year === academicYear)
            .map((slot) => `${slot.grade}|${slot.day}|${slot.period}`)
        );
        slotsToCreate = slotsToCreateRaw.filter(
          (slot) => !occupied.has(`${slot.grade}|${slot.day}|${slot.period}`)
        );
      } else {
        const toDeleteIds = freshSlots
          .filter((slot) => grades.includes(slot.grade) && !slot.is_locked && !slot.is_blocked)
          .map((slot) => slot.id);
        await deleteInBatches(toDeleteIds);
      }

      if (slotsToCreate.length > 0) {
        await TimetableSlot.bulkCreate(slotsToCreate);
      }
      await loadData();
      await logChange({
        action: fillEmptyOnly ? "timetable_fill_empty_applied" : "timetable_generated_applied",
        entityType: "timetable_term",
        entityId: `${term}:${academicYear}`,
        performedBy: currentUser?.school_role || fullName,
        summary: fillEmptyOnly
          ? `Filled empty timetable slots for ${term} ${academicYear}.`
          : `Applied generated timetable for ${term} ${academicYear}.`,
        before: {
          term,
          academic_year: academicYear,
          affected_grades: grades,
        },
        after: {
          term,
          academic_year: academicYear,
          affected_grades: grades,
          created_slots: slotsToCreate.length,
          fill_empty_only: fillEmptyOnly,
        },
      });
      toast({
        title: "Timetable saved",
        description: fillEmptyOnly
          ? `${slotsToCreate.length} empty slot(s) filled; existing timetable entries were preserved.`
          : `${slotsToCreate.length} slots saved successfully.`,
      });
    } catch (error) {
      console.error('Failed to save timetable:', error);
      toast({ title: "Save failed", description: error?.message || "Could not save timetable. Please try again.", variant: "destructive" });
      setIsLoading(false);
    }
  };

  const handleSaveAvailability = async (teacher, form) => {
    try {
      const existing = availabilities.find(a => a.teacher_id === teacher.id);
      const data = { teacher_id: teacher.id, ...form };
      if (existing?.id) {
        await TeacherAvailability.update(existing.id, data);
      } else {
        await TeacherAvailability.create(data);
      }
      await loadData();
      toast({ title: "Availability saved", description: `${teacher.first_name} ${teacher.last_name}'s availability updated.` });
    } catch (error) {
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const handleSaveAssignment = async (assignment) => {
    try {
      const existing = assignments.find(a => a.grade === assignment.grade && a.subject === assignment.subject);
      if (existing?.id) {
        await ClassAssignment.update(existing.id, assignment);
      } else {
        await ClassAssignment.create(assignment);
      }
      await loadData();
      toast({ title: "Assignment saved", description: "Class assignment has been saved." });
    } catch (error) {
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const termSlots = allSlots.filter(s => s.term === term && s.academic_year === academicYear);

  // ── Teachers eligible for the secondary timetable ─────────────────────────
  // Only include teachers who have at least one class_assignment row for a
  // secondary grade (JSS 1 – SSS 3).  This automatically excludes:
  //   • Teachers with no assignment at all
  //   • KG 1 / KG 2 / Nursery / Primary 1-4 teachers (lower-school only)
  const SECONDARY_GRADE_SET = new Set(GRADES);
  const timetableTeachers = teachers.filter(t =>
    assignments.some(a =>
      (a.subject_teacher_id === t.id || a.teacher_id === t.id) &&
      SECONDARY_GRADE_SET.has(a.grade)
    )
  );

  // ── Upcoming holidays / breaks for this term ─────────────────────────────
  const HOLIDAY_TYPES = new Set(["holiday", "vacation", "mid_term"]);
  const todayIso = getLagosDateString();
  const upcomingHolidays = calendarEvents.filter(ev =>
    HOLIDAY_TYPES.has(ev.event_type) &&
    ev.term === term &&
    (ev.academic_year === academicYear || !ev.academic_year) &&
    (ev.end_date || ev.event_date) >= todayIso
  ).sort((a, b) => a.event_date.localeCompare(b.event_date));

  const conflictCount = gradeSlots.filter(slot => {
    if (!slot.teacher_id || slot.is_blocked) return false;
    return termSlots.some(s =>
      s.id !== slot.id && s.teacher_id === slot.teacher_id &&
      s.day === slot.day && s.period === slot.period
    );
  }).length;

  const tabs = [
    { id: "timetable",  label: "Timetable",          icon: CalendarDays },
    ...(canBrowseTeacherTimetables(currentUser) ? [{ id: "teacher-tt", label: "Teacher Timetable", icon: User }] : []),
    { id: "live",       label: "Live Classes",         icon: Video       },
    ...(userLoaded && !isReadOnly ? [
      { id: "subjects",  label: "Subject Setup",       icon: Settings2   },
      { id: "teachers",  label: "Teacher Constraints", icon: Settings2   },
    ] : []),
    ...(canViewTeacherWorkload(currentUser) ? [{ id: "report", label: "Workload Report", icon: BarChart2 }] : []),
  ];

  return (
    <>
    {/* Generic confirm dialog */}
    <AlertDialog open={!!pendingConfirm} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pendingConfirm?.desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { const fn = pendingConfirm?.onConfirm; setPendingConfirm(null); fn?.(); }}
            className={pendingConfirm?.danger ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Snapshot picker dialog */}
    <AlertDialog open={snapshotPicker} onOpenChange={setSnapshotPicker}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle>Restore a snapshot</AlertDialogTitle>
            <button
              onClick={() => {
                updateBulkHistory(prev => prev.filter(s => s.locked));
                if (bulkHistory.every(s => s.locked)) setSnapshotPicker(false);
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
              title="Deletes all unlocked snapshots"
            >
              Clear all
            </button>
          </div>
          <AlertDialogDescription>Choose a saved timetable state to restore.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 my-2 max-h-72 overflow-y-auto pr-0.5">
          {bulkHistory.map((snapshot) => {
            const isEditing = editingSnapshot?.id === snapshot.id;
            return (
              <div key={snapshot.id} className={`flex items-center gap-1.5 group rounded-lg border transition-colors ${
                snapshot.locked ? "border-amber-200 bg-amber-50/40" : "border-slate-200"
              }`}>
                {/* Main restore button / inline edit */}
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
                    <input
                      autoFocus
                      value={editingSnapshot.label}
                      onChange={e => setEditingSnapshot(prev => ({ ...prev, label: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === "Enter") renameSnapshot(snapshot.id, editingSnapshot.label);
                        if (e.key === "Escape") setEditingSnapshot(null);
                      }}
                      className="flex-1 text-sm border border-indigo-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <button
                      onClick={() => renameSnapshot(snapshot.id, editingSnapshot.label)}
                      className="w-7 h-7 flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setSnapshotPicker(false); setEditingSnapshot(null); restoreBulkSnapshot(snapshot); }}
                    className="flex-1 text-left px-3 py-2.5 hover:bg-slate-50 transition-colors rounded-l-lg"
                  >
                    <div className="flex items-center gap-1.5">
                      {snapshot.locked && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                      <p className="font-semibold text-sm text-slate-900 truncate">{snapshot.actionLabel}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(snapshot.capturedAt).toLocaleString()}</p>
                  </button>
                )}

                {/* Action icons — shown on hover (or always when locked/editing) */}
                {!isEditing && (
                  <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {/* Rename */}
                    <button
                      onClick={() => setEditingSnapshot({ id: snapshot.id, label: snapshot.actionLabel })}
                      className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* Lock / Unlock */}
                    <button
                      onClick={() => toggleSnapshotLock(snapshot.id)}
                      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                        snapshot.locked
                          ? "text-amber-500 hover:text-amber-700 hover:bg-amber-50 opacity-100"
                          : "text-slate-400 hover:text-amber-500 hover:bg-amber-50"
                      }`}
                      title={snapshot.locked ? "Unlock (allow deletion)" : "Lock (prevent deletion)"}
                    >
                      {snapshot.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                    </button>
                    {/* Delete — hidden when locked */}
                    {!snapshot.locked && (
                      <button
                        onClick={() => updateBulkHistory(prev => prev.filter(s => s.id !== snapshot.id))}
                        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete snapshot"
                      >
                        <span className="text-base leading-none">×</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {bulkHistory.length === 0 && (
            <p className="text-sm text-slate-400 italic text-center py-4">No snapshots saved yet.</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Timetable Scheduler</h1>
              <p className="text-xs text-slate-500">Secondary School — JSS 1 to SS 3</p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            {isReadOnly && (
              <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full">Read-only view</span>
            )}
            <Button variant="outline" size="sm" className="text-xs px-2.5 py-1 h-auto" onClick={() => {
              const getSlot = (day, period) =>
                gradeSlots.find(s => s.day === day && s.period === period) || null;
              const getTeacherName = (id) => {
                if (!id) return "";
                const t = teachers.find(t => t.id === id);
                return t ? `${t.first_name} ${t.last_name}` : "";
              };

              const rows = PERIODS.map(period => {
                const isBreak = period === 5;
                const breakRow = isBreak
                  ? `<tr style="background:#f8fafc"><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600;font-size:10px;color:#94a3b8">LONG BREAK<br/>${breakTime}</td>${DAYS.map(() => `<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px">— Break —</td>`).join("")}</tr>` : "";

                const cells = DAYS.map(day => {
                  const slot = getSlot(day, period);
                  if (!slot) return `<td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1">—</td>`;
                  if (slot.is_blocked) return `<td style="padding:8px;border:1px solid #e2e8f0;text-align:center;background:#f8fafc;color:#94a3b8;font-size:10px">Blocked</td>`;
                  const teacherName = getTeacherName(slot.teacher_id);
                  return `<td style="padding:8px;border:1px solid #e2e8f0;text-align:center">
                    <div style="font-weight:700;font-size:11px;margin-bottom:2px">${slot.subject_name || slot.subject || "—"}</div>
                    ${teacherName ? `<div style="font-size:10px;color:#64748b">${teacherName}</div>` : ""}
                  </td>`;
                }).join("");

                return `${breakRow}<tr>
                  <td style="padding:6px 10px;border:1px solid #e2e8f0;white-space:nowrap;background:#f8fafc">
                    <div style="font-weight:700;font-size:11px">P${period}</div>
                    <div style="font-size:10px;color:#94a3b8">${periodTimes[period]}</div>
                  </td>${cells}</tr>`;
              }).join("");

              const html = `<!DOCTYPE html><html><head><title>${activeGrade} Timetable — ${term} ${academicYear}</title>
                <style>
                  body{font-family:sans-serif;padding:20px;font-size:12px}
                  h2{margin:0 0 4px}p{margin:0 0 12px;color:#64748b;font-size:12px}
                  table{border-collapse:collapse;width:100%}
                  thead th{background:#1e293b;color:white;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:center}
                  thead th:first-child{text-align:left}
                  @page{size:A4 landscape;margin:10mm}
                </style></head><body>
                <h2>${activeGrade} — ${term} ${academicYear} Timetable</h2>
                <p>${BRAND.schoolName}</p>
                <table><thead><tr><th style="text-align:left">Period / Time</th>${DAYS.map(d => `<th>${d}</th>`).join("")}</tr></thead>
                <tbody>${rows}</tbody></table>
                </body></html>`;

              const win = window.open("", "_blank");
              win.document.write(html);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); win.close(); }, 400);
            }}>
              <Printer className="w-3 h-3 mr-1" /> Print
            </Button>
            {!isReadOnly && activeTab === "timetable" && allSlots.some(s => s.term === term && s.academic_year === academicYear && !s.is_locked && !s.is_blocked) && (
              <Button variant="outline" size="sm" onClick={handleClearAllGrades} className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-2.5 py-1 h-auto">
                <Eraser className="w-3 h-3 mr-1" /> Clear All
              </Button>
            )}
            {!isReadOnly && bulkHistory.length > 0 && (
              <Button variant="outline" size="sm" onClick={restoreLastBulkSnapshot} className="text-amber-700 border-amber-200 hover:bg-amber-50 text-xs px-2.5 py-1 h-auto">
                <Undo2 className="w-3 h-3 mr-1" /> Undo
              </Button>
            )}
            {!isReadOnly && bulkHistory.length > 1 && (
              <Button variant="outline" size="sm" onClick={openBulkHistoryPicker} className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs px-2.5 py-1 h-auto">
                <History className="w-3 h-3 mr-1" /> History ({bulkHistory.length})
              </Button>
            )}
            {!isReadOnly && (
              <Button
                size="sm"
                onClick={handleToggleTimetableLock}
                variant="outline"
                className={`text-xs px-2.5 py-1 h-auto ${isTimetableLocked ? "text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                title={isTimetableLocked ? `Timetable locked — click to unlock` : "Lock timetable to prevent changes"}
              >
                {isTimetableLocked ? <Lock className="w-3 h-3 mr-1" /> : <LockOpen className="w-3 h-3 mr-1" />}
                {isTimetableLocked ? "Locked" : "Lock"}
              </Button>
            )}
            {!isReadOnly && (
              <Button
                size="sm"
                onClick={() => setGenerateOpen(true)}
                disabled={isTimetableLocked}
                className={`text-xs px-2.5 py-1 h-auto ${isTimetableLocked ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                title={isTimetableLocked ? "Unlock the timetable to regenerate" : ""}
              >
                <Zap className="w-3 h-3 mr-1" /> Generate
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 print:hidden">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        {activeTab === "timetable" && (
          <>
            {/* Term & Year selectors */}
              <div className="flex flex-wrap gap-4 mb-4 print:hidden">
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">Term</Label>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger className="h-9 w-40 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">Academic Year</Label>
                  <Input
                    value={academicYear}
                    onChange={e => setAcademicYear(e.target.value)}
                    className="h-9 w-32 text-sm"
                    placeholder="e.g. 2025/2026"
                  />
                </div>
              {conflictCount > 0 && (
                <div className="flex items-end">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm font-medium">
                    ⚠ {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} in {activeGrade}
                  </div>
                </div>
              )}
              {isTimetableLocked && (
                <div className="flex items-end">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 text-amber-700 text-sm font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    Timetable locked
                  </div>
                </div>
              )}
            </div>

            {/* ── Upcoming Holiday/Break Banner ── */}
            {upcomingHolidays.length > 0 && (
              <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 print:hidden">
                <CalendarX2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 flex-1">
                  <span className="font-semibold">Upcoming school breaks in {term}:</span>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {upcomingHolidays.map(ev => {
                      const start = new Date(ev.event_date + "T12:00:00");
                      const end   = ev.end_date ? new Date(ev.end_date + "T12:00:00") : null;
                      const fmt   = d => formatDateInLagos(d, { day: "numeric", month: "short" });
                      const dateStr = end && ev.end_date !== ev.event_date
                        ? `${fmt(start)} – ${fmt(end)}`
                        : fmt(start);
                      const typeLabel = ev.event_type === "mid_term" ? "Mid-Term Break" : ev.event_type === "vacation" ? "Vacation" : "Holiday";
                      return (
                        <span key={ev.id} className="inline-flex items-center gap-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            ev.event_type === "vacation" ? "bg-teal-100 text-teal-700" :
                            ev.event_type === "mid_term" ? "bg-orange-100 text-orange-700" :
                            "bg-emerald-100 text-emerald-700"
                          }`}>{typeLabel}</span>
                          <span className="font-medium">{ev.title}</span>
                          <span className="text-amber-600 text-xs">({dateStr})</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Class tabs — hidden for students (they only see their own class) */}
            {!isStudent && (
              <div className="flex gap-1 mb-4 flex-wrap print:hidden">
                {GRADES.map(g => {
                  const isSpecialJSS3 = g === "JSS 3" && jss3SSSMode;
                  const isActive = activeGrade === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setActiveGrade(g)}
                      title={isSpecialJSS3 ? "JSS 3 is currently taking SSS subjects" : undefined}
                      className={`relative px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                        isActive
                          ? isSpecialJSS3
                            ? "bg-indigo-600 text-white border-indigo-600 shadow"
                            : "bg-blue-600 text-white border-blue-600 shadow"
                          : isSpecialJSS3
                            ? "bg-indigo-50 text-indigo-700 border-indigo-300 hover:border-indigo-400"
                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {g}
                      {isSpecialJSS3 && (
                        <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${
                          isActive ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"
                        }`}>
                          SSS
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {isStudent && activeGrade && (
              <div className="mb-4">
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold">
                  {activeGrade} Timetable
                </span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div id="timetable-print-area">
                <h2 style={{display:"none"}} className="print-heading">{activeGrade} Timetable — {term} {academicYear}</h2>
                <TimetableGrid
                  slots={gradeSlots}
                  allSlots={termSlots}
                  grade={activeGrade}
                  term={term}
                  academicYear={academicYear}
                  teachers={teachers}
                  availabilities={availabilities}
                  onSlotClick={isReadOnly ? () => {} : openModal}
                  onClearSlot={isReadOnly ? () => {} : handleClearSlot}
                  onToggleLock={isReadOnly ? () => {} : handleToggleLock}
                  readOnly={isReadOnly}
                  periodTimes={periodTimes}
                  breakTime={breakTime}
                />
              </div>
            )}
          </>
        )}

        {activeTab === "subjects" && (
          <SubjectSetupPanel
            subjects={subjects}
            assignments={assignments}
            teachers={teachers}
            grades={GRADES}
            onSaveAssignment={handleSaveAssignment}
            availabilities={availabilities}
            ssPairings={ssPairings}
            onSaveSSPairings={handleSaveSSPairings}
            periodTimes={periodTimes}
            onSavePeriodTimes={savePeriodTimes}
            breakTime={breakTime}
            onSaveBreakTime={saveBreakTime}
          />
        )}

        {activeTab === "teachers" && (
          <TeacherConstraintPanel
            teachers={teachers}
            availabilities={availabilities}
            onSave={handleSaveAvailability}
          />
        )}

        {activeTab === "teacher-tt" && (
          <TeacherTimetableView
            teachers={timetableTeachers}
            allSlots={termSlots}
            selectedTeacherId={selectedTeacherId}
            onSelectTeacher={setSelectedTeacherId}
            term={term}
            academicYear={academicYear}
            isRestrictedToSelectedTeacher={isTeacher}
            periodTimes={periodTimes}
          />
        )}

        {activeTab === "report" && canViewTeacherWorkload(currentUser) && (
          <WorkloadReport
            allSlots={allSlots}
            teachers={timetableTeachers}
            term={term}
            academicYear={academicYear}
            grades={GRADES}
          />
        )}

        {activeTab === "live" && (
          <LiveClassesPanel
            allSlots={allSlots}
            term={term}
            academicYear={academicYear}
            teachers={teachers}
            userRole={userRole}
            fullName={fullName}
            activeGrade={activeGrade}
            isStudent={isStudent}
            periodTimes={periodTimes}
          />
        )}
      </div>

      {/* Generate Modal */}
      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        subjects={subjects}
        teachers={teachers}
        assignments={assignments}
        availabilities={availabilities}
        allSlots={termSlots}
        term={term}
        academicYear={academicYear}
        grades={GRADES}
        onGenerate={handleApplyGenerated}
        ssPairings={ssPairings}
        applyLabel={isSuperAdminUser ? "Apply to All Classes" : "Submit for Approval"}
        jss3SSSMode={jss3SSSMode}
        onJss3SSSModeChange={setJss3SSSMode}
        jss3SSSSubjects={jss3SSSSubjects}
        onJss3SSSSubjectsChange={setJss3SSSSubjects}
      />

      {/* Slot Modal - only for admin/super_admin */}
      {!isReadOnly && <SlotModal
        open={modal.open}
        onClose={closeModal}
        day={modal.day}
        period={modal.period}
        grade={activeGrade}
        existingSlot={modal.slot}
        teachers={teachers}
        subjects={subjects}
        availabilities={availabilities}
        allSlots={termSlots}
        gradeSlots={gradeSlots}
        assignments={assignments}
        onSave={handleSaveSlot}
        onToggleLock={handleToggleLock}
        isSaving={isSaving}
        periodTimes={periodTimes}
        jss3SSSMode={jss3SSSMode}
        jss3SSSSubjects={jss3SSSSubjects}
      />}
    </div>
    </>
  );
}
