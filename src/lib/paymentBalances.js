import { supabase } from "@/api/supabaseClient";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { isFeeGroupEffectiveForTerm, normalizeFeeGroup } from "@/lib/feeGroups";
import { getLagosDateString } from "@/lib/timezone";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";

export const MANUAL_OPENING_PAID_TAG = "[opening_paid_before_app]";
const PAYMENT_DISCOUNT_STORAGE_KEY = "payment_discounts";
const PAYMENT_DISCOUNT_REGISTRY_TYPE = "payment_discount_registry";
const PAYMENT_DISCOUNT_REGISTRY_ID = "global";
const STUDENT_START_TERM_STORAGE_KEY = "student_start_terms";
const STUDENT_START_TERM_REGISTRY_TYPE = "student_start_term_registry";
const STUDENT_START_TERM_REGISTRY_ID = "global";
const STUDENT_START_TERM_REGISTRY_VERSION = 2;
const STUDENT_FEE_GROUP_STORAGE_KEY = "student_fee_groups";
const STUDENT_FEE_GROUP_REGISTRY_TYPE = "student_fee_group_registry";
const STUDENT_FEE_GROUP_REGISTRY_ID = "global";
export const DEFAULT_STUDENT_START_TERM = "Second Term";
const TERM_ORDER = {
  "First Term": 1,
  "Second Term": 2,
  "Third Term": 3,
};

export function makePaymentDiscountKey(studentId, term, academicYear) {
  return [studentId, term || "", academicYear || ""].join("__");
}

export function getPaymentDiscountPct(discounts = {}, studentId, term, academicYear) {
  if (!studentId) return 0;
  const scopedKey = makePaymentDiscountKey(studentId, term, academicYear);
  return Math.max(0, Math.min(100, Number(discounts?.[scopedKey]) || 0));
}

export function isManualOpeningPaid(payment) {
  return typeof payment?.notes === "string" && payment.notes.includes(MANUAL_OPENING_PAID_TAG);
}

export function normalizeTermName(term) {
  const value = String(term || "").trim().toLowerCase();
  if (value.startsWith("first")) return "First Term";
  if (value.startsWith("second")) return "Second Term";
  if (value.startsWith("third")) return "Third Term";
  return "";
}

export function compareTermScopes(aTerm, aAcademicYear, bTerm, bAcademicYear) {
  const aYearStart = Number(String(aAcademicYear || "").split("/")[0]) || 0;
  const bYearStart = Number(String(bAcademicYear || "").split("/")[0]) || 0;
  if (aYearStart !== bYearStart) return aYearStart - bYearStart;
  return (TERM_ORDER[normalizeTermName(aTerm)] || 0) - (TERM_ORDER[normalizeTermName(bTerm)] || 0);
}

function sanitizePaymentDiscounts(discounts) {
  if (!discounts || typeof discounts !== "object") return {};

  return Object.entries(discounts).reduce((acc, [key, rawPct]) => {
    const pct = Math.max(0, Math.min(100, Number(rawPct) || 0));
    if (key && pct > 0) acc[key] = pct;
    return acc;
  }, {});
}

function sanitizeStudentStartTerms(records) {
  if (!records || typeof records !== "object") return {};

  return Object.entries(records).reduce((acc, [studentId, raw]) => {
    const term = normalizeTermName(raw?.term || raw?.start_term);
    const academicYear = String(raw?.academic_year || raw?.academicYear || raw?.start_academic_year || "").trim();
    if (studentId && term && academicYear) {
      acc[studentId] = { term, academic_year: academicYear };
    }
    return acc;
  }, {});
}

function sanitizeStudentFeeGroups(records) {
  if (!records || typeof records !== "object") return {};

  return Object.entries(records).reduce((acc, [studentId, raw]) => {
    const feeGroup = normalizeFeeGroup(raw?.fee_group || raw?.feeGroup || raw);
    if (studentId && feeGroup !== "standard") {
      acc[studentId] = feeGroup;
    }
    return acc;
  }, {});
}

