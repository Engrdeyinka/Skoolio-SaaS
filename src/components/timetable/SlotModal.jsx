import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Ban, Loader2, Lock, Unlock } from "lucide-react";
import { PERIOD_TIMES as DEFAULT_PERIOD_TIMES, BLOCK_LABELS } from "./constants";

function getConflicts({ day, period, teacherId, gradeSlots, allSlots, availabilities, subjectName, grade }) {
  const warnings = [];
  if (!teacherId) return warnings;
  const avail = availabilities.find(a => a.teacher_id === teacherId);
  if (avail) {
    if (avail.employment_type !== 'part_time') {
      if (avail.unavailable_days?.includes(day)) warnings.push(`Teacher unavailable on ${day}`);
      if (avail.unavailable_periods?.includes(period)) warnings.push(`Teacher unavailable at period ${period}`);
    } else {
      // Part-time: only check per-day period availability
      if (avail.unavailable_periods_by_day?.[day]?.includes(period)) {
        warnings.push(`Teacher unavailable on ${day} at period ${period}`);
      }
    }
    
    const dayCount = allSlots.filter(s => s.teacher_id === teacherId && s.day === day && !(s.period === period && s.grade === grade)).length + 1;
    if (dayCount > (avail.max_periods_per_day ?? 8)) warnings.push(`Exceeds teacher's max ${avail.max_periods_per_day} periods/day`);
    const weekCount = allSlots.filter(s => s.teacher_id === teacherId && !(s.period === period && s.grade === grade)).length + 1;
    if (weekCount > (avail.max_periods_per_week ?? 40)) warnings.push(`Exceeds teacher's max ${avail.max_periods_per_week} periods/week`);
  }
  const clash = allSlots.find(s => s.teacher_id === teacherId && s.day === day && s.period === period && s.grade !== grade);
  if (clash) warnings.push(`Teacher already assigned to ${clash.grade} at this slot`);
  return warnings;
}

