import React, { useState, useEffect } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { supabase } from "@/api/supabaseClient";
import { updateMe } from "@/api/auth";
import { useAuth } from "@/lib/AuthContext";
import { Student } from "@/entities/Student";
import { AcademicRecord } from "@/entities/AcademicRecord";
import { ExamResult } from "@/entities/ExamResult";
import { Subject } from "@/entities/Subject";
import { User, Payment, TimetableSlot } from "@/entities/all";
import { ClassFee } from "@/entities/ClassFee";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, GraduationCap, Trash2, Shield, UserPlus, Mail, BookOpen, Link2, Calendar, CalendarDays, ArrowRight, Building2, Upload, ImageIcon, Clock3, Palette, Check, HardDrive, Cloud, CloudOff } from "lucide-react";
import { PALETTES, applyTheme, getCurrentTheme } from "@/lib/appTheme";
import SubjectsPage from "./Subjects";
import ClassAssignmentsPage from "./ClassAssignments";
import SchoolCalendarSection from "@/components/settings/SchoolCalendarSection";
import { getExactClassFee } from "@/lib/classFeeUtils";
import { applyStudentFeeGroups, buildStudentBalanceRows, loadPaymentDiscounts, loadStudentFeeGroups, loadStudentStartTerms } from "@/lib/paymentBalances";
import { toast } from "sonner";
import { PageHeader, PageSection, PageShell } from "@/components/ui/page-shell";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { isDriveConnected, restoreDriveConnection, startPermanentDriveConnection, disconnectPermanentDrive } from "@/lib/googleDriveService";
import { getVaultDriveConfig } from "@/lib/vaultConfig";
import { runTermVaultExport } from "@/lib/termVaultExport";

const ROLE_COLORS = {
  super_admin: "bg-emerald-100 text-emerald-800",
  admin:       "bg-blue-100 text-blue-800",
  teacher:     "bg-emerald-100 text-emerald-800",
  student:     "bg-slate-100 text-slate-800",
};

const TERMS = ["First Term", "Second Term", "Third Term"];
const GRADE_PROGRESSION = {
  "KG 1": "KG 2",
  "KG 2": "Nursery 1",
  "Nursery 1": "Nursery 2",
  "Nursery 2": "Primary 1",
  "Primary 1": "Primary 2",
  "Primary 2": "Primary 3",
  "Primary 3": "Primary 4",
  "Primary 4": "JSS 1",   // transition: subjects reset to JSS curriculum
  "JSS 1": "JSS 2",
  "JSS 2": "JSS 3",
  "JSS 3": "SSS 1",        // transition: subjects reset to SSS curriculum
  "SSS 1": "SSS 2",
  "SSS 2": "SSS 3",
  "SSS 3": "SSS 3",        // graduates stay until manually withdrawn
};

// Grades where the subject set changes completely on promotion
const TRANSITION_GRADES = new Set(["Primary 4", "JSS 3"]);

const ALL_GRADES = Object.keys(GRADE_PROGRESSION).filter(
  (g, i, arr) => arr.indexOf(g) === i
);

const GRADE_GROUPS = [
  { label: "Kindergarten", grades: ["KG 1", "KG 2"] },
  { label: "Nursery", grades: ["Nursery 1", "Nursery 2"] },
  { label: "Primary", grades: ["Primary 1", "Primary 2", "Primary 3", "Primary 4"] },
  { label: "Junior Secondary", grades: ["JSS 1", "JSS 2", "JSS 3"] },
  { label: "Senior Secondary", grades: ["SSS 1", "SSS 2", "SSS 3"] },
];

let _tempIdCounter = 0;
const newTempId = () => `tmp_${++_tempIdCounter}_${Date.now()}`;

function sanitizeTimetableSnapshotSlot(slot) {
  if (!slot) return null;
  const cleaned = { ...slot };
  delete cleaned.id;
  delete cleaned.created_at;
  delete cleaned.updated_at;
  delete cleaned.created_date;
  delete cleaned.updated_date;
  return cleaned;
}