function migrateStartTermsToSecondTermDefault(records) {
  const cleanRecords = sanitizeStudentStartTerms(records);
  let changed = false;
  const migrated = Object.entries(cleanRecords).reduce((acc, [studentId, record]) => {
    if (record.term === "Third Term") {
      changed = true;
      acc[studentId] = { ...record, term: DEFAULT_STUDENT_START_TERM };
    } else {
      acc[studentId] = record;
    }
    return acc;
  }, {});

  return { records: migrated, changed };
}

function readLocalPaymentDiscounts() {
  try {
    return sanitizePaymentDiscounts(
      JSON.parse(localStorage.getItem(PAYMENT_DISCOUNT_STORAGE_KEY) || "{}")
    );
  } catch {
    return {};
  }
}

function writeLocalPaymentDiscounts(discounts) {
  try {
    localStorage.setItem(PAYMENT_DISCOUNT_STORAGE_KEY, JSON.stringify(sanitizePaymentDiscounts(discounts)));
  } catch {}
}

function readLocalStudentStartTerms() {
  try {
    return sanitizeStudentStartTerms(
      JSON.parse(localStorage.getItem(STUDENT_START_TERM_STORAGE_KEY) || "{}")
    );
  } catch {
    return {};
  }
}

function writeLocalStudentStartTerms(records) {
  try {
    localStorage.setItem(STUDENT_START_TERM_STORAGE_KEY, JSON.stringify(sanitizeStudentStartTerms(records)));
  } catch {}
}

function readLocalStudentFeeGroups() {
  try {
    return sanitizeStudentFeeGroups(
      JSON.parse(localStorage.getItem(STUDENT_FEE_GROUP_STORAGE_KEY) || "{}")
    );
  } catch {
    return {};
  }
}

function writeLocalStudentFeeGroups(records) {
  try {
    localStorage.setItem(STUDENT_FEE_GROUP_STORAGE_KEY, JSON.stringify(sanitizeStudentFeeGroups(records)));
  } catch {}
}

async function loadPaymentDiscountRegistry() {
  try {
    const { data } = await supabase
      .from("audit_logs")
      .select("details")
      .eq("entity_type", PAYMENT_DISCOUNT_REGISTRY_TYPE)
      .eq("entity_id", PAYMENT_DISCOUNT_REGISTRY_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.details && typeof data.details === "object") {
      const discounts = sanitizePaymentDiscounts(
        data.details.discounts || data.details.payment_discounts || {}
      );
      return { found: true, discounts };
    }
  } catch {}

  return { found: false, discounts: {} };
}

async function loadStudentFeeGroupRegistry() {
  try {
    const { data } = await supabase
      .from("audit_logs")
      .select("details")
      .eq("entity_type", STUDENT_FEE_GROUP_REGISTRY_TYPE)
      .eq("entity_id", STUDENT_FEE_GROUP_REGISTRY_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.details && typeof data.details === "object") {
      const records = sanitizeStudentFeeGroups(data.details.student_fee_groups || data.details.records || {});
      return { found: true, records };
    }
  } catch {}

  return { found: false, records: {} };
}

async function loadDiscountsFromAuditHistory() {
  try {
    const { data } = await supabase
      .from("audit_logs")
      .select("entity_id, details, created_at")
      .eq("entity_type", "student_discount")
      .order("created_at", { ascending: false })
      .limit(500);

    const discountMap = {};
    for (const row of data || []) {
      const studentId = row?.details?.student_id || row?.entity_id;
      const scopedKey = makePaymentDiscountKey(
        studentId,
        row?.details?.term,
        row?.details?.academic_year
      );
      if (!studentId || !row?.details?.term || !row?.details?.academic_year || Object.prototype.hasOwnProperty.call(discountMap, scopedKey)) continue;
      discountMap[scopedKey] = Math.max(
        0,
        Math.min(100, Number(row?.details?.new_discount_pct) || 0)
      );
    }

    return sanitizePaymentDiscounts(discountMap);
  } catch {
    return {};
  }
}

