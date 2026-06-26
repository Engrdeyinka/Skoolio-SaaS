import { supabase } from "@/api/supabaseClient";
import { TimetableSlot } from "@/entities/all";
import { Student } from "@/entities/Student";
import { Expense } from "@/entities/Expense";
import { ClassFee } from "@/entities/ClassFee";
import { logChange } from "@/lib/changeHistory";
import { saveStudentFeeGroup, saveStudentStartTerm } from "@/lib/paymentBalances";

export const APPROVAL_REQUEST_TYPE = "approval_request";
export const APPROVAL_REMINDER_TYPE = "approval_reminder";
const APPROVAL_VERSION = 1;

function normalizeTimetableSlot(slot) {
  return {
    grade: slot?.grade || "",
    day: slot?.day || "",
    period: Number(slot?.period) || 0,
    term: slot?.term || null,
    academic_year: slot?.academic_year || null,
    subject: slot?.subject ?? slot?.subject_name ?? null,
    teacher_id: slot?.teacher_id || null,
    second_teacher_id: slot?.second_teacher_id || null,
    is_blocked: Boolean(slot?.is_blocked),
    block_label: slot?.block_label || "",
    is_locked: Boolean(slot?.is_locked),
  };
}

async function applyTimetableApproval(request) {
  const proposed = request?.proposed_data || {};
  const term = proposed.term || request?.metadata?.term || null;
  const academicYear = proposed.academic_year || proposed.academicYear || request?.metadata?.academic_year || null;
  const actionType = proposed.action_type || request?.metadata?.action_type || "replace";
  const nextSlotsRaw = Array.isArray(proposed.slots) ? proposed.slots : [];
  const nextSlots = nextSlotsRaw.map((slot) => normalizeTimetableSlot({ ...slot, term, academic_year: academicYear }));

  if (!term || !academicYear) {
    throw new Error("Missing timetable term or academic year.");
  }

  const currentSlots = await TimetableSlot.filter({
    term,
    academic_year: academicYear,
  });

  const slotGrades = [...new Set(nextSlots.map((slot) => slot.grade).filter(Boolean))];
  const targetGrades = actionType === "clear_grade"
    ? [proposed.grade].filter(Boolean)
    : actionType === "clear_all"
    ? []
    : slotGrades;

  const slotsToDelete = (currentSlots || []).filter((slot) => {
    if (!slot?.id || slot.is_blocked) return false;
    if (actionType !== "clear_all" && actionType !== "clear_grade" && slot.is_locked) return false;
    if (actionType === "clear_all") return true;
    if (actionType === "clear_grade") return slot.grade === proposed.grade;
    if (actionType === "fill_empty") return false;
    return targetGrades.includes(slot.grade);
  });

  if (slotsToDelete.length > 0) {
    await TimetableSlot.bulkDelete(slotsToDelete.map((slot) => slot.id));
  }

  let slotsToCreate = nextSlots;
  if (actionType === "fill_empty") {
    const refreshedSlots = await TimetableSlot.filter({
      term,
      academic_year: academicYear,
    });
    const occupied = new Set(
      (refreshedSlots || []).map((slot) => `${slot.grade}|${slot.day}|${slot.period}`)
    );
    slotsToCreate = nextSlots.filter(
      (slot) => !occupied.has(`${slot.grade}|${slot.day}|${slot.period}`)
    );
  }

  if (slotsToCreate.length > 0) {
    await TimetableSlot.bulkCreate(slotsToCreate);
  }

  return {
    term,
    academic_year: academicYear,
    action_type: actionType,
    affected_grades: actionType === "clear_all" ? "all" : targetGrades,
    deleted_slots: slotsToDelete.length,
    created_slots: slotsToCreate.length,
  };
}

const ENTITY_HANDLERS = {
  student: Student,
  expense: Expense,
  class_fee: ClassFee,
  timetable_term: {
    applyApproval: applyTimetableApproval,
  },
};

