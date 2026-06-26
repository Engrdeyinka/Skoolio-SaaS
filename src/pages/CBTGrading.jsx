import React, { useState, useEffect } from 'react';
import { Quiz, Question, CBTAttempt, Student, ExamResult, User, Teacher } from '@/entities/all';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Save, CheckCircle, Clock, AlertCircle, RotateCcw, Printer, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import MathRenderer from '@/components/cbt/MathRenderer';
import katex from 'katex';

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

export default function CBTGradingPage() {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [essayScores, setEssayScores] = useState({});
  const [teacherComments, setTeacherComments] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allSaved, setAllSaved] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [redoExpandedId, setRedoExpandedId] = useState(null);  // which attempt has redo form open
  const [redoDeadlines, setRedoDeadlines] = useState({});       // deadlines keyed by attempt.id
  const [isSubmittingRedo, setIsSubmittingRedo] = useState(false);
  const [showPrintSelector, setShowPrintSelector] = useState(false);
  const [printSelected, setPrintSelected] = useState([]);       // student_ids to print

  const urlParams = new URLSearchParams(window.location.search);
  const quizId = urlParams.get('quizId');

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const user = await User.me();
        setCurrentUser(user);

        if (user.school_role !== 'admin' && user.school_role !== 'teacher' && user.school_role !== 'super_admin') {
          setAccessDenied(true);
          setIsLoading(false);
          return;
        }

        const [quizData, questionsData, attemptsData, studentsData] = await Promise.all([
          Quiz.get(quizId),
          Question.filter({ quiz_id: quizId }),
          CBTAttempt.filter({ quiz_id: quizId }),
          Student.list()
        ]);

        // All teachers and admins are allowed to grade any quiz

        setQuiz(quizData);
        setQuestions(questionsData);
        setAttempts(attemptsData);
        setStudents(studentsData);
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Failed to load grading data");
      }
      setIsLoading(false);
    };

    if (quizId) loadData();
  }, [quizId]);

  const handleSelectAttempt = (attempt) => {
    setSelectedAttempt(attempt);
    setEssayScores(attempt.essay_scores || {});
    setTeacherComments(attempt.teacher_comments || {});
  };

  const handleSaveAllToRecords = async () => {
    setIsSaving(true);
    let savedCount = 0;
    try {
      const essayQs  = questions.filter(q => q.question_type === 'essay');
      const mcqQs    = questions.filter(q => q.question_type !== 'essay');
      const hasEssay = essayQs.length > 0;
      const hasMCQ   = mcqQs.length > 0;
      const testType = quiz?.test_type;

      for (const attempt of attempts) {
        if (!attempt.student_id) continue;

        const attemptEssayScores = attempt.essay_scores || {};
        const anyEssayGraded = essayQs.some(
          q => attemptEssayScores[q.id] !== undefined && attemptEssayScores[q.id] !== null && attemptEssayScores[q.id] !== ''
        );
        if (hasEssay && hasMCQ && !anyEssayGraded && attempt.grading_status !== 'fully_graded') continue;

        const totalEssayScore = essayQs.reduce((sum, q) => sum + (parseFloat(attemptEssayScores[q.id]) || 0), 0);
        const maxEssayScore   = essayQs.reduce((sum, q) => sum + (q.max_score || 10), 0);
        const essayPct  = maxEssayScore > 0 ? (totalEssayScore / maxEssayScore) * 100 : 0;
        const mcqScore  = mcqQs.length > 0
          ? (mcqQs.filter(q => attempt.submitted_answers?.[q.id] === q.correct_option_index).length / mcqQs.length) * 100
          : 0;

        let finalScore = hasEssay && hasMCQ ? (mcqScore * 0.5) + (essayPct * 0.5)
                       : hasEssay           ? essayPct
                       :                      mcqScore;
        finalScore = Math.min(Math.max(finalScore || 0, 0), 100);

        const student  = students.find(s => s.id === attempt.student_id);
        let testScore  = 0;
        if      (testType === 'CA1')  testScore = (finalScore / 100) * 10;
        else if (testType === 'CA2')  testScore = (finalScore / 100) * 10;
        else if (testType === 'CA3')  testScore = (finalScore / 100) * 10;
        else if (testType === 'Exam') testScore = (finalScore / 100) * 70;
        else                          testScore = (finalScore / 100) * 40;

        // Fetch existing record to merge other CA scores
        const { data: existing } = await supabase
          .from("exam_results")
          .select("id,ca1_score,ca2_score,ca3_score,exam_score")
          .eq("student_id", attempt.student_id)
          .eq("subject_name", quiz.subject)
          .eq("term", quiz.term)
          .eq("academic_year", quiz.academic_year)
          .maybeSingle();

        const ca1  = testType === 'CA1'  ? testScore : (existing?.ca1_score  || 0);
        const ca2  = testType === 'CA2'  ? testScore : (existing?.ca2_score  || 0);
        const ca3  = testType === 'CA3'  ? testScore : (existing?.ca3_score  || 0);
        const exam = testType === 'Exam' ? testScore : (existing?.exam_score || 0);
        const cont = ca1 + ca2 + ca3;
        const tot  = cont + exam;
        const { grade, remarks } = calculateGradeAndRemark(tot, student?.grade);

        const upsertData = {
          student_id:            attempt.student_id,
          subject_name:          quiz.subject,
          term:                  quiz.term,
          academic_year:         quiz.academic_year,
          ca1_score:             ca1,
          ca2_score:             ca2,
          ca3_score:             ca3,
          continuous_assessment: cont,
          exam_score:            exam,
          total_score:           tot,
          grade,
          remarks,
        };

        if (existing?.id) {
          await supabase.from("exam_results").update(upsertData).eq("id", existing.id);
        } else {
          await supabase.from("exam_results").insert(upsertData);
        }

        // Sync the same scores to gradebook_entries so the Gradebook column updates too
        // (field names differ: ca1/ca2/ca3 instead of ca1_score/ca2_score/ca3_score)
        const { data: existingGb } = await supabase
          .from("gradebook_entries")
          .select("id,lt_cum,cum_avg")
          .eq("student_id", attempt.student_id)
          .eq("subject", quiz.subject)
          .eq("term", quiz.term)
          .eq("academic_year", quiz.academic_year)
          .maybeSingle();

        const gbData = {
          student_id:    attempt.student_id,
          class:         quiz.grade,
          subject:       quiz.subject,
          term:          quiz.term,
          academic_year: quiz.academic_year,
          ca1:           ca1,
          ca2:           ca2,
          ca3:           ca3,
          exam_score:    exam,
          lt_cum:        existingGb?.lt_cum  ?? null,
          cum_avg:       existingGb?.cum_avg ?? null,
          grade_letter:  grade,
          remarks,
        };

        if (existingGb?.id) {
          await supabase.from("gradebook_entries").update(gbData).eq("id", existingGb.id);
        } else {
          await supabase.from("gradebook_entries").insert(gbData);
        }

        savedCount++;
      }

      toast.success(`Saved ${savedCount} of ${attempts.length} records to Academic Records!`);
      setAllSaved(true);
      setTimeout(() => setAllSaved(false), 5000);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Save failed: " + (error?.message || String(error)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGrades = async () => {
    if (!selectedAttempt) return;

    setIsSaving(true);
    try {
      const essayQuestions = questions.filter(q => q.question_type === 'essay');
      const allGraded = essayQuestions.every(q => essayScores[q.id] !== undefined && essayScores[q.id] !== null && essayScores[q.id] !== '');
      const anyGraded = essayQuestions.some(q => essayScores[q.id] !== undefined && essayScores[q.id] !== null && essayScores[q.id] !== '');

      // Calculate essay score
      const totalEssayScore = essayQuestions.reduce((sum, q) => {
        const score = parseFloat(essayScores[q.id]) || 0;
        return sum + score;
      }, 0);

      const maxEssayScore = essayQuestions.reduce((sum, q) => sum + (q.max_score || 10), 0);
      const essayPercentage = maxEssayScore > 0 ? (totalEssayScore / maxEssayScore) * 100 : 0;

      // Must declare mcqQuestions before using it below
      const mcqQuestions = questions.filter(q => q.question_type !== 'essay');
      const hasEssay = essayQuestions.length > 0;
      const hasMCQ = mcqQuestions.length > 0;

      // Recalculate MCQ score fresh from submitted answers to avoid drift
      // (selectedAttempt.score is overwritten with the combined score on each save,
      //  so reading it back as "MCQ score" would inflate the result on re-saves)
      const mcqScore = hasMCQ
        ? (mcqQuestions.filter(q =>
            selectedAttempt.submitted_answers?.[q.id] === q.correct_option_index
          ).length / mcqQuestions.length) * 100
        : 0;

      let finalScore;
      if (hasEssay && hasMCQ) {
        finalScore = (mcqScore * 0.5) + (essayPercentage * 0.5);
      } else if (hasEssay) {
        finalScore = essayPercentage;
      } else { // Only MCQ questions or no questions at all
        finalScore = mcqScore;
      }
      // Safety cap — score can never exceed 100%
      finalScore = Math.min(Math.max(finalScore, 0), 100);

      // Update CBT Attempt
      await CBTAttempt.update(selectedAttempt.id, {
        essay_scores: essayScores,
        teacher_comments: teacherComments,
        grading_status: hasEssay ? (allGraded ? 'fully_graded' : 'partially_graded') : 'fully_graded',
        score: finalScore
      });

      // Save to ExamResult whenever there's any score to save (fully or partially graded)
      if (!hasEssay || anyGraded || allGraded) {
        const student = students.find(s => s.id === selectedAttempt.student_id);
        const testType = quiz.test_type;

        // Scale finalScore (0-100%) to the test type's max marks
        let testScore = 0;
        if (testType === 'CA1') testScore = (finalScore / 100) * 10;
        else if (testType === 'CA2') testScore = (finalScore / 100) * 10;
        else if (testType === 'CA3') testScore = (finalScore / 100) * 20;
        else if (testType === 'Exam') testScore = (finalScore / 100) * 60;
        else testScore = (finalScore / 100) * 40; // fallback

        const existingResults = await ExamResult.filter({
          student_id: selectedAttempt.student_id,
          subject_name: quiz.subject,
          term: quiz.term,
          academic_year: quiz.academic_year
        });

        if (existingResults && existingResults.length > 0) {
          const r = existingResults[0];
          const updateData = {
            ca1_score: r.ca1_score || 0,
            ca2_score: r.ca2_score || 0,
            ca3_score: r.ca3_score || 0,
            exam_score: r.exam_score || 0,
          };
          if (testType === 'CA1') updateData.ca1_score = testScore;
          else if (testType === 'CA2') updateData.ca2_score = testScore;
          else if (testType === 'CA3') updateData.ca3_score = testScore;
          else if (testType === 'Exam') updateData.exam_score = testScore;

          updateData.continuous_assessment = updateData.ca1_score + updateData.ca2_score + updateData.ca3_score;
          updateData.total_score = updateData.continuous_assessment + updateData.exam_score;
          const { grade, remarks } = calculateGradeAndRemark(updateData.total_score, student?.grade);
          updateData.grade = grade;
          updateData.remarks = remarks;

          await ExamResult.update(r.id, updateData);
        } else {
          const createData = {
            student_id: selectedAttempt.student_id,
            subject_name: quiz.subject,
            term: quiz.term,
            academic_year: quiz.academic_year,
            ca1_score: testType === 'CA1' ? testScore : 0,
            ca2_score: testType === 'CA2' ? testScore : 0,
            ca3_score: testType === 'CA3' ? testScore : 0,
            exam_score: testType === 'Exam' ? testScore : 0,
          };
          createData.continuous_assessment = createData.ca1_score + createData.ca2_score + createData.ca3_score;
          createData.total_score = createData.continuous_assessment + createData.exam_score;
          const { grade, remarks } = calculateGradeAndRemark(createData.total_score, student?.grade);
          createData.grade = grade;
          createData.remarks = remarks;
          await ExamResult.create(createData);
        }
      }

      toast.success("Grades saved successfully!");
      
      // Reload data
      const attemptsData = await CBTAttempt.filter({ quiz_id: quizId });
      setAttempts(attemptsData);
      const updatedAttempt = attemptsData.find(a => a.id === selectedAttempt.id);
      if (updatedAttempt) setSelectedAttempt(updatedAttempt);

    } catch (error) {
      console.error("Error saving grades:", error);
      toast.error("Failed to save grades");
    }
    setIsSaving(false);
  };

  const toggleRedoForm = (attempt) => {
    if (redoExpandedId === attempt.id) {
      setRedoExpandedId(null);
      return;
    }
    // Set default deadline 24 h from now
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setRedoDeadlines(prev => ({ ...prev, [attempt.id]: local }));
    setRedoExpandedId(attempt.id);
  };

  const handleSendRedo = async (attempt) => {
    const deadline = redoDeadlines[attempt.id];
    if (!deadline) return;
    setIsSubmittingRedo(true);
    try {
      await CBTAttempt.update(attempt.id, {
        redo_requested: true,
        redo_deadline: new Date(deadline).toISOString(),
      });
      toast.success("Redo request sent! The student can now retake the test before the deadline.");
      setRedoExpandedId(null);
      const attemptsData = await CBTAttempt.filter({ quiz_id: quizId });
      setAttempts(attemptsData);
      if (selectedAttempt?.id === attempt.id) {
        setSelectedAttempt(attemptsData.find(a => a.id === attempt.id) || null);
      }
    } catch (err) {
      console.error("Error sending redo:", err);
      toast.error("Failed to send redo request.");
    }
    setIsSubmittingRedo(false);
  };

  const handleCancelRedo = async (attempt) => {
    try {
      await CBTAttempt.update(attempt.id, { redo_requested: false, redo_deadline: null });
      toast.success("Redo request cancelled.");
      const attemptsData = await CBTAttempt.filter({ quiz_id: quizId });
      setAttempts(attemptsData);
    } catch (err) {
      toast.error("Failed to cancel redo.");
    }
  };

  if (accessDenied) {
    return (
      <div className="p-8 text-center flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-600 mb-6">Only teachers and administrators can access the grading interface.</p>
          <Link to={createPageUrl("CBT")}>
            <Button variant="outline">Back to CBT Management</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Quiz not found</p>
        <Link to={createPageUrl("CBT")}>
          <Button variant="outline" className="mt-4">Back to CBT Management</Button>
        </Link>
      </div>
    );
  }

  const essayQuestions = questions.filter(q => q.question_type === 'essay');
  const mcqQuestions = questions.filter(q => q.question_type !== 'essay');

  // Unique attempts (latest per student, excluding redo-pending)
  const uniqueAttempts = Object.values(
    attempts
      .filter(a => !a.redo_requested)
      .reduce((acc, a) => {
        const existing = acc[a.student_id];
        if (!existing || new Date(a.created_date) > new Date(existing.created_date)) acc[a.student_id] = a;
        return acc;
      }, {})
  );

  // Converts text with $...$ / $$...$$ to KaTeX HTML for the print window
  const renderMathHtml = (text) => {
    if (!text) return '';
    const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;
    return text.replace(regex, (match) => {
      const isBlock = match.startsWith('$$');
      const math = isBlock ? match.slice(2, -2).trim() : match.slice(1, -1).trim();
      try {
        return katex.renderToString(math, { displayMode: isBlock, throwOnError: false });
      } catch {
        return match;
      }
    });
  };

  const handlePrint = () => {
    const ids = printSelected.length > 0 ? printSelected : uniqueAttempts.map(a => a.student_id);
    const toPrint = uniqueAttempts.filter(a => ids.includes(a.student_id));

    const renderOptions = (question, attempt) => {
      return (question.options || []).map((opt, i) => {
        const isStudent = attempt.submitted_answers?.[question.id] === i;
        const isCorrect = question.correct_option_index === i;
        let bg = '';
        let label = '';
        if (isCorrect && isStudent) { bg = 'background:#d1fae5'; label = ' ✓ Correct (your answer)'; }
        else if (isCorrect) { bg = 'background:#d1fae5'; label = ' ✓ Correct answer'; }
        else if (isStudent) { bg = 'background:#fee2e2'; label = ' ✗ Your answer'; }
        return `<div style="padding:4px 8px;margin:2px 0;border-radius:4px;font-size:11px;${bg}">${String.fromCharCode(65+i)}. ${renderMathHtml(opt)}${label}</div>`;
      }).join('');
    };

    const studentBlocks = toPrint.map(attempt => {
      const student = students.find(s => s.id === attempt.student_id);
      const name = student ? `${student.first_name} ${student.last_name}` : 'Unknown';

      // Build question cards (MCQ + essay combined)
      const allQCards = [
        ...mcqQuestions.map((q, idx) => {
          const isCorrect = attempt.submitted_answers?.[q.id] === q.correct_option_index;
          return `
            <div style="break-inside:avoid;margin-bottom:8px;padding:8px;border:1px solid ${isCorrect ? '#bbf7d0' : '#fecaca'};border-radius:6px;background:${isCorrect ? '#f0fdf4' : '#fff1f2'}">
              <div style="font-size:10px;font-weight:bold;color:${isCorrect ? '#15803d' : '#b91c1c'};margin-bottom:3px">Q${idx+1} — ${isCorrect ? 'Correct ✓' : 'Incorrect ✗'}</div>
              <div style="font-size:11px;font-weight:600;margin-bottom:4px">${renderMathHtml(q.text)}</div>
              ${renderOptions(q, attempt)}
            </div>`;
        }),
        ...essayQuestions.map((q, idx) => {
          const rawAnswer = attempt.submitted_answers?.[q.id] || '';
          let answerText = rawAnswer;
          try { const p = JSON.parse(rawAnswer); if (p?.text) answerText = p.text; } catch {}
          const score = attempt.essay_scores?.[q.id];
          return `
            <div style="break-inside:avoid;margin-bottom:8px;padding:8px;border:1px solid #e9d5ff;border-radius:6px;background:#faf5ff">
              <div style="font-size:10px;font-weight:bold;color:#7c3aed;margin-bottom:3px">Essay Q${idx+1}${score !== undefined ? ` — Score: ${score}/${q.max_score||10}` : ''}</div>
              <div style="font-size:11px;font-weight:600;margin-bottom:4px">${renderMathHtml(q.text)}</div>
              <div style="font-size:11px;color:#374151;border-top:1px dashed #d1d5db;padding-top:4px">${renderMathHtml(answerText) || '<em>No answer</em>'}</div>
            </div>`;
        }),
      ];

      // Split cards into left (even indices) and right (odd indices) columns
      const left  = allQCards.filter((_, i) => i % 2 === 0).join('');
      const right = allQCards.filter((_, i) => i % 2 === 1).join('');

      return `
        <table style="width:100%;border-collapse:collapse;break-before:page;table-layout:fixed">
          <thead>
            <tr>
              <td colspan="2" style="background:#e5e7eb;color:#111827;padding:8px 12px;border-radius:6px">
                <div style="font-size:13px;font-weight:bold">${name}</div>
                <div style="font-size:11px;color:#374151">${quiz.title} · ${quiz.subject} · ${quiz.grade} · Score: ${attempt.score?.toFixed(1)}%</div>
              </td>
            </tr>
            <tr><td colspan="2" style="height:8px"></td></tr>
          </thead>
          <tbody>
            <tr>
              <td style="width:50%;vertical-align:top;padding-right:8px">${left}</td>
              <td style="width:50%;vertical-align:top;padding-left:8px">${right}</td>
            </tr>
          </tbody>
        </table>`;
    }).join('');

    const printTitle = toPrint.length === 1
      ? `Test Results - ${students.find(s => s.id === toPrint[0].student_id)?.first_name ?? ''} ${students.find(s => s.id === toPrint[0].student_id)?.last_name ?? ''}`.trim()
      : 'Test Results';

    const html = `<!DOCTYPE html><html><head><title>${printTitle}</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
        * { box-sizing: border-box; }
        .katex { font-size: 1em; }
        thead { display: table-header-group; }
        tbody { display: table-row-group; }
      </style>
    </head><body>${studentBlocks}</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
    setShowPrintSelector(false);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Link to={createPageUrl("CBT")}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to CBT Management
          </Button>
        </Link>

        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Grade Student Tests</h1>
            <p className="text-slate-600">{quiz.title} - {quiz.subject} ({quiz.grade})</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => { setPrintSelected([]); setShowPrintSelector(true); }} variant="outline" className="border-slate-300">
              <Printer className="w-4 h-4 mr-2" />
              Print Results
            </Button>
            <Button
              onClick={handleSaveAllToRecords}
              disabled={isSaving}
              className={allSaved ? "bg-emerald-500 hover:bg-emerald-500 cursor-default" : "bg-green-600 hover:bg-green-700"}
            >
              {isSaving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                : allSaved
                  ? <><CheckCircle className="w-4 h-4 mr-2" />Saved to Academic Records!</>
                  : <><Save className="w-4 h-4 mr-2" />Save All to Academic Records</>
              }
            </Button>
          </div>
        </div>

        {/* Print student selector dialog */}
        {showPrintSelector && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-gray-900">Select Students to Print</h2>
                </div>
                <button onClick={() => setShowPrintSelector(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printSelected.length === 0}
                    onChange={() => setPrintSelected([])}
                    className="rounded"
                  />
                  All students ({uniqueAttempts.length})
                </label>
                <hr className="border-slate-100" />
                {uniqueAttempts.map(attempt => {
                  const student = students.find(s => s.id === attempt.student_id);
                  if (!student) return null;
                  const checked = printSelected.includes(attempt.student_id);
                  return (
                    <label key={attempt.student_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setPrintSelected(prev =>
                          checked ? prev.filter(id => id !== attempt.student_id) : [...prev, attempt.student_id]
                        )}
                        className="rounded"
                      />
                      <span className="flex-1">{student.first_name} {student.last_name}</span>
                      <span className="text-xs text-slate-400">{attempt.score?.toFixed(1)}%</span>
                    </label>
                  );
                })}
              </div>
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPrintSelector(false)}>Cancel</Button>
                <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                  <Printer className="w-4 h-4 mr-2" />
                  Print {printSelected.length > 0 ? `(${printSelected.length})` : `All`}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[300px_1fr] gap-6">
          {/* Student List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {(() => {
                  const unique = new Set(attempts.filter(a => !a.redo_requested).map(a => a.student_id)).size;
                  const awaitingRedo = new Set(attempts.filter(a => a.redo_requested).map(a => a.student_id)).size;
                  return (
                    <>
                      Students ({unique})
                      {awaitingRedo > 0 && (
                        <span className="ml-2 text-xs font-normal text-amber-600">
                          · {awaitingRedo} awaiting redo
                        </span>
                      )}
                    </>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* De-duplicate: one card per student (keep the latest attempt) */}
                {Object.values(
                  attempts
                    .filter(a => !a.redo_requested)
                    .reduce((acc, a) => {
                      const existing = acc[a.student_id];
                      if (!existing || new Date(a.created_date) > new Date(existing.created_date)) {
                        acc[a.student_id] = a;
                      }
                      return acc;
                    }, {})
                ).map(attempt => {
                  const student = students.find(s => s.id === attempt.student_id);
                  if (!student) return null;

                  const isSelected = selectedAttempt?.id === attempt.id;
                  const status = attempt.grading_status;
                  const redoCount = attempt.redo_count || 0;

                  return (
                    <div
                      key={attempt.id}
                      className={`rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectAttempt(attempt)}
                        className="w-full text-left p-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm">{student.first_name} {student.last_name}</p>
                          {essayQuestions.length > 0 ? (
                            status === 'fully_graded' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : status === 'partially_graded' ? (
                              <Clock className="w-4 h-4 text-amber-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            )
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            Score: {attempt.score?.toFixed(1)}%
                          </Badge>
                          {essayQuestions.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {status === 'fully_graded' ? 'Graded' : status === 'partially_graded' ? 'Partial' : 'Pending'}
                            </Badge>
                          )}
                          {redoCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                              <RotateCcw className="w-2.5 h-2.5 mr-1" />
                              Redo #{redoCount}
                            </Badge>
                          )}
                        </div>
                      </button>
                      {/* Redo controls */}
                      <div className="px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => toggleRedoForm(attempt)}
                          className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 underline"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {redoExpandedId === attempt.id ? 'Close' : 'Return for Redo'}
                        </button>

                        {redoExpandedId === attempt.id && (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                            <p className="text-xs text-amber-800 font-medium">Set a redo deadline:</p>
                            <input
                              type="datetime-local"
                              value={redoDeadlines[attempt.id] || ''}
                              min={(() => {
                                const d = new Date(Date.now() + 5 * 60 * 1000);
                                d.setSeconds(0, 0);
                                const pad = n => String(n).padStart(2, '0');
                                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                              })()}
                              onChange={e => setRedoDeadlines(prev => ({ ...prev, [attempt.id]: e.target.value }))}
                              className="w-full border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <button
                              type="button"
                              disabled={isSubmittingRedo || !redoDeadlines[attempt.id]}
                              onClick={() => handleSendRedo(attempt)}
                              className="w-full py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                              {isSubmittingRedo
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RotateCcw className="w-3 h-3" />}
                              Send Redo Request
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Grading Interface */}
          {selectedAttempt ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <span>
                    {students.find(s => s.id === selectedAttempt.student_id)?.first_name}{' '}
                    {students.find(s => s.id === selectedAttempt.student_id)?.last_name}'s Test
                  </span>
                  {(selectedAttempt.redo_count > 0) && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs font-normal">
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Redo #{selectedAttempt.redo_count}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Overall Score: {selectedAttempt.score?.toFixed(1)}%
                  {essayQuestions.length > 0 && mcqQuestions.length > 0 && (
                    <span className="ml-2 text-slate-500">(50% MCQ + 50% Essay)</span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Section A - Multiple Choice Questions */}
                {mcqQuestions.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b-2 border-blue-200 pb-2">
                      <h3 className="text-xl font-bold text-blue-800">
                        Section A - Multiple Choice Questions
                      </h3>
                      <Badge className="bg-blue-100 text-blue-800">
                        Auto-Graded
                      </Badge>
                    </div>
                    
                    {mcqQuestions.map((question, index) => {
                      const studentAnswer = selectedAttempt.submitted_answers?.[question.id];
                      const isCorrect = studentAnswer === question.correct_option_index;
                      
                      return (
                        <div key={question.id} className={`p-4 rounded-lg border-2 ${
                          isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <Badge className={`mb-2 ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                Question {index + 1} - {isCorrect ? 'Correct ✓' : 'Incorrect ✗'}
                              </Badge>
                              <p className="font-semibold text-slate-900"><MathRenderer text={question.text} /></p>
                            </div>
                          </div>

                          <div className="space-y-2 ml-4">
                            {question.options?.map((option, optIndex) => {
                              const isStudentAnswer = studentAnswer === optIndex;
                              const isCorrectAnswer = question.correct_option_index === optIndex;

                              return (
                                <div
                                  key={optIndex}
                                  className={`p-3 rounded-lg border-2 ${
                                    isCorrectAnswer
                                      ? 'bg-green-100 border-green-300'
                                      : isStudentAnswer
                                      ? 'bg-red-100 border-red-300'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-700">
                                      {String.fromCharCode(65 + optIndex)}.
                                    </span>
                                    <span className="flex-1"><MathRenderer text={option} /></span>
                                    {isCorrectAnswer && (
                                      <Badge className="bg-green-600 text-white text-xs">Correct Answer</Badge>
                                    )}
                                    {isStudentAnswer && !isCorrectAnswer && (
                                      <Badge className="bg-red-600 text-white text-xs">Student Selected</Badge>
                                    )}
                                    {isStudentAnswer && isCorrectAnswer && (
                                      <Badge className="bg-green-600 text-white text-xs">Student Selected ✓</Badge>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Section B - Essay Questions */}
                {essayQuestions.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b-2 border-emerald-200 pb-2">
                      <h3 className="text-xl font-bold text-emerald-800">
                        Section B - Essay Questions
                      </h3>
                      <Badge className="bg-emerald-100 text-emerald-800">
                        Manual Grading Required
                      </Badge>
                    </div>
                    
                    {essayQuestions.map((question, index) => {
                      // Parse answer — may be plain string or JSON {"text":...,"photo":...}
                      const rawAnswer = selectedAttempt.submitted_answers?.[question.id];
                      let answerText = rawAnswer || '';
                      let answerPhoto = null;
                      if (rawAnswer) {
                        try {
                          const parsed = JSON.parse(rawAnswer);
                          if (parsed && typeof parsed === 'object') {
                            answerText  = parsed.text  || '';
                            answerPhoto = parsed.photo || null;
                          }
                        } catch {}
                      }
                      const hasAnswer = answerText || answerPhoto;
                      const maxScore = question.max_score || 10;
                      const currentScore = essayScores[question.id];
                      const hasScore = currentScore !== undefined && currentScore !== null && currentScore !== '';

                      return (
                        <div key={question.id} className="p-4 bg-emerald-50 rounded-lg border-2 border-emerald-200">
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge className="bg-emerald-100 text-emerald-800">
                                Section B - Question {index + 1}
                              </Badge>
                              {hasScore && (
                                <Badge className="bg-green-100 text-green-800">
                                  Scored: {currentScore}/{maxScore}
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold text-slate-900 mb-2"><MathRenderer text={question.text} /></p>
                            <div className="bg-white p-4 rounded border-2 border-slate-200 space-y-3">
                              <p className="text-sm text-slate-600 font-medium">Student's Answer:</p>
                              {!hasAnswer && (
                                <p className="text-slate-400 italic text-sm">No answer provided</p>
                              )}
                              {answerText && (
                                <div className="text-slate-800 leading-relaxed">
                                  <MathRenderer text={answerText} />
                                </div>
                              )}
                              {answerPhoto && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Uploaded working:</p>
                                  <img
                                    src={answerPhoto}
                                    alt="Student's handwritten working"
                                    className="max-h-64 rounded border border-slate-200 object-contain"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4 mt-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">
                                Score (Max: {maxScore})
                              </label>
                              <Input
                                type="number"
                                min="0"
                                max={maxScore}
                                step="0.5"
                                value={essayScores[question.id] || ''}
                                onChange={(e) => setEssayScores(prev => ({
                                  ...prev,
                                  [question.id]: parseFloat(e.target.value)
                                }))}
                                placeholder={`0 - ${maxScore}`}
                                className="border-2 border-emerald-300 focus:border-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">
                                Teacher's Comment (Optional)
                              </label>
                              <Textarea
                                value={teacherComments[question.id] || ''}
                                onChange={(e) => setTeacherComments(prev => ({
                                  ...prev,
                                  [question.id]: e.target.value
                                }))}
                                placeholder="Add feedback..."
                                className="h-10 border-2 border-emerald-300 focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex justify-end gap-3 pt-4 border-t-2 border-slate-200">
                      <Button onClick={handleSaveGrades} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Grades
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-slate-500">Select a student to view their test answers</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}