export default function Settings() {
  const { user: currentUser } = useAuth();
  const {
    term: schoolTerm, year: schoolYear, smsSenderId: schoolSmsSenderId,
    schoolName: savedSchoolName, schoolAddress: savedSchoolAddress,
    schoolPhone: savedSchoolPhone, schoolEmail: savedSchoolEmail,
    schoolLogoUrl: savedLogoUrl, schoolStampUrl: savedStampUrl,
    principalName: savedPrincipalName,
    alocApiToken: savedAlocApiToken,
    flutterwavePublicKey: savedFlutterwavePublicKey,
    heroImages: savedHeroImages,
    themeColor: savedThemeColor,
    themeCustomHex: savedThemeCustomHex,
    save: saveSchoolSettings,
  } = useSchoolSettings();
  const [currentTerm, setCurrentTerm] = useState("Second Term");
  const [currentYear, setCurrentYear] = useState("2025/2026");
  const [smsSenderId, setSmsSenderId] = useState("");
  const [alocApiToken, setAlocApiToken] = useState("");
  const [flutterwavePublicKey, setFlutterwavePublicKey] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolLogoUrl, setSchoolLogoUrl] = useState("");
  const [schoolStampUrl, setSchoolStampUrl] = useState("");
  const [principalName, setPrincipalName] = useState("");
  const [heroImages, setHeroImages] = useState([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [schoolInfoSaved, setSchoolInfoSaved] = useState(false);
  const [driveClientId, setDriveClientId] = useState("");
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [rolloverProgress, setRolloverProgress] = useState({
    visible: false,
    value: 0,
    label: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [promotionPreview, setPromotionPreview] = useState(null);
  const [showPromotionPreview, setShowPromotionPreview] = useState(false);
  const [promotionWarnings, setPromotionWarnings] = useState([]);
  const [rolloverReadiness, setRolloverReadiness] = useState(null);
  const [rolloverOptions, setRolloverOptions] = useState({
    carryForwardArrears: true,
    carryForwardMode: "keep_existing",
    clearTargetTimetable: true,
    graduateFinalClass: false,
  });
  const [latestRollbackableRollover, setLatestRollbackableRollover] = useState(null);
  const [loadingRollbackInfo, setLoadingRollbackInfo] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [restoreGradesConfirmOpen, setRestoreGradesConfirmOpen] = useState(false);
  const [isRestoringGrades, setIsRestoringGrades] = useState(false);
  // Manual grade demotion (no snapshot)
  const [manualDemoteOpen, setManualDemoteOpen] = useState(false);
  const [manualDemoteFromGrade, setManualDemoteFromGrade] = useState("");
  const [isDemoting, setIsDemoting] = useState(false);
  const [demoteAllConfirmOpen, setDemoteAllConfirmOpen] = useState(false);
  const [isDemotingAll, setIsDemotingAll] = useState(false);
  const [demoteAllResult, setDemoteAllResult] = useState(null);
  // Term/year of the accidentally promoted data to clean up
  const [demoteCleanupTerm, setDemoteCleanupTerm] = useState("");
  const [demoteCleanupYear, setDemoteCleanupYear] = useState("");
  // Restore accidentally graduated SSS 3 students
  const [demoteRestoreGraduated, setDemoteRestoreGraduated] = useState(false);
  // Promote all grades (reverse of demote-all, to fix accidental demotion)
  const [promoteAllConfirmOpen, setPromoteAllConfirmOpen] = useState(false);
  const [isPromotingAll, setIsPromotingAll] = useState(false);
  const [promoteAllResult, setPromoteAllResult] = useState(null);
  const [promoteAllPreview, setPromoteAllPreview] = useState(null);
  const [promoteAllTyped, setPromoteAllTyped] = useState("");
  const [demoteAllTyped, setDemoteAllTyped] = useState("");
  const [demoteAllPreviewRows, setDemoteAllPreviewRows] = useState(null);

  // Manual delete (when no snapshot exists)
  const [manualDeleteOpen, setManualDeleteOpen] = useState(false);
  const [manualDeleteTerm, setManualDeleteTerm] = useState("");
  const [manualDeleteYear, setManualDeleteYear] = useState("");
  const [manualDeletePreview, setManualDeletePreview] = useState(null);
  const [manualDeleteLoading, setManualDeleteLoading] = useState(false);
  const [manualDeleting, setManualDeleting] = useState(false);

  // Quick delete — wipe the NEXT term's rollover records from the scope card
  const [quickDeleteOpen, setQuickDeleteOpen] = useState(false);
  const [quickDeleteCounts, setQuickDeleteCounts] = useState(null);
  const [quickDeleteLoading, setQuickDeleteLoading] = useState(false);
  const [quickDeleting, setQuickDeleting] = useState(false);

  const [activeTab, setActiveTab] = usePersistentState("settings_tab", "general");
  const [generalSection, setGeneralSection] = usePersistentState("settings_general_section", "term");
  const [termCardOpen, setTermCardOpen]           = useState(false);
  const [promotionCardOpen, setPromotionCardOpen] = useState(false);

  // ── Appearance (theme) state ──────────────────────────────────────────────
  const [selectedTheme, setSelectedTheme]   = useState(() => getCurrentTheme().key);
  const [customHex, setCustomHex]           = useState(() => getCurrentTheme().customHex);
  const [themeSaved, setThemeSaved]         = useState(false);

  // Sync from Supabase when settings load (overrides localStorage)
  useEffect(() => {
    if (savedThemeColor) {
      setSelectedTheme(savedThemeColor);
      if (savedThemeCustomHex) setCustomHex(savedThemeCustomHex);
    }
  }, [savedThemeColor, savedThemeCustomHex]);

  const updateRolloverProgress = (value, label) => {
    setRolloverProgress({
      visible: true,
      value: Math.max(0, Math.min(100, Math.round(value))),
      label,
    });
  };


  // ── User Management state ──────────────────────────────────────────────────
  const [umCardOpen, setUmCardOpen]         = useState(false);
  const [umUsers, setUmUsers]               = useState([]);
  const [umLoading, setUmLoading]           = useState(false);
  const [umInviteEmail, setUmInviteEmail]   = useState("");
  const [umInviteRole, setUmInviteRole]     = useState("teacher");
  const [umInviting, setUmInviting]         = useState(false);
  const [umInviteMsg, setUmInviteMsg]       = useState("");
  const [umConfirmDeleteId, setUmConfirmDeleteId] = useState(null);
  const [umDeleting, setUmDeleting]         = useState(false);
  const [umDeleteError, setUmDeleteError]   = useState("");

  const isSuperAdmin = currentUser?.school_role === "super_admin";
  const umRoleOptions = isSuperAdmin ? ["super_admin", "admin", "teacher"] : ["teacher"];


  // Sync local state when shared school settings load
  useEffect(() => { setCurrentTerm(schoolTerm); }, [schoolTerm]);
  useEffect(() => { setCurrentYear(schoolYear); }, [schoolYear]);
  useEffect(() => { setSmsSenderId(schoolSmsSenderId || ""); }, [schoolSmsSenderId]);
  useEffect(() => { setAlocApiToken(savedAlocApiToken || ""); }, [savedAlocApiToken]);
  useEffect(() => { setFlutterwavePublicKey(savedFlutterwavePublicKey || ""); }, [savedFlutterwavePublicKey]);
  useEffect(() => { setSchoolName(savedSchoolName || ""); }, [savedSchoolName]);
  useEffect(() => { setSchoolAddress(savedSchoolAddress || ""); }, [savedSchoolAddress]);
  useEffect(() => { setSchoolPhone(savedSchoolPhone || ""); }, [savedSchoolPhone]);
  useEffect(() => { setSchoolEmail(savedSchoolEmail || ""); }, [savedSchoolEmail]);
  useEffect(() => { setSchoolLogoUrl(savedLogoUrl || ""); }, [savedLogoUrl]);
  useEffect(() => { setSchoolStampUrl(savedStampUrl || ""); }, [savedStampUrl]);
  useEffect(() => { setPrincipalName(savedPrincipalName || ""); }, [savedPrincipalName]);
  useEffect(() => { setHeroImages(savedHeroImages || []); }, [savedHeroImages]);

  useEffect(() => {
    let alive = true;
    async function loadDriveConfig() {
      try {
        const cfg = await getVaultDriveConfig();
        if (!alive) return;
        const savedClientId = cfg?.google_client_id || "";
        setDriveClientId(savedClientId);
        if (savedClientId) {
          const restored = await restoreDriveConnection(savedClientId);
          if (alive) setDriveConnected(restored || isDriveConnected());
        } else {
          setDriveConnected(isDriveConnected());
        }
      } catch {
        if (alive) setDriveConnected(isDriveConnected());
      }
    }
    loadDriveConfig();
    return () => { alive = false; };
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await saveSchoolSettings({ current_term: currentTerm, current_year: currentYear, sms_sender_id: smsSenderId, aloc_api_token: alocApiToken, flutterwave_public_key: flutterwavePublicKey });
      await updateMe({ current_term: currentTerm, current_academic_year: currentYear });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast.error("Settings could not be saved. Please try again.");
      console.error(e);
    }
    setIsSaving(false);
  };

  const handleSaveSchoolInfo = async () => {
    setIsSaving(true);
    try {
      await saveSchoolSettings({ school_name: schoolName, school_address: schoolAddress, school_phone: schoolPhone, school_email: schoolEmail, school_logo_url: schoolLogoUrl, school_stamp_url: schoolStampUrl, principal_name: principalName });
      setSchoolInfoSaved(true);
      setTimeout(() => setSchoolInfoSaved(false), 2000);
    } catch (e) {
      toast.error("School info could not be saved. Please try again.");
      console.error(e);
    }
    setIsSaving(false);
  };

  const handleConnectDrive = async () => {
    const value = driveClientId.trim();
    if (!value) {
      toast.error("Google Drive is not configured yet in Supabase.");
      return;
    }
    setDriveConnecting(true);
    try {
      await startPermanentDriveConnection(value);
    } catch (e) {
      toast.error(e.message || "Could not start Google Drive connection.");
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await disconnectPermanentDrive();
    setDriveConnected(false);
    toast.success("Google Drive disconnected.");
  };

  const handleImageUpload = async (file, type) => {
    if (!file) return;
    const setter = type === "logo" ? setUploadingLogo : setUploadingStamp;
    setter(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `school/${type}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("uploads").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);
      if (type === "logo") setSchoolLogoUrl(urlData.publicUrl);
      else setSchoolStampUrl(urlData.publicUrl);
    } catch (e) {
      toast.error(`Could not upload ${type}. Please try again.`);
      console.error(e);
    }
    setter(false);
  };

  const handleHeroImageUpload = async (file) => {
    if (!file) return;
    if (heroImages.length >= 8) { toast.error("Maximum 8 slideshow images allowed."); return; }
    setUploadingHeroImage(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `school/hero_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("uploads").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);
      const updated = [...heroImages, urlData.publicUrl];
      setHeroImages(updated);
      await saveSchoolSettings({ hero_images: updated });
      toast.success("Image added to slideshow!");
    } catch (e) {
      toast.error("Could not upload image. Please try again.");
      console.error(e);
    }
    setUploadingHeroImage(false);
  };

  const handleRemoveHeroImage = async (index) => {
    const updated = heroImages.filter((_, i) => i !== index);
    setHeroImages(updated);
    await saveSchoolSettings({ hero_images: updated });
    toast.success("Image removed.");
  };

  const nextTerm = currentTerm === "Third Term" ? "First Term" : TERMS[TERMS.indexOf(currentTerm) + 1];
  const nextYear = currentTerm === "Third Term"
    ? `${parseInt(currentYear.split("/")[0]) + 1}/${parseInt(currentYear.split("/")[1]) + 1}`
    : currentYear;

  function getNextTerm(term) {
    const terms = ["First Term", "Second Term", "Third Term"];
    const idx = terms.indexOf(term);
    return idx < 2 ? terms[idx + 1] : "First Term";
  }
function getNextYear(term, year) {
  if (term !== "Third Term") return year;
  const [start, end] = year.split("/").map(Number);
  return `${start + 1}/${end + 1}`;
}

function getPreviousTermAndYear(term, year) {
  if (term === "Second Term") return { term: "First Term", academicYear: year };
  if (term === "Third Term") return { term: "Second Term", academicYear: year };
  const [start, end] = String(year || "").split("/").map(Number);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return { term: "Third Term", academicYear: `${start - 1}/${end - 1}` };
  }
  return { term: null, academicYear: year };
}

function getCarryForwardScore(resultLike) {
  const cumulative = Number(resultLike?.cumulative_average);
  if (Number.isFinite(cumulative) && cumulative > 0) return cumulative;

  const total = Number(resultLike?.total_score);
  if (Number.isFinite(total) && total > 0) return total;

  const ltCum = Number(resultLike?.lt_cum);
  if (Number.isFinite(ltCum) && ltCum > 0) return ltCum;

  return 0;
}

  const formatMoney = (value) => `₦${Number(value || 0).toLocaleString()}`;

  const deleteTimetableSlotsInBatches = async (ids = []) => {
    const queue = ids.filter(Boolean);
    const chunkSize = 100;
    for (let i = 0; i < queue.length; i += chunkSize) {
      await TimetableSlot.bulkDelete(queue.slice(i, i + chunkSize));
    }
  };

  const loadRolloverReadiness = async () => {
    try {
      const isPromotion = currentTerm === "Third Term";
      const [
        allStudents,
        allSubjects,
        allClassFees,
        calendarEvents,
        targetRecords,
        targetSlots,
        currentPayments,
        discounts,
        studentStartTerms,
        feeGroupRecords,
      ] = await Promise.all([
        Student.list(),
        Subject.list(),
        ClassFee.list().catch(() => []),
        SchoolCalendarEvent.list().catch(() => []),
        AcademicRecord.filter({ term: nextTerm, academic_year: nextYear }).catch(() => []),
        TimetableSlot.filter({ term: nextTerm, academic_year: nextYear }).catch(() => []),
        Payment.filter({ term: currentTerm, academic_year: currentYear }).catch(() => []),
        loadPaymentDiscounts().catch(() => ({})),
        loadStudentStartTerms().catch(() => ({})),
        loadStudentFeeGroups().catch(() => ({})),
      ]);

      const activeStudents = applyStudentFeeGroups(allStudents || [], feeGroupRecords).filter((student) => student.enrollment_status === "active");
      const destinationRows = activeStudents.map((student) => {
        const nextGrade = isPromotion ? (GRADE_PROGRESSION[student.grade] || student.grade) : student.grade;
        return { student, nextGrade };
      });
      const destinationGrades = [...new Set(destinationRows.map((row) => row.nextGrade).filter(Boolean))];

      const subjectsByGrade = {};
      (allSubjects || []).forEach((subject) => {
        (subject.grade_levels || []).forEach((grade) => {
          subjectsByGrade[grade] = (subjectsByGrade[grade] || 0) + 1;
        });
      });

      const missingSubjectGrades = destinationGrades.filter((grade) => !(subjectsByGrade[grade] > 0));
      const missingFeeGrades = destinationGrades.filter(
        (grade) => !getExactClassFee(allClassFees || [], { grade, term: nextTerm, academicYear: nextYear })
      );

      const scopedCalendarEvents = (calendarEvents || []).filter((event) => {
        if (event.academic_year !== nextYear) return false;
        return !event.term || event.term === nextTerm;
      });
      const hasTermStart = scopedCalendarEvents.some((event) => event.event_type === "term_start");
      const hasTermEnd = scopedCalendarEvents.some((event) => event.event_type === "term_end");

      const balanceRows = buildStudentBalanceRows({
        students: activeStudents,
        payments: currentPayments || [],
        classFees: allClassFees || [],
        term: currentTerm,
        academicYear: currentYear,
        discounts,
        startTermRecords: studentStartTerms,
      });
      const arrearsRows = balanceRows.filter((row) => row.balance > 0);
      const arrearsTotal = arrearsRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);

      setRolloverReadiness({
        isPromotion,
        activeStudents: activeStudents.length,
        destinationGrades,
        missingSubjectGrades,
        missingFeeGrades,
        scopedCalendarEvents: scopedCalendarEvents.length,
        hasTermStart,
        hasTermEnd,
        targetRecords: (targetRecords || []).length,
        targetTimetableSlots: (targetSlots || []).filter((slot) => !slot.is_blocked).length,
        arrearsStudents: arrearsRows.length,
        arrearsTotal,
      });
    } catch (error) {
      console.error("Failed to load rollover readiness:", error);
      setRolloverReadiness(null);
    }
  };

  const loadLatestRollbackableRollover = async () => {
    setLoadingRollbackInfo(true);
    try {
      // Query rollover-specific logs directly so we're never blocked by a row-count cap
      const { data: rolloverLogs } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_id", "term_rollover")
        .in("action", ["rollover_executed", "rollover_rolled_back"])
        .order("created_at", { ascending: false })
        .limit(50);

      const rollbackIds = new Set(
        (rolloverLogs || [])
          .filter((log) => log.action === "rollover_rolled_back")
          .map((log) => log.details?.rollback_of)
          .filter(Boolean)
      );

      const latest = (rolloverLogs || []).find((log) =>
        log.action === "rollover_executed" &&
        log.details?.snapshot &&
        !rollbackIds.has(log.id)
      );

      setLatestRollbackableRollover(latest || null);
    } catch (error) {
      console.warn("Could not load rollback info:", error);
      setLatestRollbackableRollover(null);
    } finally {
      setLoadingRollbackInfo(false);
    }
  };

  useEffect(() => {
    if (activeTab === "general" && generalSection === "promotion") {
      loadRolloverReadiness();
      loadLatestRollbackableRollover();
    }
  }, [activeTab, generalSection, currentTerm, currentYear]);

  const handlePreviewTransfer = async () => {
    setIsTransferring(true);
    setRolloverProgress({ visible: false, value: 0, label: "" });
    setPromotionWarnings([]);
    try {
      const [allStudents, allSubjects] = await Promise.all([
        Student.list(),
        Subject.list(),
      ]);
      const activeStudents = allStudents.filter(s => s.enrollment_status === "active");
      const isPromotion = currentTerm === "Third Term";

      // Build grade → subject count map for validation
      const subjectsByGrade = {};
      for (const subject of allSubjects) {
        for (const grade of (subject.grade_levels || [])) {
          subjectsByGrade[grade] = (subjectsByGrade[grade] || 0) + 1;
        }
      }

      const rows = activeStudents.map(student => {
        let nextGrade = student.grade;
        if (isPromotion) {
          nextGrade = GRADE_PROGRESSION[student.grade] || student.grade;
        }
        return { student, currentGrade: student.grade, nextGrade, isPromotion, willChange: nextGrade !== student.grade };
      });

      const warnings = [];

      // Validate: warn if any destination grade has no subjects
      if (isPromotion) {
        const gradesWithNoSubjects = new Set();
        for (const { nextGrade } of rows) {
          if (!(subjectsByGrade[nextGrade] > 0)) {
            gradesWithNoSubjects.add(nextGrade);
          }
        }
        if (gradesWithNoSubjects.size > 0) {
          warnings.push(
            `No subjects are defined for the following grade(s): ${[...gradesWithNoSubjects].join(", ")}. ` +
            `Students promoted into these grades will have no academic records for the new term. ` +
            `Please set up subjects for these grades before proceeding.`
          );
        }
      } else {
        // Non-promotion: check current grade has subjects for the next term
        const gradesWithNoSubjects = new Set();
        for (const { nextGrade } of rows) {
          if (!(subjectsByGrade[nextGrade] > 0)) {
            gradesWithNoSubjects.add(nextGrade);
          }
        }
        if (gradesWithNoSubjects.size > 0) {
          warnings.push(
            `No subjects are defined for: ${[...gradesWithNoSubjects].join(", ")}. ` +
            `Students in these classes will have no academic records created for the next term.`
          );
        }
      }

      if (rolloverReadiness?.missingFeeGrades?.length > 0) {
        warnings.push(
          `No exact fee schedule is set yet for ${nextTerm} ${nextYear} in: ${rolloverReadiness.missingFeeGrades.join(", ")}.`
        );
      }
      if (!rolloverReadiness?.hasTermStart || !rolloverReadiness?.hasTermEnd) {
        warnings.push(
          `The school calendar for ${nextTerm} ${nextYear} is incomplete. Add both term start and term end before opening operations.`
        );
      }
      if ((rolloverReadiness?.targetRecords || 0) > 0) {
        warnings.push(
          `${rolloverReadiness.targetRecords} academic records already exist in ${nextTerm} ${nextYear}. Existing rows will be reused where possible, so review carefully before rollover.`
        );
      }
      if ((rolloverReadiness?.targetTimetableSlots || 0) > 0) {
        warnings.push(
          rolloverOptions.clearTargetTimetable
            ? `${rolloverReadiness.targetTimetableSlots} timetable slots already exist in ${nextTerm} ${nextYear}. Unblocked slots will be cleared before rollover.`
            : `${rolloverReadiness.targetTimetableSlots} timetable slots already exist in ${nextTerm} ${nextYear}. They will remain because timetable clearing is turned off.`
        );
      }
      if (rolloverOptions.carryForwardArrears && (rolloverReadiness?.arrearsStudents || 0) > 0) {
        warnings.push(
          `${rolloverReadiness.arrearsStudents} students currently have outstanding balances totaling ${formatMoney(rolloverReadiness.arrearsTotal)}. ${
            rolloverOptions.carryForwardMode === "replace_existing"
              ? `Existing carry-forward rows in ${nextTerm} ${nextYear} from this source term will be replaced.`
              : rolloverOptions.carryForwardMode === "clean_target_only"
                ? `Transfer will only run if ${nextTerm} ${nextYear} has no existing carry-forward rows from this source term.`
                : `Carry-forward entries will be created only for students still missing one in ${nextTerm} ${nextYear}.`
          }`
        );
      }

      setPromotionWarnings(warnings);

      setPromotionPreview({ rows, isPromotion, nextTerm: getNextTerm(currentTerm), nextYear: getNextYear(currentTerm, currentYear) });
      setShowPromotionPreview(true);
    } catch (err) {
      console.error(err);
    }
    setIsTransferring(false);
  };

  const handleTransfer = async () => {
    setIsTransferring(true);
    setTransferResult(null);
    updateRolloverProgress(4, "Preparing rollover...");
    try {
      const isPromotion = currentTerm === "Third Term";

      // Load everything needed in parallel
      updateRolloverProgress(10, "Loading students, records, payments, and timetable...");
      const [
        allStudents,
        allSubjects,
        currentRecords,
        currentExamResults,
        nextRecords,
        allClassFees,
        currentPayments,
        nextPayments,
        targetSlots,
        discounts,
        studentStartTerms,
        feeGroupRecords,
      ] = await Promise.all([
        Student.filter({ enrollment_status: "active" }),
        Subject.list(),
        AcademicRecord.filter({ term: currentTerm, academic_year: currentYear }),
        ExamResult.filter({ term: currentTerm, academic_year: currentYear }).catch(() => []),
        AcademicRecord.filter({ term: nextTerm, academic_year: nextYear }),
        ClassFee.list().catch(() => []),
        Payment.filter({ term: currentTerm, academic_year: currentYear }).catch(() => []),
        Payment.filter({ term: nextTerm, academic_year: nextYear }).catch(() => []),
        TimetableSlot.filter({ term: nextTerm, academic_year: nextYear }).catch(() => []),
        loadPaymentDiscounts().catch(() => ({})),
        loadStudentStartTerms().catch(() => ({})),
        loadStudentFeeGroups().catch(() => ({})),
      ]);
      const activeStudentsWithFeeGroups = applyStudentFeeGroups(allStudents || [], feeGroupRecords);
      updateRolloverProgress(18, "Checking subjects and existing next-term data...");

      // Build grade → [subject_id] map from subjects.grade_levels
      const subjectsByGrade = {};
      const subjectNameById = {};
      const subjectIdByName = {};
      for (const subject of allSubjects) {
        if (subject?.id && subject?.subject_name) {
          subjectNameById[subject.id] = subject.subject_name;
          subjectIdByName[subject.subject_name] = subject.id;
        }
        for (const grade of (subject.grade_levels || [])) {
          if (!subjectsByGrade[grade]) subjectsByGrade[grade] = [];
          subjectsByGrade[grade].push(subject.id);
        }
      }

      // De-dup: track which student+subject combos already exist in next term
      const existingKeys = new Set(nextRecords.map(r => `${r.student_id}::${r.subject_id}`));

      // Group current records by student
      const recordsByStudent = {};
      for (const r of currentRecords) {
        if (!recordsByStudent[r.student_id]) recordsByStudent[r.student_id] = [];
        recordsByStudent[r.student_id].push(r);
      }

      const examResultsByStudentSubject = new Map();
      for (const result of currentExamResults || []) {
        const subjectId = subjectIdByName[result?.subject_name];
        if (!result?.student_id || !subjectId) continue;
        examResultsByStudentSubject.set(`${result.student_id}::${subjectId}`, result);
      }

      const arrearsByStudent = {};
      if (rolloverOptions.carryForwardArrears) {
        updateRolloverProgress(24, "Calculating unpaid balances to carry forward...");
        buildStudentBalanceRows({
          students: activeStudentsWithFeeGroups,
          payments: currentPayments || [],
          classFees: allClassFees || [],
          term: currentTerm,
          academicYear: currentYear,
          discounts,
          startTermRecords: studentStartTerms,
        })
          .filter((row) => row.balance > 0)
          .forEach((row) => {
            arrearsByStudent[row.student.id] = Number(row.balance || 0);
          });
      }

      const carryForwardNote = `Arrears carried forward from ${currentTerm} ${currentYear}`;
      const existingCarryForwardRows = (nextPayments || []).filter((payment) =>
        String(payment.notes || "").includes(carryForwardNote)
      );
      const existingCarryForward = new Map(
        existingCarryForwardRows.map((payment) => [payment.student_id, payment])
      );

      if (
        rolloverOptions.carryForwardArrears &&
        rolloverOptions.carryForwardMode === "replace_existing" &&
        existingCarryForwardRows.length > 0
      ) {
        updateRolloverProgress(28, `Replacing ${existingCarryForwardRows.length} existing carry-forward row(s)...`);
        const carryForwardIds = existingCarryForwardRows.map((payment) => payment.id).filter(Boolean);
        if (carryForwardIds.length > 0) {
          await Payment.bulkDelete(carryForwardIds);
        }
        existingCarryForward.clear();
      }

      const createdAcademicRecordIds = [];
      const createdPaymentIds = [];
      const studentUpdates = [];
      const clearedTimetableSnapshot = (targetSlots || [])
        .filter((slot) => slot.id && !slot.is_blocked)
        .map((slot) => ({ ...slot }));

      let timetableCleared = 0;
      if (rolloverOptions.clearTargetTimetable) {
        updateRolloverProgress(30, `Clearing ${clearedTimetableSnapshot.length} existing next-term timetable slot(s)...`);
        const toDelete = clearedTimetableSnapshot.map((slot) => slot.id);
        if (toDelete.length > 0) {
          await deleteTimetableSlotsInBatches(toDelete);
          timetableCleared = toDelete.length;
        }
      }

      let studentsProcessed = 0;
      let recordsCreated = 0;
      let arrearsCreated = 0;
      let graduatesProcessed = 0;
      const totalStudents = Math.max(allStudents.length, 1);

      const updateStudentLoopProgress = (completed, label) => {
        const loopValue = 38 + (completed / totalStudents) * 47;
        updateRolloverProgress(loopValue, label);
      };

      for (const student of allStudents) {
        if (
          studentsProcessed === 0 ||
          studentsProcessed % 10 === 0 ||
          studentsProcessed === totalStudents - 1
        ) {
          updateStudentLoopProgress(
            studentsProcessed,
            isPromotion
              ? `Processing promoted students (${studentsProcessed}/${totalStudents})...`
              : `Processing rollover students (${studentsProcessed}/${totalStudents})...`
          );
        }
        const stuRecords = recordsByStudent[student.id] || [];
        const shouldGraduate = isPromotion && rolloverOptions.graduateFinalClass && student.grade === "SSS 3";

        if (shouldGraduate) {
          studentUpdates.push({
            studentId: student.id,
            previousGrade: student.grade,
            previousEnrollmentStatus: student.enrollment_status,
            nextGrade: student.grade,
            nextEnrollmentStatus: "graduated",
          });
          await Student.update(student.id, { enrollment_status: "graduated" });
          graduatesProcessed++;
          studentsProcessed++;
          continue;
        }

        if (!isPromotion) {
          // ── SAME GRADE (First→Second or Second→Third) ──────────────────
          // Carry the previous term's cumulative average into the new term's LT CUM.
          const subjectIds = stuRecords.length > 0
            ? [...new Set(stuRecords.map(r => r.subject_id).filter(Boolean))]
            : (subjectsByGrade[student.grade] || []);

          for (const subjectId of subjectIds) {
            const key = `${student.id}::${subjectId}`;
            if (existingKeys.has(key)) continue;
            const previousAcademicRecord = stuRecords.find(record => record.subject_id === subjectId);
            const previousExamResult = examResultsByStudentSubject.get(key);
            let ltCum = 0;

            if (previousExamResult) {
              ltCum = getCarryForwardScore(previousExamResult);
            } else if (previousAcademicRecord) {
              const previousTotal = Number(previousAcademicRecord.total_score) || 0;
              const previousLtCum = Number(previousAcademicRecord.lt_cum) || 0;
              ltCum = previousLtCum > 0
                ? Math.round((((previousLtCum + previousTotal) / 2) * 10)) / 10
                : previousTotal;
            }

            const createdRecord = await AcademicRecord.create({
              student_id: student.id,
              subject_id: subjectId,
              term: nextTerm,
              academic_year: nextYear,
              lt_cum: ltCum,
              continuous_assessment: 0,
              exam_score: 0,
              total_score: 0,
              grade: "",
              remarks: "",
            });
            if (createdRecord?.id) createdAcademicRecordIds.push(createdRecord.id);
            existingKeys.add(key);
            recordsCreated++;
          }
        } else {
          // ── PROMOTION (Third Term → First Term of next year) ────────────
          const newGrade = GRADE_PROGRESSION[student.grade] || student.grade;
          if (newGrade !== student.grade) {
            studentUpdates.push({
              studentId: student.id,
              previousGrade: student.grade,
              previousEnrollmentStatus: student.enrollment_status,
              nextGrade: newGrade,
              nextEnrollmentStatus: student.enrollment_status,
            });
            await Student.update(student.id, { grade: newGrade });
          }

          // For promoted students use subjects of the NEW grade (handles
          // transition classes Primary 4→JSS 1 and JSS 3→SSS 1 automatically)
          const newSubjectIds = subjectsByGrade[newGrade] || [];
          for (const subjectId of newSubjectIds) {
            const key = `${student.id}::${subjectId}`;
            if (existingKeys.has(key)) continue;
            const createdRecord = await AcademicRecord.create({
              student_id: student.id,
              subject_id: subjectId,
              term: nextTerm,
              academic_year: nextYear,
              lt_cum: 0,
              continuous_assessment: 0,
              exam_score: 0,
              total_score: 0,
              grade: "",
              remarks: "",
            });
            if (createdRecord?.id) createdAcademicRecordIds.push(createdRecord.id);
            existingKeys.add(key);
            recordsCreated++;
          }
        }

        if (
          rolloverOptions.carryForwardArrears &&
          Number(arrearsByStudent[student.id] || 0) > 0 &&
          (
            rolloverOptions.carryForwardMode === "replace_existing" ||
            (
              rolloverOptions.carryForwardMode === "clean_target_only"
                ? existingCarryForward.size === 0
                : !existingCarryForward.has(student.id)
            )
          )
        ) {
          const createdPayment = await Payment.create({
            student_id: student.id,
            amount: Number(arrearsByStudent[student.id] || 0),
            payment_status: "pending",
            term: nextTerm,
            academic_year: nextYear,
            notes: carryForwardNote,
            payment_date: null,
            payment_method: "cash",
            due_date: null,
          });
          if (createdPayment?.id) createdPaymentIds.push(createdPayment.id);
          existingCarryForward.set(student.id, createdPayment || { student_id: student.id });
          arrearsCreated++;
        }

        studentsProcessed++;
      }

      // Advance the global term in school settings
      updateRolloverProgress(88, "Updating school term and year...");
      await saveSchoolSettings({ current_term: nextTerm, current_year: nextYear });
      await updateMe({ current_term: nextTerm, current_academic_year: nextYear }).catch(() => {});
      updateRolloverProgress(93, "Saving rollback snapshot...");
      const rollbackSnapshot = {
        previousTerm: currentTerm,
        previousYear: currentYear,
        nextTerm,
        nextYear,
        isPromotion,
        options: rolloverOptions,
        createdAcademicRecordIds,
        createdPaymentIds,
        clearedTimetableSlots: clearedTimetableSnapshot.map(sanitizeTimetableSnapshotSlot).filter(Boolean),
        studentUpdates,
      };
      const rolloverLogPayload = {
        action: "rollover_executed",
        entity_type: "school_settings",
        entity_id: "term_rollover",
        performed_by: currentUser?.school_role || currentUser?.full_name || "admin",
        summary: `Rollover executed from ${currentTerm} ${currentYear} to ${nextTerm} ${nextYear}.`,
        details: {
          snapshot: rollbackSnapshot,
        },
      };

      const { error: rollbackLogInsertError } = await supabase
        .from("audit_logs")
        .insert(rolloverLogPayload);

      if (rollbackLogInsertError) {
        console.error("Failed to save rollover snapshot:", rollbackLogInsertError);
      }

      let rollbackLog = null;
      const { data: latestRolloverLogs, error: rollbackLogFetchError } = await supabase
        .from("audit_logs")
        .select("id, created_at, details, summary, action")
        .eq("entity_id", "term_rollover")
        .eq("action", "rollover_executed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!rollbackLogFetchError && latestRolloverLogs?.[0]?.details?.snapshot) {
        rollbackLog = latestRolloverLogs[0];
      } else {
        if (rollbackLogFetchError) {
          console.warn("Could not re-load saved rollover snapshot:", rollbackLogFetchError);
        }
        // Keep the snapshot usable in the current session even if the audit-log
        // read-back fails, so an immediate rollback is still available.
        rollbackLog = {
          id: null,
          created_at: new Date().toISOString(),
          summary: rolloverLogPayload.summary,
          details: { snapshot: rollbackSnapshot },
        };
      }
      setLatestRollbackableRollover(rollbackLog);
      setCurrentTerm(nextTerm);
      setCurrentYear(nextYear);
      updateRolloverProgress(97, "Refreshing rollover status...");
      await loadRolloverReadiness();
      await loadLatestRollbackableRollover();
      updateRolloverProgress(100, "Rollover complete.");

      // ── Auto-export term documents to School Vault ────────────────────────
      if (isDriveConnected()) {
        try {
          updateRolloverProgress(98, "Exporting term documents to Vault...");
          await runTermVaultExport(currentTerm, currentYear, (msg) =>
            updateRolloverProgress(98, msg)
          );
          updateRolloverProgress(100, "Rollover complete.");
        } catch (e) {
          console.error("Vault export error:", e);
          // Non-fatal — rollover already succeeded
        }
      }

      // Auto-hide progress bar after 3 seconds
      setTimeout(() => setRolloverProgress({ visible: false, value: 0, label: "" }), 3000);
      setTransferResult({
        success: true,
        studentsProcessed,
        recordsCreated,
        arrearsCreated,
        timetableCleared,
        graduatesProcessed,
        isPromotion,
        toTerm: nextTerm,
        toYear: nextYear,
        rollbackLogId: rollbackLog?.id || null,
      });
    } catch (error) {
      setRolloverProgress({ visible: false, value: 0, label: "" });
      setTransferResult({ success: false, error: error.message });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRollbackLastRollover = () => {
    const snapshot = latestRollbackableRollover?.details?.snapshot;
    if (!snapshot) {
      toast.error("No rollback snapshot is available for the last rollover.");
      return;
    }
    setRollbackConfirmOpen(true);
  };

  // ── Manual delete (fallback when no snapshot exists) ─────────────────────
  const handleManualDeletePreview = async () => {
    if (!manualDeleteTerm || !manualDeleteYear) return;
    setManualDeleteLoading(true);
    setManualDeletePreview(null);
    try {
      // Use count queries — never capped by Supabase's 1000-row default limit
      const [recResult, payResult] = await Promise.all([
        supabase
          .from("academic_records")
          .select("id", { count: "exact", head: true })
          .eq("term", manualDeleteTerm)
          .eq("academic_year", manualDeleteYear),
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("term", manualDeleteTerm)
          .eq("academic_year", manualDeleteYear)
          .ilike("notes", "%arrears carried forward%"),
      ]);
      if (recResult.error) throw recResult.error;
      if (payResult.error) throw payResult.error;
      setManualDeletePreview({
        records: recResult.count ?? 0,
        carryForwards: payResult.count ?? 0,
        term: manualDeleteTerm,
        year: manualDeleteYear,
      });
    } catch (err) {
      toast.error("Could not load preview: " + (err?.message || "Unknown error"));
    } finally {
      setManualDeleteLoading(false);
    }
  };

  const executeManualDelete = async () => {
    if (!manualDeletePreview) return;
    // Capture term/year from the preview object so closing the dialog
    // (which resets manualDeleteTerm/Year state) doesn't lose them
    const term = manualDeletePreview.term;
    const year = manualDeletePreview.year;
    setManualDeleting(true);
    try {
      // Delete directly by filter — no 1000-row cap, single DB operation each
      const { error: recError } = await supabase
        .from("academic_records")
        .delete()
        .eq("term", term)
        .eq("academic_year", year);
      if (recError) throw recError;

      const { error: payError } = await supabase
        .from("payments")
        .delete()
        .eq("term", term)
        .eq("academic_year", year)
        .ilike("notes", "%arrears carried forward%");
      if (payError) throw payError;

      toast.success(
        `Deleted ${manualDeletePreview.records} academic records and ${manualDeletePreview.carryForwards} carry-forward entries for ${term} ${year}.`
      );
      setManualDeleteOpen(false);
      setManualDeletePreview(null);
      setManualDeleteTerm("");
      setManualDeleteYear("");
      await loadRolloverReadiness();
    } catch (err) {
      toast.error("Could not delete records: " + (err?.message || "Unknown error"));
    } finally {
      setManualDeleting(false);
    }
  };

  // ── Quick delete — scope card shortcut for nextTerm/nextYear ─────────────
  const openQuickDelete = async () => {
    setQuickDeleteCounts(null);
    setQuickDeleteOpen(true);
    setQuickDeleteLoading(true);
    try {
      const [recResult, payResult] = await Promise.all([
        supabase
          .from("academic_records")
          .select("id", { count: "exact", head: true })
          .eq("term", nextTerm)
          .eq("academic_year", nextYear),
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("term", nextTerm)
          .eq("academic_year", nextYear)
          .ilike("notes", "%arrears carried forward%"),
      ]);
      setQuickDeleteCounts({
        records: recResult.count ?? 0,
        carryForwards: payResult.count ?? 0,
      });
    } catch (err) {
      toast.error("Could not load counts: " + (err?.message || "Unknown error"));
      setQuickDeleteOpen(false);
    } finally {
      setQuickDeleteLoading(false);
    }
  };

  const executeQuickDelete = async () => {
    setQuickDeleting(true);
    try {
      const { error: recError } = await supabase
        .from("academic_records")
        .delete()
        .eq("term", nextTerm)
        .eq("academic_year", nextYear);
      if (recError) throw recError;

      const { error: payError } = await supabase
        .from("payments")
        .delete()
        .eq("term", nextTerm)
        .eq("academic_year", nextYear)
        .ilike("notes", "%arrears carried forward%");
      if (payError) throw payError;

      toast.success(`Deleted ${quickDeleteCounts?.records ?? 0} academic records and ${quickDeleteCounts?.carryForwards ?? 0} carry-forward entries for ${nextTerm} ${nextYear}.`);
      setQuickDeleteOpen(false);
      setQuickDeleteCounts(null);
      await loadRolloverReadiness();
    } catch (err) {
      toast.error("Could not delete: " + (err?.message || "Unknown error"));
    } finally {
      setQuickDeleting(false);
    }
  };

  const executeRollback = async () => {
    setRollbackConfirmOpen(false);
    const rolloverLog = latestRollbackableRollover;
    const snapshot = rolloverLog?.details?.snapshot;
    if (!snapshot) return;

    setIsRollingBack(true);
    setTransferResult(null);
    let slotsToRestore = [];
    try {
      // Step 1: Remove rollover-created academic records (non-critical — may already be deleted)
      if ((snapshot.createdAcademicRecordIds || []).length > 0) {
        try {
          await AcademicRecord.bulkDelete(snapshot.createdAcademicRecordIds);
        } catch (e) {
          console.warn("Rollback: could not delete academic records (may already be gone):", e);
        }
      }

      // Step 2: Remove carry-forward payments (non-critical)
      if ((snapshot.createdPaymentIds || []).length > 0) {
        try {
          await Payment.bulkDelete(snapshot.createdPaymentIds);
        } catch (e) {
          console.warn("Rollback: could not delete carry-forward payments:", e);
        }
      }

      // Step 3: Restore student grades (CRITICAL — always run this)
      for (const change of snapshot.studentUpdates || []) {
        await Student.update(change.studentId, {
          grade: change.previousGrade,
          enrollment_status: change.previousEnrollmentStatus,
        });
      }

      // Step 4: Restore cleared timetable slots (non-critical)
      try {
        const currentTargetSlots = await TimetableSlot.filter({
          term: snapshot.nextTerm,
          academic_year: snapshot.nextYear,
        }).catch(() => []);

        const currentSlotKeys = new Set(
          (currentTargetSlots || []).map((slot) => [
            slot.grade, slot.day, slot.period,
            slot.subject_id || "", slot.teacher_id || "",
            slot.term, slot.academic_year,
          ].join("::"))
        );

        slotsToRestore = (snapshot.clearedTimetableSlots || [])
          .map(sanitizeTimetableSnapshotSlot)
          .filter(Boolean)
          .filter((slot) => {
            const key = [
              slot.grade, slot.day, slot.period,
              slot.subject_id || "", slot.teacher_id || "",
              slot.term, slot.academic_year,
            ].join("::");
            return !currentSlotKeys.has(key);
          });

        if (slotsToRestore.length > 0) {
          await TimetableSlot.bulkCreate(slotsToRestore);
        }
      } catch (e) {
        console.warn("Rollback: could not restore timetable slots:", e);
      }

      await saveSchoolSettings({ current_term: snapshot.previousTerm, current_year: snapshot.previousYear });
      await updateMe({
        current_term: snapshot.previousTerm,
        current_academic_year: snapshot.previousYear,
      }).catch(() => {});

      await supabase.from("audit_logs").insert({
        action: "rollover_rolled_back",
        entity_type: "school_settings",
        entity_id: "term_rollover",
        performed_by: currentUser?.school_role || currentUser?.full_name || "admin",
        summary: `Rolled back rollover from ${snapshot.previousTerm} ${snapshot.previousYear} to ${snapshot.nextTerm} ${snapshot.nextYear}.`,
        details: {
          rollback_of: rolloverLog.id,
          restoredTimetableSlots: slotsToRestore.length,
          deletedAcademicRecords: (snapshot.createdAcademicRecordIds || []).length,
          deletedPaymentEntries: (snapshot.createdPaymentIds || []).length,
          restoredStudents: (snapshot.studentUpdates || []).length,
        },
      });

      setCurrentTerm(snapshot.previousTerm);
      setCurrentYear(snapshot.previousYear);
      await loadRolloverReadiness();
      await loadLatestRollbackableRollover();
      setTransferResult({
        success: true,
        isPromotion: snapshot.isPromotion,
        studentsProcessed: (snapshot.studentUpdates || []).length,
        recordsCreated: 0,
        arrearsCreated: 0,
        timetableCleared: 0,
        graduatesProcessed: 0,
        rollback: true,
        rollbackRestoredSlots: slotsToRestore.length,
        rollbackDeletedRecords: (snapshot.createdAcademicRecordIds || []).length,
        rollbackDeletedPayments: (snapshot.createdPaymentIds || []).length,
      });
      toast.success("Last rollover has been rolled back.");
    } catch (error) {
      toast.error(error?.message || "Could not roll back the last rollover.");
    } finally {
      setIsRollingBack(false);
    }
  };

  // Restore grades only from snapshot (emergency path when full rollback is blocked)
  const executeRestoreGradesOnly = async () => {
    setRestoreGradesConfirmOpen(false);
    const snapshot = latestRollbackableRollover?.details?.snapshot;
    if (!snapshot) return;
    setIsRestoringGrades(true);
    try {
      let count = 0;
      for (const change of snapshot.studentUpdates || []) {
        await Student.update(change.studentId, {
          grade: change.previousGrade,
          enrollment_status: change.previousEnrollmentStatus,
        });
        count++;
      }
      if (count === 0) {
        toast.warning("No student grade changes were found in the snapshot.");
      } else {
        toast.success(`Restored previous grades for ${count} student(s).`);
      }
    } catch (error) {
      toast.error(error?.message || "Failed to restore student grades.");
    } finally {
      setIsRestoringGrades(false);
    }
  };

  // Build reverse grade map once
  // SSS 3 is the terminal grade — exclude it so "Demote All" never moves SSS 3 → SSS 2
  const REVERSE_GRADE_MAP = (() => {
    const map = {};
    for (const [from, to] of Object.entries(GRADE_PROGRESSION)) {
      if (to !== from) map[to] = from;
    }
    delete map["SSS 3"];
    return map;
  })();

  // Delete academic records + carry-forward fees for a set of student IDs in a given term/year
  const cleanupPromotedRecords = async (studentIds, term, year) => {
    const idSet = new Set(studentIds);
    const [allRecords, allPayments] = await Promise.all([
      AcademicRecord.filter({ term, academic_year: year }).catch(() => []),
      Payment.filter({ term, academic_year: year }).catch(() => []),
    ]);
    const recordIds = allRecords.filter(r => idSet.has(r.student_id)).map(r => r.id);
    const paymentIds = allPayments
      .filter(p => idSet.has(p.student_id) && (p.notes || "").toLowerCase().includes("carried forward"))
      .map(p => p.id);
    if (recordIds.length) await AcademicRecord.bulkDelete(recordIds);
    if (paymentIds.length) await Payment.bulkDelete(paymentIds);
    return { recordIds: recordIds.length, paymentIds: paymentIds.length };
  };

  // Restore accidentally graduated SSS 3 students → active
  const restoreGraduatedSS3 = async () => {
    const graduated = await Student.filter({ grade: "SSS 3", enrollment_status: "graduated" }).catch(() => []);
    for (const s of graduated) {
      await Student.update(s.id, { enrollment_status: "active" });
    }
    return graduated.length;
  };

  // Manual grade demotion — bulk-move all students in a grade to its predecessor
  const executeManualDemote = async () => {
    if (!manualDemoteFromGrade) return;
    setIsDemoting(true);
    try {
      // Special case: SSS 3 has no previous grade — only restore graduated students
      if (manualDemoteFromGrade === "SSS 3") {
        if (demoteRestoreGraduated) {
          const count = await restoreGraduatedSS3();
          let extra = "";
          if (demoteCleanupTerm && demoteCleanupYear && count > 0) {
            const allSS3 = await Student.filter({ grade: "SSS 3", enrollment_status: "active" }).catch(() => []);
            const { recordIds, paymentIds } = await cleanupPromotedRecords(
              allSS3.map(s => s.id), demoteCleanupTerm, demoteCleanupYear
            );
            extra = ` · ${recordIds} record(s) and ${paymentIds} fee(s) removed.`;
          }
          toast.success(`Restored ${count} SSS 3 student(s) to active.${extra}`);
        } else {
          toast.warning("SSS 3 has no previous grade. Enable \"Restore graduated students\" to bring them back.");
        }
        setManualDemoteOpen(false);
        setManualDemoteFromGrade("");
        return;
      }

      const targetGrade = REVERSE_GRADE_MAP[manualDemoteFromGrade];
      if (!targetGrade) {
        toast.error(`No previous grade found for ${manualDemoteFromGrade}.`);
        setIsDemoting(false);
        return;
      }
      const students = await Student.filter({ grade: manualDemoteFromGrade, enrollment_status: "active" });
      if (!students.length) {
        toast.warning(`No active students found in ${manualDemoteFromGrade}.`);
        setIsDemoting(false);
        return;
      }
      for (const s of students) {
        await Student.update(s.id, { grade: targetGrade });
      }
      let extra = "";
      if (demoteCleanupTerm && demoteCleanupYear) {
        const { recordIds, paymentIds } = await cleanupPromotedRecords(
          students.map(s => s.id), demoteCleanupTerm, demoteCleanupYear
        );
        extra = ` · ${recordIds} record(s) and ${paymentIds} fee(s) removed.`;
      }
      toast.success(`Moved ${students.length} student(s) from ${manualDemoteFromGrade} → ${targetGrade}.${extra}`);
      setManualDemoteOpen(false);
      setManualDemoteFromGrade("");
    } catch (error) {
      toast.error(error?.message || "Failed to demote students.");
    } finally {
      setIsDemoting(false);
    }
  };

  const executeManualDemoteAll = async () => {
    setDemoteAllConfirmOpen(false);
    setDemoteAllTyped("");
    setIsDemotingAll(true);
    setDemoteAllResult(null);
    try {
      const allStudents = await Student.filter({ enrollment_status: "active" });
      const byGrade = {};
      for (const s of allStudents) {
        if (REVERSE_GRADE_MAP[s.grade]) {
          if (!byGrade[s.grade]) byGrade[s.grade] = [];
          byGrade[s.grade].push(s);
        }
      }
      let totalMoved = 0;
      let totalRecords = 0;
      let totalPayments = 0;
      let restoredSS3 = 0;
      const summary = [];
      const allAffectedIds = [];
      for (const [fromGrade, students] of Object.entries(byGrade)) {
        const toGrade = REVERSE_GRADE_MAP[fromGrade];
        for (const s of students) {
          await Student.update(s.id, { grade: toGrade });
          allAffectedIds.push(s.id);
        }
        totalMoved += students.length;
        summary.push(`${fromGrade} → ${toGrade} (${students.length})`);
      }
      // Restore accidentally graduated SSS 3 students
      if (demoteRestoreGraduated) {
        restoredSS3 = await restoreGraduatedSS3();
        if (restoredSS3 > 0) {
          summary.push(`SSS 3 graduated → active (${restoredSS3})`);
          totalMoved += restoredSS3;
          // Add SSS 3 students to cleanup list too
          const ss3Active = await Student.filter({ grade: "SSS 3", enrollment_status: "active" }).catch(() => []);
          ss3Active.forEach(s => allAffectedIds.push(s.id));
        }
      }
      if (demoteCleanupTerm && demoteCleanupYear && allAffectedIds.length) {
        const { recordIds, paymentIds } = await cleanupPromotedRecords(
          allAffectedIds, demoteCleanupTerm, demoteCleanupYear
        );
        totalRecords = recordIds;
        totalPayments = paymentIds;
      }
      setDemoteAllResult({ success: true, totalMoved, totalRecords, totalPayments, summary });
      toast.success(`Demoted ${totalMoved} student(s) across ${summary.length} grade(s).`);
    } catch (error) {
      setDemoteAllResult({ success: false, error: error?.message });
      toast.error(error?.message || "Failed to demote all grades.");
    } finally {
      setIsDemotingAll(false);
    }
  };

  // Load a live preview of what Promote All will do
  const loadPromoteAllPreview = async () => {
    const all = await Student.filter({ enrollment_status: "active" });
    const counts = {};
    for (const s of all) {
      counts[s.grade] = (counts[s.grade] || 0) + 1;
    }
    const rows = ALL_GRADES
      .filter(g => counts[g] > 0)
      .map(g => ({ from: g, to: GRADE_PROGRESSION[g] || g, count: counts[g] }));
    setPromoteAllPreview(rows);
  };

  // Load a live preview of what Demote All will do
  const loadDemoteAllPreview = async () => {
    const all = await Student.filter({ enrollment_status: "active" });
    const counts = {};
    for (const s of all) {
      counts[s.grade] = (counts[s.grade] || 0) + 1;
    }
    const rows = ALL_GRADES
      .filter(g => counts[g] > 0)
      .map(g => ({ from: g, to: REVERSE_GRADE_MAP[g] || null, count: counts[g] }));
    setDemoteAllPreviewRows(rows);
  };

  // Promote all grades — reverse of Demote All (use GRADE_PROGRESSION forward map)
  const executePromoteAll = async () => {
    setPromoteAllConfirmOpen(false);
    setPromoteAllTyped("");
    setIsPromotingAll(true);
    setPromoteAllResult(null);
    try {
      const allStudents = await Student.filter({ enrollment_status: "active" });
      const byGrade = {};
      for (const s of allStudents) {
        const toGrade = GRADE_PROGRESSION[s.grade];
        if (!toGrade || toGrade === s.grade) continue; // skip terminal grade (SSS 3)
        if (!byGrade[s.grade]) byGrade[s.grade] = [];
        byGrade[s.grade].push(s);
      }
      let totalMoved = 0;
      const summary = [];
      for (const [fromGrade, students] of Object.entries(byGrade)) {
        const toGrade = GRADE_PROGRESSION[fromGrade];
        for (const s of students) {
          await Student.update(s.id, { grade: toGrade });
        }
        totalMoved += students.length;
        summary.push(`${fromGrade} → ${toGrade} (${students.length})`);
      }
      setPromoteAllResult({ success: true, totalMoved, summary });
      toast.success(`Promoted ${totalMoved} student(s) across ${summary.length} grade(s).`);

      // Clear school calendar so admin can upload the new term's calendar fresh
      try {
        const calEvents = await SchoolCalendarEvent.list();
        for (const ev of calEvents) await SchoolCalendarEvent.delete(ev.id);
      } catch (_) { /* non-critical — don't fail promotion if calendar clear fails */ }
    } catch (error) {
      setPromoteAllResult({ success: false, error: error?.message });
      toast.error(error?.message || "Failed to promote all grades.");
    } finally {
      setIsPromotingAll(false);
    }
  };

  // ── User Management helpers ────────────────────────────────────────────────
  const loadUmUsers = async () => {
    setUmLoading(true);
    try {
      const all = await User.list();
      setUmUsers(all.filter(u => u.is_banned !== true && u.school_role !== "student"));
    } catch (e) {
      console.error("Failed to load users:", e);
    }
    setUmLoading(false);
  };

  const handleUmInvite = async () => {
    if (!umInviteEmail.trim()) return;
    setUmInviting(true);
    setUmInviteMsg("");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: umInviteEmail.trim(), role: umInviteRole }),
      });
      if (res.ok) {
        setUmInviteMsg(`Invitation sent to ${umInviteEmail}. They'll be assigned the ${umInviteRole} role upon first login.`);
        setUmInviteEmail("");
        loadUmUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        setUmInviteMsg(`Failed: ${err.error || res.statusText || "Could not send invite."}`);
      }
    } catch (e) {
      setUmInviteMsg("Failed to send invite. Please check your Edge Function deployment.");
    }
    setUmInviting(false);
  };

  const handleUmRoleChange = async (userId, newRole) => {
    await User.update(userId, { school_role: newRole });
    setUmUsers(prev => prev.map(u => u.id === userId ? { ...u, school_role: newRole } : u));
  };

  const handleUmDeleteUser = async (userId) => {
    setUmDeleting(true);
    setUmDeleteError("");
    try {
      const { error } = await supabase.rpc("delete_auth_user", { user_id: userId });
      if (error) throw error;
      setUmUsers(prev => prev.filter(u => u.id !== userId));
      setUmConfirmDeleteId(null);
    } catch (e) {
      setUmDeleteError(e.message || "Failed to delete user.");
    }
    setUmDeleting(false);
  };


  const TABS = [
    { id: "general",          label: "General",          icon: GraduationCap },
    { id: "subjects",         label: "Subjects",         icon: BookOpen },
    { id: "classassignments", label: "Class Assignments", icon: Link2 },
  ];

  const rollbackSnapshot = latestRollbackableRollover?.details?.snapshot;

  return (
    <>
    {/* ── Snapshot-based rollback confirm ── */}
    <AlertDialog open={rollbackConfirmOpen} onOpenChange={setRollbackConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollback last rollover?</AlertDialogTitle>
          <AlertDialogDescription>
            {rollbackSnapshot
              ? `This will undo the rollover from ${rollbackSnapshot.previousTerm} ${rollbackSnapshot.previousYear} → ${rollbackSnapshot.nextTerm} ${rollbackSnapshot.nextYear}. Created next-term records will be removed and the previous term state restored.`
              : "This will undo the last term rollover."}
            {" "}This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={executeRollback} className="bg-red-600 hover:bg-red-700 text-white">
            Yes, roll back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Restore grades only confirm ── */}
    <AlertDialog open={restoreGradesConfirmOpen} onOpenChange={setRestoreGradesConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore previous student grades?</AlertDialogTitle>
          <AlertDialogDescription>
            {rollbackSnapshot?.studentUpdates?.length
              ? `This will move ${rollbackSnapshot.studentUpdates.length} student(s) back to their grade before the rollover. Academic records will not be changed.`
              : "No student grade changes found in the snapshot."}
            {" "}This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={executeRestoreGradesOnly} className="bg-amber-600 hover:bg-amber-700 text-white">
            Yes, restore grades
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Manual grade demotion dialog ── */}
    <AlertDialog open={manualDemoteOpen} onOpenChange={open => { if (!isDemoting) setManualDemoteOpen(open); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Manually demote students</AlertDialogTitle>
          <AlertDialogDescription>
            Select the grade students are currently stuck in. All active students in that grade will be moved back one grade.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-1 space-y-4">
          <div>
            <Label className="text-sm font-medium">Current (wrong) grade</Label>
            <Select value={manualDemoteFromGrade} onValueChange={setManualDemoteFromGrade}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select grade…" />
              </SelectTrigger>
              <SelectContent>
                {ALL_GRADES.filter(g => !!REVERSE_GRADE_MAP[g]).map(g => (
                  <SelectItem key={g} value={g}>{g} → {REVERSE_GRADE_MAP[g]}</SelectItem>
                ))}
                <SelectItem value="SSS 3">SSS 3 (restore graduated students)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* SSS 3 restore option */}
          <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={demoteRestoreGraduated}
              onChange={e => setDemoteRestoreGraduated(e.target.checked)}
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">Restore accidentally graduated SSS 3 students</p>
              <p className="text-xs text-slate-500 mt-0.5">Finds all SSS 3 students marked as "graduated" and sets them back to active.</p>
            </div>
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            <p className="text-xs font-semibold text-amber-800">Also delete records for the accidentally-promoted term (optional)</p>
            <p className="text-xs text-amber-700">Academic records and carry-forward fees for those students in the selected term/year will be removed.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-600">Term</Label>
                <Select value={demoteCleanupTerm} onValueChange={setDemoteCleanupTerm}>
                  <SelectTrigger className="mt-1 h-8 text-xs bg-white">
                    <SelectValue placeholder="Term…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Skip cleanup</SelectItem>
                    {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Year</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  placeholder="e.g. 2025/2026"
                  value={demoteCleanupYear}
                  onChange={e => setDemoteCleanupYear(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDemoting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={executeManualDemote}
            disabled={!manualDemoteFromGrade || isDemoting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDemoting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Demoting…</> : "Demote students"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Demote ALL grades confirm ── */}
    <AlertDialog open={demoteAllConfirmOpen} onOpenChange={open => {
      if (!isDemotingAll) {
        setDemoteAllConfirmOpen(open);
        if (open) { setDemoteAllTyped(""); setDemoteAllPreviewRows(null); loadDemoteAllPreview(); }
      }
    }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Demote all grades?</AlertDialogTitle>
          <AlertDialogDescription>
            Every active student will move back one grade. SSS 3 students are <strong>not moved</strong> (fixed bug).
            Review the table below, then type <strong>DEMOTE ALL</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-1 space-y-3">
          {/* Preview table */}
          {demoteAllPreviewRows ? (
            <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Current Grade</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Students</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Will move to</th>
                  </tr>
                </thead>
                <tbody>
                  {demoteAllPreviewRows.map(r => (
                    <tr key={r.from} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700 font-medium">{r.from}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.count}</td>
                      <td className={`px-3 py-1.5 font-medium ${!r.to ? "text-slate-400 italic" : "text-orange-700"}`}>
                        {r.to || "No change (first grade / SSS 3)"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading grade counts…
            </div>
          )}
          {/* Cleanup options */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            <p className="text-xs font-semibold text-amber-800">Also delete records for the accidentally-promoted term (optional)</p>
            <p className="text-xs text-amber-700">Academic records and carry-forward fees for ALL demoted students in the selected term/year will be removed.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-600">Term</Label>
                <Select value={demoteCleanupTerm} onValueChange={setDemoteCleanupTerm}>
                  <SelectTrigger className="mt-1 h-8 text-xs bg-white">
                    <SelectValue placeholder="Term…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Skip cleanup</SelectItem>
                    {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Year</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  placeholder="e.g. 2025/2026"
                  value={demoteCleanupYear}
                  onChange={e => setDemoteCleanupYear(e.target.value)}
                />
              </div>
            </div>
          </div>
          {/* SSS 3 restore option */}
          <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={demoteRestoreGraduated}
              onChange={e => setDemoteRestoreGraduated(e.target.checked)}
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">Restore accidentally graduated SSS 3 students</p>
              <p className="text-xs text-slate-500 mt-0.5">Finds all SSS 3 students marked as "graduated" and sets them back to active. Use this if SSS 3 vanished after a mistaken promotion.</p>
            </div>
          </label>
          {/* Typed confirmation */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Type <span className="font-mono bg-slate-100 px-1 rounded">DEMOTE ALL</span> to enable the button</Label>
            <Input
              className="mt-1 font-mono"
              placeholder="DEMOTE ALL"
              value={demoteAllTyped}
              onChange={e => setDemoteAllTyped(e.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDemotingAll}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={executeManualDemoteAll}
            disabled={isDemotingAll || demoteAllTyped.trim() !== "DEMOTE ALL"}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            {isDemotingAll ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Demoting…</> : "Yes, demote all"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Promote ALL grades confirm ── */}
    <AlertDialog open={promoteAllConfirmOpen} onOpenChange={open => {
      if (!isPromotingAll) {
        setPromoteAllConfirmOpen(open);
        if (open) { setPromoteAllTyped(""); setPromoteAllPreview(null); loadPromoteAllPreview(); }
      }
    }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Promote all grades?</AlertDialogTitle>
          <AlertDialogDescription>
            Every active student will move forward one grade. SSS 3 students are <strong>not moved</strong>.
            Review the table below, then type <strong>PROMOTE ALL</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-1 space-y-3">
          {/* Preview table */}
          {promoteAllPreview ? (
            <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Current Grade</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Students</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Will move to</th>
                  </tr>
                </thead>
                <tbody>
                  {promoteAllPreview.map(r => (
                    <tr key={r.from} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700 font-medium">{r.from}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.count}</td>
                      <td className={`px-3 py-1.5 font-medium ${r.from === r.to ? "text-slate-400 italic" : "text-blue-700"}`}>
                        {r.from === r.to ? "No change (terminal grade)" : r.to}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading grade counts…
            </div>
          )}
          {/* Typed confirmation */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Type <span className="font-mono bg-slate-100 px-1 rounded">PROMOTE ALL</span> to enable the button</Label>
            <Input
              className="mt-1 font-mono"
              placeholder="PROMOTE ALL"
              value={promoteAllTyped}
              onChange={e => setPromoteAllTyped(e.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPromotingAll}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={executePromoteAll}
            disabled={isPromotingAll || promoteAllTyped.trim() !== "PROMOTE ALL"}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
          >
            {isPromotingAll ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Promoting…</> : "Yes, promote all"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Quick delete dialog (scope-card shortcut) ── */}
    <AlertDialog open={quickDeleteOpen} onOpenChange={open => { if (!quickDeleting) setQuickDeleteOpen(open); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {nextTerm} {nextYear} records?</AlertDialogTitle>
          <AlertDialogDescription>
            {quickDeleteLoading ? "Loading counts…" : quickDeleteCounts ? (
              <>
                This will permanently delete:{" "}
                <strong>{quickDeleteCounts.records} academic records</strong> and{" "}
                <strong>{quickDeleteCounts.carryForwards} carry-forward payment entries</strong> for {nextTerm} {nextYear}.
                Regular cash/bank payments are not affected.
              </>
            ) : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={quickDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); executeQuickDelete(); }}
            disabled={quickDeleteLoading || quickDeleting || !quickDeleteCounts || (quickDeleteCounts.records === 0 && quickDeleteCounts.carryForwards === 0)}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            {quickDeleting
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Deleting…</>
              : quickDeleteCounts?.records === 0 && quickDeleteCounts?.carryForwards === 0
                ? "Nothing to delete"
                : "Yes, delete all"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Manual delete dialog ── */}
    <AlertDialog open={manualDeleteOpen} onOpenChange={open => { setManualDeleteOpen(open); if (!open) setManualDeletePreview(null); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Rollover Records</AlertDialogTitle>
          <AlertDialogDescription>
            Select the term you rolled over by mistake. This will delete all academic records and carry-forward payment entries for that term. Regular payment records and student grades are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Term</label>
              <Select value={manualDeleteTerm} onValueChange={v => { setManualDeleteTerm(v); setManualDeletePreview(null); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Academic Year</label>
              <Select value={manualDeleteYear} onValueChange={v => { setManualDeleteYear(v); setManualDeletePreview(null); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {["2023/2024","2024/2025","2025/2026","2026/2027","2027/2028"].map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualDeletePreview}
            disabled={!manualDeleteTerm || !manualDeleteYear || manualDeleteLoading}
            className="w-full"
          >
            {manualDeleteLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading preview…</>
              : "Preview what will be deleted"}
          </Button>

          {manualDeletePreview && (
            <div className={`rounded-xl border p-3 text-sm space-y-1 ${
              manualDeletePreview.records === 0 && manualDeletePreview.carryForwards === 0
                ? "border-slate-200 bg-slate-50 text-slate-500"
                : "border-red-200 bg-red-50"
            }`}>
              {manualDeletePreview.records === 0 && manualDeletePreview.carryForwards === 0 ? (
                <p>No academic records or carry-forward entries found for {manualDeleteTerm} {manualDeleteYear}.</p>
              ) : (
                <>
                  <p className="font-semibold text-red-800">The following will be permanently deleted:</p>
                  <p className="text-red-700">• {manualDeletePreview.records} academic records</p>
                  <p className="text-red-700">• {manualDeletePreview.carryForwards} carry-forward payment entries</p>
                  <p className="text-xs text-red-500 mt-1">Regular payment records (e.g. cash payments) are NOT deleted.</p>
                </>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); executeManualDelete(); }}
            disabled={!manualDeletePreview || (manualDeletePreview.records === 0 && manualDeletePreview.carryForwards === 0) || manualDeleting}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            {manualDeleting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</>
              : "Yes, delete these records"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      <PageShell maxWidth="5xl" className="py-6">
        <PageSection>
          <PageHeader
            eyebrow="Administration"
            title="School Settings"
            description="Manage academic terms, school calendar, user access, and setup controls from one workspace."
          />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all -mb-px ${
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-700 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Subjects tab */}
        {activeTab === "subjects" && <SubjectsPage embedded />}

        {/* Class Assignments tab */}
        {activeTab === "classassignments" && <ClassAssignmentsPage embedded />}

        {/* General tab */}
        {activeTab === "general" && <>
        <div className="space-y-4">

          {/* ── Horizontal section nav ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <div className="flex min-w-max">
              {[
                { id: "school",     icon: Building2,    color: "text-rose-600",    bg: "bg-rose-50",    label: "School Info",      desc: "Logo, address, stamp"     },
                { id: "term",       icon: Calendar,     color: "text-blue-600",    bg: "bg-blue-50",    label: "Academic Term",    desc: "Set current term & year"  },
                { id: "promotion",  icon: ArrowRight,   color: "text-amber-600",   bg: "bg-amber-50",   label: "Term Promotion",   desc: "Promote students"         },
                { id: "users",      icon: Shield,       color: "text-emerald-600", bg: "bg-emerald-50", label: "User Management",  desc: "Roles & invitations"      },
                { id: "appearance", icon: Palette,      color: "text-purple-600",  bg: "bg-purple-50",  label: "Appearance",       desc: "Colors & theme"           },
              ].map((s, i, arr) => (
                <button key={s.id} onClick={() => setGeneralSection(s.id)}
                  className={`relative flex items-center gap-3 px-5 py-4 text-left transition-colors flex-shrink-0
                    ${i < arr.length - 1 ? "border-r border-slate-100" : ""}
                    ${generalSection === s.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                >
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${generalSection === s.id ? "text-emerald-700" : "text-slate-800"}`}>{s.label}</div>
                    <div className="text-xs text-slate-400">{s.desc}</div>
                  </div>
                  {generalSection === s.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content panel ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* School Information */}
          {generalSection === "school" && <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">School Information</h2>
              <p className="text-sm text-slate-500 mt-0.5">Appears on certificates, ID cards, and printed documents.</p>
            </div>

            {/* Logo & Stamp uploads */}
            <div className="grid grid-cols-2 gap-6">
              {/* Logo */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">School Logo</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center gap-3 bg-slate-50 hover:border-blue-300 transition-colors">
                  {schoolLogoUrl
                    ? <img src={schoolLogoUrl} alt="Logo" className="h-20 object-contain rounded" />
                    : <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center"><ImageIcon className="w-7 h-7 text-slate-400" /></div>
                  }
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files[0], "logo")} />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                      {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadingLogo ? "Uploading..." : schoolLogoUrl ? "Change Logo" : "Upload Logo"}
                    </span>
                  </label>
                </div>
              </div>
              {/* Stamp */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">Official Stamp</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center gap-3 bg-slate-50 hover:border-blue-300 transition-colors">
                  {schoolStampUrl
                    ? <img src={schoolStampUrl} alt="Stamp" className="h-28 object-contain rounded" />
                    : <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center"><ImageIcon className="w-7 h-7 text-slate-400" /></div>
                  }
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files[0], "stamp")} />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                      {uploadingStamp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadingStamp ? "Uploading..." : schoolStampUrl ? "Change Stamp" : "Upload Stamp"}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* ── Homepage Slideshow Images ── */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">Homepage Slideshow Images</Label>
              <p className="text-xs text-slate-400 mb-3">Photos that cycle in the hero section of the school homepage. Add up to 8 images.</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {heroImages.map((url, i) => (
                  <div key={url + i} className="relative group flex-shrink-0 w-56 h-36 rounded-xl overflow-hidden bg-slate-100">
                    <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    <button
                      onClick={() => handleRemoveHeroImage(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                    <span className="absolute bottom-1.5 left-2 text-[10px] text-white/70 font-medium opacity-0 group-hover:opacity-100 transition-opacity">#{i + 1}</span>
                  </div>
                ))}
                {heroImages.length < 8 && (
                  <label className="cursor-pointer flex-shrink-0 w-56 h-36 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 bg-slate-50 flex flex-col items-center justify-center gap-1.5 transition-colors">
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingHeroImage} onChange={e => { if (e.target.files[0]) { handleHeroImageUpload(e.target.files[0]); e.target.value = ""; } }} />
                    {uploadingHeroImage
                      ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      : <Upload className="w-5 h-5 text-slate-400" />
                    }
                    <span className="text-xs text-slate-400 font-medium">{uploadingHeroImage ? "Uploading…" : "Add Photo"}</span>
                  </label>
                )}
              </div>
              {heroImages.length === 0 && (
                <p className="text-xs text-slate-400 mt-2 italic">No images yet — placeholder photos are shown until you upload some.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">School Name</Label>
                <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. Greenfield International School" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">Address</Label>
                <textarea value={schoolAddress} onChange={e => setSchoolAddress(e.target.value)} placeholder="Full school address" rows={2}
                  className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Phone</Label>
                <Input value={schoolPhone} onChange={e => setSchoolPhone(e.target.value)} placeholder="e.g. 08012345678" className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Email</Label>
                <Input type="email" value={schoolEmail} onChange={e => setSchoolEmail(e.target.value)} placeholder="school@example.com" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">Principal's Name</Label>
                <Input value={principalName} onChange={e => setPrincipalName(e.target.value)} placeholder="e.g. Mr. Adeyinka Adekoya" className="mt-1.5" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-3">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${driveConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {driveConnected ? <Cloud className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Google Drive Storage</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      One shared Drive connection for School Vault, Photo Gallery, documents, and vault exports.
                    </p>
                    <p className={`text-xs font-semibold mt-2 ${driveConnected ? "text-emerald-700" : "text-amber-700"}`}>
                      {driveConnected ? "Connected and ready to sync" : "Not connected yet"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {driveConnected ? (
                    <Button onClick={handleDisconnectDrive} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-2">
                      <CloudOff className="w-4 h-4" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button onClick={handleConnectDrive} disabled={driveConnecting || !driveClientId.trim()} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                      {driveConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                      Connect Drive
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                This uses the Google Drive Client ID already saved in Supabase. School Vault, Photo Gallery, documents, and exports will all share this one connection.
              </p>
            </div>

            <Button onClick={handleSaveSchoolInfo} disabled={isSaving || uploadingLogo || uploadingStamp} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : schoolInfoSaved ? "✓ Saved!" : "Save School Info"}
            </Button>

            {/* School Calendar — term dates & holidays */}
            <div className="pt-4 border-t border-slate-100">
              <SchoolCalendarSection />
            </div>
          </div>}

          {/* Current Term Setup */}
          {generalSection === "term" && <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Current Academic Term</h2>
              <p className="text-sm text-slate-500 mt-0.5">All records, timetables, and assessments use this term and year.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Term</Label>
                <Select value={currentTerm} onValueChange={setCurrentTerm}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map(term => <SelectItem key={term} value={term}>{term}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Academic Year</Label>
                <Input type="text" value={currentYear} onChange={(e) => setCurrentYear(e.target.value)} placeholder="e.g., 2025/2026" className="mt-1.5" />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* SMS Settings */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-0.5">SMS Settings</h3>
                <p className="text-xs text-slate-400 mb-3">Sender name on parent SMS (max 11 chars, no spaces).</p>
                <Label className="text-sm font-medium text-slate-700">SMS Sender ID</Label>
                <Input
                  type="text"
                  value={smsSenderId}
                  onChange={(e) => setSmsSenderId(e.target.value.replace(/\s/g, "").slice(0, 11))}
                  placeholder="e.g. GreenfieldSch"
                  className="mt-1.5 font-mono"
                  maxLength={11}
                />
                <p className="text-xs text-slate-400 mt-1">{smsSenderId.length}/11 characters</p>
              </div>

              {/* ALOC API */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Exam Practice (ALOC API)</h3>
                <p className="text-xs text-slate-400 mb-3">
                  Optional token from{" "}
                  <a href="https://questions.aloc.com.ng" target="_blank" rel="noreferrer" className="text-blue-500 underline">questions.aloc.com.ng</a>{" "}
                  for unlimited JAMB/WAEC questions.
                </p>
                <Label className="text-sm font-medium text-slate-700">ALOC Access Token</Label>
                <Input
                  type="text"
                  value={alocApiToken}
                  onChange={(e) => setAlocApiToken(e.target.value.trim())}
                  placeholder="Paste your token here..."
                  className="mt-1.5 font-mono text-xs"
                />
              </div>

              {/* Flutterwave Online Payments */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-0.5">Online Fee Payment</h3>
                <p className="text-xs text-slate-400 mb-3">
                  Flutterwave public key so students can pay fees online.{" "}
                  <a href="https://dashboard.flutterwave.com/dashboard/settings/apis" target="_blank" rel="noreferrer" className="text-blue-500 underline">Get key</a>
                </p>
                <Label className="text-sm font-medium text-slate-700">Flutterwave Public Key</Label>
                <Input
                  type="text"
                  value={flutterwavePublicKey}
                  onChange={(e) => setFlutterwavePublicKey(e.target.value.trim())}
                  placeholder="FLWPUBK_TEST-..."
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : saved ? "✓ Saved!" : "Save Settings"}
            </Button>
          </div>}

          {generalSection === "promotion" && <div className="p-4 space-y-3">
            <div className="space-y-3">
              {/* Scope */}
              <Card className="border-slate-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Rollover Scope</p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-900">
                        {currentTerm} {currentYear} → {nextTerm} {nextYear}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {currentTerm === "Third Term" ? "Students move to their next grade." : "Students stay in same grade, new term records open."}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        {currentTerm === "Third Term" ? "Promotion rollover" : "Same-grade rollover"}
                      </Badge>
                      <button onClick={() => { loadRolloverReadiness(); loadLatestRollbackableRollover(); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                        <ArrowRight className="w-3 h-3 rotate-[-45deg]" /> Refresh
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Active students</p>
                      <p className="text-xl font-bold text-slate-900">{rolloverReadiness?.activeStudents ?? "-"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Students with arrears</p>
                      <p className="text-xl font-bold text-slate-900">{rolloverReadiness?.arrearsStudents ?? "-"}</p>
                      <p className="text-xs text-slate-400">{formatMoney(rolloverReadiness?.arrearsTotal || 0)} outstanding</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">{nextTerm} data already there</p>
                      <p className="text-xl font-bold text-slate-900">{(rolloverReadiness?.targetRecords || 0) + (rolloverReadiness?.targetTimetableSlots || 0)}</p>
                      <p className="text-xs text-slate-400">{rolloverReadiness?.targetRecords || 0} records, {rolloverReadiness?.targetTimetableSlots || 0} timetable slots</p>
                      {(rolloverReadiness?.targetRecords || 0) > 0 && (
                        <button onClick={openQuickDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold mt-1">
                          <Trash2 className="w-3 h-3" /> Delete these records
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Options */}
              <Card className="border-slate-200">
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Rollover options</p>
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={rolloverOptions.carryForwardArrears} onChange={(e) => setRolloverOptions((prev) => ({ ...prev, carryForwardArrears: e.target.checked }))} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Carry forward unpaid balances</p>
                      <p className="text-xs text-slate-500">Opens arrears entries in {nextTerm} {nextYear} for students who still owe.</p>
                    </div>
                  </label>
                  {rolloverOptions.carryForwardArrears && (
                    <div className="rounded-lg border border-slate-200 px-3 py-3 bg-slate-50/70 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">If carry-forward rows already exist</p>
                      <Select
                        value={rolloverOptions.carryForwardMode || "keep_existing"}
                        onValueChange={(value) => setRolloverOptions((prev) => ({ ...prev, carryForwardMode: value }))}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keep_existing">Keep existing rows and add only missing students</SelectItem>
                          <SelectItem value="replace_existing">Replace existing rows with recalculated balances</SelectItem>
                          <SelectItem value="clean_target_only">Only proceed if the target term is clean</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {rolloverOptions.carryForwardMode === "replace_existing"
                          ? "Existing carried-forward arrears from this source term will be deleted and recreated using the latest balances."
                          : rolloverOptions.carryForwardMode === "clean_target_only"
                            ? "No arrears will be transferred if the target term already has carry-forward rows from this source term."
                            : "Existing carried-forward arrears stay untouched. Only missing students get new carry-forward rows."}
                      </p>
                    </div>
                  )}
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={rolloverOptions.clearTargetTimetable} onChange={(e) => setRolloverOptions((prev) => ({ ...prev, clearTargetTimetable: e.target.checked }))} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Clear next term timetable</p>
                      <p className="text-xs text-slate-500">Removes existing unblocked slots in {nextTerm} {nextYear} before rolling over.</p>
                    </div>
                  </label>
                  {currentTerm === "Third Term" && (
                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={rolloverOptions.graduateFinalClass} onChange={(e) => setRolloverOptions((prev) => ({ ...prev, graduateFinalClass: e.target.checked }))} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">Mark SSS 3 students as graduated</p>
                        <p className="text-xs text-slate-500">Only when final-year students should not roll into the next session.</p>
                      </div>
                    </label>
                  )}
                </CardContent>
              </Card>

              {/* Undo Rollover */}
              <Card className="border-red-100 bg-red-50/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">Undo Rollover</p>
                      <p className="text-sm font-semibold text-slate-900">Rolled over by mistake?</p>
                    </div>
                    {loadingRollbackInfo && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {latestRollbackableRollover?.details?.snapshot ? (
                        <>
                          <p className="text-sm font-medium text-slate-900">
                            {latestRollbackableRollover.details.snapshot.previousTerm} {latestRollbackableRollover.details.snapshot.previousYear} → {latestRollbackableRollover.details.snapshot.nextTerm} {latestRollbackableRollover.details.snapshot.nextYear}
                          </p>
                          <p className="text-xs text-slate-500">
                            {latestRollbackableRollover.details.snapshot.createdAcademicRecordIds?.length || 0} records · {latestRollbackableRollover.details.snapshot.createdPaymentIds?.length || 0} carry-forwards · {latestRollbackableRollover.details.snapshot.clearedTimetableSlots?.length || 0} timetable slots
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">No snapshot available</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRollbackLastRollover} disabled={isRollingBack || isRestoringGrades || !latestRollbackableRollover?.details?.snapshot} className="border-amber-300 text-amber-700 hover:bg-amber-100 whitespace-nowrap flex-shrink-0">
                      {isRollingBack ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Rolling back…</> : "Full Rollback"}
                    </Button>
                  </div>
                  {(latestRollbackableRollover?.details?.snapshot?.studentUpdates?.length > 0) && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-slate-600">Restore <strong>only grades</strong> (if records were already deleted).</p>
                      <Button variant="outline" size="sm" onClick={() => setRestoreGradesConfirmOpen(true)} disabled={isRollingBack || isRestoringGrades} className="border-amber-300 text-amber-700 hover:bg-amber-100 whitespace-nowrap flex-shrink-0">
                        {isRestoringGrades ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Restoring…</> : `Restore Grades (${latestRollbackableRollover.details.snapshot.studentUpdates.length})`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" /> Always preview first — nothing changes until you confirm.</p>

              {rolloverProgress.visible && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Rollover progress</p>
                      <p className="text-sm text-blue-700 mt-1">{rolloverProgress.label}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-700">{rolloverProgress.value}%</span>
                  </div>
                  <Progress value={rolloverProgress.value} className="h-2.5 bg-blue-100 [&>div]:bg-blue-600" />
                </div>
              )}


              <Button
                onClick={handlePreviewTransfer}
                disabled={isTransferring}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isTransferring
                  ? rolloverProgress.visible
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running rollover...</>
                    : <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading Preview...</>
                  : currentTerm === "Third Term"
                    ? `Preview Promotion to ${nextTerm} ${nextYear}`
                    : `Preview Transfer to ${nextTerm} ${nextYear}`
                }
              </Button>

              {transferResult && (
                <Alert className={transferResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                  {transferResult.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                  <AlertDescription className={`text-sm ${transferResult.success ? "text-green-700" : "text-red-700"}`}>
                    {transferResult.success
                      ? transferResult.rollback
                        ? `Rollback complete. ${transferResult.rollbackDeletedRecords || 0} rollover records removed, ${transferResult.rollbackDeletedPayments || 0} carry-forward payments removed, and ${transferResult.rollbackRestoredSlots || 0} timetable slots restored.`
                        : `${transferResult.isPromotion ? `${transferResult.studentsProcessed} students promoted` : `${transferResult.studentsProcessed} students carried forward`} into ${transferResult.toTerm || nextTerm} ${transferResult.toYear || nextYear}. ${transferResult.recordsCreated} academic records created. ${transferResult.arrearsCreated || 0} arrears entries created. ${transferResult.timetableCleared || 0} timetable slots cleared.${transferResult.graduatesProcessed ? ` ${transferResult.graduatesProcessed} final-year students marked as graduated.` : ""}`
                      : `Error: ${transferResult.error}`}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>}
          {generalSection === "users" && ["super_admin", "admin"].includes(currentUser?.school_role) && (
            <div className="p-4 space-y-4" ref={el => { if (el && umUsers.length === 0) loadUmUsers(); }}>
              {/* Invite row */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Email address" value={umInviteEmail} onChange={e => setUmInviteEmail(e.target.value)} className="pl-9 h-9" />
                </div>
                <Select value={umInviteRole} onValueChange={setUmInviteRole}>
                  <SelectTrigger className="w-full sm:w-32 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleUmInvite} disabled={umInviting || !umInviteEmail.trim()} size="sm" className="bg-blue-600 hover:bg-blue-700 h-9">
                  {umInviting ? "Sending..." : <><UserPlus className="w-4 h-4 mr-1" />Invite</>}
                </Button>
              </div>
              {umInviteMsg && <p className={`text-xs ${umInviteMsg.startsWith("Failed") ? "text-red-600" : "text-emerald-600"}`}>{umInviteMsg}</p>}

              {/* Users list */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">All Users {umUsers.length > 0 && `(${umUsers.length})`}</p>
                <button onClick={loadUmUsers} className="text-xs text-slate-400 hover:text-slate-600">Refresh</button>
              </div>
              {umLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : (
                <div className="space-y-1.5">
                  {umUsers.map(u => {
                    const isMe = currentUser?.id === u.id;
                    const isConfirming = umConfirmDeleteId === u.id;
                    return (
                      <div key={u.id} className={`rounded-lg border px-3 py-2 ${isConfirming ? "border-red-300 bg-red-50" : "border-slate-100 bg-slate-50/50"}`}>
                        {isConfirming ? (
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="text-sm">Delete <strong>{u.full_name || u.email}</strong>?</span>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => { setUmConfirmDeleteId(null); setUmDeleteError(""); }} disabled={umDeleting} className="h-7 text-xs">Cancel</Button>
                              <Button size="sm" onClick={() => handleUmDeleteUser(u.id)} disabled={umDeleting} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">{umDeleting ? "…" : "Delete"}</Button>
                            </div>
                            {umDeleteError && <p className="w-full text-xs text-red-600">{umDeleteError}</p>}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{u.full_name || "—"}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isMe && (isSuperAdmin || !["super_admin", "admin"].includes(u.school_role)) && (
                                <Select value={u.school_role || "student"} onValueChange={val => handleUmRoleChange(u.id, val)}>
                                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{umRoleOptions.map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
                                </Select>
                              )}
                              {isMe && <Badge className={ROLE_COLORS[u.school_role] || "bg-slate-100 text-slate-700"}>{u.school_role || "unassigned"}</Badge>}
                              {isSuperAdmin && !isMe && (
                                <button onClick={() => setUmConfirmDeleteId(u.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete user">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {umUsers.length === 0 && !umLoading && <p className="text-sm text-slate-400 text-center py-4">No users found.</p>}
                </div>
              )}
            </div>
          )}

          {/* ── Appearance ───────────────────────────────────────────── */}
          {generalSection === "appearance" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Appearance</h2>
                <p className="text-sm text-slate-500 mt-0.5">Choose a color theme for the entire app. Changes apply instantly.</p>
              </div>

              {/* Palette grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Object.entries(PALETTES).map(([key, palette]) => {
                  const isActive = selectedTheme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedTheme(key);
                        setThemeSaved(false);
                        applyTheme(key, key === "custom" ? customHex : undefined);
                        saveSchoolSettings({ theme_color: key, theme_custom_hex: key === "custom" ? customHex : savedThemeCustomHex });
                      }}
                      className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? "border-emerald-500 bg-emerald-50 shadow-md"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      {/* Color strip */}
                      <div className="flex gap-1 w-full">
                        {palette.preview.map((c, i) => (
                          <div
                            key={i}
                            className="flex-1 h-8 rounded-md"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="w-full">
                        <p className="text-sm font-semibold text-slate-800">{palette.name}</p>
                        <p className="text-xs text-slate-400">{palette.description}</p>
                      </div>
                      {isActive && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Custom color tile */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTheme("custom");
                    setThemeSaved(false);
                    applyTheme("custom", customHex);
                    saveSchoolSettings({ theme_color: "custom", theme_custom_hex: customHex });
                  }}
                  className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                    selectedTheme === "custom"
                      ? "border-emerald-500 bg-emerald-50 shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  {/* Gradient strip */}
                  <div
                    className="w-full h-8 rounded-md"
                    style={{ background: `linear-gradient(135deg, ${customHex}44, ${customHex})` }}
                  />
                  <div className="w-full">
                    <p className="text-sm font-semibold text-slate-800">Custom</p>
                    <p className="text-xs text-slate-400">Pick any color</p>
                  </div>
                  {selectedTheme === "custom" && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              </div>

              {/* Custom color picker — shown when Custom tile is selected */}
              {selectedTheme === "custom" && (
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="relative">
                    <input
                      type="color"
                      value={customHex}
                      onChange={(e) => {
                        setCustomHex(e.target.value);
                        setThemeSaved(false);
                        applyTheme("custom", e.target.value);
                        saveSchoolSettings({ theme_color: "custom", theme_custom_hex: e.target.value });
                      }}
                      className="w-12 h-12 rounded-xl border-2 border-slate-300 cursor-pointer p-0.5 bg-white"
                      title="Pick a color"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Custom color</p>
                    <p className="text-xs text-slate-500">
                      Selected: <span className="font-mono font-bold">{customHex}</span> — shades are generated automatically
                    </p>
                  </div>
                </div>
              )}

              {/* Live preview bar */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-emerald-600 px-4 py-3 flex items-center justify-between">
                  <span className="text-white text-sm font-semibold">Preview — Header & Buttons</span>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-white/40" />
                    <div className="w-2 h-2 rounded-full bg-white/60" />
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                </div>
                <div className="bg-white p-4 flex flex-wrap gap-3 items-center">
                  <button type="button" className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700">
                    Primary Button
                  </button>
                  <button type="button" className="px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-lg border border-emerald-200 hover:bg-emerald-100">
                    Secondary
                  </button>
                  <span className="text-emerald-600 text-sm font-semibold">Active Link</span>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Badge
                  </div>
                  <div className="h-1 flex-1 bg-emerald-100 rounded-full overflow-hidden min-w-[60px]">
                    <div className="h-full w-2/3 bg-emerald-500 rounded-full" />
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Theme is saved in your browser. It will be remembered the next time you open the app on this device.
              </p>
            </div>
          )}

          </div>{/* end right panel */}
        </div>{/* end two-panel grid */}
        </>}
        </PageSection>
      </PageShell>

      {showPromotionPreview && promotionPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">
                  {promotionPreview.isPromotion ? "Promotion Preview" : "Term Rollover Preview"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Moving to {promotionPreview.nextTerm} {promotionPreview.nextYear} - review before confirming
                </p>
              </div>
              <button onClick={() => setShowPromotionPreview(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-lg leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {promotionWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    {promotionWarnings.map((w, i) => (
                      <p key={i} className="text-sm text-amber-800">{w}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Carry forward arrears</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{rolloverOptions.carryForwardArrears ? "Yes" : "No"}</p>
                  {rolloverOptions.carryForwardArrears && (
                    <p className="mt-1 text-xs text-slate-500">
                      {rolloverOptions.carryForwardMode === "replace_existing"
                        ? "Replace existing rows"
                        : rolloverOptions.carryForwardMode === "clean_target_only"
                          ? "Only if target is clean"
                          : "Add only missing students"}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Clear next timetable</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{rolloverOptions.clearTargetTimetable ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Graduate SSS 3</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{currentTerm === "Third Term" ? (rolloverOptions.graduateFinalClass ? "Yes" : "No") : "Not applicable"}</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-600 font-semibold">Student</th>
                    <th className="text-left py-2 px-3 text-slate-600 font-semibold">Current Class</th>
                    <th className="text-left py-2 px-3 text-slate-600 font-semibold">Next Class</th>
                    <th className="text-center py-2 px-3 text-slate-600 font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {promotionPreview.rows.map(({ student, currentGrade, nextGrade, willChange }) => (
                    <tr key={student.id} className="border-b border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-900">{student.first_name} {student.last_name}</td>
                      <td className="py-2 px-3 text-slate-600">{currentGrade}</td>
                      <td className="py-2 px-3 text-slate-600">{nextGrade}</td>
                      <td className="py-2 px-3 text-center">
                        {willChange
                          ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Promoted</span>
                          : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Same class</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowPromotionPreview(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => { setShowPromotionPreview(false); handleTransfer(); }}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
              >
                Confirm and execute rollover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
