import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Student, ExamResult, Attendance } from "@/entities/all";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/lib/AuthContext";
import { useTeacherAccess } from "@/lib/useTeacherAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, BookOpen, FileText, Edit, Eye, EyeOff, ChevronDown, ChevronUp, TrendingUp, Users, GraduationCap, Award, ArrowLeft, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { printReportCard } from "@/utils/printReportCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { canEditResultsForStatus, getResultsWorkflowStatus } from "@/lib/resultsWorkflow";
import { listSchoolDaysForTerm } from "@/lib/schoolCalendar";
import { getLagosDateString } from "@/lib/timezone";
import { PageShell } from "@/components/ui/page-shell";
import SaveToVaultButton from "@/components/ui/SaveToVaultButton";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";

import AcademicRecordForm from "../components/academics/AcademicRecordForm";
import Gradebook from "../components/academics/Gradebook";

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

const GRADES_SUBJECTS_MAP = {
  "KG 1": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "Fine Arts", "Music"],
  "KG 2": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "Fine Arts", "Music"],
  "Nursery 1": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "Fine Arts", "Music"],
  "Nursery 2": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "Fine Arts", "Music"],
  "Primary 1": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "Primary 2": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "Primary 3": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "Primary 4": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "JSS 1": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "JSS 2": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "JSS 3": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science"],
  "SSS 1": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science", "Physics", "Chemistry", "Biology", "Geography", "Economics", "Government", "Literature in English", "Further Mathematics"],
  "SSS 2": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science", "Physics", "Chemistry", "Biology", "Geography", "Economics", "Government", "Literature in English", "Further Mathematics"],
  "SSS 3": ["Mathematics", "English Language", "Basic Science", "Social Studies", "Christian Religious Studies", "Physical & Health Education", "Computer Studies", "French", "Yoruba", "Fine Arts", "Music", "Agricultural Science", "Physics", "Chemistry", "Biology", "Geography", "Economics", "Government", "Literature in English", "Further Mathematics"],
};

const getSubjectsForGrade = (grade) => {
  if (grade === "all" || !grade) {
    const allSubjects = new Set();
    Object.values(GRADES_SUBJECTS_MAP).forEach(subjectsArray => {
      subjectsArray.forEach(subject => allSubjects.add(subject));
    });
    return Array.from(allSubjects).sort();
  }
  return GRADES_SUBJECTS_MAP[grade] || [];
};

