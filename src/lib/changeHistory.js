import { AuditLog } from "@/entities/AuditLog";

export async function logChange({
  action,
  entityType,
  entityId,
  performedBy,
  summary,
  before,
  after,
  details,
}) {
  try {
    await AuditLog.log({
      action,
      entityType,
      entityId,
      performedBy,
      summary,
      details: {
        before: before ?? null,
        after: after ?? null,
        ...(details || {}),
      },
    });
  } catch (error) {
    // Audit logging should never block the actual school operation.
    console.warn("Audit log skipped:", error);
  }
}
