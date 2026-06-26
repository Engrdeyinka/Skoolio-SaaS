/**
 * streakUtils.js
 * Tracks activity streaks for admin/teacher users across 5 categories:
 *   attendance | academic_records | cbt | timetable | payments
 *
 * Streak rules:
 *  - Only weekdays (Mon–Fri) count
 *  - Actions are grouped into SESSIONS: a new session starts after
 *    SESSION_GAP_MINUTES (60 min) of inactivity on the same day.
 *    Each session increments total_days by 1.
 *  - The consecutive-day streak (current_streak) still only increments
 *    once per calendar day (on the first session of that day).
 *  - Missing the previous weekday resets current_streak to 1.
 *  - Milestone toasts only fire on new-day streaks, not extra sessions.
 */

import { supabase } from "@/api/supabaseClient";
import { getLagosDateString } from "@/lib/timezone";
import { toast } from "sonner";

export const STREAK_TYPES = {
  ATTENDANCE:        "attendance",
  ACADEMIC_RECORDS:  "academic_records",
  CBT:               "cbt",
  TIMETABLE:         "timetable",
  PAYMENTS:          "payments",
};

export const STREAK_META = {
  attendance:       { label: "Attendance",       emoji: "📋", color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  academic_records: { label: "Academic Records", emoji: "📝", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  cbt:              { label: "CBT Management",   emoji: "💻", color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
  timetable:        { label: "Timetable",        emoji: "🗓️", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  payments:         { label: "Payments",         emoji: "💰", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
};

export const MILESTONES = [3, 7, 14, 30, 60, 100];

/** Inactivity gap (minutes) that defines the boundary between two sessions */
const SESSION_GAP_MINUTES = 15;

/** Returns true if the given date string (yyyy-MM-dd) is a weekday */
function isWeekday(dateStr) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day >= 1 && day <= 5;
}

/** Returns the previous weekday date string from a given date */
function getPrevWeekday(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const subtractDays = day === 1 ? 3 : 1; // Monday → subtract 3 to get Friday
  d.setDate(d.getDate() - subtractDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Call this whenever a user completes a streak-worthy action.
 *
 * Session logic:
 *  - First action of a new weekday  → new day + new session
 *    • current_streak increments (consecutive-day check)
 *    • total_days increments
 *  - Action on the SAME day but more than SESSION_GAP_MINUTES since last
 *    action → new session, same day
 *    • current_streak unchanged
 *    • total_days increments
 *  - Action within SESSION_GAP_MINUTES of the last action → same session
 *    • nothing changes (return null)
 *
 * @param {string} userId - profiles.id of the acting user
 * @param {string} type   - one of STREAK_TYPES values
 * @returns {{ newStreak: number, milestone: number|null, isNewDay: boolean } | null}
 */
export async function updateStreak(userId, type) {
  if (!userId || !type) return null;

  const today = getLagosDateString();
  if (!isWeekday(today)) return null;

  const now = new Date();

  try {
    const { data: existing } = await supabase
      .from("user_streaks")
      .select("*")
      .eq("user_id", userId)
      .eq("streak_type", type)
      .maybeSingle();

    const lastAt = existing?.last_activity_at ? new Date(existing.last_activity_at) : null;
    const minutesSinceLast = lastAt ? (now - lastAt) / 60_000 : Infinity;
    const isNewDay     = existing?.last_activity_date !== today;
    const isNewSession = isNewDay || minutesSinceLast > SESSION_GAP_MINUTES;

    // Same session — nothing to do
    if (!isNewSession) return null;

    let newStreak  = existing?.current_streak  || 0;
    let newLongest = existing?.longest_streak  || 0;

    if (isNewDay) {
      // Advance the consecutive-day streak
      const prevWeekday   = getPrevWeekday(today);
      const isConsecutive = existing?.last_activity_date === prevWeekday;
      newStreak  = isConsecutive ? newStreak + 1 : 1;
      newLongest = Math.max(newStreak, newLongest);
    }

    const newTotal = (existing?.total_days || 0) + 1;

    await supabase.from("user_streaks").upsert({
      user_id:            userId,
      streak_type:        type,
      current_streak:     newStreak,
      longest_streak:     newLongest,
      last_activity_date: today,
      last_activity_at:   now.toISOString(),
      total_days:         newTotal,
      updated_at:         now.toISOString(),
    }, { onConflict: "user_id,streak_type" });

    // Milestones only celebrate consecutive-day streaks (new day only)
    const milestone = isNewDay ? (MILESTONES.find(m => m === newStreak) || null) : null;

    return { newStreak, milestone, streakType: type, isNewDay };
  } catch (err) {
    console.warn("Streak update failed silently:", err?.message);
    return null;
  }
}

/**
 * Fetch all 4 streak records for a user.
 * Returns an object keyed by streak_type with streak data.
 */
export async function getStreaks(userId) {
  if (!userId) return {};
  try {
    const { data } = await supabase
      .from("user_streaks")
      .select("*")
      .eq("user_id", userId);

    const result = {};
    (data || []).forEach(row => { result[row.streak_type] = row; });
    return result;
  } catch {
    return {};
  }
}

/** Returns the total "overall" streak — the minimum across all active streaks */
export function getOverallStreak(streaks) {
  const values = Object.values(streaks).map(s => s.current_streak || 0);
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Fire-and-forget streak recorder.
 * Calls updateStreak and automatically shows a milestone toast if a milestone was hit.
 * Safe to call without await — any errors are swallowed silently.
 */
export function recordStreak(userId, type) {
  updateStreak(userId, type).then(result => {
    if (!result) return;
    const { newStreak, milestone, isNewDay } = result;
    const meta = STREAK_META[type];

    // Always notify the Layout header to refresh the flame badge
    window.dispatchEvent(new CustomEvent("streak-updated", { detail: { type, newStreak } }));

    // Toasts only fire on a brand-new calendar day (not extra sessions within the same day)
    if (!isNewDay) return;

    if (milestone) {
      toast.success(
        `🔥 ${milestone}-Day Streak! ${meta?.emoji || ""} ${meta?.label || type}`,
        {
          description: `You've been active for ${milestone} consecutive weekdays. Keep it up!`,
          duration: 6000,
        }
      );
    } else if (newStreak > 1 && newStreak % 5 === 0) {
      toast(`${meta?.emoji || "🔥"} ${newStreak}-day ${meta?.label || type} streak!`, {
        duration: 3000,
      });
    }
  }).catch(() => {});
}
