import { supabase } from "@/api/supabaseClient";

/**
 * Creates a notification in the database.
 * Non-blocking — fires and forgets so it never breaks the calling flow.
 */
export function notify({ title, message, type = "general", targetRole = "admin", link = null }) {
  supabase.from("notifications").insert({
    title,
    message: message || null,
    type,
    target_role: targetRole,
    link: link || null,
    is_read: false,
  }).then(() => {}).catch(() => {});
}
