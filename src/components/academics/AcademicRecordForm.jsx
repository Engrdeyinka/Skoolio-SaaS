
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ExamResult } from "@/entities/ExamResult";
import { Subject } from "@/entities/Subject";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, X, Save, Plus, Trash2, Loader2, ArrowRightLeft, GraduationCap } from "lucide-react";
import { logChange } from "@/lib/changeHistory";

const calculateGradeAndRemark = (total, studentClass) => {
  const isSSS = studentClass && ['SSS 1', 'SSS 2', 'SSS 3'].includes(studentClass);

  if (isSSS) {
    if (total >= 75) return { grade: "A1", remarks: "Excellent" };
    if (total >= 70) return { grade: "B2", remarks: "Very Good" };
    if (total >= 65) return { grade: "B3", remarks: "Good" };
    if (total >= 60) return { grade: "C4", remarks: "Credit" };
    if (total >= 55) return { grade: "C5", remarks: "Credit" };
    if (total >= 50) return { grade: "C6", remarks: "Credit" };
    if (total >= 45) return { grade: "D7", remarks: "Pass" };
    if (total >= 40) return { grade: "E8", remarks: "Pass" };
    return { grade: "F9", remarks: "Fail" };
  } else {
    if (total >= 70) return { grade: "A", remarks: "Excellent" };
    if (total >= 60) return { grade: "B", remarks: "Very Good" };
    if (total >= 50) return { grade: "C", remarks: "Good" };
    if (total >= 45) return { grade: "D", remarks: "Pass" };
    if (total >= 40) return { grade: "E", remarks: "Pass" };
    return { grade: "F", remarks: "Fail" };
  }
};

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

const getScoreBarColor = (score) => {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 45) return "bg-orange-500";
  return "bg-red-400";
};

const getGradePillColor = (grade) => {
  const map = {
    A: "bg-emerald-100 text-emerald-700 border-emerald-300",
    A1: "bg-emerald-100 text-emerald-700 border-emerald-300",
    B: "bg-blue-100 text-blue-700 border-blue-300",
    B2: "bg-blue-100 text-blue-700 border-blue-300",
    B3: "bg-blue-100 text-blue-700 border-blue-300",
    C: "bg-amber-100 text-amber-700 border-amber-300",
    C4: "bg-amber-100 text-amber-700 border-amber-300",
    C5: "bg-amber-100 text-amber-700 border-amber-300",
    C6: "bg-amber-100 text-amber-700 border-amber-300",
    D: "bg-orange-100 text-orange-700 border-orange-300",
    D7: "bg-orange-100 text-orange-700 border-orange-300",
    E: "bg-red-100 text-red-700 border-red-300",
    E8: "bg-red-100 text-red-700 border-red-300",
    F: "bg-red-100 text-red-700 border-red-300",
    F9: "bg-red-100 text-red-700 border-red-300",
  };
  return map[grade] || "bg-slate-100 text-slate-600 border-slate-300";
};

