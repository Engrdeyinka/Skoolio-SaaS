import { supabase } from "@/api/supabaseClient";

/**
 * Calls the parse-school-calendar Edge Function.
 * @param {string} fileUrl  Public Supabase Storage URL of the uploaded file
 * @returns {Promise<Array>} Array of event objects ready to save
 */
export const parseSchoolCalendar = async (fileUrl) => {
  const { data, error } = await supabase.functions.invoke("parse-school-calendar", {
    body: { fileUrl },
  });
  if (error) throw new Error(error.message || "Edge function error");
  if (!data?.success) throw new Error(data?.error || "Failed to parse calendar file");
  return data.events || [];
};
