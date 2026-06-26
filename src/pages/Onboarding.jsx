import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { supabase } from "@/api/supabaseClient";
import { ClassAssignment, Teacher, Subject } from "@/entities/all";
import { updateMe } from "@/api/auth";
import { Student } from "@/entities/Student";
import { ClassFee } from "@/entities/ClassFee";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, GraduationCap, BookOpen, UserCog, ChevronLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPageUrl } from "@/utils";

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

const ROLE_OPTIONS = [
  {
    id: "teacher",
    label: "Teacher",
    description: "Claim your assigned subjects and manage your classes",
    icon: BookOpen,
    color: "blue",
  },
  {
    id: "student",
    label: "Student",
    description: "Access your timetable, results and CBT tests",
    icon: GraduationCap,
    color: "emerald",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Assist with school operations and management",
    icon: UserCog,
    color: "purple",
  },
];

// Static Tailwind class maps — dynamic strings (e.g. `hover:border-${color}-500`)
// are not included in the compiled CSS bundle. Use this map instead.
const ROLE_COLOR_CLASSES = {
  blue: {
    button:  "hover:border-blue-500 hover:bg-blue-50",
    iconBg:  "bg-blue-100 group-hover:bg-blue-200",
    iconText: "text-blue-600",
  },
  emerald: {
    button:  "hover:border-emerald-500 hover:bg-emerald-50",
    iconBg:  "bg-emerald-100 group-hover:bg-emerald-200",
    iconText: "text-emerald-600",
  },
  purple: {
    button:  "hover:border-emerald-500 hover:bg-emerald-50",
    iconBg:  "bg-emerald-100 group-hover:bg-emerald-200",
    iconText: "text-emerald-600",
  },
};

