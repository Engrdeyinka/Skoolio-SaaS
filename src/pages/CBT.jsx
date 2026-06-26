import React, { useState, useEffect } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Quiz, Question, User } from "@/entities/all";
import { Subject } from "@/entities/Subject";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { notify } from "@/lib/notify";
import { useToast } from "@/components/ui/use-toast";
import { useTeacherAccess } from "@/lib/useTeacherAccess";
import { Button } from "@/components/ui/button";
import SaveToVaultButton from "@/components/ui/SaveToVaultButton";
import { Plus, Edit, Trash2, FileText, BarChart2, AlertCircle, Eye, EyeOff, ClipboardCheck, Clock, Hash, Undo2, X, ChevronDown, ChevronRight, BookOpen, MoreHorizontal, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import QuizForm from "../components/cbt/QuizForm";
import SchemeQuestionGenerator from "../components/cbt/SchemeQuestionGenerator";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";

const TEST_CONFIG = {
  CA1:  { label: "CA 1",       marks: 10, color: "bg-blue-500",   light: "bg-blue-50 border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500" },
  CA2:  { label: "CA 2",       marks: 10, color: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  CA3:  { label: "CA 3",       marks: 10, color: "bg-amber-500",   light: "bg-amber-50 border-amber-200",   text: "text-amber-700",   dot: "bg-amber-500" },
  Exam: { label: "Final Exam", marks: 70, color: "bg-emerald-500",  light: "bg-emerald-50 border-emerald-200",  text: "text-emerald-700",  dot: "bg-emerald-500" },
};

const SUBJECT_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-emerald-500 to-emerald-600",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

// Compact horizontal cell — actions hidden behind ⋯ button
function TestCell({ testType, test, onTogglePublish, onEdit, onCreate, onRequestUndo, getQuestionCount, subject, grade, term, academic_year }) {
  const cfg = TEST_CONFIG[testType];
  const [showActions, setShowActions] = useState(false);
  const exists = !!test;
  const isHidden      = test && test.is_published === false;
  const qCount        = exists ? getQuestionCount(test.id) : 0;
  const isEmpty       = exists && qCount === 0;

  return (
    <div className={`relative rounded-xl border overflow-hidden transition-all ${exists ? cfg.light : "bg-white border-slate-200"}`}>
      {/* Colored top accent bar */}
      <div className={`h-1 w-full ${exists ? cfg.color : "bg-slate-200"}`} />

      <div className="p-3 flex flex-col gap-2 min-h-[90px]">
        {/* ── Header row: label + badges + action toggle ── */}
        <div className="flex items-center justify-between gap-1">
          <span className={`text-xs font-bold leading-tight ${exists ? cfg.text : "text-slate-400"}`}>
            {cfg.label}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {exists && !showActions && (
              <>
                {isHidden && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full leading-tight">Hidden</span>}
                <button onClick={() => setShowActions(true)} title="Actions"
                  className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
                  <MoreHorizontal className="w-3 h-3" />
                </button>
              </>
            )}
            {exists && showActions && (
              <button onClick={() => setShowActions(false)} title="Close"
                className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* ── Body: create / actions / stats ── */}
        {!exists ? (
          <button
            onClick={() => onCreate(subject, grade, term, academic_year, testType)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-2 text-xs font-semibold transition-all
              ${testType === "CA1" ? "border-blue-300 text-blue-500 hover:bg-blue-50" :
                testType === "CA2" ? "border-emerald-300 text-emerald-500 hover:bg-emerald-50" :
                testType === "CA3" ? "border-amber-300 text-amber-500 hover:bg-amber-50" :
                "border-emerald-300 text-emerald-500 hover:bg-emerald-50"}`}
          >
            <Plus className="w-4 h-4" />
            Create
          </button>

        ) : showActions ? (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => onTogglePublish(test)} title={isHidden ? "Publish" : "Hide from students"}
              className={`h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium transition-colors ${isHidden ? "text-amber-600 bg-amber-100" : "text-slate-500 hover:bg-white hover:text-slate-700"}`}>
              {isHidden ? <><EyeOff className="w-3 h-3" /> Publish</> : <><Eye className="w-3 h-3" /> Hide</>}
            </button>
            <button onClick={() => { onEdit(test); setShowActions(false); }} title="Edit settings"
              className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700 transition-colors">
              <Edit className="w-3 h-3" /> Edit
            </button>
            <Link to={createPageUrl(`CBTEditor?quizId=${test.id}`)}>
              <button title="Manage questions"
                className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700 transition-colors">
                <FileText className="w-3 h-3" /> Questions
              </button>
            </Link>
            <Link to={createPageUrl(`CBTGrading?quizId=${test.id}`)}>
              <button title="View grades"
                className={`h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium ${cfg.text} hover:bg-white transition-colors`}>
                <BarChart2 className="w-3 h-3" /> Grades
              </button>
            </Link>
            {isEmpty && (
              <button onClick={() => { onRequestUndo(test.id); setShowActions(false); }} title="Remove empty quiz"
                className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
                <Undo2 className="w-3 h-3" /> Remove
              </button>
            )}
          </div>

        ) : (
          <div className="flex items-end justify-between">
            <div className="space-y-0.5">
              <div className={`text-xl font-bold leading-none ${cfg.text}`}>{qCount}</div>
              <div className="text-[10px] text-slate-400 font-medium">questions</div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="text-sm font-semibold text-slate-600">{test.duration_minutes}m</div>
              <div className="text-[10px] text-slate-400 font-medium">duration</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const GRADES_LIST = [
  "KG 1","KG 2","Nursery 1","Nursery 2","Primary 1","Primary 2","Primary 3",
  "Primary 4","JSS 1","JSS 2","JSS 3","SSS 1","SSS 2","SSS 3"
];
const TERMS_LIST = ["First Term","Second Term","Third Term"];
const YEARS_LIST = ["2023/2024","2024/2025","2025/2026","2026/2027","2027/2028"];

function GroupEditDialog({ group, onSave, onCancel }) {
  const [grade,    setGrade]    = useState(group.grade);
  const [term,     setTerm]     = useState(group.term);
  const [year,     setYear]     = useState(group.academic_year);
  const [subject,  setSubject]  = useState(group.subject || "");
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    Subject.list("subject_name").then(setSubjects).catch(() => {});
  }, []);

  const subjectNames = subjects.map(s => s.subject_name).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-lg">Edit Card</h2>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500">Changes apply to all tests in this card.</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {subjectNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Class</label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GRADES_LIST.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Term</label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS_LIST.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Academic Year</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS_LIST.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave({ subject, grade, term, academic_year: year })} className="bg-blue-600 hover:bg-blue-700">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CBTPage() {
  const { toast } = useToast();
  const { term: defaultTerm, year: defaultYear } = useSchoolSettings();
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null); // { quizIds, grade, term, year }
  const [undoTarget, setUndoTarget] = useState(null); // quizId pending undo confirmation
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedClass, setSelectedClass] = usePersistentState("cbt_class", "All");
  const [activeTab, setActiveTab] = usePersistentState("cbt_management_tab", "manage");
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedSections, setExpandedSections] = useState(new Set()); // grade keys that are expanded (default: all collapsed)

  const toggleSection = (grade) => setExpandedSections(prev => {
    const next = new Set(prev);
    if (next.has(grade)) next.delete(grade); else next.add(grade);
    return next;
  });

  const { isTeacher, teacherSubject, teacherSubjects, teacherClasses, isLoadingTeacher } = useTeacherAccess();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [quizData, questionData] = await Promise.all([
        Quiz.list("-created_date"),
        Question.list()
      ]);
      setQuizzes(quizData);
      setQuestions(questionData);
    } catch (error) {
      console.error("Error loading CBT data:", error);
    }
    setIsLoading(false);
  };

  // Sync selector to school settings once they load (but don't override a manual selection)
  useEffect(() => {
    if (defaultTerm && selectedTerm === null) setSelectedTerm(defaultTerm);
  }, [defaultTerm]);
  useEffect(() => {
    if (defaultYear && selectedYear === null) setSelectedYear(defaultYear);
  }, [defaultYear]);

  useEffect(() => {
    const checkAccess = async () => {
      setIsLoading(true);
      try {
        const user = await User.me();
        setCurrentUser(user);

        if (user.school_role !== 'admin' && user.school_role !== 'teacher' && user.school_role !== 'super_admin') {
          setAccessDenied(true);
          setIsLoading(false);
          return;
        }

        loadData();
      } catch (error) {
        console.error("Error checking access:", error);
        setAccessDenied(true);
        setIsLoading(false);
      }
    };
    checkAccess();
  }, []);

  const handleFormSubmit = async (quizData) => {
    try {
      if (editingQuiz && editingQuiz.id) {
        await Quiz.update(editingQuiz.id, quizData);
        toast({ title: "Quiz updated", description: `"${quizData.title}" has been updated.` });
      } else {
        await Quiz.create(quizData);
        toast({ title: "Quiz created", description: `"${quizData.title}" has been created.` });
        recordStreak(currentUser?.id, STREAK_TYPES.CBT);
      }
      setShowForm(false);
      setEditingQuiz(null);
      loadData();
    } catch (error) {
      console.error("Error saving quiz:", error);
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const handleEdit = (quiz) => {
    setEditingQuiz(quiz);
    setShowForm(true);
  };

  const handleDelete = async (quizId) => {
    try {
      const questionsToDelete = questions.filter(q => q.quiz_id === quizId);
      const deletePromises = questionsToDelete.map(q => Question.delete(q.id));
      await Promise.all(deletePromises);
      await Quiz.delete(quizId);
      loadData();
    } catch (error) {
      console.error("Error deleting quiz:", error);
    }
  };

  const handleSaveGroup = async ({ subject, grade, term, academic_year }) => {
    if (!editingGroup) return;
    try {
      await Promise.all(editingGroup.quizIds.map(id =>
        Quiz.update(id, { subject, grade, term, academic_year })
      ));
      toast({ title: "Card updated", description: `${subject} · ${grade} · ${term} · ${academic_year}` });
      setEditingGroup(null);
      loadData();
    } catch (e) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };


  const handleTogglePublish = async (quiz) => {
    try {
      const newValue = quiz.is_published === false ? true : false;
      await Quiz.update(quiz.id, { is_published: newValue });
      toast({
        title: newValue ? "Test published" : "Test hidden",
        description: `"${quiz.title}" is now ${newValue ? "visible to students" : "hidden from students"}.`,
      });
      if (newValue) {
        notify({
          title: `Exam published — ${quiz.title}`,
          message: `${quiz.subject || ""}${quiz.grade ? ` · ${quiz.grade}` : ""}${quiz.term ? ` · ${quiz.term}` : ""}`,
          type: "exam",
          targetRole: "all",
          link: "/cbt",
        });
      }
      loadData();
    } catch (error) {
      console.error("Error toggling publish:", error);
      toast({ title: "Error", description: error?.message, variant: "destructive" });
    }
  };

  const handleDeleteCard = async (group) => {
    const { tests } = group;
    const testsToDelete = Object.values(tests).filter(t => t);
    if (testsToDelete.length === 0) return;
    try {
      const deletePromises = [];
      for (const test of testsToDelete) {
        const questionsToDelete = questions.filter(q => q.quiz_id === test.id);
        questionsToDelete.forEach(q => { deletePromises.push(Question.delete(q.id)); });
        deletePromises.push(Quiz.delete(test.id));
      }
      await Promise.all(deletePromises);
      loadData();
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const getQuestionCount = (quizId) => {
    return questions.filter(q => q.quiz_id === quizId).length;
  };

  const handleCreateTest = async (subject, grade, term = defaultTerm, academicYear = defaultYear, testType) => {
    try {
      let defaultDuration;
      switch (testType) {
        case 'Exam': defaultDuration = 60; break;
        case 'CA3':  defaultDuration = 30; break;
        default:     defaultDuration = 20; break;
      }
      const newQuiz = await Quiz.create({
        subject, grade, term,
        academic_year: academicYear,
        test_type: testType,
        title: `${subject} ${testType}`,
        description: "",
        duration_minutes: defaultDuration
      });
      recordStreak(currentUser?.id, STREAK_TYPES.CBT);
      window.location.href = createPageUrl(`CBTEditor?quizId=${newQuiz.id}`);
    } catch (error) {
      console.error("Error creating test:", error);
    }
  };

  const activeTerm = selectedTerm || defaultTerm;
  const activeYear = selectedYear || defaultYear;

  const currentTermQuizzes = quizzes.filter(q =>
    q.term === activeTerm && q.academic_year === activeYear
  );

  const visibleQuizzes = isTeacher
    ? currentTermQuizzes.filter(q =>
        (!teacherSubjects?.length || teacherSubjects.includes(q.subject)) &&
        (teacherClasses.length === 0 || teacherClasses.includes(q.grade))
      )
    : currentTermQuizzes;

  const groupedQuizzes = visibleQuizzes.reduce((acc, quiz) => {
    const key = `${quiz.subject}-${quiz.grade}-${quiz.term}-${quiz.academic_year}`;
    if (!acc[key]) {
      acc[key] = { subject: quiz.subject, grade: quiz.grade, term: quiz.term, academic_year: quiz.academic_year, tests: {} };
    }
    acc[key].tests[quiz.test_type] = quiz;
    return acc;
  }, {});

  if (accessDenied) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-2xl shadow-lg border border-red-200">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">This area is for teachers and administrators only.</p>
          <Link to={createPageUrl("StudentCBT")}>
            <Button className="bg-blue-600 hover:bg-blue-700">Go to Student Tests</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalTests = Object.values(groupedQuizzes).reduce((sum, g) => sum + Object.values(g.tests).filter(Boolean).length, 0);
  const totalQuestions = visibleQuizzes.reduce((sum, q) => sum + getQuestionCount(q.id), 0);

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">CBT Management</h1>
            <p className="text-slate-500">Create and manage computer-based tests for students</p>
          </div>
          <div className="flex items-center gap-2">
            <SaveToVaultButton module="exams" term={defaultTerm} year={defaultYear} />
            <Button
              onClick={() => { setEditingQuiz(null); setShowForm(true); }}
              className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New Quiz
            </Button>
          </div>
        </div>

        <div className="mb-6 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("manage")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "manage"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Tests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("generator")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "generator"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wand2 className="w-4 h-4" />
            AI Question Generator
          </button>
        </div>

        {/* ── Term / Year selector ── */}
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Term</span>
            <Select value={activeTerm || ""} onValueChange={setSelectedTerm}>
              <SelectTrigger className="w-44 bg-white border-slate-200 text-sm font-medium text-slate-800 rounded-lg shadow-sm">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {TERMS_LIST.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Year</span>
            <Select value={activeYear || ""} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-36 bg-white border-slate-200 text-sm font-medium text-slate-800 rounded-lg shadow-sm">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS_LIST.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(activeTerm !== defaultTerm || activeYear !== defaultYear) && (
            <button
              type="button"
              onClick={() => { setSelectedTerm(defaultTerm); setSelectedYear(defaultYear); }}
              className="mb-0.5 text-xs text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
            >
              Reset to current
            </button>
          )}
        </div>

        {activeTab === "generator" ? (
          <SchemeQuestionGenerator
            quizzes={visibleQuizzes}
            onSaved={loadData}
            defaultTerm={defaultTerm}
            defaultYear={defaultYear}
            restrictedSubject={isTeacher ? teacherSubject : null}
            restrictedSubjects={isTeacher ? teacherSubjects : null}
            restrictedGrades={isTeacher ? teacherClasses : null}
          />
        ) : (
          <>

        {/* Stats */}
        {!isLoading && Object.keys(groupedQuizzes).length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Subject Groups</p>
                <p className="text-xl font-bold text-slate-900">{Object.keys(groupedQuizzes).length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Tests</p>
                <p className="text-xl font-bold text-slate-900">{totalTests}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Hash className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Questions</p>
                <p className="text-xl font-bold text-slate-900">{totalQuestions}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quiz Form */}
        <AnimatePresence>
          {showForm && (
            <QuizForm
              quiz={editingQuiz}
              defaultTerm={defaultTerm}
              defaultYear={defaultYear}
              onSubmit={handleFormSubmit}
              onCancel={() => { setShowForm(false); setEditingQuiz(null); }}
              restrictedSubjects={isTeacher ? teacherSubjects : null}
              restrictedGrades={isTeacher ? teacherClasses : null}
            />
          )}
        </AnimatePresence>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="h-1 bg-slate-200" />
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/2" />
                      <div className="h-3 bg-slate-100 rounded w-2/3" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Array(4).fill(0).map((_, j) => (
                      <div key={j} className="h-[90px] bg-slate-100 rounded-xl" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : Object.keys(groupedQuizzes).length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No tests yet</h3>
            <p className="text-slate-400 text-sm mb-6">Create your first quiz to get started.</p>
            <Button onClick={() => { setEditingQuiz(null); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Quiz
            </Button>
          </div>
        ) : (() => {
          // ── Group by grade in GRADES_LIST order ──────────────────────────
          const allGroups = Object.values(groupedQuizzes);
          const gradeOrder = GRADES_LIST;
          const gradesPresent = [...new Set(allGroups.map(g => g.grade))]
            .sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b));

          // Class filter bar
          const filteredGrades = selectedClass === "All" ? gradesPresent : gradesPresent.filter(g => g === selectedClass);

          // Per-grade color strip
          const GRADE_COLORS = {
            "KG 1":"bg-pink-500","KG 2":"bg-pink-500","Nursery 1":"bg-rose-500","Nursery 2":"bg-rose-500",
            "Primary 1":"bg-amber-500","Primary 2":"bg-amber-500","Primary 3":"bg-amber-500",
            "Primary 4":"bg-amber-500",
            "JSS 1":"bg-blue-500","JSS 2":"bg-blue-500","JSS 3":"bg-blue-500",
            "SSS 1":"bg-indigo-600","SSS 2":"bg-indigo-600","SSS 3":"bg-indigo-600",
          };
          const GRADE_LIGHT = {
            "KG 1":"bg-pink-50 border-pink-200 text-pink-700","KG 2":"bg-pink-50 border-pink-200 text-pink-700",
            "Nursery 1":"bg-rose-50 border-rose-200 text-rose-700","Nursery 2":"bg-rose-50 border-rose-200 text-rose-700",
            "Primary 1":"bg-amber-50 border-amber-200 text-amber-700","Primary 2":"bg-amber-50 border-amber-200 text-amber-700",
            "Primary 3":"bg-amber-50 border-amber-200 text-amber-700","Primary 4":"bg-amber-50 border-amber-200 text-amber-700",
            "JSS 1":"bg-blue-50 border-blue-200 text-blue-700","JSS 2":"bg-blue-50 border-blue-200 text-blue-700",
            "JSS 3":"bg-blue-50 border-blue-200 text-blue-700",
            "SSS 1":"bg-indigo-50 border-indigo-200 text-indigo-700","SSS 2":"bg-indigo-50 border-indigo-200 text-indigo-700",
            "SSS 3":"bg-indigo-50 border-indigo-200 text-indigo-700",
          };

          // Global color index for card avatars (persists across sections)
          let colorIdx = 0;

          return (
            <div className="space-y-2">
              {/* ── Class filter bar ── */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2 mb-4 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Jump to class:</span>
                <button
                  onClick={() => setSelectedClass("All")}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedClass === "All" ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"}`}
                >
                  All ({gradesPresent.length})
                </button>
                {gradesPresent.map(grade => {
                  const dotColor = GRADE_COLORS[grade] || "bg-slate-400";
                  const activeLight = GRADE_LIGHT[grade] || "bg-slate-100 border-slate-200 text-slate-700";
                  const gradeSubjects = allGroups.filter(g => g.grade === grade).length;
                  return (
                    <button
                      key={grade}
                      onClick={() => setSelectedClass(selectedClass === grade ? "All" : grade)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
                        selectedClass === grade
                          ? `${dotColor} text-white border-transparent`
                          : `${activeLight} opacity-80 hover:opacity-100`
                      }`}
                    >
                      {grade}
                      <span className={`text-[10px] rounded-full px-1.5 py-0 font-bold ${selectedClass === grade ? "bg-white/30" : "bg-white/60"}`}>{gradeSubjects}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Class sections ── */}
              {filteredGrades.map(grade => {
                const gradeGroups = allGroups.filter(g => g.grade === grade);
                const isCollapsed = !expandedSections.has(grade);
                const totalSubjects = gradeGroups.length;
                const totalTests = gradeGroups.reduce((s, g) => s + Object.values(g.tests).filter(Boolean).length, 0);
                const totalQs = gradeGroups.reduce((s, g) => s + Object.values(g.tests).filter(Boolean).reduce((ss, t) => ss + getQuestionCount(t.id), 0), 0);
                const dotColor = GRADE_COLORS[grade] || "bg-slate-400";
                const lightColor = GRADE_LIGHT[grade] || "bg-slate-50 border-slate-200 text-slate-700";

                return (
                  <div key={grade} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Section header */}
                    <button
                      onClick={() => toggleSection(grade)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className={`w-9 h-9 rounded-xl ${dotColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <BookOpen className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-slate-900">{grade}</h2>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${lightColor}`}>
                            {totalSubjects} subject{totalSubjects !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-slate-400">{totalTests} tests · {totalQs} questions</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-slate-400">
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Subject cards grid */}
                    {!isCollapsed && (
                      <div className="border-t border-slate-100 p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {gradeGroups.map((group) => {
                            const { subject, term, academic_year, tests } = group;
                            const avatarColor = SUBJECT_COLORS[colorIdx++ % SUBJECT_COLORS.length];
                            const createdCount = Object.values(tests).filter(Boolean).length;
                            const totalQsCard = Object.values(tests).filter(Boolean).reduce((s, t) => s + getQuestionCount(t.id), 0);

                            return (
                              <Card key={`${subject}-${grade}-${term}-${academic_year}`} className="bg-slate-50 border border-slate-200 shadow-none hover:shadow-md hover:bg-white transition-all">
                                <CardHeader className="pb-3 border-b border-slate-100">
                                  <div className="flex items-start gap-3">
                                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarColor} flex items-center justify-center flex-shrink-0 shadow-md`}>
                                      <span className="text-white font-bold text-base">{subject?.charAt(0) || 'S'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-bold text-slate-900 truncate text-base">{subject}</h3>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className="text-xs font-medium bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{term}</span>
                                        <span className="text-xs font-medium bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{academic_year}</span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => setEditingGroup({ quizIds: Object.values(tests).filter(Boolean).map(t => t.id), subject, grade, term, academic_year })}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
                                      title="Edit class / term / year"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="Delete all tests">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete {subject} Tests?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will permanently delete all tests for <strong>{subject} — {grade} — {term} — {academic_year}</strong>, including all questions.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteCard(group)} className="bg-red-600 hover:bg-red-700">Delete All</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                                    <span><strong className="text-slate-700">{createdCount}</strong>/4 tests</span>
                                    <span className="text-slate-300">·</span>
                                    <span><strong className="text-slate-700">{totalQsCard}</strong> questions</span>
                                  </div>
                                </CardHeader>
                                <CardContent className="pt-2 pb-4 px-4">
                                  <div className="grid grid-cols-2 gap-2">
                                    {['CA1', 'CA2', 'CA3', 'Exam'].map(testType => (
                                      <TestCell
                                        key={testType}
                                        testType={testType}
                                        test={tests[testType]}
                                        onTogglePublish={handleTogglePublish}
                                        onEdit={handleEdit}
                                        onCreate={handleCreateTest}
                                        onRequestUndo={(id) => setUndoTarget(id)}
                                        getQuestionCount={getQuestionCount}
                                        subject={subject}
                                        grade={grade}
                                        term={term}
                                        academic_year={academic_year}
                                      />
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
          </>
        )}
      </div>

      {/* Undo confirmation dialog */}
      <AlertDialog open={!!undoTarget} onOpenChange={(open) => { if (!open) setUndoTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove empty quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This quiz has no questions. Are you sure you want to delete it? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUndoTarget(null)}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await handleDelete(undoTarget); setUndoTarget(null); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group edit dialog */}
      {editingGroup && (
        <GroupEditDialog
          group={editingGroup}
          onSave={handleSaveGroup}
          onCancel={() => setEditingGroup(null)}
        />
      )}
    </div>
  );
}
