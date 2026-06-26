import { supabase } from "@/api/supabaseClient";

export const AuditLog = {
  async log({ action, entityType, entityId, performedBy, summary, details }) {
    try {
      await supabase.from("audit_logs").insert({
        action,
        entity_type: entityType,
        entity_id:   entityId ? String(entityId) : null,
        performed_by: performedBy || "admin",
        summary,
        details: details || null,
      });
    } catch (err) {
      console.warn("Audit log failed:", err);
    }
  },

  async list(limit = 100) {
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
};
