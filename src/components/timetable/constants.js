/**
 * Shared timetable constants.
 * Single source of truth — import from here instead of redefining locally.
 * This file is plain JS (no JSX) so it can be used by both React components
 * and Web Worker solver files.
 */

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Full time-range label for each period (e.g. "9:00–9:45").
 * Used in slot displays, print views, and the slot editor.
 */
export const PERIOD_TIMES = {
  1: "9:00–9:45",
  2: "9:45–10:30",
  3: "10:30–11:15",
  4: "11:15–12:00",
  5: "12:30–1:15",
  6: "1:15–2:00",
  7: "2:00–2:45",
  8: "2:45–3:30",
};

/**
 * Start-time-only label for each period (e.g. "9:00").
 * Used in compact displays like the teacher constraint panel checkboxes.
 */
export const PERIOD_START_TIMES = {
  1: "9:00",
  2: "9:45",
  3: "10:30",
  4: "11:15",
  5: "12:30",
  6: "1:15",
  7: "2:00",
  8: "2:45",
};

/**
 * Standard pre-set labels for blocked periods.
 * Shown in the block-period dropdown in the slot editor.
 */
export const BLOCK_LABELS = [
  "Assembly",
  "Club",
  "Sports",
  "Free Period",
  "Exam",
  "Staff Meeting",
  "Library",
  "Religious Activity",
  "Class Meeting",
];