function normalizeCompareText(value) {
  return String(value || "").trim().toLowerCase();
}

function isDuplicateCreateError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("duplicate") ||
    message.includes("already exists") ||
    message.includes("unique") ||
    message.includes("violates")
  );
}

async function findExistingStudentMatch(proposed = {}) {
  const students = await Student.list().catch(() => []);
  if (!Array.isArray(students) || students.length === 0) return null;

  const regNumber = normalizeCompareText(proposed?.reg_number);
  if (regNumber) {
    const byReg = students.find((student) => normalizeCompareText(student?.reg_number) === regNumber);
    if (byReg) return byReg;
  }

  const firstName = normalizeCompareText(proposed?.first_name);
  const lastName = normalizeCompareText(proposed?.last_name);
  const grade = normalizeCompareText(proposed?.grade);
  const parentPhone = normalizeCompareText(proposed?.parent_phone);

  return (
    students.find((student) => {
      const sameName =
        normalizeCompareText(student?.first_name) === firstName &&
        normalizeCompareText(student?.last_name) === lastName;
      const sameGrade = normalizeCompareText(student?.grade) === grade;
      const sameParentPhone =
        parentPhone &&
        normalizeCompareText(student?.parent_phone) === parentPhone;

      return sameName && sameGrade && (!!sameParentPhone || !parentPhone);
    }) || null
  );
}

