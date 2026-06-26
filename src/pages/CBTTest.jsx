import React, { useState, useEffect, useCallback } from 'react';
import { Quiz, Question, Student, User, CBTAttempt } from '@/entities/all';
import MathRenderer from '@/components/cbt/MathRenderer';
import EssayAnswerInput from '@/components/cbt/EssayAnswerInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Timer, Search, User as UserIcon, Eye, Save, LogOut, ArrowLeft, RotateCcw, Calculator, X, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { formatTimeInLagos } from "@/lib/timezone";

const TestTimer = ({ duration, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(duration * 60);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }
    const intervalId = setInterval(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [timeLeft, onTimeUp]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex items-center gap-2 font-mono text-lg font-semibold">
      <Timer className="w-5 h-5" />
      <span>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
    </div>
  );
};

// ── Scientific Calculator ─────────────────────────────────────────────────────
function ScientificCalculator({ onMinimize }) {
  const [display,    setDisplay]    = useState("0");
  const [expression, setExpression] = useState("");
  const [isDeg,      setIsDeg]      = useState(true);
  const [justEvaled, setJustEvaled] = useState(false);

  const toRad = x => isDeg ? (x * Math.PI) / 180 : x;

  function press(val) {
    if (val === "AC")  { setDisplay("0"); setExpression(""); setJustEvaled(false); return; }
    if (val === "⌫")   { setDisplay(d => d.length > 1 ? d.slice(0, -1) : "0"); return; }

    if (val === "=") {
      try {
        const expr = (expression + display)
          .replace(/×/g, "*").replace(/÷/g, "/")
          .replace(/π/g, String(Math.PI))
          .replace(/e(?!\d)/g, String(Math.E))
          .replace(/\^/g, "**");
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + expr + ')')();
        setDisplay(String(isFinite(result) ? parseFloat(result.toFixed(10)) : "Error"));
        setExpression("");
        setJustEvaled(true);
      } catch { setDisplay("Error"); setExpression(""); }
      return;
    }

    // Unary scientific functions applied to current display value
    const unary = {
      "sin":  v => Math.sin(toRad(v)),
      "cos":  v => Math.cos(toRad(v)),
      "tan":  v => Math.tan(toRad(v)),
      "log":  v => Math.log10(v),
      "ln":   v => Math.log(v),
      "√":    v => Math.sqrt(v),
      "x²":   v => v * v,
      "x³":   v => v * v * v,
      "1/x":  v => 1 / v,
      "%":    v => v / 100,
    };
    if (unary[val]) {
      try {
        const r = unary[val](parseFloat(display));
        setDisplay(String(parseFloat(r.toFixed(10))));
        setJustEvaled(true);
      } catch { setDisplay("Error"); }
      return;
    }

    // Binary operators — flush display to expression
    if (["+", "-", "×", "÷", "^"].includes(val)) {
      setExpression(expression + display + val);
      setDisplay("0");
      setJustEvaled(false);
      return;
    }

    // Constants
    if (val === "π") { setDisplay(String(Math.PI));  setJustEvaled(true); return; }
    if (val === "e")  { setDisplay(String(Math.E));   setJustEvaled(true); return; }

    // Parentheses — flush display to expression
    if (val === "(") { setExpression(expression + display + "("); setDisplay("0"); return; }
    if (val === ")") { setExpression(expression + display + ")"); setDisplay("0"); return; }

    // Digits and decimal
    if (display === "0" || display === "Error" || justEvaled) {
      setDisplay(val === "." ? "0." : val);
      setJustEvaled(false);
    } else {
      if (val === "." && display.includes(".")) return;
      setDisplay(display + val);
    }
  }

  const Btn = ({ label, cls = "", wide = false }) => (
    <button
      onMouseDown={e => { e.preventDefault(); press(label); }}
      className={`${wide ? "col-span-2" : ""} h-9 rounded-xl text-xs font-bold transition-all active:scale-90 select-none ${cls}`}
    >{label}</button>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl overflow-hidden shadow-2xl border border-slate-700"
         style={{ background: "linear-gradient(160deg,#1e293b,#0f172a)" }}>

      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/80">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-white text-xs font-semibold">Scientific Calculator</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDeg(d => !d)}
            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 font-mono font-bold">
            {isDeg ? "DEG" : "RAD"}
          </button>
          <button onClick={onMinimize} className="text-slate-400 hover:text-white p-0.5 rounded transition-colors" title="Minimise">
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Display */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-slate-500 text-[10px] text-right font-mono h-3.5 truncate">{expression || " "}</div>
        <div className={`text-right font-mono font-bold text-white mt-0.5 leading-none ${display.length > 14 ? "text-base" : display.length > 10 ? "text-xl" : "text-2xl"}`}>
          {display}
        </div>
      </div>

      {/* Buttons grid — 5 columns */}
      <div className="p-2.5 grid grid-cols-5 gap-1.5">
        {/* Row 1 — trig & log */}
        {["sin","cos","tan","log","ln"].map(fn =>
          <Btn key={fn} label={fn} cls="bg-slate-700/80 text-blue-300 hover:bg-slate-600" />
        )}
        {/* Row 2 — powers */}
        {["x²","x³","√","^","1/x"].map(fn =>
          <Btn key={fn} label={fn} cls="bg-slate-700/80 text-blue-300 hover:bg-slate-600" />
        )}
        {/* Row 3 — constants & parens */}
        {["π","e","(",")","%" ].map(fn =>
          <Btn key={fn} label={fn} cls="bg-slate-700/80 text-emerald-300 hover:bg-slate-600" />
        )}
        {/* Row 4 — 7 8 9 ÷ ⌫ */}
        <Btn label="7"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="8"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="9"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="÷"  cls="bg-amber-600 text-white hover:bg-amber-500" />
        <Btn label="⌫"  cls="bg-red-800 text-white hover:bg-red-700" />
        {/* Row 5 — 4 5 6 × AC */}
        <Btn label="4"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="5"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="6"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="×"  cls="bg-amber-600 text-white hover:bg-amber-500" />
        <Btn label="AC" cls="bg-red-800 text-white hover:bg-red-700" />
        {/* Row 6 — 1 2 3 - */}
        <Btn label="1"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="2"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="3"  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="-"  cls="bg-amber-600 text-white hover:bg-amber-500" />
        <Btn label="="  cls="bg-blue-600 text-white hover:bg-blue-500 row-span-1" />
        {/* Row 7 — 0 . + = */}
        <Btn label="0"  cls="bg-slate-800 text-white hover:bg-slate-700 col-span-2" wide />
        <Btn label="."  cls="bg-slate-800 text-white hover:bg-slate-700" />
        <Btn label="+"  cls="bg-amber-600 text-white hover:bg-amber-500" />
        <Btn label="="  cls="bg-blue-600 text-white hover:bg-blue-500" />
      </div>
    </div>
  );
}