export async function savePaymentDiscounts(
  discounts,
  { performedBy = "system", summary = "Payment discount registry updated." } = {}
) {
  const cleanDiscounts = sanitizePaymentDiscounts(discounts);

  // Primary global store: school_settings.payment_discounts (reliable, shared across devices)
  await saveSchoolSetting("payment_discounts", cleanDiscounts);

  // Secondary: audit_logs registry (for history/audit trail)
  try {
    await supabase.from("audit_logs").insert({
      action: "updated",
      entity_type: PAYMENT_DISCOUNT_REGISTRY_TYPE,
      entity_id: PAYMENT_DISCOUNT_REGISTRY_ID,
      performed_by: performedBy,
      summary,
      details: {
        module: "payments",
        discounts: cleanDiscounts,
        count: Object.keys(cleanDiscounts).length,
      },
    });
  } catch {}

  writeLocalPaymentDiscounts(cleanDiscounts);
  return cleanDiscounts;
}

export async function loadPaymentDiscounts() {
  // 1. Check audit_logs registry first (most recent intentional save)
  const registry = await loadPaymentDiscountRegistry();
  if (registry.found) {
    writeLocalPaymentDiscounts(registry.discounts);
    return registry.discounts;
  }

  // 2. Check school_settings.payment_discounts (global, reliable)
  const settingsDiscounts = sanitizePaymentDiscounts(
    await loadSchoolSetting("payment_discounts", {})
  );
  if (Object.keys(settingsDiscounts).length > 0) {
    // Back-fill audit_logs registry and localStorage
    await savePaymentDiscounts(settingsDiscounts, {
      performedBy: "system",
      summary: "Payment discounts loaded from school settings.",
    });
    return settingsDiscounts;
  }

  // 3. Rebuild from individual student_discount audit log entries
  const historyDiscounts = await loadDiscountsFromAuditHistory();
  if (Object.keys(historyDiscounts).length > 0) {
    await savePaymentDiscounts(historyDiscounts, {
      performedBy: "system",
      summary: "Payment discounts rebuilt from audit history.",
    });
    return historyDiscounts;
  }

  // 4. Last resort: migrate from localStorage (this PC only — will sync to Supabase)
  const localDiscounts = readLocalPaymentDiscounts();
  if (Object.keys(localDiscounts).length > 0) {
    await savePaymentDiscounts(localDiscounts, {
      performedBy: "system",
      summary: "Payment discounts migrated from browser storage.",
    });
    return localDiscounts;
  }

  return {};
}

export async function loadStudentStartTerms() {
  try {
    const { data } = await supabase
      .from("audit_logs")
      .select("details")
      .eq("entity_type", STUDENT_START_TERM_REGISTRY_TYPE)
      .eq("entity_id", STUDENT_START_TERM_REGISTRY_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.details && typeof data.details === "object") {
      const records = sanitizeStudentStartTerms(data.details.student_start_terms || data.details.records || {});
      if (data.details.default_start_term_version !== STUDENT_START_TERM_REGISTRY_VERSION) {
        const migrated = migrateStartTermsToSecondTermDefault(records);
        if (migrated.changed) {
          await saveStudentStartTerms(migrated.records, {
            performedBy: "system",
            summary: "Student start-term defaults reset to Second Term.",
          });
          return migrated.records;
        }
      }
      writeLocalStudentStartTerms(records);
      return records;
    }
  } catch {}

  const localRecords = readLocalStudentStartTerms();
  const migrated = migrateStartTermsToSecondTermDefault(localRecords);
  if (migrated.changed) {
    await saveStudentStartTerms(migrated.records, {
      performedBy: "system",
      summary: "Student start-term defaults reset to Second Term.",
    });
    return migrated.records;
  }
  return localRecords;
}

