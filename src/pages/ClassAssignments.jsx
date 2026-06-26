import React, { useState, useEffect } from 'react';
import { Teacher, ClassAssignment, Subject } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Link2, Save, GraduationCap, Loader2, BookOpen, CheckCircle2, UserCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from "framer-motion";

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

const PRIMARY_GRADES = ["KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4"];
const SECONDARY_GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

const SECTION_COLORS = {
  "JSS 1": "bg-blue-50 border-blue-200",
  "JSS 2": "bg-blue-50 border-blue-200",
  "JSS 3": "bg-blue-50 border-blue-200",
  "SSS 1": "bg-indigo-50 border-indigo-200",
  "SSS 2": "bg-indigo-50 border-indigo-200",
  "SSS 3": "bg-indigo-50 border-indigo-200",
};

const LABEL_COLORS = {
  "JSS 1": "bg-blue-100 text-blue-700",
  "JSS 2": "bg-blue-100 text-blue-700",
  "JSS 3": "bg-blue-100 text-blue-700",
  "SSS 1": "bg-indigo-100 text-indigo-700",
  "SSS 2": "bg-indigo-100 text-indigo-700",
  "SSS 3": "bg-indigo-100 text-indigo-700",
};

export default function ClassAssignmentsPage({ embedded = false }) {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [teachersData, assignmentsData, subjectsData] = await Promise.all([
        Teacher.list(),
        ClassAssignment.list(),
        Subject.list()
      ]);
      setTeachers(teachersData);
      setSubjects(subjectsData);

      const assignmentsMap = assignmentsData.reduce((acc, assignment) => {
        const key = assignment.subject ? `${assignment.grade}-${assignment.subject}` : assignment.grade;
        acc[key] = assignment;
        return acc;
      }, {});
      setAssignments(assignmentsMap);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssignmentChange = (key, teacherId, isSubject = false) => {
    setAssignments(prev => {
      const existingAssignment = prev[key];

      if (!teacherId) {
        // User picked "Unassigned"
        if (existingAssignment?.id) {
          if (isSubject) {
            // Subject row: keep the row (it holds periods_per_week / max_per_day /
            // allow_double for the timetable solver) but mark its FK for clearing.
            // The save handler PATCHes subject_teacher_id to NULL.
            return {
              ...prev,
              [key]: {
                ...existingAssignment,
                subject_teacher_id: null,
                _clearTeacher: true,
                _shouldDelete: false,
              },
            };
          }
          // Class-teacher row: delete the whole row — it carries no other state.
          return {
            ...prev,
            [key]: { ...existingAssignment, teacher_id: null, _shouldDelete: true },
          };
        }
        // No existing record yet — just drop it from local state.
        const { [key]: removed, ...rest } = prev;
        return rest;
      }

      if (existingAssignment) {
        const fieldToUpdate = isSubject ? 'subject_teacher_id' : 'teacher_id';
        return {
          ...prev,
          [key]: {
            ...existingAssignment,
            [fieldToUpdate]: teacherId,
            _shouldDelete: false,
            _clearTeacher: false,
          },
        };
      } else {
        const [grade, subject] = key.split('-');
        const newAssignment = { grade, id: null };
        if (isSubject) {
          newAssignment.subject = subject;
          newAssignment.subject_teacher_id = teacherId;
        } else {
          newAssignment.teacher_id = teacherId;
        }
        return { ...prev, [key]: newAssignment };
      }
    });
  };

  const handleSaveAssignments = async () => {
    setIsSaving(true);
    try {
      // Re-fetch the latest records from DB before saving.
      // This ensures we use the correct IDs even if SubjectSetupPanel (in the
      // Timetable page) created or updated records after this page last loaded,
      // which would otherwise cause duplicate class_assignment rows.
      const freshData = await ClassAssignment.list();
      const freshMap = freshData.reduce((acc, a) => {
        const key = a.subject ? `${a.grade}-${a.subject}` : a.grade;
        // Keep the most recently created record per key
        if (!acc[key] || (a.created_date > acc[key].created_date)) acc[key] = a;
        return acc;
      }, {});

      // Collect IDs of any duplicate records so we can clean them up
      const duplicateIds = [];
      const seen = new Set();
      freshData.forEach(a => {
        const key = a.subject ? `${a.grade}-${a.subject}` : a.grade;
        if (seen.has(key) && a.id !== freshMap[key]?.id) {
          duplicateIds.push(a.id);
        } else {
          seen.add(key);
        }
      });

      const promises = [];

      // Delete stale duplicate records first
      duplicateIds.forEach(id => promises.push(ClassAssignment.delete(id)));

      Object.entries(assignments).forEach(([key, assignment]) => {
        // Prefer the fresh DB ID over whatever was in local state
        const freshRecord = freshMap[key];
        const recordId    = freshRecord?.id || assignment.id;

        if (assignment._shouldDelete && recordId) {
          promises.push(ClassAssignment.delete(recordId));
        } else if (assignment._clearTeacher && recordId) {
          // Explicit unassign for a subject row — PATCH the FK to NULL while
          // preserving timetable settings (periods_per_week etc.) so the
          // teacher can be left blank without losing the row's other state.
          promises.push(
            ClassAssignment.update(recordId, {
              grade: assignment.grade,
              ...(assignment.subject && { subject: assignment.subject }),
              subject_teacher_id: null,
              ...(freshRecord?.periods_per_week != null && { periods_per_week: freshRecord.periods_per_week }),
              ...(freshRecord?.max_per_day     != null && { max_per_day:      freshRecord.max_per_day }),
              ...(freshRecord?.allow_double    != null && { allow_double:     freshRecord.allow_double }),
            })
          );
        } else if (assignment.teacher_id || assignment.subject_teacher_id) {
          const updateData = {
            grade: assignment.grade,
            ...(assignment.teacher_id      && { teacher_id:          assignment.teacher_id }),
            ...(assignment.subject         && { subject:             assignment.subject }),
            ...(assignment.subject_teacher_id && { subject_teacher_id: assignment.subject_teacher_id }),
            // Preserve timetable-specific fields so SubjectSetupPanel values
            // are never lost when saving from this page (Supabase update is
            // PATCH, but create needs these to avoid creating sparse records)
            ...(freshRecord?.periods_per_week != null && { periods_per_week: freshRecord.periods_per_week }),
            ...(freshRecord?.max_per_day     != null && { max_per_day:      freshRecord.max_per_day }),
            ...(freshRecord?.allow_double    != null && { allow_double:     freshRecord.allow_double }),
          };

          if (recordId) {
            promises.push(ClassAssignment.update(recordId, updateData));
          } else {
            promises.push(ClassAssignment.create(updateData));
          }
        }
      });

      await Promise.all(promises);

      // Sync secondary class teachers → teacher.classes_assigned so attendance access updates
      const teacherUpdates = {};
      for (const grade of SECONDARY_GRADES) {
        const oldTeacherId = freshMap[grade]?.teacher_id || null;
        const newTeacherId = assignments[grade]?.teacher_id || null;
        if (oldTeacherId === newTeacherId) continue;
        if (oldTeacherId) {
          if (!teacherUpdates[oldTeacherId]) teacherUpdates[oldTeacherId] = { add: [], remove: [] };
          teacherUpdates[oldTeacherId].remove.push(grade);
        }
        if (newTeacherId) {
          if (!teacherUpdates[newTeacherId]) teacherUpdates[newTeacherId] = { add: [], remove: [] };
          teacherUpdates[newTeacherId].add.push(grade);
        }
      }
      for (const [teacherId, changes] of Object.entries(teacherUpdates)) {
        const teacher = teachers.find(t => t.id === teacherId);
        if (!teacher) continue;
        let updated = [...(teacher.classes_assigned || [])];
        updated = updated.filter(c => !changes.remove.includes(c));
        changes.add.forEach(c => { if (!updated.includes(c)) updated.push(c); });
        await Teacher.update(teacherId, { classes_assigned: updated });
      }

      loadData();
    } catch (error) {
      console.error("Error saving assignments:", error);
    }
    setIsSaving(false);
  };

  const assignedPrimaryCount = PRIMARY_GRADES.filter(g => assignments[g]?.teacher_id).length;
  const assignedSecondaryClassTeacherCount = SECONDARY_GRADES.filter(g => assignments[g]?.teacher_id).length;
  const totalSecondarySlots = SECONDARY_GRADES.reduce((acc, grade) => {
    return acc + subjects.filter(s => s.grade_levels && s.grade_levels.includes(grade)).length;
  }, 0);
  const assignedSecondaryCount = SECONDARY_GRADES.reduce((acc, grade) => {
    return acc + subjects.filter(s => s.grade_levels && s.grade_levels.includes(grade) && assignments[`${grade}-${s.subject_name}`]?.subject_teacher_id).length;
  }, 0);

  return (
    <div className={embedded ? "" : "p-6 md:p-8 min-h-screen"}>
      <div className={embedded ? "" : "max-w-4xl mx-auto"}>

        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">
              Class Assignments
            </h1>
            <p className="text-slate-500">
              Assign teachers to class levels and subjects
            </p>
          </div>
          <Button
            onClick={handleSaveAssignments}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-100 gap-2 min-w-[160px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save All Assignments
              </>
            )}
          </Button>
        </div>

        {/* Stats row */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Primary Class Teachers</p>
                <p className="text-xl font-bold text-slate-900">
                  {assignedPrimaryCount}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {PRIMARY_GRADES.length}</span>
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <UserCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Secondary Class Teachers</p>
                <p className="text-xl font-bold text-slate-900">
                  {assignedSecondaryClassTeacherCount}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {SECONDARY_GRADES.length}</span>
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Subject Teachers</p>
                <p className="text-xl font-bold text-slate-900">
                  {assignedSecondaryCount}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {totalSecondarySlots}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Primary / Class Teachers */}
          <Card className="bg-white shadow-sm border border-slate-200/80">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                Class Teachers
                <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-1">
                  KG – Primary 4
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {isLoading ? (
                <div className="space-y-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse h-14 bg-slate-100 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence>
                    {PRIMARY_GRADES.map((grade, index) => {
                      const isAssigned = !!assignments[grade]?.teacher_id;
                      const assignedTeacher = isAssigned
                        ? teachers.find(t => t.id === assignments[grade].teacher_id)
                        : null;

                      return (
                        <motion.div
                          key={grade}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04 }}
                        >
                          <div className={`p-3.5 rounded-xl border transition-all ${
                            isAssigned
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isAssigned ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 text-sm">{grade}</p>
                                  {assignedTeacher && (
                                    <p className="text-xs text-emerald-600 truncate">
                                      {assignedTeacher.first_name} {assignedTeacher.last_name}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="w-44 flex-shrink-0">
                                <Select
                                  value={assignments[grade]?.teacher_id || ''}
                                  onValueChange={(teacherId) => handleAssignmentChange(grade, teacherId, false)}
                                >
                                  <SelectTrigger className={`h-8 text-xs ${isAssigned ? 'bg-white border-emerald-200' : 'bg-white border-slate-200'}`}>
                                    <SelectValue placeholder="Assign teacher..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={null}>Unassigned</SelectItem>
                                    {teachers.map(teacher => (
                                      <SelectItem key={teacher.id} value={teacher.id}>
                                        {teacher.first_name} {teacher.last_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Secondary / Subject Teachers */}
          <Card className="bg-white shadow-sm border border-slate-200/80">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                </div>
                Subject Teachers
                <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-1">
                  JSS 1 – SSS 3
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {isLoading ? (
                <div className="space-y-4">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-5 bg-slate-200 rounded w-20" />
                      <div className="h-12 bg-slate-100 rounded-xl" />
                      <div className="h-12 bg-slate-100 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {SECONDARY_GRADES.map((grade, gradeIndex) => {
                    const gradeSubjects = subjects.filter(s => s.grade_levels && s.grade_levels.includes(grade));
                    const assignedInGrade = gradeSubjects.filter(s => assignments[`${grade}-${s.subject_name}`]?.subject_teacher_id).length;
                    const classTeacherId = assignments[grade]?.teacher_id || '';
                    const classTeacher = classTeacherId ? teachers.find(t => t.id === classTeacherId) : null;

                    return (
                      <div key={grade}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${LABEL_COLORS[grade] || 'bg-slate-100 text-slate-600'}`}>
                            {grade}
                          </span>
                          {gradeSubjects.length > 0 && (
                            <span className="text-xs text-slate-400">
                              {assignedInGrade}/{gradeSubjects.length} subjects assigned
                            </span>
                          )}
                        </div>

                        {/* Class Teacher row */}
                        <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${classTeacher ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            {classTeacher ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <UserCircle2 className="w-4 h-4 text-slate-300 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800">Class Teacher</p>
                              {classTeacher ? (
                                <p className="text-xs text-emerald-600 truncate">{classTeacher.first_name} {classTeacher.last_name}</p>
                              ) : (
                                <p className="text-xs text-slate-400">Not assigned — cannot mark attendance</p>
                              )}
                            </div>
                          </div>
                          <div className="w-48 flex-shrink-0">
                            <Select
                              value={classTeacherId}
                              onValueChange={(tid) => handleAssignmentChange(grade, tid, false)}
                            >
                              <SelectTrigger className={`h-8 text-xs ${classTeacher ? 'bg-white border-emerald-200' : 'bg-white border-slate-200'}`}>
                                <SelectValue placeholder="Assign class teacher…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={null}>Unassigned</SelectItem>
                                {teachers.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {gradeSubjects.length === 0 ? (
                          <div className="flex items-center gap-2 py-3 px-4 rounded-xl bg-slate-50 border border-slate-100">
                            <BookOpen className="w-4 h-4 text-slate-300" />
                            <p className="text-slate-400 text-sm">No subjects configured for {grade}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {gradeSubjects.map((subject) => {
                              const key = `${grade}-${subject.subject_name}`;
                              const isAssigned = !!assignments[key]?.subject_teacher_id;
                              const assignedTeacher = isAssigned
                                ? teachers.find(t => t.id === assignments[key].subject_teacher_id)
                                : null;

                              return (
                                <div
                                  key={`${grade}-${subject.id}`}
                                  className={`p-3 rounded-xl border transition-all ${
                                    isAssigned
                                      ? `${SECTION_COLORS[grade] || 'bg-blue-50 border-blue-200'}`
                                      : 'bg-slate-50 border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {isAssigned ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                                      )}
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-700 text-sm truncate">{subject.subject_name}</p>
                                        {assignedTeacher && (
                                          <p className="text-xs text-blue-600 truncate">
                                            {assignedTeacher.first_name} {assignedTeacher.last_name}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="w-36 flex-shrink-0">
                                      <Select
                                        value={assignments[key]?.subject_teacher_id || ''}
                                        onValueChange={(teacherId) => handleAssignmentChange(key, teacherId, true)}
                                      >
                                        <SelectTrigger className={`h-7 text-xs ${isAssigned ? 'bg-white' : 'bg-white border-slate-200'}`}>
                                          <SelectValue placeholder="Assign..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value={null}>Unassigned</SelectItem>
                                          {teachers.map(teacher => (
                                            <SelectItem key={teacher.id} value={teacher.id}>
                                              {teacher.first_name} {teacher.last_name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Save Button */}
        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSaveAssignments}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-100 gap-2 min-w-[160px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save All Assignments
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