const getScoreColor = (score) => {
  if (score >= 70) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" };
  if (score >= 60) return { bar: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" };
  if (score >= 50) return { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" };
  if (score >= 45) return { bar: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50" };
  return { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" };
};

const getGradeBadgeColor = (grade) => {
  const colors = {
    A: "bg-emerald-100 text-emerald-800 border-emerald-300",
    A1: "bg-emerald-100 text-emerald-800 border-emerald-300",
    B: "bg-blue-100 text-blue-800 border-blue-300",
    B2: "bg-blue-100 text-blue-800 border-blue-300",
    B3: "bg-blue-100 text-blue-800 border-blue-300",
    C: "bg-amber-100 text-amber-800 border-amber-300",
    C4: "bg-amber-100 text-amber-800 border-amber-300",
    C5: "bg-amber-100 text-amber-800 border-amber-300",
    C6: "bg-amber-100 text-amber-800 border-amber-300",
    D: "bg-orange-100 text-orange-800 border-orange-300",
    D7: "bg-orange-100 text-orange-800 border-orange-300",
    E: "bg-red-100 text-red-800 border-red-300",
    E8: "bg-red-100 text-red-800 border-red-300",
    F: "bg-red-100 text-red-800 border-red-300",
    F9: "bg-red-100 text-red-800 border-red-300",
  };
  return colors[grade] || "bg-slate-100 text-slate-800 border-slate-300";
};

export default function AcademicRecordsPage() {
  const [students, setStudents] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [searchTerm, setSearchTerm] = usePersistentState("academic_search", "");
  const [filters, setFilters] = usePersistentState("academic_filters", {
    grade: "all",
    term: "Third Term",
    academic_year: "2025/2026"
  });
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear, schoolLogoUrl, principalSignatureUrl, schoolStampUrl } = useSchoolSettings();
  const [isLoading, setIsLoading] = useState(true);
  const [activeStudentAccordion, setActiveStudentAccordion] = useState(null);
  const [activeTab, setActiveTab] = usePersistentState("academic_tab", "results"); // "results" | "gradebook"
  const [workflow, setWorkflow] = useState({ status: "draft", updatedAt: null });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const previewTeacherId = searchParams.get("preview") || null;

  const { teacherSubject, teacherSubjects, teacherClasses, isTeacher, isAdminOrSuperAdmin, isPreviewMode, previewTeacherName } = useTeacherAccess({ previewTeacherId });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [studentsData, resultsData] = await Promise.all([
        Student.list(),
        ExamResult.list("-created_date")
      ]);
      setStudents(studentsData);
      setExamResults(resultsData);
    } catch (error) {
      console.error("Error loading academic records:", error);
    }
    setIsLoading(false);
  };

  // Auto-select first assigned class when teacher classes load
  useEffect(() => {
    if (isTeacher && teacherClasses.length > 0) {
      setFilters(prev => prev.grade === "all" ? { ...prev, grade: teacherClasses[0] } : prev);
    }
  }, [isTeacher, teacherClasses]);

  // Sync default filter term/year from school settings
  useEffect(() => {
    if (schoolTerm) setFilters(f => ({ ...f, term: schoolTerm }));
  }, [schoolTerm]);
  useEffect(() => {
    if (schoolYear) setFilters(f => ({ ...f, academic_year: schoolYear }));
  }, [schoolYear]);

  useEffect(() => {
    if (currentUser !== null) {
      loadData();
    }
  }, [currentUser]);

  useEffect(() => {
    getResultsWorkflowStatus(filters.term, filters.academic_year)
      .then((status) => setWorkflow(status || { status: "draft", updatedAt: null }))
      .catch(() => setWorkflow({ status: "draft", updatedAt: null }));
  }, [filters.term, filters.academic_year]);

  useEffect(() => {
    let currentFiltered = examResults;

    currentFiltered = currentFiltered.filter(result =>
      result.term === filters.term && result.academic_year === filters.academic_year
    );

    if (filters.grade !== "all") {
      const gradeStudents = students.filter(s => s.grade === filters.grade);
      const gradeStudentIds = gradeStudents.map(s => s.id);
      currentFiltered = currentFiltered.filter(result => gradeStudentIds.includes(result.student_id));
    }

    if (isTeacher) {
      if (teacherSubjects.length > 0) {
        currentFiltered = currentFiltered.filter(r => teacherSubjects.includes(r.subject_name));
      }
      if (teacherClasses.length > 0) {
        const allowedStudentIds = students.filter(s => teacherClasses.includes(s.grade)).map(s => s.id);
        currentFiltered = currentFiltered.filter(r => allowedStudentIds.includes(r.student_id));
      }
    }

    if (searchTerm) {
      currentFiltered = currentFiltered.filter(result => {
        const student = students.find(s => s.id === result.student_id);
        const studentName = student ? `${student.first_name} ${student.last_name}` : '';
        return studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
               result.subject_name.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    const uniqueResultsMap = new Map();
    for (const result of currentFiltered) {
      const key = `${result.student_id}-${result.subject_name}`;
      if (!uniqueResultsMap.has(key)) {
        uniqueResultsMap.set(key, result);
      }
    }
    setFilteredResults(Array.from(uniqueResultsMap.values()));
  }, [examResults, students, searchTerm, filters, isTeacher, teacherSubjects, teacherClasses]);

  const handleSubmitSuccess = () => {
    setShowForm(false);
    setEditingStudentId(null);
    loadData();
    toast.success("Academic records saved successfully.");
    recordStreak(currentUser?.id, STREAK_TYPES.ACADEMIC_RECORDS);
  };

  const handleEdit = (studentId) => {
    setEditingStudentId(studentId);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingStudentId(null);
    setShowForm(true);
  };

  const handleToggleResultRelease = async (result) => {
    if (workflow.status === "locked") {
      toast.error("Results are locked for this term.");
      return;
    }
    try {
      const newValue = !result.results_released;
      await ExamResult.update(result.id, { results_released: newValue });
      toast.success(newValue ? "Result released to student" : "Result hidden from student");
      loadData();
    } catch (error) {
      toast.error("Failed to update result visibility");
    }
  };

  const handleToggleAllResultsForStudent = async (studentId, release) => {
    if (workflow.status === "locked") {
      toast.error("Results are locked for this term.");
      return;
    }
    try {
      const studentResults = filteredResults.filter(r => r.student_id === studentId);
      await Promise.all(studentResults.map(r => ExamResult.update(r.id, { results_released: release })));
      toast.success(release ? "All results released to student" : "All results hidden from student");
      loadData();
    } catch (error) {
      toast.error("Failed to update result visibility");
    }
  };

  const generateStudentReportCard = async (studentId) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const studentResults = filteredResults.filter(r => r.student_id === studentId);

    // Attendance: present days up to TODAY / full term school days
    // - total  = all school days in the term (e.g. 61)
    // - present = school days from term start → today that student was NOT absent/late
    let attendance = { present: 0, total: 0 };
    try {
      const calEvents  = await SchoolCalendarEvent.list("-event_date").catch(() => []);
      const allDates   = listSchoolDaysForTerm(calEvents, filters.term, filters.academic_year);
      const totalDays  = allDates.length; // full term length (denominator)

      if (totalDays > 0) {
        const today          = getLagosDateString();
        const datesUpToToday = allDates.filter(d => d <= today);
        const schoolDaysSoFar = datesUpToToday.length;

        const records = await Attendance.filter({
          grade:         student.grade,
          term:          filters.term,
          academic_year: filters.academic_year,
        });

        let absent = 0;
        let late   = 0;
        records.forEach(r => {
          if (r.student_id !== studentId) return;
          // Only count absences/lates on school days that have already passed
          if (!r.attendance_date || !datesUpToToday.includes(r.attendance_date)) return;
          if (r.status === "absent") absent++;
          else if (r.status === "late") late++;
        });

        attendance = {
          present: Math.max(0, schoolDaysSoFar - absent - late),
          total:   totalDays,
        };
      }
    } catch (_) {}

    printReportCard({
      student,
      results: studentResults,
      term: filters.term,
      academicYear: filters.academic_year,
      attendance,
      schoolLogoUrl,
      principalSignatureUrl,
      schoolStampUrl,
    });
  };

  const resultsByStudent = filteredResults.reduce((acc, result) => {
    if (!acc[result.student_id]) {
      acc[result.student_id] = [];
    }
    acc[result.student_id].push(result);
    return acc;
  }, {});

  const subjectsForForm = useMemo(() => {
    if (editingStudentId) {
      const student = students.find(s => s.id === editingStudentId);
      return student ? getSubjectsForGrade(student.grade) : getSubjectsForGrade("all");
    }
    return getSubjectsForGrade(filters.grade);
  }, [editingStudentId, students, filters.grade]);

  // Stats
  const studentCount = Object.keys(resultsByStudent).length;
  const allAverages = Object.values(resultsByStudent).map(results => {
    const sum = results.reduce((s, r) => s + (r.total_score || 0), 0);
    return results.length ? sum / results.length : 0;
  });
  const overallClassAvg = allAverages.length
    ? Math.ceil(allAverages.reduce((a, b) => a + b, 0) / allAverages.length)
    : "—";
  const highAchievers = allAverages.filter(a => a >= 70).length;
  const canEditResults = canEditResultsForStatus(workflow.status);

  return (
    <PageShell maxWidth="7xl" className="min-h-screen">
      <div>

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">Academic Records</h1>
            <p className="text-slate-500">Manage exam scores and generate student report cards</p>
          </div>
          <div className="flex items-center gap-2">
            <SaveToVaultButton module="gradebooks" term={schoolTerm} year={schoolYear} />
            {activeTab === "results" && (
              <Button
                onClick={handleAddNew}
                disabled={!canEditResults}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200 gap-2"
              >
                <Plus className="w-4 h-4" />
                Add / Edit Scores
              </Button>
            )}
          </div>
        </div>

        {/* Preview mode banner */}
        {isPreviewMode && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-blue-600 text-white rounded-2xl text-sm shadow-md">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 flex-shrink-0" />
              <span>Previewing as <strong>{previewTeacherName || "Teacher"}</strong> — you are seeing exactly what this teacher sees.</span>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-blue-100 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
              Exit Preview
            </button>
          </div>
        )}

        <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
          canEditResults ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          Results workflow for {filters.term} {filters.academic_year}: <strong className="capitalize">{workflow.status}</strong>
          {canEditResults ? " — score entry is open." : " — score entry is locked on this page."}
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("results")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "results"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Exam Results
          </button>
          <button
            onClick={() => setActiveTab("gradebook")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "gradebook"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Gradebook
          </button>
        </div>

        {/* ── Gradebook tab ── */}
        {activeTab === "gradebook" && (
          <Gradebook
            term={filters.term}
            academicYear={filters.academic_year}
            currentUser={currentUser}
            teacherSubject={teacherSubject}
            teacherSubjects={teacherSubjects}
            teacherClasses={teacherClasses}
          />
        )}

        {/* ── Exam Results tab ── */}
        {activeTab === "results" && <>

        {/* Teacher info banner */}
        {isTeacher && teacherSubjects.length > 0 && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
            <BookOpen className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              Showing records for: <strong>{teacherSubjects.join(", ")}</strong>
              {teacherClasses.length > 0 && <> · Classes: <strong>{teacherClasses.join(", ")}</strong></>}
            </span>
          </div>
        )}

        {/* Score Entry Form */}
        <AnimatePresence>
          {showForm && (
            <>
              <button
                onClick={() => { setShowForm(false); setEditingStudentId(null); }}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Records
              </button>
            <AcademicRecordForm
              initialStudentId={editingStudentId}
              term={filters.term}
              academicYear={filters.academic_year}
              students={students}
              currentUser={currentUser}
              readOnly={!canEditResults}
              onSubmitSuccess={handleSubmitSuccess}
              onCancel={() => { setShowForm(false); setEditingStudentId(null); }}
            />
            </>
          )}
        </AnimatePresence>

        {/* Stats Row */}
        {!isLoading && !showForm && studentCount > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Students</p>
                <p className="text-xl font-bold text-slate-900">{studentCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Records</p>
                <p className="text-xl font-bold text-slate-900">{filteredResults.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Class Average</p>
                <p className="text-xl font-bold text-slate-900">{overallClassAvg}{overallClassAvg !== "—" ? "%" : ""}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Award className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">High Achievers (≥70%)</p>
                <p className="text-xl font-bold text-slate-900">{highAchievers}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Term</label>
              <Select value={filters.term} onValueChange={(v) => setFilters({ ...filters, term: v })}>
                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First Term">First Term</SelectItem>
                  <SelectItem value="Second Term">Second Term</SelectItem>
                  <SelectItem value="Third Term">Third Term</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Academic Year</label>
              <Select value={filters.academic_year} onValueChange={(v) => setFilters({ ...filters, academic_year: v })}>
                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2023/2024">2023/2024</SelectItem>
                  <SelectItem value="2024/2025">2024/2025</SelectItem>
                  <SelectItem value="2025/2026">2025/2026</SelectItem>
                  <SelectItem value="2026/2027">2026/2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Class</label>
              <Select
                value={filters.grade}
                onValueChange={(v) => setFilters({ ...filters, grade: v })}
                disabled={!isAdminOrSuperAdmin && teacherClasses.length === 1}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isAdminOrSuperAdmin && <SelectItem value="all">All Classes</SelectItem>}
                  {(isAdminOrSuperAdmin ? GRADES : teacherClasses.length > 0 ? teacherClasses : GRADES)
                    .map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <Input
                  placeholder="Student or subject..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 bg-slate-50 border-slate-200 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-1/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                  </div>
                  <div className="w-24 h-8 bg-slate-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : Object.keys(resultsByStudent).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No records found</h3>
            <p className="text-slate-400 text-sm">Try adjusting your filters or add scores for this period.</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={activeStudentAccordion}
            onValueChange={setActiveStudentAccordion}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start"
          >
            {Object.entries(resultsByStudent).map(([studentId, results], idx) => {
              const student = students.find(s => s.id === studentId);
              if (!student) return null;

              const totalScore = results.reduce((sum, r) => sum + (r.total_score || 0), 0);
              const avg = results.length > 0 ? totalScore / results.length : 0;
              const avgDisplay = Math.ceil(avg);
              const allReleased = results.every(r => r.results_released);
              const scoreColors = getScoreColor(avg);
              const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();
              const avatarColors = [
                "from-emerald-500 to-indigo-600",
                "from-blue-500 to-cyan-600",
                "from-emerald-500 to-teal-600",
                "from-amber-500 to-orange-500",
                "from-rose-500 to-pink-600",
              ];
              const avatarColor = avatarColors[idx % avatarColors.length];

              return (
                <AccordionItem
                  value={studentId}
                  key={studentId}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm data-[state=open]:border-emerald-200 data-[state=open]:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <span className="text-white font-bold text-sm">{initials}</span>
                    </div>

                    {/* Name & info — this is the accordion trigger */}
                    <AccordionTrigger className="flex-1 hover:no-underline py-0 text-left gap-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{student.first_name} {student.last_name}</p>
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{student.grade}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${scoreColors.bar} rounded-full transition-all`}
                                style={{ width: `${Math.min(avg, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${scoreColors.text}`}>{avgDisplay}%</span>
                          </div>
                          <span className="text-xs text-slate-400">{results.length} subject{results.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </AccordionTrigger>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        onClick={() => handleEdit(studentId)}
                        variant="outline"
                        size="sm"
                        disabled={!canEditResults}
                        className="h-8 gap-1.5 text-xs border-slate-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      {isAdminOrSuperAdmin && (
                        <Button
                          onClick={() => handleToggleAllResultsForStudent(studentId, !allReleased)}
                          variant="outline"
                          size="sm"
                          className={`h-8 gap-1.5 text-xs ${
                            allReleased
                              ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              : "border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {allReleased
                            ? <><Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Released</span></>
                            : <><EyeOff className="w-3.5 h-3.5" /><span className="hidden sm:inline">Release</span></>
                          }
                        </Button>
                      )}
                      {isAdminOrSuperAdmin && (
                        <Button
                          onClick={() => generateStudentReportCard(studentId)}
                          size="sm"
                          className="h-8 gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Report</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  <AccordionContent className="px-5 pb-5 pt-0">
                    <div className="border-t border-slate-100 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {results.map((result) => {
                          const sc = getScoreColor(result.total_score || 0);
                          return (
                            <div
                              key={result.id}
                              className={`rounded-xl border px-3 py-2.5 overflow-hidden ${result.results_released ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/60"}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{result.subject_name}</p>
                                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                  {isAdminOrSuperAdmin && (
                                    <button
                                      onClick={() => handleToggleResultRelease(result)}
                                      disabled={workflow.status === "locked"}
                                      title={result.results_released ? "Hide from student" : "Release to student"}
                                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                        result.results_released ? "text-emerald-600 hover:text-emerald-700" : "text-slate-300 hover:text-slate-500"
                                      }`}
                                    >
                                      {result.results_released ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${getGradeBadgeColor(result.grade)}`}>
                                    {result.grade}
                                  </span>
                                </div>
                              </div>

                              {/* Score bar */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${sc.bar} rounded-full`}
                                    style={{ width: `${Math.min(Math.ceil(result.total_score || 0), 100)}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold ${sc.text}`}>{Math.ceil(result.total_score || 0)}</span>
                              </div>

                              {/* Score breakdown */}
                              <div className="space-y-1 text-xs text-slate-600">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">CA</span>
                                  <span className="font-medium">{Math.ceil(result.continuous_assessment || 0)}<span className="text-slate-400">/30</span></span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Exam</span>
                                  <span className="font-medium">{Math.ceil(result.exam_score || 0)}<span className="text-slate-400">/70</span></span>
                                </div>
                                {result.lt_cum > 0 && (
                                  <>
                                    <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                                      <span className="text-slate-400">L.T. Cum</span>
                                      <span className="font-medium">{Math.ceil(result.lt_cum)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Cum. Avg</span>
                                      <span className="font-semibold text-slate-700">{Math.ceil(result.cumulative_average)}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              {result.remarks && (
                                <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100 italic">{result.remarks}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        </> /* end activeTab === "results" */}

      </div>
    </PageShell>
  );
}
