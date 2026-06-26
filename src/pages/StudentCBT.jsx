import React, { useState, useEffect, useRef } from "react";
import { Quiz, Question, Student, User, CBTAttempt } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { PlayCircle, Clock, FileText, BookOpen, CheckCircle, AlertCircle, Lock, ArrowLeft, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";

export default function StudentCBTPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [linkedStudent, setLinkedStudent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [pollStopped, setPollStopped] = useState(false);

  const pollFailures = useRef(0);
  const intervalRef  = useRef(null);
  const currentUserRef    = useRef(null);
  const linkedStudentRef  = useRef(null);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(silentRefresh, 10000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const isAdminPreview = (user) =>
    user?.school_role === 'admin' || user?.school_role === 'super_admin' || user?.school_role === 'teacher';

  // Shared quiz/question fetch logic (used by both full load and silent refresh)
  const fetchQuizData = async (user, student) => {
    const [quizzesData, questionsData] = await Promise.all([
      Quiz.list("-created_date"),
      Question.list()
    ]);
    setQuestions(questionsData);
    if (isAdminPreview(user)) {
      setQuizzes(quizzesData);
      return;
    }
    if (student) {
      const filteredQuizzes = quizzesData.filter(q => q.grade === student.grade && q.is_published !== false);
      setQuizzes(filteredQuizzes);
    }
  };

  // Silent background refresh — no spinner, no error flicker.
  // Uses refs so the interval closure always reads the latest user/student.
  const silentRefresh = async () => {
    try {
      const user = currentUserRef.current || await User.me();
      await fetchQuizData(user, linkedStudentRef.current);
      pollFailures.current = 0;
    } catch (_) {
      pollFailures.current += 1;
      if (pollFailures.current >= 3) {
        clearInterval(intervalRef.current);
        setPollStopped(true);
      }
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await User.me();
      setCurrentUser(user);
      currentUserRef.current = user;

      if (isAdminPreview(user)) {
        await fetchQuizData(user, null);
        setIsLoading(false);
        return;
      }

      if (user.linked_student_id && user.linked_student_id !== "0000" && user.linked_student_id.length > 4) {
        try {
          const student = await Student.get(user.linked_student_id);
          setLinkedStudent(student);
          linkedStudentRef.current = student;
          await fetchQuizData(user, student);
          const studentAttempts = await CBTAttempt.filter({ student_id: student.id, status: 'submitted' });
          const studentDrafts = await CBTAttempt.filter({ student_id: student.id, status: 'draft' });
          setAttempts(studentAttempts);
          setDrafts(studentDrafts);
        } catch (err) {
          console.error("Error loading student record:", err);
          setError("Student record not found. Please contact your administrator to link your account to a student profile.");
        }
      } else {
        setError("Your account is not linked to a student profile. Please contact your administrator.");
      }
    } catch (error) {
      console.error("Error loading quizzes:", error);
      setError("Failed to load tests. Please try again later.");
    }
    setIsLoading(false);
  };

  const getQuestionCount = (quizId) => {
    return questions.filter(q => q.quiz_id === quizId).length;
  };

  const hasStudentTakenTest = (quizId) => {
    return attempts.some(attempt => attempt.quiz_id === quizId);
  };

  const hasDraft = (quizId) => {
    return drafts.some(d => d.quiz_id === quizId);
  };

  // A quiz has an active redo if the submitted attempt has redo_requested=true and deadline not passed
  const getRedoAttempt = (quizId) => {
    return attempts.find(a =>
      a.quiz_id === quizId &&
      a.redo_requested &&
      a.redo_deadline &&
      new Date(a.redo_deadline) > new Date()
    ) || null;
  };

  const formatTimeLeft = (deadline) => {
    const ms = new Date(deadline) - new Date();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  };

  // Separate available, redo, and completed tests
  const redoQuizzes  = quizzes.filter(quiz => !!getRedoAttempt(quiz.id));
  const availableQuizzes = quizzes.filter(quiz => !hasStudentTakenTest(quiz.id));
  const completedQuizzes = quizzes.filter(quiz => hasStudentTakenTest(quiz.id) && !getRedoAttempt(quiz.id));

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-slate-200 rounded-xl h-64"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-amber-200">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Account Not Linked</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Link to={createPageUrl("StudentDashboard")}>
            <Button className="bg-blue-600 hover:bg-blue-700">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser && isAdminPreview(currentUser);

  // All available grades from quizzes
  const allGrades = isAdmin
    ? [...new Set(quizzes.map(q => q.grade || "Unassigned"))].sort()
    : [];

  // Group quizzes by grade for admin preview (filtered)
  const filteredAdminQuizzes = isAdmin
    ? (selectedGrade === "all" ? quizzes : quizzes.filter(q => (q.grade || "Unassigned") === selectedGrade))
    : [];

  const quizzesByGrade = isAdmin
    ? filteredAdminQuizzes.reduce((acc, quiz) => {
        const g = quiz.grade || "Unassigned";
        if (!acc[g]) acc[g] = [];
        acc[g].push(quiz);
        return acc;
      }, {})
    : null;

  const handleRetryPoll = () => {
    pollFailures.current = 0;
    setPollStopped(false);
    intervalRef.current = setInterval(silentRefresh, 10000);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {pollStopped && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>Auto-refresh paused — connection issues detected.</span>
            </div>
            <button
              onClick={handleRetryPoll}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-white border border-amber-200 px-3 py-1 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-2">
            {isAdmin ? "All Tests (Admin Preview)" : "Available Tests"}
          </h1>
          <p className="text-slate-600 text-lg">
            {isAdmin ? "Viewing all quizzes across all classes" : "Select a test to begin"}
          </p>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                👁 Admin Preview Mode — tests are read-only
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-600">Filter by Class:</label>
                <select
                  value={selectedGrade}
                  onChange={e => setSelectedGrade(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Classes</option>
                  {allGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Admin: grouped by grade */}
        {isAdmin && quizzesByGrade && (
          Object.keys(quizzesByGrade).sort().length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-2xl">
              <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">No Tests Created Yet</h3>
              <p className="text-slate-500">Go to CBT Management to create quizzes.</p>
            </div>
          ) : (
            Object.entries(quizzesByGrade).sort(([a], [b]) => a.localeCompare(b)).map(([grade, gradeQuizzes]) => (
              <div key={grade} className="mb-10">
                <h2 className="text-xl font-bold text-slate-800 mb-4 pb-2 border-b-2 border-blue-200">{grade}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {gradeQuizzes.map(quiz => (
                    <Card key={quiz.id} className="flex flex-col bg-white/80 backdrop-blur-sm border-slate-200/60 hover:shadow-xl transition-all">
                      <CardHeader>
                        <div className="flex items-start justify-between mb-2">
                          <CardTitle className="text-slate-800">{quiz.title}</CardTitle>
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">{quiz.test_type}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">{quiz.subject} - {quiz.grade}</p>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-slate-700">
                            <FileText className="w-4 h-4" />
                            <span>{getQuestionCount(quiz.id)} Questions</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <Clock className="w-4 h-4" />
                            <span>{quiz.duration_minutes} Minutes</span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-4 border-t">
                        <Link to={createPageUrl(`CBTTest?quizId=${quiz.id}`)} className="w-full">
                          <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                            <PlayCircle className="w-4 h-4 mr-2" />
                            Preview Test
                          </Button>
                        </Link>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )
        )}

        {/* Student: Available Tests */}
        {!isAdmin && availableQuizzes.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-2xl mb-8">
            <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Tests Available</h3>
            <p className="text-slate-500">Check back later for new tests.</p>
          </div>
        )}
        {!isAdmin && availableQuizzes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {availableQuizzes.map(quiz => (
              <Card key={quiz.id} className="flex flex-col bg-white/80 backdrop-blur-sm border-slate-200/60 hover:shadow-xl transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-slate-800">{quiz.title}</CardTitle>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {hasDraft(quiz.id) && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">In Progress</Badge>
                      )}
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">{quiz.test_type}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">{quiz.subject} - {quiz.grade}</p>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <FileText className="w-4 h-4" />
                      <span>{getQuestionCount(quiz.id)} Questions</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock className="w-4 h-4" />
                      <span>{quiz.duration_minutes} Minutes</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t">
                  <Link to={createPageUrl(`CBTTest?quizId=${quiz.id}${linkedStudent ? `&studentId=${linkedStudent.id}` : ''}`)} className="w-full">
                    <Button className={`w-full ${hasDraft(quiz.id) ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {hasDraft(quiz.id) ? "Resume Test" : "Start Test"}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Redo Required Tests */}
        {!isAdmin && redoQuizzes.length > 0 && (
          <div className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-amber-700 mb-1 flex items-center gap-2">
                <RotateCcw className="w-6 h-6" /> Redo Required
              </h2>
              <p className="text-slate-600">Your teacher has asked you to redo these tests</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {redoQuizzes.map(quiz => {
                const redoAttempt = getRedoAttempt(quiz.id);
                return (
                  <Card key={quiz.id} className="flex flex-col bg-amber-50/80 backdrop-blur-sm border-amber-300 hover:shadow-xl transition-all">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="text-slate-800">{quiz.title}</CardTitle>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                          <RotateCcw className="w-3 h-3 mr-1" /> Redo
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">{quiz.subject} - {quiz.grade}</p>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-slate-700">
                          <FileText className="w-4 h-4" />
                          <span>{getQuestionCount(quiz.id)} Questions</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <Clock className="w-4 h-4" />
                          <span>{quiz.duration_minutes} Minutes</span>
                        </div>
                        {redoAttempt?.redo_deadline && (
                          <div className="flex items-center gap-2 text-amber-700 font-semibold">
                            <AlertCircle className="w-4 h-4" />
                            <span>Deadline: {formatTimeLeft(redoAttempt.redo_deadline)}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-4 border-t border-amber-200">
                      <Link
                        to={createPageUrl(`CBTTest?quizId=${quiz.id}${linkedStudent ? `&studentId=${linkedStudent.id}` : ''}&redo=true`)}
                        className="w-full"
                      >
                        <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Redo Test
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Tests */}

        {!isAdmin && completedQuizzes.length > 0 && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Completed Tests</h2>
              <p className="text-slate-600">Tests you have already taken</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completedQuizzes.map(quiz => {
                const attempt = attempts.find(a => a.quiz_id === quiz.id);
                return (
                  <Card key={quiz.id} className="flex flex-col bg-slate-50/80 backdrop-blur-sm border-slate-200/60 opacity-75">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="text-slate-700">{quiz.title}</CardTitle>
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">{quiz.subject} - {quiz.grade}</p>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-slate-600">
                          <FileText className="w-4 h-4" />
                          <span>{getQuestionCount(quiz.id)} Questions</span>
                        </div>
                        {attempt && quiz.results_visible !== false && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <span className="font-semibold">Score: {attempt.score?.toFixed(1)}%</span>
                          </div>
                        )}
                        {attempt && quiz.results_visible === false && (
                          <div className="flex items-center gap-2 text-slate-500 text-xs italic">
                            <Lock className="w-3 h-3" />
                            <span>Score not yet released</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-4 border-t">
                      <Button className="w-full" disabled variant="outline">
                        Already Completed
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}