export default function CBTTestPage() {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [testState, setTestState] = useState('select_student'); // select_student, idle, running, submitted
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [draftAttemptId, setDraftAttemptId] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRedoMode, setIsRedoMode] = useState(false);
  const [redoAttemptId, setRedoAttemptId] = useState(null);
  const [calcOpen, setCalcOpen] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const quizId = urlParams.get('quizId');
  const preview = urlParams.get('preview');
  const studentIdParam = urlParams.get('studentId');
  const redoParam = urlParams.get('redo');

  useEffect(() => {
    const loadData = async () => {
      if (!quizId) {
        setIsLoading(false);
        return;
      }
      try {
        const [quizData, questionsData] = await Promise.all([
          Quiz.get(quizId),
          Question.filter({ quiz_id: quizId }),
        ]);
        // User.me() may fail for public (unauthenticated) access — that's fine
        let user = null;
        try { user = await User.me(); } catch (e) {}
        // Sort by sort_order (teacher-arranged), fallback to question_number
        const sortedQuestions = [...questionsData].sort((a, b) => {
          if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
          if (a.sort_order != null) return -1;
          if (b.sort_order != null) return 1;
          return (a.question_number ?? 0) - (b.question_number ?? 0);
        });
        setQuiz(quizData);
        setQuestions(sortedQuestions);
        setCurrentUser(user);

        // Check if this is preview mode (teacher/admin viewing)
        if (preview === 'true' && user && (user.school_role === 'admin' || user.school_role === 'teacher')) {
          setIsPreviewMode(true);
          setTestState('idle');
        } else {
          // Regular student mode
          if (studentIdParam) {
            // If studentId passed from StudentCBT, load that student directly
            const student = await Student.get(studentIdParam);
            setSelectedStudent(student);
            setTestState('idle');
          } else {
            // Otherwise, filter students by quiz grade and active status for selection
            const studentsData = await Student.filter({ 
              grade: quizData.grade,
              enrollment_status: 'active' 
            });
            setStudents(studentsData);
            setFilteredStudents(studentsData);
          }
        }
      } catch (error) {
        console.error("Error loading quiz:", error);
      }
      setIsLoading(false);
    };
    loadData();
  }, [quizId, preview, studentIdParam]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = students.filter(student =>
        `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStudents(filtered);
    } else {
      setFilteredStudents(students);
    }
  }, [searchTerm, students]);

  // Auto-save every 60 seconds while test is running
  useEffect(() => {
    if (testState !== 'running' || isPreviewMode || !selectedStudent) return;
    const interval = setInterval(() => {
      saveDraft(answers, selectedStudent.id, true);
    }, 60000);
    return () => clearInterval(interval);
  }, [testState, answers, selectedStudent, isPreviewMode, draftAttemptId]);

  const handleStudentSelect = (student) => {
    setSelectedStudent(student);
    setTestState('idle');
  };

  // Load existing draft when a student is selected
  const loadDraft = async (student) => {
    try {
      const drafts = await CBTAttempt.filter({ quiz_id: quizId, student_id: student.id, status: 'draft' });
      if (drafts && drafts.length > 0) {
        const draft = drafts[0];
        setDraftAttemptId(draft.id);
        setAnswers(draft.submitted_answers || {});
        setLastSaved(new Date(draft.updated_date));
      }
    } catch (e) {
      console.error("Error loading draft:", e);
    }
  };

  const saveDraft = async (currentAnswers, studentId, silent = false) => {
    if (isPreviewMode || !studentId) return;
    if (!silent) setIsSaving(true);
    try {
      const draftData = {
        quiz_id: quizId,
        student_id: studentId,
        submitted_answers: currentAnswers,
        status: 'draft',
        started_at: new Date().toISOString(),
        total_questions: questions.length,
      };
      if (draftAttemptId) {
        await CBTAttempt.update(draftAttemptId, draftData);
      } else {
        const created = await CBTAttempt.create(draftData);
        setDraftAttemptId(created.id);
      }
      setLastSaved(new Date());
    } catch (e) {
      console.error("Error saving draft:", e);
    }
    if (!silent) setIsSaving(false);
  };

  const handleStart = async () => {
    if (selectedStudent) {
      // Check if this student already has a submitted attempt for this quiz
      try {
        const existingAttempts = await CBTAttempt.filter({ quiz_id: quizId, student_id: selectedStudent.id, status: 'submitted' });
        if (existingAttempts && existingAttempts.length > 0) {
          const existing = existingAttempts[0];
          // Allow redo if teacher sent a redo request with a valid future deadline
          const isActiveRedo =
            existing.redo_requested &&
            existing.redo_deadline &&
            new Date(existing.redo_deadline) > new Date();
          if (isActiveRedo || redoParam === 'true') {
            // Redo mode: remember the old attempt so we can clear it on submit
            setIsRedoMode(true);
            setRedoAttemptId(existing.id);
            // Don't load draft — start fresh
          } else {
            setFinalResult({ score: existing.score ?? 0, attempt: existing });
            setTestState('submitted');
            return;
          }
        } else {
          await loadDraft(selectedStudent);
        }
      } catch (e) {
        console.error("Error checking existing attempts:", e);
        await loadDraft(selectedStudent);
      }
    }
    setTestState('running');
  };
  
  const handleAnswerSelect = (questionId, value) => { // value can be option index (number) or essay text (string)
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = useCallback(async () => {
    if (isPreviewMode) {
      setTestState('submitted');
      setFinalResult({ preview: true, message: "Preview completed. Results are not saved in preview mode." });
      return;
    }

    setTestState('submitting');

    try {
      // Calculate MCQ score locally
      const mcqQs = questions.filter(q => q.question_type !== 'essay');
      const essayQs = questions.filter(q => q.question_type === 'essay');
      let mcqCorrect = 0;
      mcqQs.forEach(q => {
        if (answers[q.id] !== undefined && Number(answers[q.id]) === q.correct_option_index) {
          mcqCorrect++;
        }
      });
      const mcqScore = mcqQs.length > 0 ? (mcqCorrect / mcqQs.length) * 100 : 0;
      const hasEssay = essayQs.length > 0;

      // Delete draft if exists (draft is a temp record, separate from the redo target)
      if (draftAttemptId) {
        try { await CBTAttempt.delete(draftAttemptId); } catch(e) {}
        setDraftAttemptId(null);
      }

      // If this is a redo, UPDATE the existing attempt in place instead of
      // deleting + creating a new one. This keeps exactly one record per student
      // and increments redo_count so the teacher can see how many times they redid it.
      if (isRedoMode && redoAttemptId) {
        let oldRedoCount = 0;
        try {
          const oldAttempt = await CBTAttempt.get(redoAttemptId);
          oldRedoCount = oldAttempt?.redo_count || 0;
        } catch(e) {}

        const updatedAttempt = await CBTAttempt.update(redoAttemptId, {
          submitted_answers: answers,
          total_questions: questions.length,
          score: mcqScore,
          completed_at: new Date().toISOString(),
          grading_status: hasEssay ? 'pending' : 'fully_graded',
          status: 'submitted',
          redo_requested: false,
          redo_deadline: null,
          redo_count: oldRedoCount + 1,
          essay_scores: {},
          teacher_comments: {},
        });

        setFinalResult({ score: mcqScore, attempt: updatedAttempt });
        setTestState('submitted');
        return;
      }

      // Normal first submission — create a new record
      const attempt = await CBTAttempt.create({
        quiz_id: quizId,
        student_id: selectedStudent.id,
        submitted_answers: answers,
        total_questions: questions.length,
        score: mcqScore,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        grading_status: hasEssay ? 'pending' : 'fully_graded',
        status: 'submitted',
        redo_count: 0,
      });

      setFinalResult({ score: mcqScore, attempt });
      setTestState('submitted');
    } catch (err) {
      console.error("Submission error:", err);
      setFinalResult({ error: "Failed to save your test. Please check your connection and try again." });
      setTestState('submitted');
    }
  }, [quizId, selectedStudent, answers, isPreviewMode, questions, draftAttemptId, isRedoMode, redoAttemptId]);

  const handleTimeUp = useCallback(() => {
    setShowConfirmDialog(false);
    handleSubmit();
  }, [handleSubmit]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin w-8 h-8" /></div>;
  }

  if (!quiz) {
    return <div className="p-8 text-center text-red-500">Quiz not found or invalid ID.</div>;
  }

  // Add check for empty questions
  if (questions.length === 0 && testState === 'running') {
    return (
      <div className="p-8 text-center">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-red-600 mb-4">No Questions Available</h2>
            <p className="text-slate-600 mb-6">This quiz doesn't have any questions yet. Please contact your teacher.</p>
            <Link to={createPageUrl(isPreviewMode ? "CBT" : "StudentCBT")}>
              <Button variant="outline">Go Back</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Student Selection Screen (only for non-preview mode)
  if (testState === 'select_student' && !isPreviewMode) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Select Your Profile</CardTitle>
            <p className="text-slate-600 text-center">
              {quiz.grade} - {quiz.subject} Quiz
            </p>
            <p className="text-slate-500 text-center text-sm">
              Please find and select your name to start the quiz
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Search your name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
              {filteredStudents.map((student) => (
                <Card 
                  key={student.id} 
                  className="cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all"
                  onClick={() => handleStudentSelect(student)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {student.first_name?.[0]}{student.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{student.first_name} {student.last_name}</p>
                      <p className="text-sm text-slate-600">{student.grade}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {filteredStudents.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <UserIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No students found in {quiz.grade}.</p>
                {searchTerm && <p className="text-sm mt-2">Try a different search term.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz Start Screen
  if (testState === 'idle') {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <Card>
          <CardHeader>
            {isPreviewMode ? (
              <div className="mb-4">
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  <Eye className="w-3 h-3 mr-1" />
                  Preview Mode - Results Won't Be Saved
                </Badge>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </span>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                  <p className="text-sm text-slate-600">{selectedStudent.grade}</p>
                </div>
              </div>
            )}
            <CardTitle>{quiz.title}</CardTitle>
            <p className="text-slate-600">{quiz.subject} - {quiz.grade}</p>
          </CardHeader>
          <CardContent>
            <div className="mt-2 space-y-2 text-left">
              <p><strong>Questions:</strong> {questions.length}</p>
              <p><strong>Duration:</strong> {quiz.duration_minutes} minutes</p>
              <p><strong>Term:</strong> {quiz.term}</p>
              <p><strong>Academic Year:</strong> {quiz.academic_year}</p>
            </div>
            {questions.length === 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-amber-800 text-sm">⚠️ Warning: This quiz has no questions yet. You cannot start the quiz.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                studentIdParam
                  ? navigate(`/QuickTest?studentId=${studentIdParam}`)
                  : navigate(-1)
              }
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleStart}
              disabled={questions.length === 0}
            >
              Start Quiz
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Test Submitted Screen
  if (testState === 'submitted' || testState === 'submitting') {
    return (
       <div className="p-8 max-w-2xl mx-auto text-center">
         <Card>
           <CardHeader>
             <CardTitle>Test Submitted!</CardTitle>
           </CardHeader>
           <CardContent>
            {testState === 'submitting' ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600"/>
                <p className="text-slate-600">Grading your test...</p>
              </div>
            ) : finalResult.preview ? (
              <div className="space-y-4">
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-base px-4 py-2">
                  <Eye className="w-4 h-4 mr-2 inline" />
                  Preview Mode
                </Badge>
                <p className="text-lg text-slate-600 mt-4">{finalResult.message}</p>
                <p className="text-sm text-slate-500 mt-2">You answered {Object.keys(answers).length} out of {questions.length} questions.</p>
              </div>
            ) : finalResult.error ? (
              <div className="text-red-500">{finalResult.error}</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">
                      {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                    <p className="text-sm text-slate-600">{selectedStudent.grade}</p>
                  </div>
                </div>
                <p className="text-lg">Your result has been recorded.</p>
                <div className="p-6 bg-slate-100 rounded-lg">
                  <p className="text-sm text-slate-500">YOU SCORED</p>
                  <p className="text-5xl font-bold text-slate-800">{finalResult.score.toFixed(1)}%</p>
                </div>
                <p className="text-sm text-slate-600">This has been saved as the Continuous Assessment (CA) score for {quiz.subject}.</p>
              </div>
            )}
           </CardContent>
           <CardFooter>
             {isPreviewMode ? (
               <Link to={createPageUrl("CBT")} className="w-full">
                 <Button variant="outline" className="w-full">Back to CBT Management</Button>
               </Link>
             ) : studentIdParam ? (
               <Button variant="outline" className="w-full" onClick={() => navigate(`/QuickTest?studentId=${studentIdParam}`)}>
                 Back to Tests
               </Button>
             ) : (
               <Link to={createPageUrl("StudentCBT")} className="w-full">
                 <Button variant="outline" className="w-full">Back to Tests</Button>
               </Link>
             )}
           </CardFooter>
         </Card>
       </div>
    );
  }

  // Compute section-specific numbering
  const mcqQuestions = questions.filter(q => q.question_type !== 'essay');
  const essayQuestions = questions.filter(q => q.question_type === 'essay');

  const getSectionNumber = (question, globalIndex) => {
    // Preserve original question number from the exam paper
    if (question.question_number != null) return question.question_number;
    if (question.question_type === 'essay') {
      return essayQuestions.findIndex(q => q.id === question.id) + 1;
    }
    return mcqQuestions.findIndex(q => q.id === question.id) + 1;
  };

  // Test Taking Screen
  const currentQuestion = questions[currentQuestionIndex];
  
  // Safety check - if currentQuestion is undefined, show error
  if (!currentQuestion) {
    return (
      <div className="p-8 text-center">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Question</h2>
            <p className="text-slate-600 mb-6">There was a problem loading question {currentQuestionIndex + 1}. This may happen if there are no questions or an unexpected error occurred.</p>
            <Button onClick={() => setCurrentQuestionIndex(0)}>Restart Quiz</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const isEssay = currentQuestion.question_type === 'essay';
  
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-[1fr_250px] gap-6">
        {/* Main Question Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              {isRedoMode ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 mb-2">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Redo Attempt
                </Badge>
              ) : isPreviewMode ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 mb-2">
                  <Eye className="w-3 h-3 mr-1" />
                  Preview Mode
                </Badge>
              ) : (
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">
                      {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                </div>
              )}
              <CardTitle>{quiz.title}</CardTitle>
              <div className="flex items-center gap-3">
                <p className="text-slate-500 text-sm">
                  {isEssay ? 'Section B' : 'Section A'} — Question {getSectionNumber(currentQuestion, currentQuestionIndex)} of {isEssay ? essayQuestions.length : mcqQuestions.length}
                </p>
                <Badge variant="outline" className={isEssay ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}>
                  {isEssay ? 'Essay' : 'MCQ'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCalcOpen(o => !o)}
                title={calcOpen ? "Hide calculator" : "Open scientific calculator"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  calcOpen
                    ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200"
                    : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Calculator</span>
              </button>
              <TestTimer duration={quiz.duration_minutes} onTimeUp={handleTimeUp} />
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="mb-6"/>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 font-medium">
                {isEssay ? `Essay Q${getSectionNumber(currentQuestion, currentQuestionIndex)}` : `MCQ Q${getSectionNumber(currentQuestion, currentQuestionIndex)}`}
              </p>
              <div className="text-lg font-semibold mb-4">
                <MathRenderer text={currentQuestion.text} />
              </div>

              {/* Diagram image — shown when question has an attached visual */}
              {currentQuestion.image_url && (
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-2 flex justify-center">
                  <img
                    src={currentQuestion.image_url}
                    alt="Question diagram"
                    className="max-h-72 object-contain rounded-lg"
                  />
                </div>
              )}

              {isEssay ? (
                <EssayAnswerInput
                  questionId={currentQuestion.id}
                  value={answers[currentQuestion.id] || ""}
                  onChange={handleAnswerSelect}
                />
              ) : (
                <RadioGroup
                  value={answers[currentQuestion.id] !== undefined ? String(answers[currentQuestion.id]) : ""}
                  onValueChange={(value) => handleAnswerSelect(currentQuestion.id, Number(value))}
                  className="space-y-3"
                >
                  {currentQuestion.options?.map((option, i) => (
                    <Label key={i} htmlFor={`q${currentQuestion.id}-opt${i}`} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:border-blue-300">
                      <RadioGroupItem value={String(i)} id={`q${currentQuestion.id}-opt${i}`} />
                      <MathRenderer text={option} />
                    </Label>
                  )) || <p className="text-red-500">No options available</p>}
                </RadioGroup>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <div className="flex justify-between w-full">
              <Button 
                variant="outline"
                onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                disabled={currentQuestionIndex === 0}
              >
                Previous
              </Button>
              {currentQuestionIndex < questions.length - 1 ? (
                <Button onClick={() => setCurrentQuestionIndex(prev => prev + 1)}>
                  Next
                </Button>
              ) : (
                <Button onClick={() => setShowConfirmDialog(true)} className="bg-green-600 hover:bg-green-700">
                  Submit Test
                </Button>
              )}
            </div>
            {!isPreviewMode && (
              <div className="flex items-center justify-between w-full border-t pt-3">
                <div className="text-xs text-slate-400">
                  {isSaving ? (
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>
                  ) : lastSaved ? (
                    <span className="flex items-center gap-1"><Save className="w-3 h-3 text-green-500" /> Saved {formatTimeInLagos(lastSaved)}</span>
                  ) : (
                    <span>Not saved yet</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={async () => {
                    await saveDraft(answers, selectedStudent?.id);
                    window.location.href = '/StudentCBT';
                  }}
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save & Exit
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>

        {/* Question Navigator Panel */}
        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader>
            <CardTitle className="text-base">Question Navigator</CardTitle>
            <p className="text-xs text-slate-500">
              {Object.keys(answers).length} of {questions.length} answered
            </p>
          </CardHeader>
          <CardContent>
            {mcqQuestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Section A — MCQ</p>
                <div className="grid grid-cols-5 gap-2">
                  {mcqQuestions.map((q, sectionIdx) => {
                    const globalIdx = questions.findIndex(gq => gq.id === q.id);
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";
                    const isCurrent = globalIdx === currentQuestionIndex;
                    return (
                      <button key={q.id} onClick={() => setCurrentQuestionIndex(globalIdx)}
                        className={`w-full aspect-square rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-105 ${isCurrent ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${isAnswered ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-100 text-red-700 border-2 border-red-300 hover:bg-red-200'}`}>
                        {sectionIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {essayQuestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Section B — Essay</p>
                <div className="grid grid-cols-5 gap-2">
                  {essayQuestions.map((q, sectionIdx) => {
                    const globalIdx = questions.findIndex(gq => gq.id === q.id);
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";
                    const isCurrent = globalIdx === currentQuestionIndex;
                    return (
                      <button key={q.id} onClick={() => setCurrentQuestionIndex(globalIdx)}
                        className={`w-full aspect-square rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-105 ${isCurrent ? 'ring-2 ring-emerald-500 ring-offset-2' : ''} ${isAnswered ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-100 text-red-700 border-2 border-red-300 hover:bg-red-200'}`}>
                        {sectionIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded bg-green-500"></div>
                <span className="text-slate-600">Answered</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded bg-red-100 border-2 border-red-300"></div>
                <span className="text-slate-600">Not Answered</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded ring-2 ring-blue-500"></div>
                <span className="text-slate-600">Current</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Floating Scientific Calculator */}
      {calcOpen && <ScientificCalculator onMinimize={() => setCalcOpen(false)} />}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPreviewMode ? "Finish Preview?" : "Finish and Submit?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPreviewMode 
                ? "Are you sure you want to finish this preview? Your answers will not be saved."
                : "Are you sure you want to submit your answers? You won't be able to change them after this."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <AlertDialogAction onClick={handleSubmit}>
              {isPreviewMode ? "Finish Preview" : "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