export default function Onboarding() {
  const { user: currentUser } = useAuth();
  const [step, setStep] = useState(1);          // 1 = role select, 2 = details
  const [role, setRole] = useState("");
  const [formData, setFormData] = useState({});
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Teacher-specific state ──────────────────────────────────────────────────
  const [allSubjects, setAllSubjects] = useState([]);
  const [classAssignments, setClassAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherStep, setTeacherStep] = useState("subject"); // "subject" | "claim"
  const [matchingTeachers, setMatchingTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [phoneVerification, setPhoneVerification] = useState(""); // digits entered by user
  const [phoneVerified, setPhoneVerified] = useState(false);      // true once verified

  // ── Student-specific state ──────────────────────────────────────────────────
  const [selectedGrade, setSelectedGrade] = useState("");
  const [studentStep, setStudentStep] = useState("grade"); // "grade" | "search" | "info"
  const [studentInfo, setStudentInfo] = useState({
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    date_of_birth: "",
    address: "",
    gender: "",
  });
  const [studentMatches, setStudentMatches] = useState([]);
  const [selectedExistingStudent, setSelectedExistingStudent] = useState(null);
  const [searchingStudents, setSearchingStudents] = useState(false);

  // Redirect away if the user already completed onboarding
  useEffect(() => {
    if (currentUser !== null) {
      if (currentUser.school_role) {
        window.location.href = currentUser.school_role === "student"
          ? createPageUrl("StudentDashboard")
          : createPageUrl("Dashboard");
        return;
      }
      setPageLoading(false);
    } else if (currentUser === null) {
      setPageLoading(false);
    }
  }, [currentUser]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getTeacherGrades = (teacherId) =>
    classAssignments
      .filter(a => a.subject_teacher_id === teacherId)
      .map(a => a.grade)
      .join(", ") || "—";

  const handleFormChange = (field, value) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  // ── Role selection ───────────────────────────────────────────────────────────

  const handleRoleSelect = async (selectedRole) => {
    setRole(selectedRole);
    setFormData({});
    setError("");

    if (selectedRole === "teacher") {
      try {
        const [assignments, teacherList, subjectList] = await Promise.all([
          ClassAssignment.list(),
          Teacher.list(),
          Subject.list(),
        ]);
        setClassAssignments(assignments);
        setTeachers(teacherList);
        setAllSubjects(subjectList);
      } catch (e) {
        console.error("Failed to load teacher data", e);
        setError("Failed to load subject data. Please try again.");
      }
      setTeacherStep("subject");
    }

    // Student: reset sub-step
    if (selectedRole === "student") {
      setStudentStep("grade");
      setStudentInfo({ parent_name: "", parent_phone: "", parent_email: "", date_of_birth: "", address: "", gender: "" });
    }

    setStep(2);
  };

  // ── Teacher: subject chosen → find existing teacher records ─────────────────

  const handleSubjectSelected = (subject) => {
    setFormData(prev => ({ ...prev, subject_specialization: subject }));
    setError("");

    // Find teacher IDs from ClassAssignment records for this subject
    const assignedTeacherIds = [
      ...new Set(
        classAssignments
          .filter(a => a.subject === subject && a.subject_teacher_id)
          .map(a => a.subject_teacher_id)
      ),
    ];

    const found = teachers.filter(t => assignedTeacherIds.includes(t.id));

    // Fallback: if no assignments yet, show all teachers so they can still identify
    setMatchingTeachers(found.length > 0 ? found : teachers);
    setSelectedTeacher(null);
    setPhoneVerification("");
    setPhoneVerified(false);
    setTeacherStep("claim");
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      let updateData = { school_role: role };

      if (role === "teacher") {
        if (!selectedTeacher) {
          setError("Please select your teacher record to continue.");
          setSubmitting(false);
          return;
        }
        // Link this auth profile to the EXISTING teacher record — no new record created
        updateData.linked_teacher_id = selectedTeacher.id;

      } else if (role === "student") {
        if (!selectedGrade) {
          setError("Please select your class to continue.");
          setSubmitting(false);
          return;
        }
        if (!studentInfo.parent_name.trim() || !studentInfo.parent_phone.trim()) {
          setError("Parent/guardian name and phone number are required.");
          setSubmitting(false);
          return;
        }

        // Parse first/last name from the account's full_name
        const fullName = (currentUser?.full_name || "").trim();
        const spaceIdx = fullName.indexOf(" ");
        const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
        const lastName  = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : "";

        // Generate a unique TOP/25/XXX registration number
        const existing = await Student.list().catch(() => []);
        const existingNums = new Set(existing.map(s => s.reg_number).filter(Boolean));
        let reg_number;
        do {
          const rand = Math.floor(Math.random() * 900) + 100;
          reg_number = `TOP/25/${rand}`;
        } while (existingNums.has(reg_number));

        // Fetch fee for this grade from the fee schedule
        const feeRecords = await ClassFee.filter({ grade: selectedGrade }).catch(() => []);
        const termly_tuition = feeRecords.length > 0 ? feeRecords[0].termly_tuition : null;

        // Create the student record via SECURITY DEFINER RPC (bypasses RLS).
        // All fields are passed in one call so no separate Student.update() is needed
        // (student's session has no RLS permission to update the students table yet).
        const { data: newStudentId, error: fnError } = await supabase.rpc('create_student_on_signup', {
          p_first_name:     firstName,
          p_last_name:      lastName,
          p_grade:          selectedGrade,
          p_reg_number:     reg_number,
          p_parent_name:    studentInfo.parent_name.trim()  || null,
          p_parent_phone:   studentInfo.parent_phone.trim() || null,
          p_parent_email:   studentInfo.parent_email.trim() || null,
          p_date_of_birth:  studentInfo.date_of_birth       || null,
          p_address:        studentInfo.address.trim()      || null,
          p_termly_tuition: termly_tuition                  ?? null,
          p_gender:         studentInfo.gender              || null,
        });
        if (fnError) throw fnError;
        if (!newStudentId) {
          throw new Error(
            "Your student record could not be created. Please contact the school administrator for assistance."
          );
        }

        // Link this auth profile to the new student record
        updateData.linked_student_id = newStudentId;
        updateData.preview_student_grade = selectedGrade;
      }
      // Admin: just sets the role, no additional linking needed

      await updateMe(updateData);

      // Students are auto-approved — set approval_status immediately so they
      // are never blocked by the PendingApproval screen on subsequent logins.
      // Admin and teacher accounts require super-admin approval before accessing the app.
      if (role === "student") {
        await supabase
          .from("profiles")
          .update({ approval_status: "approved" })
          .eq("id", currentUser.id);
        window.location.href = createPageUrl("StudentDashboard");
      } else {
        // Mark this profile as pending approval
        await supabase
          .from("profiles")
          .update({ approval_status: "pending" })
          .eq("id", currentUser.id);

        // Notify the super admin (non-blocking)
        try {
          await supabase.from("notifications").insert({
            title: `New ${role} account awaiting approval`,
            message: `${currentUser.full_name || currentUser.email} has signed up as ${role} and is waiting for your approval.`,
            type: "account_approval_request",
            target_role: "super_admin",
            link: "/SuperAdminAudit",
            is_read: false,
          });
        } catch {}

        window.location.href = "/PendingApproval";
      }

    } catch (err) {
      console.error("Onboarding submit failed:", err);
      const msg = err?.message || err?.details || err?.hint || JSON.stringify(err);
      setError(`Setup failed: ${msg}`);
      setSubmitting(false);
    }
  };

  // ── Loading screen ───────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Branding */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{BRAND.schoolName}</h1>
          <p className="text-slate-500 text-sm mt-1">Let's set up your account</p>
        </div>

        {/* ── STEP 1: Role selection ─────────────────────────────────── */}
        {step === 1 && (
          <Card className="bg-white/90 backdrop-blur-xl shadow-xl border border-slate-200/60">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-center text-xl">Who are you?</CardTitle>
              <p className="text-slate-500 text-center text-sm mt-1">Select your role to get started</p>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {ROLE_OPTIONS.map(({ id, label, description, icon: Icon, color }) => (
                <button
                  key={id}
                  onClick={() => handleRoleSelect(id)}
                  className={`w-full p-4 text-left border-2 rounded-xl transition-all group ${ROLE_COLOR_CLASSES[color].button}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${ROLE_COLOR_CLASSES[color].iconBg}`}>
                      <Icon className={`w-5 h-5 ${ROLE_COLOR_CLASSES[color].iconText}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{label}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Role details ──────────────────────────────────── */}
        {step === 2 && (
          <Card className="bg-white/90 backdrop-blur-xl shadow-xl border border-slate-200/60">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setStep(1); setRole(""); setError(""); setTeacherStep("subject"); setSelectedGrade(""); setStudentStep("grade"); }}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <CardTitle className="text-xl capitalize">{role} Setup</CardTitle>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {role === "teacher" && teacherStep === "subject" && "Select the subject you teach"}
                    {role === "teacher" && teacherStep === "claim"  && "Identify your teacher record"}
                    {role === "student" && studentStep === "grade"  && "Select your class"}
                    {role === "student" && studentStep === "search" && "Find your student record"}
                    {role === "student" && studentStep === "info"   && "Parent & contact details"}
                    {role === "admin"   && "Complete your profile"}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* ── TEACHER: Subject selection ── */}
              {role === "teacher" && teacherStep === "subject" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 mb-4">
                    Choose the subject you teach. You'll then identify yourself from the teacher records
                    your administrator has already set up.
                  </p>
                  {allSubjects.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                      No subjects have been set up yet. Please contact your administrator.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {[...new Set(allSubjects.map(s => s.subject_name))].sort().map(subject => {
                        const gradeCount = classAssignments.filter(a => a.subject === subject && a.subject_teacher_id).length;
                        return (
                          <button
                            key={subject}
                            onClick={() => handleSubjectSelected(subject)}
                            className="w-full p-3.5 text-left border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
                          >
                            <p className="font-semibold text-slate-900">{subject}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {gradeCount > 0 ? `Assigned to ${gradeCount} class(es)` : "No assignments yet"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── TEACHER: Claim — pick your teacher record ── */}
              {role === "teacher" && teacherStep === "claim" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    Subject: <strong>{formData.subject_specialization}</strong>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Which teacher are you?</Label>
                    <p className="text-xs text-slate-500 mb-3">
                      Select your name from the list below. This links your account to the record
                      your administrator already created — nothing will be changed or overwritten.
                    </p>

                    {matchingTeachers.length === 0 ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                        No teacher records found for this subject. Please contact your administrator
                        to ensure your teacher profile has been created.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {matchingTeachers.map(teacher => {
                          const isSelected = selectedTeacher?.id === teacher.id;
                          const grades = getTeacherGrades(teacher.id);
                          return (
                            <button
                              key={teacher.id}
                              type="button"
                              onClick={() => {
                                setSelectedTeacher(teacher);
                                setPhoneVerification("");
                                setPhoneVerified(false);
                              }}
                              className={`w-full p-3.5 text-left border-2 rounded-xl transition-all ${
                                isSelected
                                  ? "border-blue-600 bg-blue-50"
                                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {teacher.first_name} {teacher.last_name}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Classes: {grades}
                                  </p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Phone verification (shows after a teacher is selected) ── */}
                  {selectedTeacher && (() => {
                    const rawPhone = (selectedTeacher.phone || "").replace(/\D/g, "");
                    const hasPhone = rawPhone.length >= 4;
                    const last4    = rawPhone.slice(-4);
                    const maskedPhone = hasPhone
                      ? (selectedTeacher.phone || "").replace(/.(?=.{4})/g, "•")
                      : null;
                    const verifyOk = !hasPhone || phoneVerified;

                    return (
                      <div className="space-y-3">
                        {hasPhone ? (
                          phoneVerified ? (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                              Identity verified — you are <strong>{selectedTeacher.first_name} {selectedTeacher.last_name}</strong>.
                            </div>
                          ) : (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                              <p className="text-sm font-semibold text-blue-800">Verify your identity</p>
                              <p className="text-xs text-blue-700">
                                The teacher record for <strong>{selectedTeacher.first_name} {selectedTeacher.last_name}</strong> has
                                a registered phone number ending in <strong>••••</strong>. Enter the last 4 digits to confirm this is you.
                              </p>
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={4}
                                  placeholder="Last 4 digits"
                                  value={phoneVerification}
                                  onChange={e => setPhoneVerification(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                  className="w-36 font-mono tracking-widest text-center"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    if (phoneVerification === last4) {
                                      setPhoneVerified(true);
                                      setError("");
                                    } else {
                                      setError("The digits you entered don't match. Please check and try again, or contact your administrator.");
                                    }
                                  }}
                                  disabled={phoneVerification.length !== 4}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  Confirm
                                </Button>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                            ⚠ No phone number is on record for this teacher. You can proceed, but ask your administrator to add one for future security.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setTeacherStep("subject"); setSelectedTeacher(null); setPhoneVerification(""); setPhoneVerified(false); }}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        !selectedTeacher ||
                        submitting ||
                        (selectedTeacher && (selectedTeacher.phone || "").replace(/\D/g, "").length >= 4 && !phoneVerified)
                      }
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {submitting ? "Setting up..." : "Complete Setup"}
                    </Button>
                  </div>
                </form>
              )}

              {/* ── STUDENT: Sub-step A — Grade selection ── */}
              {role === "student" && studentStep === "grade" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Select your current class.</p>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {GRADES.map(grade => (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => setSelectedGrade(grade)}
                        className={`p-3 text-left border-2 rounded-xl transition-all ${
                          selectedGrade === grade
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900 text-sm">{grade}</p>
                          {selectedGrade === grade && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    disabled={!selectedGrade}
                    onClick={async () => {
                      setSearchingStudents(true);
                      try {
                        const fullName = (currentUser?.full_name || "").trim();
                        const spaceIdx = fullName.indexOf(" ");
                        const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
                        const lastName  = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : "";
                        // Search students in the same grade with similar name
                        const results = await Student.filter({ grade: selectedGrade }).catch(() => []);
                        const matches = results.filter(s => {
                          const sName = `${s.first_name} ${s.last_name}`.toLowerCase();
                          return (
                            (firstName && sName.includes(firstName.toLowerCase())) ||
                            (lastName  && sName.includes(lastName.toLowerCase()))
                          );
                        });
                        setStudentMatches(matches);
                        setSelectedExistingStudent(null);
                        setStudentStep("search");
                      } catch {
                        setStudentStep("info");
                      } finally {
                        setSearchingStudents(false);
                      }
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {searchingStudents ? "Searching…" : "Continue →"}
                  </Button>
                </div>
              )}

              {/* ── STUDENT: Sub-step B — Match existing record ── */}
              {role === "student" && studentStep === "search" && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
                    <span>Class: <strong>{selectedGrade}</strong></span>
                    <button type="button" onClick={() => setStudentStep("grade")} className="text-emerald-600 underline text-xs">Change</button>
                  </div>

                  {studentMatches.length > 0 ? (
                    <>
                      <p className="text-sm text-slate-600">We found student record(s) that match your name in <strong>{selectedGrade}</strong>. Select yourself below, or continue to create a new profile.</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {studentMatches.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedExistingStudent(s)}
                            className={`w-full p-3.5 text-left border-2 rounded-xl transition-all ${
                              selectedExistingStudent?.id === s.id
                                ? "border-emerald-600 bg-emerald-50"
                                : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{s.first_name} {s.last_name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{s.grade} · Reg: {s.reg_number || "—"}</p>
                              </div>
                              {selectedExistingStudent?.id === s.id && (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedExistingStudent && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                          ✓ You are linking to the record of <strong>{selectedExistingStudent.first_name} {selectedExistingStudent.last_name}</strong>.
                        </div>
                      )}

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setStudentStep("grade")}
                        >
                          Back
                        </Button>
                        {selectedExistingStudent ? (
                          <Button
                            type="button"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={submitting}
                            onClick={async () => {
                              setSubmitting(true);
                              setError("");
                              try {
                                await updateMe({
                                  school_role: "student",
                                  linked_student_id: selectedExistingStudent.id,
                                  preview_student_grade: selectedExistingStudent.grade,
                                  approval_status: "approved",
                                });
                                window.location.href = createPageUrl("StudentDashboard");
                              } catch (err) {
                                setError(err.message || "Failed to link profile.");
                                setSubmitting(false);
                              }
                            }}
                          >
                            {submitting ? "Linking…" : "This is me →"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 border-slate-300 text-slate-600"
                            onClick={() => { setSelectedExistingStudent(null); setStudentStep("info"); }}
                          >
                            Not me — Create new →
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600">No existing student records matched your name in <strong>{selectedGrade}</strong>. Please fill in your details to create a new profile.</p>
                      <div className="flex gap-3">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setStudentStep("grade")}>Back</Button>
                        <Button type="button" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setStudentStep("info")}>Continue →</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── STUDENT: Sub-step C — Parent & contact info ── */}
              {role === "student" && studentStep === "info" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
                    <span>Class: <strong>{selectedGrade}</strong></span>
                    <button type="button" onClick={() => setStudentStep("grade")} className="text-emerald-600 underline text-xs">Change</button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Parent / Guardian Details</p>

                    <div className="space-y-1.5">
                      <Label htmlFor="parent_name">Parent / Guardian Name *</Label>
                      <Input
                        id="parent_name"
                        placeholder="e.g. Mrs. Adebayo Funke"
                        value={studentInfo.parent_name}
                        onChange={e => setStudentInfo(prev => ({ ...prev, parent_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="parent_phone">Parent Phone Number *</Label>
                      <Input
                        id="parent_phone"
                        type="tel"
                        placeholder="e.g. 08012345678"
                        value={studentInfo.parent_phone}
                        onChange={e => setStudentInfo(prev => ({ ...prev, parent_phone: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="parent_email">Parent Email <span className="text-slate-400 font-normal">(optional)</span></Label>
                      <Input
                        id="parent_email"
                        type="email"
                        placeholder="e.g. parent@gmail.com"
                        value={studentInfo.parent_email}
                        onChange={e => setStudentInfo(prev => ({ ...prev, parent_email: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Student Details</p>

                    <div className="flex gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <Label htmlFor="dob">Date of Birth <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                          id="dob"
                          type="date"
                          value={studentInfo.date_of_birth}
                          onChange={e => setStudentInfo(prev => ({ ...prev, date_of_birth: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5 w-32 flex-shrink-0">
                        <Label>Gender <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Select value={studentInfo.gender} onValueChange={val => setStudentInfo(prev => ({ ...prev, gender: val }))}>
                          <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="address">Home Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                      <Input
                        id="address"
                        placeholder="e.g. No. 5 Adeola Street, Lagos"
                        value={studentInfo.address}
                        onChange={e => setStudentInfo(prev => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setStudentStep("grade")}>
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={!studentInfo.parent_name.trim() || !studentInfo.parent_phone.trim() || submitting}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {submitting ? "Setting up..." : "Complete Setup"}
                    </Button>
                  </div>
                </form>
              )}

              {/* ── ADMIN form ── */}
              {role === "admin" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                    Admin accounts have access to school management features. The super-administrator
                    can adjust your permissions after setup.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department / Area of Responsibility</Label>
                    <Input
                      id="department"
                      placeholder="e.g., Academic Affairs, Finance, Administration"
                      value={formData.department || ""}
                      onChange={e => handleFormChange("department", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminphone">Phone Number</Label>
                    <Input
                      id="adminphone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={formData.phone || ""}
                      onChange={e => handleFormChange("phone", e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 mt-2">
                    {submitting ? "Setting up..." : "Complete Setup"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