export async function saveStudentStartTerms(
  records,
  { performedBy = "system", summary = "Student start-term registry updated." } = {}
) {
  const cleanRecords = sanitizeStudentStartTerms(records);
  try {
    await supabase.from("audit_logs").insert({
      action: "updated",
      entity_type: STUDENT_START_TERM_REGISTRY_TYPE,
      entity_id: STUDENT_START_TERM_REGISTRY_ID,
      performed_by: performedBy,
      summary,
      details: {
        module: "students",
        student_start_terms: cleanRecords,
        default_start_term_version: STUDENT_START_TERM_REGISTRY_VERSION,
        count: Object.keys(cleanRecords).length,
      },
    });
  } catch (error) {
    console.warn("Student start-term registry save skipped:", error);
  }
  writeLocalStudentStartTerms(cleanRecords);
  return cleanRecords;
}

export async function saveStudentStartTerm(
  studentId,
  term,
  academicYear,
  { performedBy = "system", summary } = {}
) {
  if (!studentId) return {};
  const normalizedTerm = normalizeTermName(term);
  const normalizedYear = String(academicYear || "").trim();

  if (normalizedTerm && normalizedYear) {
    try {
      const { error } = await supabase
        .from("students")
        .update({ start_term: normalizedTerm, start_academic_year: normalizedYear })
        .eq("id", studentId);
      if (error) {
        console.warn("Student start-term column update skipped:", error);
      }
    } catch (error) {
      console.warn("Student start-term column update skipped:", error);
    }
  }

  const current = readLocalStudentStartTerms();
  const next = { ...current };
  if (normalizedTerm && normalizedYear) {
    next[studentId] = { term: normalizedTerm, academic_year: normalizedYear };
  } else {
    delete next[studentId];
  }

  return saveStudentStartTerms(next, {
    performedBy,
    summary: summary || "Student start term updated.",
  });
}

export async function loadStudentFeeGroups() {
  const registry = await loadStudentFeeGroupRegistry();
  if (registry.found) {
    writeLocalStudentFeeGroups(registry.records);
    return registry.records;
  }

  return readLocalStudentFeeGroups();
}

export async function saveStudentFeeGroups(
  records,
  { performedBy = "system", summary = "Student fee-group registry updated." } = {}
) {
  const cleanRecords = sanitizeStudentFeeGroups(records);

  try {
    await supabase.from("audit_logs").insert({
      action: "updated",
      entity_type: STUDENT_FEE_GROUP_REGISTRY_TYPE,
      entity_id: STUDENT_FEE_GROUP_REGISTRY_ID,
      performed_by: performedBy,
      summary,
      details: {
        module: "payments",
        student_fee_groups: cleanRecords,
        count: Object.keys(cleanRecords).length,
      },
    });
  } catch (error) {
    console.warn("Student fee-group registry save skipped:", error);
  }

  writeLocalStudentFeeGroups(cleanRecords);
  return cleanRecords;
}

export async function saveStudentFeeGroup(
  studentId,
  feeGroup,
  { performedBy = "system", summary } = {}
) {
  if (!studentId) return {};
  const normalizedFeeGroup = normalizeFeeGroup(feeGroup);

  try {
    const { error } = await supabase
      .from("students")
      .update({ fee_group: normalizedFeeGroup })
      .eq("id", studentId);
    if (error) {
      console.warn("Student fee_group column update skipped:", error);
    }
  } catch (error) {
    console.warn("Student fee_group column update skipped:", error);
  }

  const current = await loadStudentFeeGroups().catch(() => readLocalStudentFeeGroups());
  const next = { ...current };
  if (normalizedFeeGroup === "standard") {
    delete next[studentId];
  } else {
    next[studentId] = normalizedFeeGroup;
  }

  return saveStudentFeeGroups(next, {
    performedBy,
    summary: summary || "Student fee group updated.",
  });
}

