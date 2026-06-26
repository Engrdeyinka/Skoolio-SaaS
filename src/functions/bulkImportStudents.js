import { submitNewStudentEnrollment } from "@/lib/studentEnrollment";

export const bulkImportStudents = async ({
  students,
  currentUser,
  isSuperAdminUser,
  classFees = [],
  term,
  academicYear,
}) => {
  const records = Array.isArray(students) ? students : [];
  const errors = [];
  const importedStudents = [];
  let successfulImports = 0;
  let pendingApprovals = 0;

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index] || {};
    const rowNumber = row._rowNumber || index + 2;
    const studentData = { ...row };
    delete studentData._rowNumber;

    try {
      const result = await submitNewStudentEnrollment({
        studentData,
        currentUser,
        isSuperAdminUser,
        classFees,
        term,
        academicYear,
      });

      successfulImports += 1;
      importedStudents.push(result.record);
      if (result.status === "pending_approval") pendingApprovals += 1;
    } catch (error) {
      errors.push({
        row: rowNumber,
        error: error?.message || "Import failed for this row.",
      });
    }
  }

  return {
    data: {
      success: true,
      total_processed: records.length,
      successful_imports: successfulImports,
      failed_imports: errors.length,
      pending_approvals: pendingApprovals,
      students: importedStudents,
      errors,
    },
  };
};
