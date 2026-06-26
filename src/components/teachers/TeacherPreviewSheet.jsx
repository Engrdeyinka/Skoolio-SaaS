import React, { useEffect, useState } from "react";
import { ClassAssignment, SchemeOfWork, AcademicRecord } from "@/entities/all";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail, Phone, Calendar, BookOpen, GraduationCap, Briefcase,
  ArrowRight, Loader2, CheckCircle2, AlertCircle, X,
} from "lucide-react";

const AVATAR_COLORS = [
  "from-emerald-500 to-emerald-600",
  "from-blue-500 to-indigo-600",
  "from-rose-500 to-pink-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-blue-500",
];
function avatarColor(name = "") {
  const n = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

const STATUS_STYLE = {
  active:   "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  on_leave: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL = { active: "Active", inactive: "Inactive", on_leave: "On Leave" };

export default function TeacherPreviewSheet({ teacher, onClose }) {
  const [assignments,    setAssignments]    = useState([]);
  const [schemes,        setSchemes]        = useState([]);
  const [recordCount,    setRecordCount]    = useState(null);
  const [loading,        setLoading]        = useState(true);

  const fullName = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim();
  const initials = `${teacher.first_name?.[0] || ""}${teacher.last_name?.[0] || ""}`;
  const color    = avatarColor(fullName);
  const status   = teacher.employment_status || "active";

  useEffect(() => {
    if (!teacher?.id) return;
    setLoading(true);
    Promise.all([
      ClassAssignment.list().catch(() => []),
      SchemeOfWork.list().catch(() => []),
      AcademicRecord.list().catch(() => []),
    ]).then(([allAssignments, allSchemes, allRecords]) => {
      const myAssignments = allAssignments.filter(
        a => a.subject_teacher_id === teacher.id && a.subject && a.grade
      );
      setAssignments(myAssignments);

      // Determine which grade/subject pairs this teacher owns
      const pairs = new Set(myAssignments.map(a => `${a.grade}|${a.subject}`));
      const mySchemes = allSchemes.filter(s => pairs.has(`${s.grade}|${s.subject}`));
      setSchemes(mySchemes);

      // Count academic records attributed to this teacher
      const myRecords = allRecords.filter(r => r.teacher_id === teacher.id);
      setRecordCount(myRecords.length);
    }).finally(() => setLoading(false));
  }, [teacher?.id]);

  // Group assignments by grade
  const byGrade = assignments.reduce((acc, a) => {
    if (!acc[a.grade]) acc[a.grade] = [];
    acc[a.grade].push(a.subject);
    return acc;
  }, {});

  const schemeSet = new Set(schemes.map(s => `${s.grade}|${s.subject}`));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <DialogTitle className="text-base font-semibold text-slate-900">Teacher Profile</DialogTitle>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Identity ── */}
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              <span className="text-white text-base font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[status] || STATUS_STYLE.inactive}`}>
                  {STATUS_LABEL[status] || status}
                </span>
              </div>
              {teacher.subject_specialization && (
                <p className="text-slate-500 text-sm mt-0.5">{teacher.subject_specialization}</p>
              )}
              {teacher.qualification && (
                <p className="text-slate-400 text-xs mt-0.5">{teacher.qualification}</p>
              )}
            </div>
          </div>

          {/* ── Contact & Employment ── */}
          <Section title="Contact & Employment">
            <div className="grid sm:grid-cols-2 gap-3">
              {teacher.email && <InfoItem icon={Mail}       label="Email"     value={teacher.email} />}
              {teacher.phone && <InfoItem icon={Phone}      label="Phone"     value={teacher.phone} />}
              {teacher.employment_date && (
                <InfoItem icon={Calendar} label="Joined"
                  value={format(new Date(teacher.employment_date + "T12:00:00"), "d MMMM yyyy")} />
              )}
              {teacher.salary && (
                <InfoItem icon={Briefcase} label="Salary"
                  value={`₦${Number(teacher.salary).toLocaleString()} / month`} />
              )}
              {teacher.address && <InfoItem icon={null} label="Address" value={teacher.address} />}
            </div>
          </Section>

          {/* ── Teaching Load ── */}
          <Section title="Teaching Load">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : Object.keys(byGrade).length === 0 ? (
              <p className="text-sm text-slate-400 italic">No class assignments found.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(byGrade).sort(([a], [b]) => a.localeCompare(b)).map(([grade, subjects]) => (
                  <div key={grade} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="w-16 flex-shrink-0">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-100 rounded-md px-2 py-1">{grade}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {subjects.map(s => (
                        <span key={s} className="text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-0.5">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Scheme of Work ── */}
          <Section title="Scheme of Work">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No assignments to check.</p>
            ) : (
              <div className="space-y-1.5">
                {assignments.map(a => {
                  const hasScheme = schemeSet.has(`${a.grade}|${a.subject}`);
                  return (
                    <div key={`${a.grade}|${a.subject}`}
                      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border text-sm
                        ${hasScheme ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                      <span className="font-medium text-slate-800">{a.grade} — {a.subject}</span>
                      {hasScheme
                        ? <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Uploaded</span>
                        : <span className="flex items-center gap-1 text-xs text-slate-400"><AlertCircle className="w-3.5 h-3.5" /> Not uploaded</span>}
                    </div>
                  );
                })}
                <Link to={createPageUrl("SchemeOfWork")} onClick={onClose}
                  className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  Manage schemes <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </Section>

          {/* ── Quick Actions ── */}
          <Section title="Quick Access">
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { label: "Academic Records",  sub: "View grades entered by this teacher",   to: `AcademicRecords?preview=${teacher.id}`,  icon: GraduationCap, color: "bg-blue-50 hover:bg-blue-100 border-blue-100"    },
                { label: "Attendance",         sub: "View attendance records",                to: "Attendance",                             icon: Calendar,      color: "bg-emerald-50 hover:bg-emerald-100 border-emerald-100" },
                { label: "CBT Tests",          sub: "Quizzes and exams",                      to: "CBT",                                    icon: BookOpen,      color: "bg-emerald-50 hover:bg-emerald-100 border-emerald-100"    },
                { label: "Timetable",          sub: "This teacher's schedule",                to: "Timetable",                              icon: Calendar,      color: "bg-amber-50 hover:bg-amber-100 border-amber-100"       },
              ].map(({ label, sub, to, icon: Icon, color }) => (
                <Link key={label} to={createPageUrl(to)} onClick={onClose}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${color}`}>
                  <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 truncate">{sub}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 ml-auto flex-shrink-0" />
                </Link>
              ))}
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</p>
      {children}
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 break-all">{value}</p>
      </div>
    </div>
  );
}