async function applyStudentCreateApproval(request) {
  const proposed = request?.proposed_data || {};
  const existing = await findExistingStudentMatch(proposed);
  if (existing) return existing;

  try {
    return await Student.create(proposed);
  } catch (error) {
    if (isDuplicateCreateError(error)) {
      const duplicate = await findExistingStudentMatch(proposed);
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseApprovalNotification(notification) {
  if (!notification || notification.type !== APPROVAL_REQUEST_TYPE) return null;
  const payload = safeJsonParse(notification.message);
  if (!payload || typeof payload !== "object") return null;
  return {
    ...payload,
    notification_id: notification.id,
    notification_title: notification.title,
    created_at: notification.created_at,
  };
}

export function getApprovalSummary(payload) {
  if (!payload) return "";
  const actor = payload.requested_by_name || payload.requested_by_role || "Admin";
  const target = payload.entity_label || payload.entity_type || "record";
  if (payload.entity_type === "timetable_term") {
    return `${actor} wants to apply timetable changes for ${target}.`;
  }
  if (payload.operation === "create") return `${actor} wants to create ${target}.`;
  if (payload.operation === "delete") return `${actor} wants to delete ${target}.`;
  return `${actor} wants to update ${target}.`;
}

export async function createApprovalRequest({
  entityType,
  entityLabel,
  operation,
  currentData,
  proposedData,
  requestedBy,
  requestedByRole,
  requestedByName,
  recordId,
  summary,
  metadata,
}) {
  const payload = {
    version: APPROVAL_VERSION,
    status: "pending",
    entity_type: entityType,
    entity_label: entityLabel,
    operation,
    record_id: recordId || null,
    current_data: currentData || null,
    proposed_data: proposedData || null,
    requested_by: requestedBy || null,
    requested_by_role: requestedByRole || "",
    requested_by_name: requestedByName || "",
    requested_at: new Date().toISOString(),
    summary: summary || "",
    metadata: metadata || null,
  };

  const { data, error } = await supabase.from("notifications").insert({
    title: `Approval needed: ${entityLabel}`,
    message: JSON.stringify(payload),
    type: APPROVAL_REQUEST_TYPE,
    target_role: "super_admin",
    is_read: false,
    link: "/Dashboard",
  }).select().single();

  if (error) throw error;

  await logChange({
    action: "approval_requested",
    entityType,
    entityId: recordId || data?.id,
    performedBy: requestedByRole || requestedByName || "admin",
    summary: summary || `Approval requested for ${entityLabel}.`,
    before: currentData || null,
    after: proposedData || null,
    details: { notification_id: data?.id, operation, metadata: metadata || null },
  });

  return data;
}

export async function listPendingApprovalRequests() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("type", APPROVAL_REQUEST_TYPE)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data || [])
    .map(parseApprovalNotification)
    .filter((payload) => payload?.status === "pending");
}

async function updateApprovalNotification(notificationId, payload) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ message: JSON.stringify(payload), is_read: false })
    .eq("id", notificationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function approveRequest(request, reviewer) {
  const handler = ENTITY_HANDLERS[request?.entity_type];
  if (!handler) throw new Error("This approval type is not supported yet.");

  let resultingRecord = null;
  if (typeof handler.applyApproval === "function") {
    resultingRecord = await handler.applyApproval(request);
  } else if (request.entity_type === "student" && request.operation === "create") {
    resultingRecord = await applyStudentCreateApproval(request);
  } else if (request.operation === "create") {
    resultingRecord = await handler.create(request.proposed_data || {});
  } else if (request.operation === "update") {
    if (!request.record_id) throw new Error("Missing record id for update approval.");
    resultingRecord = await handler.update(request.record_id, request.proposed_data || {});
  } else if (request.operation === "delete") {
    if (!request.record_id) throw new Error("Missing record id for delete approval.");
    await handler.delete(request.record_id);
  } else {
    throw new Error("Unsupported approval operation.");
  }

  const approvedStudentId = request.entity_type === "student"
    ? resultingRecord?.id || request.record_id
    : null;
  if (
    approvedStudentId &&
    request.operation !== "delete" &&
    (request.proposed_data?.start_term || request.proposed_data?.start_academic_year)
  ) {
    await saveStudentStartTerm(
      approvedStudentId,
      request.proposed_data?.start_term,
      request.proposed_data?.start_academic_year,
      {
        performedBy: reviewer?.school_role || reviewer?.full_name || "super_admin",
        summary: `Approved start term record for ${request.entity_label}.`,
      }
    );
  }
  if (
    approvedStudentId &&
    request.operation !== "delete" &&
    request.proposed_data?.fee_group
  ) {
    await saveStudentFeeGroup(
      approvedStudentId,
      request.proposed_data?.fee_group,
      {
        performedBy: reviewer?.school_role || reviewer?.full_name || "super_admin",
        summary: `Approved fee group for ${request.entity_label}.`,
      }
    );
  }

  const nextPayload = {
    ...request,
    status: "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewer?.id || null,
    reviewed_by_name: reviewer?.full_name || reviewer?.email || "",
    reviewed_by_role: reviewer?.school_role || "",
    applied_record: resultingRecord || null,
  };

  await updateApprovalNotification(request.notification_id, nextPayload);
  await logChange({
    action: "approval_approved",
    entityType: request.entity_type,
    entityId: request.record_id || resultingRecord?.id || request.notification_id,
    performedBy: reviewer?.school_role || reviewer?.full_name || "super_admin",
    summary: `Approved ${request.operation} request for ${request.entity_label}.`,
    before: request.current_data || null,
    after: request.proposed_data || resultingRecord || null,
    details: { notification_id: request.notification_id },
  });

  return resultingRecord;
}

export async function rejectRequest(request, reviewer) {
  const nextPayload = {
    ...request,
    status: "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewer?.id || null,
    reviewed_by_name: reviewer?.full_name || reviewer?.email || "",
    reviewed_by_role: reviewer?.school_role || "",
  };

  await updateApprovalNotification(request.notification_id, nextPayload);
  await logChange({
    action: "approval_rejected",
    entityType: request.entity_type,
    entityId: request.record_id || request.notification_id,
    performedBy: reviewer?.school_role || reviewer?.full_name || "super_admin",
    summary: `Rejected ${request.operation} request for ${request.entity_label}.`,
    before: request.current_data || null,
    after: request.proposed_data || null,
    details: { notification_id: request.notification_id },
  });
}