export default function AcademicRecordForm({
  initialStudentId,
  term,
  academicYear,
  students,
  currentUser,
  readOnly = false,
  onSubmitSuccess,
  onCancel,
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || "");
  const [scores, setScores] = useState([]);
  const [deletedScoreIds, setDeletedScoreIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [allSubjects, setAllSubjects] = useState([]);
  const [applicableSubjects, setApplicableSubjects] = useState([]);

  // Load subjects from DB once on mount
  useEffect(() => {
    Subject.list().then(data => {
      setAllSubjects(data || []);
    }).catch(err => console.error("Error loading subjects:", err));
  }, []);

  // Filter subjects by student grade whenever student or subjects list changes
  useEffect(() => {
    if (!selectedStudentId || allSubjects.length === 0) {
      setApplicableSubjects([]);
      return;
    }
    const student = students.find(s => s.id === selectedStudentId);
    if (!student?.grade) {
      setApplicableSubjects([]);
      return;
    }
    const grade = student.grade;
    // Keep subjects whose grade_levels array includes this student's grade,
    // OR subjects with no grade_levels set (treat as universal)
    const filtered = allSubjects
      .filter(s => !s.grade_levels || s.grade_levels.length === 0 || s.grade_levels.includes(grade))
      .map(s => s.subject_name)
      .filter(Boolean)
      .sort();
    setApplicableSubjects([...new Set(filtered)]);
  }, [selectedStudentId, students, allSubjects]);

  const fetchScores = useCallback(async () => {
    if (!selectedStudentId) {
      setScores([]);
      return;
    }
    setIsLoading(true);
    try {
      const existingScores = await ExamResult.filter({
        student_id: selectedStudentId,
        term: term,
        academic_year: academicYear,
      });
      setScores(existingScores.map(s => ({
        ...s,
        frontendId: generateId(),
        lt_cum: s.lt_cum || 0,
        cumulative_average: s.cumulative_average || 0,
        ca1_score: s.ca1_score || 0,
        ca2_score: s.ca2_score || 0,
        ca3_score: s.ca3_score || 0,
      })));
      setDeletedScoreIds([]);
    } catch (error) {
      console.error("Error fetching scores:", error);
    }
    setIsLoading(false);
  }, [selectedStudentId, term, academicYear]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const handleScoreChange = (frontendId, field, value) => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return;

    setScores(prevScores => {
      const newScores = [...prevScores];
      const scoreIndex = newScores.findIndex(s => s.frontendId === frontendId);
      if (scoreIndex === -1) return prevScores;

      const updatedScore = { ...newScores[scoreIndex] };
      updatedScore[field] = value;

      const ca1 = parseFloat(updatedScore.ca1_score) || 0;
      const ca2 = parseFloat(updatedScore.ca2_score) || 0;
      const ca3 = parseFloat(updatedScore.ca3_score) || 0;
      const exam = parseFloat(updatedScore.exam_score) || 0;
      const ltCum = parseFloat(updatedScore.lt_cum) || 0;

      const totalCA = Math.round(ca1 + ca2 + ca3);
      updatedScore.continuous_assessment = totalCA;

      const total = Math.round(totalCA + exam);
      updatedScore.total_score = total;

      const { grade, remarks } = calculateGradeAndRemark(total, student.grade);
      updatedScore.grade = grade;
      updatedScore.remarks = remarks;

      if (term !== 'First Term' && ltCum > 0) {
        updatedScore.cumulative_average = Math.round((ltCum + total) / 2);
      } else {
        updatedScore.cumulative_average = total;
      }

      newScores[scoreIndex] = updatedScore;
      return newScores;
    });
  };

  const addSubjectRow = () => {
    setScores(prev => [...prev, {
      frontendId: generateId(),
      subject_name: "",
      ca1_score: 0,
      ca2_score: 0,
      ca3_score: 0,
      continuous_assessment: 0,
      exam_score: 0,
      total_score: 0,
      lt_cum: 0,
      cumulative_average: 0,
      grade: "F9",
      remarks: "Fail"
    }]);
  };

  const removeSubjectRow = (frontendId) => {
    const scoreToRemove = scores.find(s => s.frontendId === frontendId);
    if (scoreToRemove && scoreToRemove.id) {
      setDeletedScoreIds(prev => [...prev, scoreToRemove.id]);
    }
    setScores(prev => prev.filter(s => s.frontendId !== frontendId));
  };

  const handleCarryOver = async () => {
    const previousTerm = term === "Second Term" ? "First Term" : term === "Third Term" ? "Second Term" : null;
    if (!previousTerm) return;

    setIsLoading(true);
    try {
      const prevTermScores = await ExamResult.filter({
        student_id: selectedStudentId,
        term: previousTerm,
        academic_year: academicYear,
      });

      if (prevTermScores.length === 0) {
        alert(`No scores found for ${previousTerm} to carry over.`);
        setIsLoading(false);
        return;
      }

      const newScores = [...scores];

      prevTermScores.forEach(prevScore => {
        const ltCumFromPreviousTerm = Number(prevScore.cumulative_average ?? prevScore.total_score) || 0;
        const existingScoreIndex = newScores.findIndex(s => s.subject_name === prevScore.subject_name);

        if (existingScoreIndex !== -1) {
          const existingScore = newScores[existingScoreIndex];
          const termTotal = parseFloat(existingScore.total_score) || 0;
          existingScore.lt_cum = ltCumFromPreviousTerm;
          existingScore.cumulative_average = Math.round((ltCumFromPreviousTerm + termTotal) / 2);
          const student = students.find(s => s.id === selectedStudentId);
          if (student) {
            const { grade, remarks } = calculateGradeAndRemark(termTotal, student.grade);
            existingScore.grade = grade;
            existingScore.remarks = remarks;
          }
        } else {
          newScores.push({
            frontendId: generateId(),
            subject_name: prevScore.subject_name,
            lt_cum: ltCumFromPreviousTerm,
            ca1_score: 0,
            ca2_score: 0,
            ca3_score: 0,
            continuous_assessment: 0,
            exam_score: 0,
            total_score: 0,
            cumulative_average: ltCumFromPreviousTerm,
            grade: 'F9',
            remarks: 'Fail',
          });
        }
      });
      setScores(newScores);
    } catch (error) {
      console.error("Error carrying over scores:", error);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    setIsSubmitting(true);

    const deletePromises = deletedScoreIds.map(id => ExamResult.delete(id));

    const upsertPromises = scores.map(score => {
      const payload = {
        student_id: selectedStudentId,
        term,
        academic_year: academicYear,
        subject_name: score.subject_name,
        ca1_score: parseFloat(score.ca1_score) || 0,
        ca2_score: parseFloat(score.ca2_score) || 0,
        ca3_score: parseFloat(score.ca3_score) || 0,
        continuous_assessment: parseFloat(score.continuous_assessment) || 0,
        exam_score: parseFloat(score.exam_score) || 0,
        total_score: parseFloat(score.total_score) || 0,
        lt_cum: parseFloat(score.lt_cum) || 0,
        cumulative_average: parseFloat(score.cumulative_average) || 0,
        grade: score.grade,
        remarks: score.remarks,
        position: score.position ? parseInt(score.position) : null,
      };

      if (score.id) {
        return ExamResult.update(score.id, payload);
      } else {
        return ExamResult.create(payload);
      }
    });

    try {
      await Promise.all([...deletePromises, ...upsertPromises]);
      const student = students.find((item) => item.id === selectedStudentId);
      await logChange({
        action: "results_saved",
        entityType: "exam_results",
        entityId: selectedStudentId,
        performedBy: currentUser?.school_role || currentUser?.full_name || "teacher",
        summary: `Saved ${scores.length} result row(s) for ${student?.first_name || "student"} ${student?.last_name || ""} in ${term} ${academicYear}.`.trim(),
        details: {
          module: "academics",
          term,
          academic_year: academicYear,
          score_rows: scores.length,
          deleted_rows: deletedScoreIds.length,
        },
      });
      onSubmitSuccess();
    } catch (error) {
      console.error("Error saving scores:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubjectSelected = (subjectName) => {
    return scores.some(score => score.subject_name === subjectName);
  };

  const getAvailableSubjects = (currentScoreId) => {
    const currentScore = scores.find(s => s.frontendId === currentScoreId);
    const currentSubject = currentScore?.subject_name;
    return applicableSubjects.filter(subject =>
      subject === currentSubject || !isSubjectSelected(subject)
    );
  };

  const isSecondOrThirdTerm = (term === 'Second Term' || term === 'Third Term');
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2 }}
      className="mb-8"
    >
      <Card className="bg-white border border-emerald-200 shadow-lg shadow-emerald-50">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-900">Manage Student Scores</CardTitle>
                <p className="text-sm text-slate-500 mt-0.5">{term} · {academicYear}</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Student selector */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Student <span className="text-red-500">*</span></Label>
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                  required
                  disabled={!!initialStudentId}
                >
                  <SelectTrigger className="bg-white border-slate-200 h-10">
                    <SelectValue placeholder="Select a student..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} — {student.grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedStudent && (
                <div className="flex items-end">
                  <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl h-10">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">{selectedStudent.grade}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Score table */}
            {selectedStudentId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-700">
                    Subject Scores
                    {scores.length > 0 && (
                      <span className="ml-2 text-emerald-600 font-normal text-xs">{scores.length} subject{scores.length !== 1 ? 's' : ''}</span>
                    )}
                  </Label>
                </div>

                {isLoading ? (
                  <div className="flex justify-center items-center h-20 bg-slate-50 rounded-xl border border-slate-200">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  </div>
                ) : scores.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">No scores yet — click <strong>Add Subject</strong> to begin</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs min-w-[860px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-44">Subject</th>
                          <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">CA 1<br /><span className="text-slate-400 font-normal">/10</span></th>
                          <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">CA 2<br /><span className="text-slate-400 font-normal">/10</span></th>
                          <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">CA 3<br /><span className="text-slate-400 font-normal">/10</span></th>
                          <th className="text-center px-2 py-2.5 font-semibold text-blue-600 w-16 bg-blue-50/50">CA Total<br /><span className="font-normal text-blue-400">/30</span></th>
                          <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">Exam<br /><span className="text-slate-400 font-normal">/70</span></th>
                          <th className="text-center px-2 py-2.5 font-semibold text-emerald-600 w-16 bg-emerald-50/50">Total<br /><span className="font-normal text-emerald-400">/100</span></th>
                          {isSecondOrThirdTerm && (
                            <>
                              <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">L.T. CUM</th>
                              <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">Cum Avg</th>
                            </>
                          )}
                          <th className="text-center px-2 py-2.5 font-semibold text-slate-600 w-16">Grade</th>
                          <th className="text-left px-2 py-2.5 font-semibold text-slate-600">Remarks</th>
                          <th className="w-8 px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scores.map((score, rowIdx) => (
                          <tr
                            key={score.frontendId}
                            className={rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                          >
                            {/* Subject select */}
                            <td className="px-2 py-2">
                              <Select
                                value={score.subject_name}
                                onValueChange={(val) => handleScoreChange(score.frontendId, 'subject_name', val)}
                              >
                                <SelectTrigger className="h-8 bg-white text-xs border-slate-200">
                                  <SelectValue placeholder="Subject" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getAvailableSubjects(score.frontendId).map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>

                            {/* CA 1 */}
                            <td className="px-2 py-2">
                              <Input
                                className="h-8 text-center text-xs bg-white border-slate-200 p-1"
                                type="number"
                                placeholder="0"
                                value={score.ca1_score ?? ''}
                                onChange={e => handleScoreChange(score.frontendId, 'ca1_score', e.target.value)}
                                min="0" max="10" step="0.5"
                              />
                            </td>

                            {/* CA 2 */}
                            <td className="px-2 py-2">
                              <Input
                                className="h-8 text-center text-xs bg-white border-slate-200 p-1"
                                type="number"
                                placeholder="0"
                                value={score.ca2_score ?? ''}
                                onChange={e => handleScoreChange(score.frontendId, 'ca2_score', e.target.value)}
                                min="0" max="10" step="0.5"
                              />
                            </td>

                            {/* CA 3 */}
                            <td className="px-2 py-2">
                              <Input
                                className="h-8 text-center text-xs bg-white border-slate-200 p-1"
                                type="number"
                                placeholder="0"
                                value={score.ca3_score ?? ''}
                                onChange={e => handleScoreChange(score.frontendId, 'ca3_score', e.target.value)}
                                min="0" max="10" step="0.5"
                              />
                            </td>

                            {/* CA Total (auto) */}
                            <td className="px-2 py-2 bg-blue-50/30">
                              <div className="h-8 flex items-center justify-center bg-blue-50 border border-blue-200 rounded-md font-bold text-blue-700 text-xs">
                                {score.continuous_assessment ?? 0}
                              </div>
                            </td>

                            {/* Exam */}
                            <td className="px-2 py-2">
                              <Input
                                className="h-8 text-center text-xs bg-white border-slate-200 p-1"
                                type="number"
                                placeholder="0"
                                value={score.exam_score ?? ''}
                                onChange={e => handleScoreChange(score.frontendId, 'exam_score', e.target.value)}
                                min="0" max="70" step="0.5"
                              />
                            </td>

                            {/* Total (auto) */}
                            <td className="px-2 py-2 bg-emerald-50/30">
                              <div className="h-8 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-md font-bold text-emerald-700 text-xs">
                                {score.total_score ?? 0}
                              </div>
                            </td>

                            {/* L.T. CUM + Cumulative avg (2nd/3rd term only) */}
                            {isSecondOrThirdTerm && (
                              <>
                                <td className="px-2 py-2">
                                  <Input
                                    className="h-8 text-center text-xs bg-white border-slate-200 p-1"
                                    type="number"
                                    placeholder="0"
                                    value={score.lt_cum ?? ''}
                                    onChange={e => handleScoreChange(score.frontendId, 'lt_cum', e.target.value)}
                                    min="0" max="100" step="0.5"
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <div className="h-8 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-md font-medium text-slate-600 text-xs">
                                    {score.cumulative_average ?? 0}
                                  </div>
                                </td>
                              </>
                            )}

                            {/* Grade (auto) */}
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${getGradePillColor(score.grade)}`}>
                                {score.grade || '—'}
                              </span>
                            </td>

                            {/* Remarks (auto) */}
                            <td className="px-2 py-2">
                              <span className="text-slate-500 text-xs">{score.remarks || '—'}</span>
                            </td>

                            {/* Delete */}
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeSubjectRow(score.frontendId)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors mx-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Action row */}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSubjectRow}
                  disabled={readOnly || !selectedStudentId}
                  className="gap-2 border-dashed border-slate-300 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50"
                >
                <Plus className="w-4 h-4" />
                Add Subject
              </Button>

              {isSecondOrThirdTerm && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCarryOver}
                  disabled={readOnly || !selectedStudentId || isLoading}
                  className="gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:border-sky-300"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Carry Over from {term === 'Second Term' ? 'First' : 'Second'} Term
                </Button>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={readOnly || isSubmitting || !selectedStudentId}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-100 gap-2 min-w-[140px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save All Scores
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