export default function SlotModal({ open, onClose, day, period, grade, existingSlot, teachers, subjects, availabilities, allSlots, gradeSlots, assignments, onSave, onToggleLock, isSaving, periodTimes = DEFAULT_PERIOD_TIMES, jss3SSSMode = false, jss3SSSSubjects = [] }) {
   const [teacherId, setTeacherId] = useState("");
   const [subjectName, setSubjectName] = useState("");
   const [isCombined, setIsCombined] = useState(false);
   const [secondSubjectName, setSecondSubjectName] = useState("");
   const [secondTeacherId, setSecondTeacherId] = useState("");
   const [mode, setMode] = useState("subject");
   const [blockLabel, setBlockLabel] = useState("");
   const [customLabel, setCustomLabel] = useState("");
   const [blockAllClasses, setBlockAllClasses] = useState(false);
   const [togglingLock, setTogglingLock] = useState(false);

  useEffect(() => {
    if (open) {
      setTeacherId(existingSlot?.teacher_id || "");
      const existingSubject = existingSlot?.subject_name || "";
      // Check if the existing subject is a known one or a custom combined one
      if (existingSlot?.is_blocked) {
        setMode("block");
        setBlockLabel(existingSlot.block_label || "");
        setIsCombined(false);
        setSecondSubjectName("");
        setSecondTeacherId("");
        setSubjectName("");
      } else {
        setMode("subject");
        setBlockLabel("");
        setCustomLabel("");
        // Detect combined subject saved as "Sub1/Sub2"
        if (existingSubject && existingSubject.includes("/")) {
          const [s1, s2] = existingSubject.split("/");
          setSubjectName(s1.trim());
          setSecondSubjectName(s2.trim());
          setIsCombined(true);
        } else {
          setSubjectName(existingSubject);
          setIsCombined(false);
          setSecondSubjectName("");
          setSecondTeacherId("");
        }
      }
    }
  }, [open, existingSlot]);

  // When JSS 3 is in SSS mode, look up teachers from SSS assignments
  const SSS_GRADES = ["SSS 1", "SSS 2", "SSS 3"];
  const isJss3SSSMode = jss3SSSMode && grade === "JSS 3";

  const findTeacherForSubject = (subjectVal) => {
    if (isJss3SSSMode) {
      // Try SSS grade assignments first, then fall back to any assignment for that subject
      const sssAssignment = assignments.find(
        a => SSS_GRADES.includes(a.grade) && a.subject === subjectVal
      );
      return sssAssignment?.subject_teacher_id || null;
    }
    return assignments.find(a => a.grade === grade && a.subject === subjectVal)?.subject_teacher_id || null;
  };

  // Auto-set teacher when subject is selected
  const handleSubjectChange = (val) => {
    setSubjectName(val);
    const tid = findTeacherForSubject(val);
    if (tid) setTeacherId(tid);
  };

  const handleSecondSubjectChange = (val) => {
    setSecondSubjectName(val);
    const tid = findTeacherForSubject(val);
    if (tid) setSecondTeacherId(tid);
  };

  const finalSubjectName = isCombined && secondSubjectName ? `${subjectName}/${secondSubjectName}` : subjectName;
  const warnings = getConflicts({ day, period, teacherId, gradeSlots, allSlots, availabilities, subjectName: finalSubjectName, grade });

  // Subject list: if JSS 3 is in SSS mode show SSS subjects, otherwise show grade's own subjects
  const allGradeSubjects = isJss3SSSMode
    ? (jss3SSSSubjects.length > 0
        ? subjects.filter(s => jss3SSSSubjects.includes(s.subject_name))
        : subjects.filter(s => s.grade_levels && SSS_GRADES.some(g => s.grade_levels.includes(g)))
      )
    : subjects.filter(s => s.grade_levels && s.grade_levels.includes(grade));

  // Only show subjects that have an assigned teacher
  const gradeSubjects = allGradeSubjects.filter(s => findTeacherForSubject(s.subject_name));
  const hiddenCount = allGradeSubjects.length - gradeSubjects.length;

  // Validation: selected subject must have a teacher
  const subjectMissingTeacher = subjectName && !findTeacherForSubject(subjectName);
  const secondSubjectMissingTeacher = isCombined && secondSubjectName && !findTeacherForSubject(secondSubjectName);
  const teacherOptions = teachers.filter(
    (teacher) =>
      teacher.employment_status !== "inactive" ||
      teacher.id === teacherId ||
      teacher.id === secondTeacherId
  );
  const canToggleLock = Boolean(existingSlot?.id && !existingSlot?.is_blocked && typeof onToggleLock === "function");

  const finalBlockLabel = blockLabel === "__custom__" ? customLabel : blockLabel;

  const handleToggleLockClick = async () => {
    if (!canToggleLock || togglingLock) return;
    setTogglingLock(true);
    try {
      await onToggleLock(existingSlot);
      onClose();
    } finally {
      setTogglingLock(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            <span className="text-blue-600">{grade}</span> — {day}, P{period}
            <span className="text-slate-400 text-sm font-normal ml-2">({periodTimes[period]})</span>
          </DialogTitle>
        </DialogHeader>

        {canToggleLock && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleToggleLockClick}
              disabled={togglingLock}
              className={existingSlot?.is_locked ? "text-amber-700 border-amber-300 hover:bg-amber-50" : ""}
            >
              {togglingLock ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : existingSlot?.is_locked ? (
                <Unlock className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Lock className="w-3.5 h-3.5 mr-1.5" />
              )}
              {existingSlot?.is_locked ? "Unlock Slot" : "Lock Slot"}
            </Button>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex gap-2 py-1">
          <button
            onClick={() => setMode("subject")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${mode === "subject" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            Assign Subject
          </button>
          <button
            onClick={() => setMode("block")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5 ${mode === "block" ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            <Ban className="w-3.5 h-3.5" /> Block Period
          </button>
        </div>

        {mode === "block" ? (
           <div className="space-y-3 py-2">
             <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
               This period will be blocked and cannot be scheduled for teaching.
             </div>
             <div>
               <Label className="text-sm mb-1.5 block">Activity / Purpose</Label>
               <div className="flex flex-wrap gap-1.5 mb-2">
                 {BLOCK_LABELS.map(lbl => (
                   <button
                     key={lbl}
                     onClick={() => setBlockLabel(lbl)}
                     className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                       blockLabel === lbl ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                     }`}
                   >
                     {lbl}
                   </button>
                 ))}
                 <button
                   onClick={() => setBlockLabel("__custom__")}
                   className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                     blockLabel === "__custom__" ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                   }`}
                 >
                   + Custom
                 </button>
               </div>
               {blockLabel === "__custom__" && (
                 <Input
                   placeholder="Enter activity name..."
                   value={customLabel}
                   onChange={e => setCustomLabel(e.target.value)}
                   className="mt-1"
                 />
               )}
             </div>

             <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
               <input
                 type="checkbox"
                 id="block-all"
                 checked={blockAllClasses}
                 onChange={(e) => setBlockAllClasses(e.target.checked)}
                 className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
               />
               <label htmlFor="block-all" className="text-sm text-blue-700 font-medium cursor-pointer flex-1">
                 Block this period across all classes
               </label>
             </div>
           </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Subject 1 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm">{isCombined ? "Subject 1" : "Subject"}</Label>
                <button
                  onClick={() => { setIsCombined(!isCombined); setSecondSubjectName(""); setSecondTeacherId(""); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {isCombined ? "← Single subject" : "+ Combined period"}
                </button>
              </div>
              <Select value={subjectName} onValueChange={handleSubjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject..." />
                </SelectTrigger>
                <SelectContent>
                  {gradeSubjects.length === 0
                    ? <div className="px-3 py-4 text-xs text-slate-400 text-center">No subjects with assigned teachers</div>
                    : gradeSubjects.map(s => (
                        <SelectItem key={s.id} value={s.subject_name}>{s.subject_name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
              {hiddenCount > 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {hiddenCount} subject{hiddenCount > 1 ? "s" : ""} hidden — no teacher assigned yet
                </p>
              )}
            </div>

            {/* Teacher 1 */}
            <div>
              <Label className="text-sm mb-1.5 block">{isCombined ? "Teacher 1" : "Teacher"}</Label>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No teacher</SelectItem>
                   {teacherOptions.map(t => (
                     <SelectItem key={t.id} value={t.id}>
                       {t.first_name} {t.last_name}
                     </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Combined: Subject 2 + Teacher 2 */}
            {isCombined && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700">Second Subject (Combined Period)</p>
                <div>
                  <Label className="text-sm mb-1.5 block">Subject 2</Label>
                  <Select value={secondSubjectName} onValueChange={handleSecondSubjectChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select second subject..." />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeSubjects.map(s => (
                        <SelectItem key={s.id} value={s.subject_name}>{s.subject_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Teacher 2</Label>
                  <Select value={secondTeacherId} onValueChange={setSecondTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No teacher</SelectItem>
                      {teacherOptions.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.first_name} {t.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}


            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" /> Scheduling Warnings
                </div>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">• {w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
           <Button variant="outline" onClick={onClose} size="sm" disabled={isSaving}>Cancel</Button>
           {mode === "block" ? (
             <Button
               size="sm"
               className="bg-slate-700 hover:bg-slate-800 text-white"
               onClick={() => onSave({ is_blocked: true, block_label: finalBlockLabel, subject_name: "", teacher_id: null, block_all_classes: blockAllClasses })}
               disabled={isSaving}
             >
               {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : blockAllClasses ? "Block All Classes" : "Block Period"}
             </Button>
           ) : (
            <Button
              size="sm"
              disabled={!subjectName || subjectMissingTeacher || (isCombined && !secondSubjectName) || secondSubjectMissingTeacher || isSaving}
              onClick={() => onSave({ subject_name: finalSubjectName, teacher_id: teacherId && teacherId !== "none" ? teacherId : null, second_teacher_id: isCombined && secondTeacherId && secondTeacherId !== "none" ? secondTeacherId : null, is_blocked: false, block_label: "" })}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : warnings.length > 0 ? "Save Anyway" : "Save Slot"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