export function applyStudentFeeGroups(students = [], records = {}) {
  const cleanRecords = sanitizeStudentFeeGroups(records);
  return (students || []).map((student) => ({
    ...student,
    fee_group: normalizeFeeGroup(student?.fee_group || cleanRecords?.[student?.id]),
  }));
}

function isPaidLike(payment) {
  return payment?.payment_status === "paid" || payment?.payment_status === "partial";
}

function parseCarryForwardSource(note) {
  const match = String(note || "").match(
    /Arrears carried forward from (First|Second|Third) Term (\d{4}\/\d{4})/i
  );

  if (!match) return null;

  const termPrefix = `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  return {
    term: `${termPrefix} Term`,
    academicYear: match[2],
  };
}

export function getStudentStartTerm(student, startTermRecords = {}) {
  const fromRegistry = startTermRecords?.[student?.id];
  const term = normalizeTermName(student?.start_term || fromRegistry?.term);
  const academicYear = String(
    student?.start_academic_year ||
    fromRegistry?.academic_year ||
    fromRegistry?.academicYear ||
    ""
  ).trim();

  if (!term || !academicYear) return null;
  return { term, academic_year: academicYear };
}

export function isStudentActiveForTerm(student, term, academicYear, startTermRecords = {}) {
  if (!student?.id) return false;
  const start = getStudentStartTerm(student, startTermRecords);
  if (!term || !academicYear) return true;
  const effectiveStart = start || { term: DEFAULT_STUDENT_START_TERM, academic_year: academicYear };
  return compareTermScopes(term, academicYear, effectiveStart.term, effectiveStart.academic_year) >= 0;
}

export function getStudentArrearsTotal({
  student,
  payments = [],
  term,
  academicYear,
  startTermRecords = {},
} = {}) {
  if (!student?.id) return 0;

  // Carry-forward payments created during term rollover are stored with
  // "Arrears carried forward from …" in their notes. We use the stored
  // amount directly — no re-derivation against source-term fees — so that
  // term-by-term fee differences never distort the carried balance.
  const scopedArrearsPayments = payments.filter((payment) => {
    if (
      payment.student_id !== student.id ||
      payment.term !== term ||
      payment.academic_year !== academicYear ||
      !String(payment.notes || "").toLowerCase().includes("arrears")
    ) {
      return false;
    }

    const source = parseCarryForwardSource(payment.notes);
    if (!source) return true;

    return isStudentActiveForTerm(
      student,
      source.term,
      source.academicYear,
      startTermRecords
    );
  });

  return scopedArrearsPayments.reduce((sum, payment) => {
    const amount = Number(payment.amount) || 0;
    return amount > 0 ? sum + amount : sum;
  }, 0);
}

export function getStudentTotalPaidForTerm(studentId, payments = [], term, academicYear) {
  return payments
    .filter(
      (payment) =>
        payment.student_id === studentId &&
        payment.term === term &&
        payment.academic_year === academicYear &&
        isPaidLike(payment)
    )
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

export async function loadPaymentDiscountsLegacy() {
  try {
    const { data } = await supabase
      .from("school_settings")
      .select("payment_discounts")
      .limit(1)
      .maybeSingle();

    if (data?.payment_discounts && typeof data.payment_discounts === "object") {
      try {
        localStorage.setItem("payment_discounts", JSON.stringify(data.payment_discounts));
      } catch {}
      return data.payment_discounts;
    }
  } catch {}

  try {
    return JSON.parse(localStorage.getItem("payment_discounts") || "{}");
  } catch {
    return {};
  }
}

export function buildStudentBalanceRows({
  students = [],
  payments = [],
  classFees = [],
  term,
  academicYear,
  grade = "all",
  discounts = {},
  startTermRecords = {},
  includeFeeGroups,
} = {}) {
  const shouldIncludeFeeGroups =
    typeof includeFeeGroups === "boolean"
      ? includeFeeGroups
      : isFeeGroupEffectiveForTerm(term, academicYear);

  const activeStudents = students.filter(
    (student) =>
      student.enrollment_status === "active" &&
      (grade === "all" || !grade || student.grade === grade) &&
      isStudentActiveForTerm(student, term, academicYear, startTermRecords)
  );

  const scopedPayments = payments.filter(
    (payment) =>
      (!term || payment.term === term) &&
      (!academicYear || payment.academic_year === academicYear)
  );

  return activeStudents.map((student) => {
    const studentPayments = scopedPayments.filter((payment) => payment.student_id === student.id);
    const paidPayments = studentPayments.filter(isPaidLike);
    const totalPaid = paidPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const manualOpeningPaid = paidPayments
      .filter((payment) => isManualOpeningPaid(payment))
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const arrearsTotal = getStudentArrearsTotal({
      student,
      payments,
      term,
      academicYear,
      startTermRecords,
    });

    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees,
      term,
      academicYear,
      discountPct: getPaymentDiscountPct(discounts, student.id, term, academicYear),
      includeFeeGroups: shouldIncludeFeeGroups,
    });

    const totalFees = Number(feeSnapshot.totalWithoutArrears || 0) + arrearsTotal;
    const balance = Math.max(0, totalFees - totalPaid);

    return {
      student,
      totalPaid,
      manualOpeningPaid,
      appRecordedPaid: Math.max(0, totalPaid - manualOpeningPaid),
      totalFees,
      balance,
      arrearsTotal,
      discountPct: getPaymentDiscountPct(discounts, student.id, term, academicYear),
      feeSnapshot,
      status: balance <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Unpaid",
    };
  });
}

// ---------------------------------------------------------------------------
// Paid-column adjustment: upsert a manual opening-paid record so that
// totalPaid = requestedTotalPaid for the given student / term / year.
// Used both by SuperAdminAudit (approve flow) and Payments (superadmin
// direct-apply flow).  Kept here so both pages import one shared copy.
// ---------------------------------------------------------------------------
export async function applyApprovedPaidAdjustment(request) {
  // Lazy-import Payment entity to avoid a top-level circular dependency with
  // entity files that may themselves import from this lib.
  const { Payment } = await import("@/entities/Payment");

  const studentId = request?.student_id;
  if (!studentId) return;

  const requestRef = request?.notification_id || "direct-superadmin";
  const requestedTotalPaid = Math.max(0, Math.round(Number(request.requested_total_paid || 0)));
  const appRecordedPaid    = Math.max(0, Math.round(Number(request.app_recorded_paid    || 0)));
  const openingPaidAmount  = Math.max(0, requestedTotalPaid - appRecordedPaid);

  const existingOpeningRecords = await Payment.filter({
    student_id:    studentId,
    term:          request.term,
    academic_year: request.academic_year,
  }).then((rows) =>
    (rows || []).filter(
      (payment) => typeof payment?.notes === "string" && payment.notes.includes(MANUAL_OPENING_PAID_TAG)
    )
  );

  if (openingPaidAmount <= 0) {
    for (const record of existingOpeningRecords) {
      await Payment.delete(record.id);
    }
    return;
  }

  if (existingOpeningRecords.length > 0) {
    const [first, ...rest] = existingOpeningRecords;
    await Payment.update(first.id, {
      amount:         openingPaidAmount,
      payment_status: "partial",
      payment_method: first.payment_method || "cash",
      payment_date:   getLagosDateString(),
      notes:          `${MANUAL_OPENING_PAID_TAG} Approved paid request ${requestRef}`,
    });
    for (const extra of rest) {
      await Payment.delete(extra.id);
    }
    return;
  }

  await Payment.create({
    student_id:     studentId,
    amount:         openingPaidAmount,
    payment_date:   getLagosDateString(),
    payment_method: "cash",
    payment_status: "partial",
    term:           request.term,
    academic_year:  request.academic_year,
    notes:          `${MANUAL_OPENING_PAID_TAG} Approved paid request ${requestRef}`,
    due_date:       null,
  });
}
