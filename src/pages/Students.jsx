import React, { useState, useEffect, useCallback } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { BRAND } from "@/config/brand";
import { useLocation } from "react-router-dom";
import { Student } from "@/entities/Student";
import { ClassAssignment } from "@/entities/ClassAssignment"; // New import
import { Teacher } from "@/entities/Teacher"; // New import
import { ClassFee } from "@/entities/ClassFee";
import { updateMe } from "@/api/auth";
import { useAuth } from "@/lib/AuthContext";
import { useTeacherAccess } from "@/lib/useTeacherAccess";
import { createApprovalRequest } from "@/lib/approvalRequests";
import { logChange } from "@/lib/changeHistory";
import { canManageStudents, isSuperAdmin } from "@/lib/permissions";
import { applyStudentFeeGroups, loadStudentFeeGroups, loadStudentStartTerms, saveStudentFeeGroup, saveStudentStartTerm } from "@/lib/paymentBalances";
import { getEffectiveClassFee } from "@/lib/classFeeUtils";
import { submitNewStudentEnrollment } from "@/lib/studentEnrollment";
import { formatDateInLagos } from "@/lib/timezone";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, UserPlus, Upload, MessageSquare, Mail, Printer, Archive, RotateCcw, Clock, BookOpen, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { PageHeader, PageSection, PageShell } from "@/components/ui/page-shell";
import SaveToVaultButton from "@/components/ui/SaveToVaultButton";

import StudentCard from "../components/students/StudentCard";
import StudentForm from "../components/students/StudentForm";
import StudentProfileDrawer from "../components/students/StudentProfileDrawer";
import StudentFilters from "../components/students/StudentFilters";
import BulkImportForm from "../components/students/BulkImportForm";
import SmsForm from "../components/communication/SmsForm";
import EmailForm from "../components/communication/EmailForm";

function StatChip({ value, label, color }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {value} {label}
    </span>
  );
}

