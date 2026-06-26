import { supabase } from "@/api/supabaseClient";
import { AuditLog } from "@/entities/AuditLog";

export const RESULTS_WORKFLOW_STATES = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "locked", label: "Locked" },
];

function workflowKey(term, academicYear) {
  return `${academicYear || "unknown"}::${term || "unknown"}`;
}

export async function listResultsWorkflowLogs(limit = 200) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("action", "results_workflow_changed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getResultsWorkflowMap() {
  const logs = await listResultsWorkflowLogs();
  return logs.reduce((acc, log) => {
    const term = log?.details?.term;
    const academicYear = log?.details?.academic_year;
    const status = log?.details?.status;
    if (!term || !academicYear || !status) return acc;
    const key = workflowKey(term, academicYear);
    if (!acc[key]) {
      acc[key] = {
        status,
        updatedAt: log.created_at,
        updatedBy: log.performed_by,
        summary: log.summary,
      };
    }
    return acc;
  }, {});
}

export async function getResultsWorkflowStatus(term, academicYear) {
  const map = await getResultsWorkflowMap();
  return map[workflowKey(term, academicYear)] || {
    status: "draft",
    updatedAt: null,
    updatedBy: null,
    summary: "",
  };
}

export async function setResultsWorkflowStatus({
  term,
  academicYear,
  status,
  performedBy,
  summary,
}) {
  await AuditLog.log({
    action: "results_workflow_changed",
    entityType: "exam_results",
    entityId: workflowKey(term, academicYear),
    performedBy: performedBy || "admin",
    summary: summary || `Results workflow moved to ${status} for ${term} ${academicYear}.`,
    details: {
      term,
      academic_year: academicYear,
      status,
    },
  });
}

export function canEditResultsForStatus(status) {
  return status !== "locked" && status !== "published";
}

// Students can always view their results UNLESS an admin has explicitly
// locked student access with the "locked" state.
export function canStudentsViewResultsForStatus(status) {
  return status !== "locked";
}
