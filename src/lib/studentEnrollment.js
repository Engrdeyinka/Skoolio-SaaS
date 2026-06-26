import { Student } from "@/entities/Student";
import { createApprovalRequest } from "@/lib/approvalRequests";
import { logChange } from "@/lib/changeHistory";
import { getEffectiveClassFee } from "@/lib/classFeeUtils";
import { DEFAULT_STUDENT_START_TERM, saveStudentFeeGroup, saveStudentStartTerm } from "@/lib/paymentBalances";

function normalizeStudentPayload(studentData = {}) {
  return {
    ...studentData,
    termly_tuition: Number(studentData.termly_tuition) || 0,
    date_of_birth: studentData.date_of_birth || null,
    enrollment_date: studentData.enrollment_date || null,
    parent_email: studentData.parent_email || "",
    address: studentData.address || "",
    state_of_origin: studentData.state_of_origin || "",
    gender: studentData.gender || "",
    photo_url: studentData.photo_url || "",
    fee_group: studentData.fee_group || "standard",
    enrollment_status: studentData.enrollment_status || "active",
    start_term: studentData.start_term || null,
    start_academic_year: studentData.start_academic_year || null,
  };
}

export async function submitNewStudentEnrollment({
  studentData,
  currentUser,
  isSuperAdminUser,
  classFees = [],
  term,
  academicYear,
}) {
  const normalizedData = normalizeStudentPayload(studentData);
  const existing = await Student.list().catch(() => []);
  const existingNumbers = new Set(existing.map((student) => student.reg_number).filter(Boolean));

  let regNumber;
  do {
    const rand = Math.floor(Math.random() * 900) + 100;
    regNumber = `TOP/25/${rand}`;
  } while (existingNumbers.has(regNumber));

  const feeRecord = getEffectiveClassFee(classFees, {
    grade: normalizedData.grade,
    term,
    academicYear,
  });
  const autoFee = Number(feeRecord?.termly_tuition);

  const studentToCreate = {
    ...normalizedData,
    start_term: normalizedData.start_term || DEFAULT_STUDENT_START_TERM,
    start_academic_year: normalizedData.start_academic_year || academicYear || null,
    reg_number: regNumber,
  };

  if ((!studentToCreate.termly_tuition || Number(studentToCreate.termly_tuition) === 0) && autoFee > 0) {
    studentToCreate.termly_tuition = autoFee;
  }

  const displayName = `${studentToCreate.first_name} ${studentToCreate.last_name}`.trim() || "new student";

  if (!isSuperAdminUser) {
    await createApprovalRequest({
      entityType: "student",
      entityLabel: displayName,
      operation: "create",
      currentData: null,
      proposedData: studentToCreate,
      requestedBy: currentUser?.id,
      requestedByRole: currentUser?.school_role,
      requestedByName: currentUser?.full_name || currentUser?.email,
      summary: `New student enrollment requested for ${displayName}.`,
    });

    return {
      status: "pending_approval",
      regNumber,
      record: studentToCreate,
    };
  }

  const createdStudent = await Student.create(studentToCreate);
  await saveStudentFeeGroup(
    createdStudent?.id,
    studentToCreate.fee_group,
    {
      performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
      summary: `${displayName} fee group saved.`,
    }
  );
  await saveStudentStartTerm(
    createdStudent?.id,
    studentToCreate.start_term || term,
    studentToCreate.start_academic_year || academicYear,
    {
      performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
      summary: `${displayName} start term record saved.`,
    }
  );
  await logChange({
    action: "student_created",
    entityType: "student",
    entityId: createdStudent?.id,
    performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
    summary: `${displayName} was enrolled.`,
    before: null,
    after: createdStudent || studentToCreate,
  });

  return {
    status: "created",
    regNumber,
    record: createdStudent || studentToCreate,
  };
}