function OverviewCard({ icon: Icon, label, value, hint, tone = "slate" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    violet: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
    slate: "border-slate-100 bg-slate-50 text-slate-600",
  };

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${tones[tone] || tones.slate}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [showSmsForm, setShowSmsForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = usePersistentState("students_search", "");
  const [filters, setFilters] = usePersistentState("students_filters", {
    grade: "all",
  });
  const [activeTab, setActiveTab] = useState("students"); // "students" | "archive"
  const [archiveModal, setArchiveModal] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [reinstateModal, setReinstateModal] = useState(null);
  const [reinstateGrade, setReinstateGrade] = useState("");
  const [reinstateNote, setReinstateNote] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  const [isReinstating, setIsReinstating] = useState(false);
  const [profileDrawerStudent, setProfileDrawerStudent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const [assignments, setAssignments] = useState([]); // New state
  const [teachers, setTeachers] = useState([]); // New state
  const [classFees, setClassFees] = useState({}); // grade -> full ClassFee record
  const { toast } = useToast();
  const { isTeacher, teacherClasses } = useTeacherAccess();
  const canEditStudents = canManageStudents(currentUser);
  const isSuperAdminUser = isSuperAdmin(currentUser);
  const location = useLocation();
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();

  // loadData now handles loading students, assignments, teachers, and class fees concurrently
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [studentsData, assignmentsData, teachersData, feeData, startTermRecords, feeGroupRecords] = await Promise.all([
        Student.list("-created_date"),
        ClassAssignment.list(),
        Teacher.list(),
        ClassFee.list().catch((e) => { console.warn("ClassFee.list() failed:", e); return []; }),
        loadStudentStartTerms().catch(() => ({})),
        loadStudentFeeGroups().catch(() => ({})),
      ]);
      const studentsWithFeeGroups = applyStudentFeeGroups(studentsData || [], feeGroupRecords);
      const studentsWithStartTerms = studentsWithFeeGroups.map((student) => ({
        ...student,
        ...(startTermRecords?.[student.id] && (!student.start_term || !student.start_academic_year)
          ? {
              start_term: startTermRecords[student.id].term,
              start_academic_year: startTermRecords[student.id].academic_year,
            }
          : {}),
      }));
      setStudents(studentsWithStartTerms);
      setAssignments(assignmentsData);
      setTeachers(teachersData);
      // Build grade -> ClassFee record lookup using current term/year via getEffectiveClassFee
      // so the fee matches exactly what is set in the class schedule for the active term.
      const grades = [...new Set(feeData.map(r => r.grade).filter(Boolean))];
      const feeLookup = {};
      for (const grade of grades) {
        const effective = getEffectiveClassFee(feeData, {
          grade,
          term: schoolTerm,
          academicYear: schoolYear,
        });
        if (effective) feeLookup[grade] = effective;
      }
      setClassFees(feeLookup);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []); // Runs once on mount to load all necessary data

  // filterStudents depends on 'students', 'searchTerm', and 'filters'.
  // Wrapping it in useCallback prevents it from being recreated on every render
  // unless its dependencies (students, searchTerm, filters) change.
  const filterStudents = useCallback(() => {
    let filtered = students;

    // Teachers can only see students in their assigned classes
    if (isTeacher && teacherClasses.length > 0) {
      filtered = filtered.filter(student => teacherClasses.includes(student.grade));
    }

    // Tab controls which enrollment statuses are shown
    if (activeTab === "students") {
      filtered = filtered.filter(student => student.enrollment_status === "active");
    } else {
      filtered = filtered.filter(student =>
        student.enrollment_status === "inactive" || student.enrollment_status === "graduated" || student.enrollment_status === "transferred"
      );
    }

    if (searchTerm) {
      filtered = filtered.filter(student =>
        `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.parent_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.reg_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filters.grade !== "all") {
      filtered = filtered.filter(student => student.grade === filters.grade);
    }

    setFilteredStudents(filtered);
  }, [students, searchTerm, filters, activeTab, isTeacher, teacherClasses]);

  // This useEffect now depends only on the memoized filterStudents function.
  // It will re-run only when filterStudents itself changes (which happens when its internal dependencies change).
  useEffect(() => {
    filterStudents();
  }, [filterStudents]);

  useEffect(() => {
    if (!canEditStudents) return;
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "add") {
      closeAllForms();
      setShowForm(true);
      setEditingStudent(null);
    }
  }, [location.search, canEditStudents]);

  const handleSubmit = async (studentData) => {
    try {
      if (editingStudent && !isSuperAdminUser) {
        await createApprovalRequest({
          entityType: "student",
          entityLabel: `${studentData.first_name} ${studentData.last_name}`.trim() || "student record",
          operation: "update",
          currentData: editingStudent,
          proposedData: { ...editingStudent, ...studentData },
          requestedBy: currentUser?.id,
          requestedByRole: currentUser?.school_role,
          requestedByName: currentUser?.full_name || currentUser?.email,
          recordId: editingStudent.id,
          summary: `Student update requested for ${studentData.first_name} ${studentData.last_name}.`,
        });
        toast({ title: "Pending superadmin approval", description: "Student update was sent for approval before it takes effect." });
      } else if (editingStudent) {
        const updatedStudent = await Student.update(editingStudent.id, studentData);
        await saveStudentFeeGroup(
          editingStudent.id,
          studentData.fee_group,
          {
            performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
            summary: `${studentData.first_name} ${studentData.last_name} fee group updated.`,
          }
        );
        await saveStudentStartTerm(
          editingStudent.id,
          studentData.start_term,
          studentData.start_academic_year,
          {
            performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
            summary: `${studentData.first_name} ${studentData.last_name} start term record updated.`,
          }
        );
        await logChange({
          action: "student_updated",
          entityType: "student",
          entityId: editingStudent.id,
          performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
          summary: `${studentData.first_name} ${studentData.last_name} was updated.`,
          before: editingStudent,
          after: { ...editingStudent, ...studentData },
        });
        toast({ title: "Student updated", description: `${studentData.first_name} ${studentData.last_name} has been updated.` });
        setStudents((prev) =>
          prev.map((student) =>
            student.id === editingStudent.id
              ? {
                  ...student,
                  ...updatedStudent,
                  ...studentData,
                  fee_group: studentData.fee_group || "standard",
                  start_term: studentData.start_term,
                  start_academic_year: studentData.start_academic_year,
                }
              : student
          )
        );
      } else {
        const result = await submitNewStudentEnrollment({
          studentData,
          currentUser,
          isSuperAdminUser,
          classFees: Object.values(classFees),
          term: schoolTerm,
          academicYear: schoolYear,
        });
        if (result.status === "pending_approval") {
          toast({ title: "Pending superadmin approval", description: `Enrollment for ${studentData.first_name} ${studentData.last_name} was sent for approval.` });
        } else {
          toast({ title: "Student added", description: `${studentData.first_name} ${studentData.last_name} enrolled. Reg: ${result.regNumber}` });
        }
      }
      setShowForm(false);
      setEditingStudent(null);
      if (!editingStudent) {
        loadData(); // Reload all data to reflect newly created records
      }
    } catch (error) {
      console.error("Error saving student:", error);
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setShowForm(true);
  };

  const handleDelete = async (student) => {
    try {
      if (!isSuperAdminUser) {
        await createApprovalRequest({
          entityType: "student",
          entityLabel: `${student.first_name} ${student.last_name}`.trim() || "student record",
          operation: "delete",
          currentData: student,
          proposedData: null,
          requestedBy: currentUser?.id,
          requestedByRole: currentUser?.school_role,
          requestedByName: currentUser?.full_name || currentUser?.email,
          recordId: student.id,
          summary: `Student deletion requested for ${student.first_name} ${student.last_name}.`,
        });
        toast({ title: "Pending superadmin approval", description: `${student.first_name} ${student.last_name} was sent for deletion approval.` });
      } else {
        await Student.delete(student.id);
        await logChange({
          action: "student_deleted",
          entityType: "student",
          entityId: student.id,
          performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
          summary: `${student.first_name} ${student.last_name} was removed.`,
          before: student,
          after: null,
        });
        toast({ title: "Student removed", description: `${student.first_name} ${student.last_name} has been removed.` });
        loadData(); // Refresh all data after deletion
      }
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({ title: "Delete failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const closeAllForms = () => {
    setShowForm(false);
    setShowImportForm(false);
    setShowSmsForm(false);
    setShowEmailForm(false);
    setEditingStudent(null);
  };

  const handlePreviewAsStudent = async (student) => {
    sessionStorage.setItem('previewRole', 'student');
    await updateMe({
      preview_student_id: student.id,
      preview_student_name: `${student.first_name} ${student.last_name}`,
      preview_student_grade: student.grade
    });
    window.location.href = "/StudentDashboard";
  };

  const handleArchiveConfirm = async () => {
    if (!archiveModal) return;
    setIsArchiving(true);
    try {
      const now = new Date().toISOString();
      await Student.update(archiveModal.id, {
        enrollment_status: "inactive",
        archived_at: now,
        archive_reason: archiveReason.trim() || null,
      });
      await logChange({
        action: "student_archived",
        entityType: "student",
        entityId: archiveModal.id,
        performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
        summary: `${archiveModal.first_name} ${archiveModal.last_name} was archived. Reason: ${archiveReason || "none"}`,
        before: archiveModal,
        after: { ...archiveModal, enrollment_status: "inactive", archived_at: now, archive_reason: archiveReason.trim() || null },
      });
      toast({ title: "Student archived", description: `${archiveModal.first_name} ${archiveModal.last_name} has been moved to the archive.` });
      setStudents(prev => prev.map(s =>
        s.id === archiveModal.id
          ? { ...s, enrollment_status: "inactive", archived_at: now, archive_reason: archiveReason.trim() || null }
          : s
      ));
      setArchiveModal(null);
      setArchiveReason("");
    } catch (error) {
      console.error("Archive error:", error);
      toast({ title: "Archive failed", description: error?.message, variant: "destructive" });
    }
    setIsArchiving(false);
  };

  const handleReinstateConfirm = async () => {
    if (!reinstateModal) return;
    setIsReinstating(true);
    try {
      const now = new Date().toISOString();
      const targetGrade = reinstateGrade || reinstateModal.grade;
      await Student.update(reinstateModal.id, {
        enrollment_status: "active",
        grade: targetGrade,
        reinstated_at: now,
        reinstatement_note: reinstateNote.trim() || null,
        archived_at: null,
        archive_reason: null,
      });
      await logChange({
        action: "student_reinstated",
        entityType: "student",
        entityId: reinstateModal.id,
        performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
        summary: `${reinstateModal.first_name} ${reinstateModal.last_name} was reinstated to ${targetGrade}.`,
        before: reinstateModal,
        after: { ...reinstateModal, enrollment_status: "active", grade: targetGrade, reinstated_at: now },
      });
      toast({ title: "Student reinstated", description: `${reinstateModal.first_name} ${reinstateModal.last_name} has been reinstated to ${targetGrade}.` });
      loadData();
      setReinstateModal(null);
      setReinstateGrade("");
      setReinstateNote("");
    } catch (error) {
      console.error("Reinstate error:", error);
      toast({ title: "Reinstate failed", description: error?.message, variant: "destructive" });
    }
    setIsReinstating(false);
  };

  const activeCount      = students.filter(s => s.enrollment_status === "active").length;
  const inactiveCount    = students.filter(s => s.enrollment_status === "inactive").length;
  const graduatedCount    = students.filter(s => s.enrollment_status === "graduated").length;
  const transferredCount  = students.filter(s => s.enrollment_status === "transferred").length;
  const archiveCount      = inactiveCount + graduatedCount + transferredCount;
  const classCount       = new Set(students.map((student) => student.grade).filter(Boolean)).size;
  const recentCount      = students.filter((student) => {
    const sourceDate = student.enrollment_date || student.created_date;
    if (!sourceDate) return false;
    return Date.now() - new Date(sourceDate).getTime() <= 1000 * 60 * 60 * 24 * 30;
  }).length;

  const handlePrintStudents = () => {
    // Sort all students by class then alphabetically by last name
    const sorted = [...students].sort((a, b) => {
      const gradeCompare = (a.grade || "").localeCompare(b.grade || "", undefined, { numeric: true });
      if (gradeCompare !== 0) return gradeCompare;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });

    // Group by class
    const grouped = {};
    sorted.forEach(s => {
      const g = s.grade || "Unassigned";
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(s);
    });

    const classBlocks = Object.entries(grouped).map(([grade, list]) => {
      const rows = list.map((s, i) => {
        const statusColor = s.enrollment_status === "active" ? "#16a34a"
          : s.enrollment_status === "graduated" ? "#1d4ed8" : "#6b7280";
        return `<tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${s.last_name || ""} ${s.first_name || ""}</td>
          <td style="text-align:center">${s.reg_number || "-"}</td>
          <td style="text-align:center">${s.gender || "-"}</td>
          <td style="text-align:center;color:${statusColor};font-weight:600;text-transform:capitalize">
            ${s.enrollment_status || "-"}
          </td>
        </tr>`;
      }).join("");

      return `
        <div class="class-block">
          <div class="class-header">${grade} &nbsp;<span style="font-weight:normal;font-size:11px;">(${list.length} student${list.length !== 1 ? "s" : ""})</span></div>
          <table>
            <thead>
              <tr>
                <th style="width:5%;text-align:center">S/N</th>
                <th style="width:45%">Student Name</th>
                <th style="width:20%;text-align:center">Reg. Number</th>
                <th style="width:15%;text-align:center">Gender</th>
                <th style="width:15%;text-align:center">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Student Records - ${BRAND.schoolName}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px 32px; }
        .school-header { text-align: center; border-bottom: 2px solid #4c1d95; padding-bottom: 12px; margin-bottom: 20px; }
        .school-header h1 { font-size: 16px; font-weight: bold; color: #4c1d95; text-transform: uppercase; letter-spacing: 1px; }
        .school-header p { font-size: 11px; color: #64748b; margin-top: 3px; }
        .summary { font-size: 11px; color: #64748b; margin-bottom: 16px; }
        .class-block { margin-bottom: 24px; page-break-inside: avoid; }
        .class-header { background: #ede9fe; color: #4c1d95; font-weight: bold; font-size: 12px;
          text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 10px;
          border-left: 4px solid #7c3aed; margin-bottom: 0; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f1f5f9; }
        th { padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.4px; color: #475569; border-bottom: 1px solid #cbd5e1; }
        td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; }
        tr:last-child td { border-bottom: none; }
        tr:nth-child(even) td { background: #fafafa; }
        .print-btn { position:fixed; top:16px; right:16px; background:#4c1d95; color:white; border:none;
          border-radius:8px; padding:10px 20px; font-size:13px; cursor:pointer; z-index:999; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .print-btn { display: none !important; }
          .class-block { page-break-inside: avoid; }
        }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
      <div class="school-header">
        <h1>${BRAND.schoolName}</h1>
        <p>Student Records &mdash; Generated ${formatDateInLagos(new Date(), { day: "2-digit", month: "long", year: "numeric" }, "en-GB")}</p>
      </div>
      <div class="summary">
        Total: <strong>${students.length}</strong> students &nbsp;|&nbsp;
        Active: <strong>${activeCount}</strong> &nbsp;|&nbsp;
        Classes: <strong>${Object.keys(grouped).length}</strong>
      </div>
      ${classBlocks}
    </body></html>`;

    const win = window.open("", "_blank", "width=900,height=800");
    if (!win) { alert("Pop-up blocked! Please allow pop-ups."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <PageShell maxWidth="7xl">
      <Toaster />
      <PageSection>

        <PageHeader
          eyebrow="Student Records"
          title="Students"
          description="Manage enrollment, parent contact details, communication, and class records from one place."
          actions={
            <>
              <SaveToVaultButton module="students" term={schoolTerm} year={schoolYear} />
              {canEditStudents && (
                <Button variant="outline" size="sm" onClick={() => { closeAllForms(); setShowImportForm(true); }}>
                  <Upload className="w-4 h-4 mr-1.5" /> Import
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handlePrintStudents}>
                <Printer className="w-4 h-4 mr-1.5" /> Print List
              </Button>
              <Button variant="outline" size="sm" onClick={() => { closeAllForms(); setShowSmsForm(true); }}>
                <MessageSquare className="w-4 h-4 mr-1.5" /> SMS
              </Button>
              <Button variant="outline" size="sm" onClick={() => { closeAllForms(); setShowEmailForm(true); }}>
                <Mail className="w-4 h-4 mr-1.5" /> Email
              </Button>
              {canEditStudents && (
                <Button size="sm" onClick={() => { closeAllForms(); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
                  <UserPlus className="w-4 h-4 mr-1.5" /> Add Student
                </Button>
              )}
            </>
          }
        />

        {/* Stat chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <StatChip value={activeCount} label="Active" color="bg-emerald-100 text-emerald-700" />
          {archiveCount > 0 && <StatChip value={archiveCount} label="Archived" color="bg-slate-100 text-slate-500" />}
          <StatChip value={classCount} label="Classes" color="bg-emerald-100 text-emerald-700" />
        </div>

        <AnimatePresence>
          {showForm && (
            <StudentForm student={editingStudent} onSubmit={handleSubmit} onCancel={closeAllForms} classFees={classFees} />
          )}
          {showImportForm && (
            <BulkImportForm
              onCancel={closeAllForms}
              onImportSuccess={loadData}
              currentUser={currentUser}
              isSuperAdminUser={isSuperAdminUser}
              classFees={Object.values(classFees)}
              term={currentUser?.current_term}
              academicYear={currentUser?.current_academic_year}
            />
          )}
          {showSmsForm    && <SmsForm  onCancel={closeAllForms} />}
          {showEmailForm  && <EmailForm onCancel={closeAllForms} />}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("students")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "students"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Active Students
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === "students" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("archive")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "archive"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Archive
            {archiveCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === "archive" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
                {archiveCount}
              </span>
            )}
          </button>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by student or parent name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <StudentFilters filters={filters} onFilterChange={setFilters} gradeOnly />
        </div>

        {/* Active Students Grid */}
        {activeTab === "students" && (
          isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-100 rounded-2xl h-56" />
              ))}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
              <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">No active students found</p>
              <p className="text-sm text-slate-400 mt-1">
                {students.length === 0 ? "Add your first student to get started" : "Try adjusting your search or class filter"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredStudents.map((student) => {
                  const assignment = assignments.find(a => a.grade === student.grade);
                  const teacher    = assignment ? teachers.find(t => t.id === assignment.teacher_id) : null;
                  return (
                    <StudentCard
                      key={student.id}
                      student={student}
                      teacher={teacher}
                      classFee={classFees[student.grade]}
                      showFees={!isTeacher}
                      onEdit={canEditStudents ? handleEdit : null}
                      onDelete={canEditStudents ? handleDelete : null}
                      onPreview={isSuperAdminUser ? handlePreviewAsStudent : null}
                      onArchive={canEditStudents ? (s) => { setArchiveModal(s); setArchiveReason(""); } : null}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          )
        )}

        {/* Archive Tab */}
        {activeTab === "archive" && (
          isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-100 rounded-2xl h-48" />
              ))}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
              <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">Archive is empty</p>
              <p className="text-sm text-slate-400 mt-1">Inactive, graduated, and transferred students will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredStudents.map((student) => (
                  <ArchiveCard
                    key={student.id}
                    student={student}
                    onReinstate={(student.enrollment_status === "inactive" || student.enrollment_status === "graduated" || student.enrollment_status === "transferred") && canEditStudents
                      ? () => { setReinstateModal(student); setReinstateGrade(student.grade || ""); setReinstateNote(""); }
                      : null}
                    onEdit={() => setProfileDrawerStudent(student)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )
        )}

        {/* Archive Confirm Modal */}
        {archiveModal && (
          <Dialog open onOpenChange={() => { setArchiveModal(null); setArchiveReason(""); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-amber-600" />
                  Archive Student
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <p className="text-sm text-slate-600">
                  Move <strong>{archiveModal.first_name} {archiveModal.last_name}</strong> to the archive?
                  Their records will be preserved but they will no longer appear in the active students list.
                </p>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Reason (optional)
                  </label>
                  <Textarea
                    placeholder="e.g. Withdrew from school, relocated..."
                    value={archiveReason}
                    onChange={e => setArchiveReason(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { setArchiveModal(null); setArchiveReason(""); }} disabled={isArchiving}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleArchiveConfirm}
                  disabled={isArchiving}
                >
                  {isArchiving ? "Archiving..." : "Archive Student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Reinstate Modal */}
        {reinstateModal && (
          <Dialog open onOpenChange={() => { setReinstateModal(null); setReinstateGrade(""); setReinstateNote(""); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-emerald-600" />
                  Reinstate Student
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <p className="text-sm text-slate-600">
                  Reinstate <strong>{reinstateModal.first_name} {reinstateModal.last_name}</strong> as an active student.
                </p>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Assign to Class
                  </label>
                  <Select value={reinstateGrade} onValueChange={setReinstateGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class..." />
                    </SelectTrigger>
                    <SelectContent>
                      {["KG 1","KG 2","Nursery 1","Nursery 2","Primary 1","Primary 2","Primary 3","Primary 4","JSS 1","JSS 2","JSS 3","SSS 1","SSS 2","SSS 3"].map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!reinstateGrade && reinstateModal.grade && (
                    <p className="text-xs text-slate-400 mt-1">Defaults to previous class: {reinstateModal.grade}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Note (optional)
                  </label>
                  <Textarea
                    placeholder="e.g. Returned from relocation, re-enrolled for new term..."
                    value={reinstateNote}
                    onChange={e => setReinstateNote(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { setReinstateModal(null); setReinstateGrade(""); setReinstateNote(""); }} disabled={isReinstating}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleReinstateConfirm}
                  disabled={isReinstating}
                >
                  {isReinstating ? "Reinstating..." : "Reinstate Student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Student Profile Drawer (archive view) */}
        {profileDrawerStudent && (
          <StudentProfileDrawer
            student={profileDrawerStudent}
            onClose={() => setProfileDrawerStudent(null)}
            onEdit={canEditStudents ? (s) => { setProfileDrawerStudent(null); handleEdit(s); } : null}
          />
        )}

      </PageSection>
    </PageShell>
  );
}

// Archive Card component
const ARCHIVE_AVATAR_COLORS = [
  "from-slate-400 to-slate-500",
  "from-zinc-400 to-zinc-500",
  "from-stone-400 to-stone-500",
];

function ArchiveCard({ student, onReinstate, onEdit }) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const initials = `${student.first_name?.[0] || ""}${student.last_name?.[0] || ""}`;
  const colorIdx = ((student.first_name?.charCodeAt(0) || 0) + (student.last_name?.charCodeAt(0) || 0)) % ARCHIVE_AVATAR_COLORS.length;
  const color = ARCHIVE_AVATAR_COLORS[colorIdx];
  const statusStyle = student.enrollment_status === "graduated"
    ? "bg-blue-100 text-blue-700 border-blue-200"
    : student.enrollment_status === "transferred"
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="h-full"
    >
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">
        <div className="px-5 pt-5 pb-4 flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <span className="text-white text-sm font-bold tracking-wide">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-700 text-base leading-tight truncate">{fullName}</h3>
            <p className="text-slate-400 text-xs mt-0.5">{student.grade || "–"}</p>
            {student.reg_number && (
              <p className="text-xs mt-0.5 font-semibold text-slate-400 tracking-wide">{student.reg_number}</p>
            )}
          </div>
          <span className={`border text-xs font-medium capitalize px-2 py-0.5 rounded-full flex-shrink-0 ${statusStyle}`}>
            {student.enrollment_status}
          </span>
        </div>

        <div className="px-5 pb-4 space-y-1.5 flex-1">
          {student.archived_at && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Archived {formatDateInLagos(new Date(student.archived_at), { day: "2-digit", month: "short", year: "numeric" }, "en-GB")}</span>
            </div>
          )}
          {student.archive_reason && (
            <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
              {student.archive_reason}
            </p>
          )}
          {student.reinstated_at && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <RotateCcw className="w-3 h-3 flex-shrink-0" />
              <span>Previously reinstated</span>
            </div>
          )}
          {student.parent_name && (
            <p className="text-xs text-slate-400 truncate">Parent: {student.parent_name}</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2">
          {onEdit && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(student)}
              className="flex-1 text-xs text-slate-500 hover:text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5 mr-1.5" /> View / Edit
            </Button>
          )}
          {onReinstate && (
            <Button size="sm" variant="ghost" onClick={onReinstate}
              className="flex-1 text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reinstate
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
