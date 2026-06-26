import { formatDateInLagos } from "@/lib/timezone";
import { BRAND } from "@/config/brand";

/**
 * Birthday helpers
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions for finding today's + upcoming birthdays from a list of
 * students, and for shaping the birthday SMS message. No DB / Supabase calls
 * here — keeps it easy to test and reuse from both the dashboard widget and
 * the daily-cron edge function (if we ever pull it into the function bundle).
 */

const TWO_DIGIT = (n) => String(n).padStart(2, "0");

/** Returns MM-DD for a yyyy-mm-dd input, or null if the date can't be parsed. */
export function monthDayKey(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[2]}-${m[3]}`;
}

/** "Sat Aug 30" style label for a Date object. */
function shortLabel(date) {
  return formatDateInLagos(date, { weekday: "short", month: "short", day: "numeric" });
}

/** Age the student will turn on the given upcoming-birthday date. */
function ageOn(dateOfBirth, onDate) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = onDate.getFullYear() - dob.getFullYear();
  // If the on-date's month-day comes BEFORE dob's month-day in the same year,
  // the student hasn't had this year's birthday yet — subtract one.
  const onKey  = `${TWO_DIGIT(onDate.getMonth() + 1)}-${TWO_DIGIT(onDate.getDate())}`;
  const dobKey = monthDayKey(dateOfBirth);
  if (dobKey && onKey < dobKey) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * @param {object} args
 * @param {Array} args.students        – students[] (active or not, we filter)
 * @param {Date}  [args.today]         – defaults to new Date()
 * @param {number} [args.upcomingDays] – how many days ahead to include (default 7)
 *
 * @returns {{
 *   todays:   Array<{ student, date: Date, mmdd: string, age: number|null, label: string }>,
 *   upcoming: Array<{ student, date: Date, mmdd: string, age: number|null, label: string }>,
 * }}
 *
 * `todays` is sorted by student last_name asc. `upcoming` is sorted by date
 * ascending, and never includes today's birthdays (those are in `todays`).
 */
export function findBirthdays({ students = [], today = new Date(), upcomingDays = 7 } = {}) {
  const activeWithDob = students.filter((s) =>
    s?.date_of_birth &&
    s?.enrollment_status !== "inactive" &&
    s?.enrollment_status !== "withdrawn" &&
    s?.enrollment_status !== "graduated"
  );

  // Build a Map of mmdd -> [student, ...] so the window walk is O(window).
  const byMonthDay = new Map();
  for (const s of activeWithDob) {
    const key = monthDayKey(s.date_of_birth);
    if (!key) continue;
    if (!byMonthDay.has(key)) byMonthDay.set(key, []);
    byMonthDay.get(key).push(s);
  }

  const todays = [];
  const upcoming = [];

  // Walk day-by-day for upcomingDays + 1 (includes today).
  for (let i = 0; i <= upcomingDays; i++) {
    const d = new Date(today);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const key = `${TWO_DIGIT(d.getMonth() + 1)}-${TWO_DIGIT(d.getDate())}`;
    const matches = byMonthDay.get(key) || [];
    for (const student of matches) {
      const entry = {
        student,
        date: new Date(d),
        mmdd: key,
        age: ageOn(student.date_of_birth, d),
        label: shortLabel(d),
      };
      if (i === 0) todays.push(entry);
      else         upcoming.push(entry);
    }
  }

  todays.sort((a, b) => String(a.student.last_name || "").localeCompare(String(b.student.last_name || "")));
  upcoming.sort((a, b) => a.date - b.date);

  return { todays, upcoming };
}

/** Standard birthday SMS body for one student. */
export function renderBirthdayMessage(student, { schoolName } = {}) {
  const name = student?.first_name || "Student";
  const school = schoolName || BRAND.schoolName;
  return `Happy birthday ${name}! Wishing you a wonderful year ahead. From all of us at ${school}.`;
}
