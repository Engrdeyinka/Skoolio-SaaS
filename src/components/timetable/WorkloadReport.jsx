import React from "react";
import { BarChart2, User } from "lucide-react";
import { DAYS } from "./constants";


export default function WorkloadReport({ allSlots, teachers, term, academicYear, grades }) {
  const termSlots = allSlots.filter(s => s.term === term && s.academic_year === academicYear && !s.is_blocked);

  // Helper: extract the subject name that belongs to this teacher in a slot
  function getTeacherSubject(slot, teacherId) {
    if (!slot.subject_name) return null;
    if (slot.subject_name.includes("/")) {
      const [s1, s2] = slot.subject_name.split("/").map(s => s.trim());
      if (slot.teacher_id === teacherId) return s1;
      if (slot.second_teacher_id === teacherId) return s2;
      return null;
    }
    return slot.teacher_id === teacherId ? slot.subject_name : null;
  }

  // Teacher workload — count slots for BOTH teacher_id AND second_teacher_id
  const teacherReport = teachers.map(teacher => {
    const primarySlots   = termSlots.filter(s => s.teacher_id === teacher.id);
    const secondarySlots = termSlots.filter(s => s.second_teacher_id === teacher.id);
    const allTeacherSlots = [...primarySlots, ...secondarySlots];

    const byGrade = {};
    grades.forEach(g => {
      byGrade[g] = allTeacherSlots.filter(s => s.grade === g).length;
    });
    const byDay = {};
    DAYS.forEach(d => {
      byDay[d] = allTeacherSlots.filter(s => s.day === d).length;
    });

    // Show only the subject(s) this teacher actually teaches (not the paired subject)
    const subjectNames = new Set(
      allTeacherSlots.map(s => getTeacherSubject(s, teacher.id)).filter(Boolean)
    );

    return {
      teacher,
      total: allTeacherSlots.length,
      byGrade,
      byDay,
      subjects: [...subjectNames],
    };
  }).sort((a, b) => b.total - a.total);

  // Class summary — split combined "Biology/CRS" into two separate subject counts
  const classReport = grades.map(grade => {
    const gradeSlots = termSlots.filter(s => s.grade === grade);
    const bySubject = {};
    gradeSlots.forEach(s => {
      if (!s.subject_name) return;
      const names = s.subject_name.includes("/")
        ? s.subject_name.split("/").map(n => n.trim())
        : [s.subject_name];
      names.forEach(name => { bySubject[name] = (bySubject[name] || 0) + 1; });
    });
    // Unassigned = primary has no teacher, OR combined slot missing second teacher
    const unassigned = gradeSlots.filter(s => {
      if (!s.subject_name) return false;
      if (!s.teacher_id) return true;
      if (s.subject_name.includes("/") && !s.second_teacher_id) return true;
      return false;
    }).length;
    return {
      grade,
      total: gradeSlots.length,
      filled: gradeSlots.filter(s => s.subject_name).length,
      bySubject,
      unassigned,
    };
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Teacher Workload */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-lg">Teacher Workload — {term} {academicYear}</h2>
        </div>

        {teacherReport.length === 0 ? (
          <p className="text-slate-400 text-sm">No timetable data yet. Generate a timetable first.</p>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="grid text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-2" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 2fr" }}>
              <div>Teacher</div>
              <div className="text-center">Total</div>
              {DAYS.map(d => <div key={d} className="text-center">{d.slice(0, 3)}</div>)}
              <div>Classes</div>
            </div>

            {teacherReport.map(({ teacher, total, byGrade, byDay, subjects }) => (
              <div
                key={teacher.id}
                className="grid items-center gap-1 py-2 border-b border-slate-100 hover:bg-slate-50 rounded-lg px-1"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 2fr" }}
              >
                <div>
                  <div className="font-semibold text-slate-700 text-sm">{teacher.first_name} {teacher.last_name}</div>
                  <div className="text-xs text-slate-400 truncate">{subjects.join(", ") || "—"}</div>
                </div>
                <div className="text-center">
                  <span className={`font-bold text-sm ${total > 30 ? "text-red-600" : total > 20 ? "text-amber-600" : "text-slate-700"}`}>
                    {total}
                  </span>
                </div>
                {DAYS.map(d => (
                  <div key={d} className="text-center">
                    <span className={`text-xs font-medium ${(byDay[d] || 0) > 6 ? "text-red-500" : "text-slate-500"}`}>
                      {byDay[d] || 0}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-0.5">
                  {grades.filter(g => byGrade[g] > 0).map(g => (
                    <span key={g} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{g}: {byGrade[g]}</span>
                  ))}
                  {grades.every(g => byGrade[g] === 0) && <span className="text-xs text-slate-300">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Class Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-slate-800 text-lg mb-4">Class Schedule Summary</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classReport.map(({ grade, total, filled, bySubject, unassigned }) => (
            <div key={grade} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800">{grade}</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{total} periods</span>
              </div>
              {unassigned > 0 && (
                <div className="text-xs text-amber-600 mb-2">⚠ {unassigned} without teacher</div>
              )}
              <div className="space-y-1">
                {Object.entries(bySubject).sort((a, b) => b[1] - a[1]).map(([subj, count]) => (
                  <div key={subj} className="flex items-center gap-2">
                    <div className="flex-1 text-xs text-slate-600 truncate">{subj}</div>
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${count * 8}px`, maxWidth: "60px" }} />
                      <span className="text-xs font-semibold text-slate-500 w-4">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
              {Object.keys(bySubject).length === 0 && (
                <p className="text-xs text-slate-300 text-center py-2">No subjects scheduled</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}