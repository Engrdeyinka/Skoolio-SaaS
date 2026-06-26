/**
 * schoolSettingUtils.js
 *
 * Thin helpers for reading and writing individual columns on the single-row
 * school_settings table.  All localStorage-backed settings should migrate to
 * these helpers so data persists across devices.
 *
 * Usage:
 *   const value = await loadSchoolSetting("timetable_locks", {});
 *   await saveSchoolSetting("timetable_locks", { "First Term:2025/2026": true });
 */
import { supabase } from "@/api/supabaseClient";

let _settingsId = null; // cached row id — fetched once per session

async function getSettingsId() {
  if (_settingsId) return _settingsId;
  const { data } = await supabase.from("school_settings").select("id").limit(1);
  _settingsId = data?.[0]?.id || null;
  return _settingsId;
}

/**
 * Read a single column from school_settings.
 * Returns `defaultValue` if the column is null/missing or an error occurs.
 */
export async function loadSchoolSetting(column, defaultValue = null) {
  try {
    const { data } = await supabase
      .from("school_settings")
      .select(column)
      .limit(1);
    const val = data?.[0]?.[column];
    return val !== null && val !== undefined ? val : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Write a value to a single column in school_settings.
 * Silently logs errors — never throws.
 */
export async function saveSchoolSetting(column, value) {
  try {
    const id = await getSettingsId();
    if (!id) return;
    await supabase
      .from("school_settings")
      .update({ [column]: value, updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch (e) {
    console.error(`Failed to save school setting "${column}":`, e);
  }
}
