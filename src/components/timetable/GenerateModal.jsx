import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Zap, CheckCircle2, Info, Loader2, XCircle, TrendingUp, Star, FlaskConical, BookX, GraduationCap } from "lucide-react";
import { DEFAULT_SS_PAIRINGS, buildSSPairMap } from "./ssPairings";
import { DAYS, PERIODS } from "./constants";
import { getAutomaticPriorityTeacherIds } from "./priority";
import { usePersistentState } from "@/hooks/usePersistentState";
// Solvers run in a Web Worker (see timetable.worker.js) — not imported here

const SS_GRADES = ["SSS 1", "SSS 2", "SSS 3"];
const SS_PAIR_MAP = buildSSPairMap(DEFAULT_SS_PAIRINGS);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID TIMETABLE ENGINE
// Phase 1 – CSP with MRV + LCV + Forward Checking + Backtracking (hard constraints)
// Phase 2 – Simulated Annealing (soft constraint optimization)
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_COMBOS = [];
DAYS.forEach(day => PERIODS.forEach(period => ALL_COMBOS.push({ day, period })));

const MAX_BACKTRACKS = 800;

// ── Soft constraint penalty weights ──────────────────────────────────────────
const SW = {
  UNPLACED:               1000, // per missing period (ensures feasibility dominates)
  TEACHER_IMBALANCE:         5, // teacher day-load variance (across week)
  SUBJECT_SAME_DAY:         20, // subject clustered on same day when spread is possible
  LATE_PERIOD:               2, // using period 7 or 8
  TEACHER_GRADE_IMBALANCE:  15, // teacher teaches same subject — penalise uneven spread across grades
};

// ─── Hard constraint helpers ──────────────────────────────────────────────────

// HC: two occurrences of same subject on same day must be adjacent and must NOT
// cross the long break (which falls between period 4 and period 5)
function areConsecutive(p1, p2) {
  const [a, b] = p1 < p2 ? [p1, p2] : [p2, p1];
  return b === a + 1 && !(a === 4 && b === 5);
}

function isUnavailable(avail, day, period) {
  if (!avail) return false;
  if (avail.employment_type === "part_time")
    return (avail.unavailable_periods_by_day?.[day] || []).includes(period);
  // full_time
  if (avail.unavailable_days?.includes(day)) return true;
  return (avail.unavailable_periods || []).includes(period);
}

// Returns a string reason if any hard constraint is violated, null if valid
function violatesHard(placement, state) {
  const {
    grade, day, period, subject_name,
    teacher_id, avail, maxTeacherDay, maxTeacherWeek, maxPerDay,
    pairedTeacherId, pairedAvail,
  } = placement;
  const key = `${day}-${period}`;
  const { grids, blockedKeys, teacherBusy, teacherDayLoad, teacherWeekLoad } = state;

  // HC: slot already occupied in this class
  if (grids[grade][key]) return "Slot occupied";
  // HC: slot is blocked
  if (blockedKeys[grade]?.has(key)) return "Slot blocked";

  if (teacher_id) {
    if (isUnavailable(avail, day, period))      return "Teacher unavailable at this time";
    if (teacherBusy[teacher_id]?.has(key))      return "Teacher double-booked";
    if ((teacherDayLoad[teacher_id]?.[day] || 0) >= maxTeacherDay)
                                                 return "Teacher day limit reached";
    if ((teacherWeekLoad[teacher_id] || 0) >= maxTeacherWeek)
                                                 return "Teacher week limit reached";
  }
  if (pairedTeacherId) {
    if (isUnavailable(pairedAvail, day, period))         return "Paired teacher unavailable";
    if (teacherBusy[pairedTeacherId]?.has(key))          return "Paired teacher double-booked";
    if ((teacherDayLoad[pairedTeacherId]?.[day] || 0) >= (pairedAvail?.max_periods_per_day ?? 8))
                                                          return "Paired teacher day limit";
    if ((teacherWeekLoad[pairedTeacherId] || 0) >= (pairedAvail?.max_periods_per_week ?? 40))
                                                          return "Paired teacher week limit";
  }

  // HC: consecutive double-period rule (same subject twice on a day → must be adjacent, no break crossing)
  const sameDaySlots = Object.entries(grids[grade])
    .filter(([k, v]) => v.subject_name === subject_name && k.startsWith(day + "-"));
  if (sameDaySlots.length >= maxPerDay) return "Subject day limit exceeded";
  if (sameDaySlots.length === 1) {
    const ep = Number(sameDaySlots[0][0].split("-")[1]);
    if (!areConsecutive(ep, period)) return "Double period must be consecutive and not cross the long break";
  }

  return null; // ✓ all hard constraints satisfied
}

// ─── State mutation helpers ───────────────────────────────────────────────────

function assignSlot(task, day, period, state) {
  const { grade, subject_name, teacher_id, pairedSubject, pairedTeacherId } = task;
  const key = `${day}-${period}`;
  state.grids[grade][key] = {
    subject_name,
    teacher_id: teacher_id || "",
    paired_subject: pairedSubject || null,
    paired_teacher_id: pairedTeacherId || null,
  };
  if (teacher_id) {
    state.teacherBusy[teacher_id].add(key);
    state.teacherDayLoad[teacher_id][day] = (state.teacherDayLoad[teacher_id][day] || 0) + 1;
    state.teacherWeekLoad[teacher_id] = (state.teacherWeekLoad[teacher_id] || 0) + 1;
  }
  if (pairedTeacherId) {
    state.teacherBusy[pairedTeacherId].add(key);
    state.teacherDayLoad[pairedTeacherId][day] = (state.teacherDayLoad[pairedTeacherId][day] || 0) + 1;
    state.teacherWeekLoad[pairedTeacherId] = (state.teacherWeekLoad[pairedTeacherId] || 0) + 1;
  }
}

function unassignSlot(task, day, period, state) {
  const { grade, teacher_id, pairedTeacherId } = task;
  const key = `${day}-${period}`;
  delete state.grids[grade][key];
  if (teacher_id) {
    state.teacherBusy[teacher_id].delete(key);
    state.teacherDayLoad[teacher_id][day] = Math.max(0, (state.teacherDayLoad[teacher_id][day] || 1) - 1);
    state.teacherWeekLoad[teacher_id] = Math.max(0, (state.teacherWeekLoad[teacher_id] || 1) - 1);
  }
  if (pairedTeacherId) {
    state.teacherBusy[pairedTeacherId].delete(key);
    state.teacherDayLoad[pairedTeacherId][day] = Math.max(0, (state.teacherDayLoad[pairedTeacherId][day] || 1) - 1);
    state.teacherWeekLoad[pairedTeacherId] = Math.max(0, (state.teacherWeekLoad[pairedTeacherId] || 1) - 1);
  }
}

// ─── Domain computation ───────────────────────────────────────────────────────

function buildDomain(unit, state) {
  return ALL_COMBOS.filter(({ day, period }) => !violatesHard({ ...unit, day, period }, state));
}

// LCV (Least Constraining Value): prefer values that leave more options for neighbours
// Uses a capped sample of pending units for performance
function lcvOrder(domain, unit, pending, state) {
  const sample = pending.slice(0, 12);
  if (sample.length === 0) return shuffle(domain);
  return domain
    .map(slot => {
      assignSlot(unit, slot.day, slot.period, state);
      const loss = sample.reduce((s, u) => s + (buildDomain(u, state).length === 0 ? 50 : 0), 0);
      unassignSlot(unit, slot.day, slot.period, state);
      return { slot, loss };
    })
    .sort((a, b) => a.loss - b.loss)
    .map(x => x.slot);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: CSP with Backtracking + Greedy Fallback
// Tries full CSP first; if backtrack limit hit, falls back to greedy placement
// ─────────────────────────────────────────────────────────────────────────────

function phase1CSP(tasks, state) {
  // Expand tasks into individual placement units
  const units = [];
  tasks.forEach(task => {
    for (let i = 0; i < task.periodsNeeded; i++) units.push({ ...task });
  });

  let backtracks = 0;
  const conflictSet = new Set();

  // Track placed units so greedy fallback knows what's left
  const placed = new Set();

  function backtrack(pending, depth) {
    if (pending.length === 0) return true;
    if (backtracks > MAX_BACKTRACKS) return false;

    // MRV: pick the unit with the smallest remaining domain (most constrained)
    let bestIdx = 0, bestSize = Infinity;
    for (let i = 0; i < pending.length; i++) {
      const size = buildDomain(pending[i], state).length;
      if (size < bestSize) { bestSize = size; bestIdx = i; }
    }

    if (bestSize === 0) {
      conflictSet.add(`${pending[bestIdx].grade} – ${pending[bestIdx].subject_name}: no valid slot available`);
      backtracks++;
      return false;
    }

    const unit = pending[bestIdx];
    const remaining = pending.filter((_, i) => i !== bestIdx);
    const rawDomain = buildDomain(unit, state);

    // LCV ordering (performance-capped) + jitter for variety across attempts
    const ordered = remaining.length < 25
      ? lcvOrder(shuffle(rawDomain), unit, remaining, state)
      : shuffle(rawDomain);

    for (const { day, period } of ordered) {
      assignSlot(unit, day, period, state);

      // Forward checking: ensure no remaining unit loses all domain values
      let wipeout = false;
      for (const u of remaining) {
        if (buildDomain(u, state).length === 0) { wipeout = true; break; }
      }

      if (!wipeout && backtrack(remaining, depth + 1)) return true;

      unassignSlot(unit, day, period, state);
      backtracks++;
      if (backtracks > MAX_BACKTRACKS) break;
    }

    conflictSet.add(`${unit.grade} – ${unit.subject_name}: could not place all required periods`);
    return false;
  }

  const feasible = backtrack(units, 0);

  // ── Greedy fallback: place any units still unscheduled ────────────────────
  // After backtracking, grids may be empty. Re-run a greedy pass.
  if (!feasible) {
    // Count placed per (grade, subject_name) from current grids state
    const placedCount = {};
    tasks.forEach(t => { placedCount[`${t.grade}|${t.subject_name}`] = 0; });
    Object.entries(state.grids).forEach(([grade, grid]) => {
      Object.values(grid).forEach(val => {
        const k = `${grade}|${val.subject_name}`;
        if (k in placedCount) placedCount[k]++;
      });
    });

    // Build remaining units that still need placement
    const remaining = [];
    tasks.forEach(task => {
      const k = `${task.grade}|${task.subject_name}`;
      const alreadyPlaced = placedCount[k] || 0;
      const stillNeeded = task.periodsNeeded - alreadyPlaced;
      for (let i = 0; i < stillNeeded; i++) remaining.push({ ...task });
    });

    // Sort remaining by domain size ascending (most constrained first)
    remaining.sort((a, b) => buildDomain(a, state).length - buildDomain(b, state).length);

    for (const unit of remaining) {
      const domain = shuffle(buildDomain(unit, state));
      if (domain.length > 0) {
        const { day, period } = domain[0];
        assignSlot(unit, day, period, state);
      } else {
        conflictSet.add(`${unit.grade} – ${unit.subject_name}: could not place all required periods`);
      }
    }
  }

  return { feasible, conflicts: [...conflictSet], backtracks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft constraint penalty function (lower = better quality timetable)
// ─────────────────────────────────────────────────────────────────────────────

function computePenalty(grids, grades, tasks, teacherDayLoad) {
  let p = 0;

  grades.forEach(grade => {
    const entries = Object.entries(grids[grade]);

    // SW.UNPLACED: massive penalty per missing period
    tasks.filter(t => t.grade === grade).forEach(task => {
      const placed = entries.filter(([, v]) => v.subject_name === task.subject_name).length + task.lockedCount;
      if (placed < task.periodsPerWeek) p += SW.UNPLACED * (task.periodsPerWeek - placed);
    });

    // SW.SUBJECT_SAME_DAY: penalise clustering a subject on same day
    const bySub = {};
    entries.forEach(([key, val]) => {
      const day = key.split("-")[0];
      if (!bySub[val.subject_name]) bySub[val.subject_name] = { days: new Set(), count: 0 };
      bySub[val.subject_name].days.add(day);
      bySub[val.subject_name].count++;
    });
    Object.values(bySub).forEach(({ days, count }) => {
      if (count > days.size) p += SW.SUBJECT_SAME_DAY * (count - days.size);
    });

    // SW.LATE_PERIOD: prefer earlier periods
    entries.forEach(([key]) => {
      if (Number(key.split("-")[1]) >= 7) p += SW.LATE_PERIOD;
    });
  });

  // SW.TEACHER_IMBALANCE: variance of teacher load across days of week
  Object.values(teacherDayLoad).forEach(dayMap => {
    const loads = DAYS.map(d => dayMap[d] || 0);
    if (loads.every(l => l === 0)) return;
    const mean = loads.reduce((a, b) => a + b, 0) / 5;
    const variance = loads.reduce((s, l) => s + (l - mean) ** 2, 0) / 5;
    p += SW.TEACHER_IMBALANCE * variance;
  });

  // SW.TEACHER_GRADE_IMBALANCE: penalise a teacher's subject being unequally spread across grades
  // e.g. if Economics teacher covers SS1/SS2/SS3, each grade should get roughly equal periods
  const teacherSubjectGradeCount = {}; // key: "teacherId|subject" => { [grade]: count }
  grades.forEach(grade => {
    Object.values(grids[grade]).forEach(val => {
      if (!val.teacher_id || !val.subject_name) return;
      const key = `${val.teacher_id}|${val.subject_name}`;
      if (!teacherSubjectGradeCount[key]) teacherSubjectGradeCount[key] = {};
      teacherSubjectGradeCount[key][grade] = (teacherSubjectGradeCount[key][grade] || 0) + 1;
    });
  });
  Object.values(teacherSubjectGradeCount).forEach(gradeMap => {
    const counts = Object.values(gradeMap);
    if (counts.length < 2) return; // only penalise if teacher covers multiple grades
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    p += SW.TEACHER_GRADE_IMBALANCE * variance;
  });

  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Simulated Annealing — optimize soft constraints
// Moves: (a) swap two non-locked slots within a grade
//        (b) relocate one slot to an empty position
// Hard constraints are always verified before accepting a move
// ─────────────────────────────────────────────────────────────────────────────

function phase2SA(grids, grades, tasks, state, lockedSlots, startTemp = 12.0) {
  const isLocked = (grade, day, period) =>
    lockedSlots.some(s => s.grade === grade && s.day === day && s.period === period && s.is_locked);

  function getMoveable(grade) {
    return Object.entries(grids[grade])
      .filter(([key]) => {
        const [day, p] = key.split("-");
        return !isLocked(grade, day, Number(p));
      })
      .map(([key, val]) => {
        const [day, p] = key.split("-");
        return { grade, day, period: Number(p), key, ...val };
      });
  }

  function getEmpty(grade) {
    const occupied = new Set(Object.keys(grids[grade]));
    return ALL_COMBOS.filter(({ day, period }) =>
      !occupied.has(`${day}-${period}`) && !state.blockedKeys[grade]?.has(`${day}-${period}`)
    );
  }

  // Reconstruct a placement descriptor from a placed slot entry
  function slotToPlacement(s, grade) {
    const t = tasks.find(tk => tk.grade === grade && tk.subject_name === s.subject_name) || {};
    return {
      grade,
      subject_name: s.subject_name,
      teacher_id: s.teacher_id,
      pairedSubject: s.paired_subject,
      pairedTeacherId: s.paired_teacher_id,
      avail: state.availabilities.find(a => a.teacher_id === s.teacher_id) || null,
      pairedAvail: s.paired_teacher_id
        ? state.availabilities.find(a => a.teacher_id === s.paired_teacher_id) || null
        : null,
      maxTeacherDay: t.maxTeacherDay ?? 8,
      maxTeacherWeek: t.maxTeacherWeek ?? 40,
      maxPerDay: t.maxPerDay ?? 2,
    };
  }

  let penalty = computePenalty(grids, grades, tasks, state.teacherDayLoad);
  let T = startTemp;
  const T_MIN = 0.05;
  const ITER = 1200;
  const alpha = Math.pow(T_MIN / T, 1 / ITER); // exponential cooling schedule

  for (let iter = 0; iter < ITER; iter++) {
    T = Math.max(T * alpha, T_MIN);

    const grade = grades[Math.floor(Math.random() * grades.length)];
    const moveable = getMoveable(grade);
    if (moveable.length < 1) continue;

    if (Math.random() < 0.65 && moveable.length >= 2) {
      // ── Move type A: swap two slots ───────────────────────────────────────
      const i1 = Math.floor(Math.random() * moveable.length);
      let i2 = Math.floor(Math.random() * moveable.length);
      if (i1 === i2) continue;
      const s1 = moveable[i1], s2 = moveable[i2];
      if (s1.subject_name === s2.subject_name) continue;

      const p1 = slotToPlacement(s1, grade);
      const p2 = slotToPlacement(s2, grade);

      unassignSlot(p1, s1.day, s1.period, state);
      unassignSlot(p2, s2.day, s2.period, state);

      const v1 = violatesHard({ ...p1, day: s2.day, period: s2.period }, state);
      const v2 = violatesHard({ ...p2, day: s1.day, period: s1.period }, state);

      if (!v1 && !v2) {
        assignSlot(p1, s2.day, s2.period, state);
        assignSlot(p2, s1.day, s1.period, state);
        const newP = computePenalty(grids, grades, tasks, state.teacherDayLoad);
        const delta = newP - penalty;
        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
          penalty = newP; // accept
        } else {
          // Revert
          unassignSlot(p1, s2.day, s2.period, state);
          unassignSlot(p2, s1.day, s1.period, state);
          assignSlot(p1, s1.day, s1.period, state);
          assignSlot(p2, s2.day, s2.period, state);
        }
      } else {
        assignSlot(p1, s1.day, s1.period, state);
        assignSlot(p2, s2.day, s2.period, state);
      }
    } else {
      // ── Move type B: relocate slot to empty position ──────────────────────
      const s = moveable[Math.floor(Math.random() * moveable.length)];
      const empty = getEmpty(grade);
      if (empty.length === 0) continue;
      const target = empty[Math.floor(Math.random() * empty.length)];

      const pl = slotToPlacement(s, grade);
      unassignSlot(pl, s.day, s.period, state);
      const v = violatesHard({ ...pl, day: target.day, period: target.period }, state);

      if (!v) {
        assignSlot(pl, target.day, target.period, state);
        const newP = computePenalty(grids, grades, tasks, state.teacherDayLoad);
        const delta = newP - penalty;
        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
          penalty = newP;
        } else {
          unassignSlot(pl, target.day, target.period, state);
          assignSlot(pl, s.day, s.period, state);
        }
      } else {
        assignSlot(pl, s.day, s.period, state);
      }
    }
  }

  return penalty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry: builds state, runs Phase 1 then Phase 2, converts to output
// ─────────────────────────────────────────────────────────────────────────────

function generateAllTimetables({ grades, subjects, assignments, teachers, availabilities, allSlots, lockedSlots, priorityTeacherIds = [] }) {
  const validSubjectNames = new Set(subjects.map(s => s.subject_name));

  // ── Initialise shared mutable state ───────────────────────────────────────
  const grids = {};
  grades.forEach(g => { grids[g] = {}; });

  const blockedKeys = {};
  grades.forEach(g => { blockedKeys[g] = new Set(); });

  const teacherBusy = {};
  const teacherDayLoad = {};
  const teacherWeekLoad = {};
  teachers.forEach(t => {
    teacherBusy[t.id] = new Set();
    teacherDayLoad[t.id] = {};
    DAYS.forEach(d => { teacherDayLoad[t.id][d] = 0; });
    teacherWeekLoad[t.id] = 0;
  });

  allSlots.filter(s => s.is_blocked).forEach(slot => {
    if (blockedKeys[slot.grade]) blockedKeys[slot.grade].add(`${slot.day}-${slot.period}`);
  });

  // Pre-fill locked slots
  lockedSlots.forEach(slot => {
    if (!slot.is_blocked && slot.subject_name) {
      const key = `${slot.day}-${slot.period}`;
      if (grids[slot.grade]) grids[slot.grade][key] = { subject_name: slot.subject_name, teacher_id: slot.teacher_id || "" };
      if (slot.teacher_id && teacherBusy[slot.teacher_id]) {
        teacherBusy[slot.teacher_id].add(key);
        teacherDayLoad[slot.teacher_id][slot.day] = (teacherDayLoad[slot.teacher_id][slot.day] || 0) + 1;
        teacherWeekLoad[slot.teacher_id] = (teacherWeekLoad[slot.teacher_id] || 0) + 1;
      }
    }
  });

  const state = { grids, blockedKeys, teacherBusy, teacherDayLoad, teacherWeekLoad, availabilities };

  // ── Build tasks ────────────────────────────────────────────────────────────
  const tasks = [];
  const processedPairs = new Set();

  grades.forEach(grade => {
    const gradeAssignments = assignments.filter(a =>
      a.grade === grade && validSubjectNames.has(a.subject) && (a.periods_per_week || 0) > 0
      && a.subject_teacher_id  // skip subjects with no assigned teacher
    );

    gradeAssignments.forEach(assignment => {
      const isSSGrade = SS_GRADES.includes(grade);
      const pairedSubject = isSSGrade ? SS_PAIR_MAP[assignment.subject] : null;

      if (pairedSubject) {
        const pk = [assignment.subject, pairedSubject].sort().join("|") + "|" + grade;
        if (processedPairs.has(pk)) return;
        processedPairs.add(pk);
      }

      const pairedAssignment = pairedSubject
        ? gradeAssignments.find(a => a.subject === pairedSubject) : null;

      const avail = assignment.subject_teacher_id
        ? availabilities.find(a => a.teacher_id === assignment.subject_teacher_id) || null : null;
      const pairedAvail = pairedAssignment?.subject_teacher_id
        ? availabilities.find(a => a.teacher_id === pairedAssignment.subject_teacher_id) || null : null;

      const lockedCount = lockedSlots.filter(
        s => s.grade === grade && s.subject_name === assignment.subject && !s.is_blocked
      ).length;
      const periodsNeeded = (assignment.periods_per_week || 4) - lockedCount;
      if (periodsNeeded <= 0) return;

      tasks.push({
        grade,
        subject_name: assignment.subject,
        teacher_id: assignment.subject_teacher_id || null,
        maxPerDay: assignment.max_per_day || 2,
        periodsPerWeek: assignment.periods_per_week || 4,
        periodsNeeded,
        lockedCount,
        pairedSubject: pairedSubject || null,
        pairedTeacherId: pairedAssignment?.subject_teacher_id || null,
        avail,
        pairedAvail,
        maxTeacherDay: avail?.max_periods_per_day ?? 8,
        maxTeacherWeek: avail?.max_periods_per_week ?? 40,
      });
    });
  });

  // ── Sort tasks: priority teachers first, then interleave grades for same teacher+subject ──
  // Interleaving ensures a teacher's subject is spread across grades (SS1/SS2/SS3) evenly
  // rather than exhausting the teacher's weekly budget on the first grade encountered.
  // Strategy: group tasks by (teacher_id, subject_name), then round-robin across grades.
  const interleavedTasks = [];
  const priorityTasks = tasks.filter(t => priorityTeacherIds.includes(t.teacher_id));
  const normalTasks = tasks.filter(t => !priorityTeacherIds.includes(t.teacher_id));

  function interleaveByTeacherSubject(taskList) {
    // Group by teacher+subject key (a teacher may teach Yoruba in JSS 1/2/3 AND SSS 1/2/3 —
    // these are separate groups per subject, each interleaved independently)
    const groups = {};
    const groupOrder = []; // preserve insertion order
    taskList.forEach(t => {
      const key = `${t.teacher_id || "__none__"}|${t.subject_name}`;
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(t);
    });

    // Expand each group into round-robin units, single-grade groups stay as single units
    const allQueues = groupOrder.map(key => {
      const grp = groups[key];
      if (grp.length <= 1) {
        // Single grade: just expand into individual period units
        return grp.flatMap(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
      }
      // Multi-grade: interleave so each grade gets one slot before any gets a second
      const byGrade = grp.map(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
      const interleaved = [];
      let added = true;
      while (added) {
        added = false;
        byGrade.forEach(units => {
          if (units.length > 0) { interleaved.push(units.shift()); added = true; }
        });
      }
      return interleaved;
    });

    // Merge all queues together, round-robining across groups so no single teacher+subject
    // monopolises the front of the task list
    const result = [];
    let anyLeft = true;
    while (anyLeft) {
      anyLeft = false;
      allQueues.forEach(q => {
        if (q.length > 0) { result.push(q.shift()); anyLeft = true; }
      });
    }
    return result;
  }

  const sortedTasks = [
    ...interleaveByTeacherSubject(priorityTasks),
    ...interleaveByTeacherSubject(normalTasks),
  ];

  // ── Phase 1: CSP ──────────────────────────────────────────────────────────
  const cspResult = phase1CSP(sortedTasks, state);

  // Collect unplaced periods after CSP (may be partial if backtrack limit hit)
  const log = [];
  const warnings = [];
  const infeasibleConflicts = [];

  if (!cspResult.feasible && cspResult.conflicts.length > 0) {
    cspResult.conflicts.forEach(c => infeasibleConflicts.push(c));
  }

  // ── Phase 2: SA optimization ──────────────────────────────────────────────
  const finalPenalty = phase2SA(grids, grades, tasks, state, lockedSlots);

  // ── Build log / warnings ──────────────────────────────────────────────────
  tasks.forEach(task => {
    const { grade, subject_name, pairedSubject, periodsPerWeek, lockedCount } = task;
    const placed = Object.values(grids[grade]).filter(v => v.subject_name === subject_name).length;
    const total = placed + lockedCount;
    if (total < periodsPerWeek) {
      warnings.push(`⚠ ${grade} – ${subject_name}${pairedSubject ? "/" + pairedSubject : ""}: scheduled ${total}/${periodsPerWeek} periods`);
    } else {
      log.push(`✓ ${grade} – ${subject_name}${pairedSubject ? "/" + pairedSubject : ""}: ${total} periods`);
    }
  });

  // ── Convert grids → flat slot array ──────────────────────────────────────
  const result = [];
  grades.forEach(grade => {
    Object.entries(grids[grade]).forEach(([key, val]) => {
      const [day, ...parts] = key.split("-");
      const period = Number(parts.join("-"));
      const locked = lockedSlots.some(
        s => s.grade === grade && s.day === day && s.period === period && s.is_locked
      );
      if (!locked) {
        result.push({ grade, day, period, subject_name: val.subject_name, teacher_id: val.teacher_id });
        if (val.paired_subject) {
          result.push({ grade, day, period, subject_name: val.paired_subject, teacher_id: val.paired_teacher_id || "" });
        }
      }
    });
  });

  return {
    result,
    log,
    warnings,
    infeasibleConflicts,
    feasible: infeasibleConflicts.length === 0 && warnings.length === 0,
    penalty: Math.round(finalPenalty),
    backtracks: cspResult.backtracks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal UI
// ─────────────────────────────────────────────────────────────────────────────

const ALGORITHMS = [
  {
    id: "csp_sa",
    name: "Greedy + Repair",
    icon: "⚡",
    description: "Places hard subjects first, then repairs conflicts and improves the layout.",
    badge: "Default",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    id: "cpsat_lns",
    name: "CP-SAT + LNS",
    icon: "🔬",
    description: "Stricter search with better distribution, but slower.",
    badge: "High Quality",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "adaptive_tabu",
    name: "Multi-Restart + Tabu Search",
    icon: "🧠",
    description: "Use this when constraints are tight and subjects keep getting left out.",
    badge: "Hard Constraints",
    badgeColor: "bg-rose-100 text-rose-700",
  },
];

export default function GenerateModal({
  open,
  onClose,
  subjects,
  teachers,
  assignments,
  availabilities,
  allSlots,
  term,
  academicYear,
  grades,
  onGenerate,
  ssPairings = [],
  applyLabel = "Apply to All Classes",
  // JSS 3 SSS mode — lifted to Timetable so the tab badge stays in sync
  jss3SSSMode = false,
  onJss3SSSModeChange,
  jss3SSSSubjects = [],
  onJss3SSSSubjectsChange,
}) {
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [priorityTeacherIds, setPriorityTeacherIds] = useState([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("csp_sa");
  const [fillEmptyOnly, setFillEmptyOnly] = useState(false);
  const [progress, setProgress] = useState({ phase: "", percent: 0 });
  const [ackCapacityRisk, setAckCapacityRisk] = useState(false);
  // Excluded classes persist across modal opens within the session — useful
  // for WAEC season when JSS 3 / SSS 3 are out for weeks and the admin
  // doesn't want to re-tick the boxes every time a regenerate is needed.
  const [excludedGrades, setExcludedGrades] = usePersistentState("timetable.excludedGrades", []);
  const setJss3SSSMode = onJss3SSSModeChange || (() => {});
  const setJss3SSSSubjects = onJss3SSSSubjectsChange || (() => {});

  const autoPriorityTeacherIds = useMemo(() => getAutomaticPriorityTeacherIds(availabilities), [availabilities]);

  // All unique SSS-level subjects that have assignments (used for JSS 3 → SSS subject picker)
  const SS_GRADE_LIST = ["SSS 1", "SSS 2", "SSS 3"];
  const sssSubjectOptions = useMemo(() => {
    const seen = new Set();
    return assignments
      .filter(a => SS_GRADE_LIST.includes(a.grade) && a.subject && (a.periods_per_week || 0) > 0)
      .map(a => a.subject)
      .filter(s => { if (seen.has(s)) return false; seen.add(s); return true; })
      .sort();
  }, [assignments]);

  useEffect(() => {
    if (open) {
      setResult(null);
      setPriorityTeacherIds([]);
      setFillEmptyOnly(false);
      setProgress({ phase: "", percent: 0 });
      setAckCapacityRisk(false);
    }
  }, [open]);

  const togglePriority = (id) => {
    setPriorityTeacherIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const runInWorker = (type, payload, onProgress) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./timetable.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.payload || {});
        return;
      }
      worker.terminate();
      if (e.data.type === 'error') reject(new Error(e.data.payload.message));
      else resolve(e.data.payload);
    };
    worker.onerror = (err) => { worker.terminate(); reject(err); };
    worker.postMessage({ type, payload });
  });

  const teacherCapacityIssues = useMemo(() => {
    const validSubjectNames = new Set(subjects.map((subject) => subject.subject_name));
    const dedup = new Map();
    assignments.forEach((assignment) => {
      if (!assignment?.grade || !assignment?.subject) return;
      if (!validSubjectNames.has(assignment.subject)) return;
      const periods = Number(assignment.periods_per_week || 0);
      if (periods <= 0) return;
      const key = `${assignment.grade}|${assignment.subject}`;
      if (!dedup.has(key) || Number(dedup.get(key).periods_per_week || 0) < periods) {
        dedup.set(key, assignment);
      }
    });

    const loadByTeacher = {};
    const capByTeacher = {};
    dedup.forEach((assignment) => {
      const teacherId = assignment.subject_teacher_id;
      if (!teacherId || teacherId === "none") return;
      loadByTeacher[teacherId] = (loadByTeacher[teacherId] || 0) + Number(assignment.periods_per_week || 0);
      const av = availabilities.find((item) => item.teacher_id === teacherId);
      capByTeacher[teacherId] = Number(av?.max_periods_per_week ?? 40);
    });

    return Object.entries(loadByTeacher)
      .filter(([teacherId, load]) => load > (capByTeacher[teacherId] ?? 40))
      .map(([teacherId, load]) => {
        const teacher = teachers.find((item) => item.id === teacherId);
        const limit = capByTeacher[teacherId] ?? 40;
        return {
          teacherId,
          teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherId,
          load,
          limit,
          overBy: load - limit,
        };
      })
      .sort((a, b) => b.overBy - a.overBy);
  }, [subjects, assignments, availabilities, teachers]);

  const handleGenerate = async () => {
    if (teacherCapacityIssues.length > 0 && !ackCapacityRisk) return;
    setResult(null);
    setGenerating(true);
    setProgress({ phase: "Preparing generation request...", percent: 5 });
    try {
      const baseLockedSlots = allSlots.filter(s =>
        s.term === term && s.academic_year === academicYear && (s.is_locked || s.is_blocked)
      );

      let lockedSlots = baseLockedSlots;
      if (fillEmptyOnly) {
        // Build a set of positions already covered by baseLockedSlots so we don't
        // double-add them (which would double-count teacher load for locked slots).
        const lockedPositions = new Set(
          baseLockedSlots.map(s => `${s.grade}|${s.day}|${s.period}`)
        );

        // Group all existing (non-blocked) slots by grid position.
        // SS elective pairs occupy the SAME grade|day|period as two separate DB rows.
        // If we push them as two separate locked entries the solver's makeState()
        // overwrites the first with the second, making the first subject invisible —
        // sameDayCount becomes 0 and the solver over-places it, cascading teacher clashes.
        // Solution: merge each position's rows into ONE combined locked entry that carries
        // paired_subject / paired_teacher_id so every teacher stays visible.
        const byPosition = new Map();
        allSlots
          .filter((slot) => slot.term === term && slot.academic_year === academicYear && !slot.is_blocked)
          .forEach((slot) => {
            const posKey = `${slot.grade}|${slot.day}|${slot.period}`;
            if (!byPosition.has(posKey)) byPosition.set(posKey, []);
            byPosition.get(posKey).push(slot);
          });

        const reserved = [];
        byPosition.forEach((slots, posKey) => {
          // Skip positions already covered by an explicit locked/blocked entry
          if (lockedPositions.has(posKey)) return;

          const first  = slots[0];
          const second = slots[1] || null;          // only present for SS elective pairs
          const firstName  = first.subject_name  || first.subject  || "__reserved__";
          const secondName = second ? (second.subject_name || second.subject || null) : null;

          reserved.push({
            grade:              first.grade,
            day:                first.day,
            period:             first.period,
            is_locked:          true,
            is_blocked:         false,
            subject_name:       firstName,
            teacher_id:         first.teacher_id         || null,
            second_teacher_id:  first.second_teacher_id  || null,
            // Merge the paired (SS) subject into the same entry so makeState()
            // stores it correctly and both teachers appear in teacherBusy.
            paired_subject:     secondName,
            paired_teacher_id:  second ? (second.teacher_id || null) : null,
          });
        });

        lockedSlots = [...baseLockedSlots, ...reserved];
      }

      // Two reasons a class can be skipped this run:
      //   1. The admin manually excluded it (e.g. JSS 3 / SSS 3 during WAEC).
      //      All assignments are kept intact; the class just doesn't compete
      //      for teacher time this round.
      //   2. The class has zero teachers assigned (neither a class teacher
      //      nor any subject teacher) — equivalent to "intentionally empty".
      // In both cases the solver doesn't run for that class, and its
      // teachers' free periods are fully available for the remaining classes.
      const gradesWithAssignments = new Set(
        assignments
          .filter(a => a.teacher_id || a.subject_teacher_id)
          .map(a => a.grade)
      );
      const excludedSet     = new Set(excludedGrades);
      const userIncluded    = grades.filter(g => !excludedSet.has(g));
      const effectiveGrades = userIncluded.filter(g => gradesWithAssignments.has(g));
      const skippedByUser     = grades.filter(g => excludedSet.has(g));
      const skippedNoTeachers = userIncluded.filter(g => !gradesWithAssignments.has(g));

      if (effectiveGrades.length === 0) {
        const reason = skippedByUser.length > 0
          ? "All remaining classes have no teachers assigned."
          : "No classes have teachers assigned. Assign teachers in Settings → Class Assignments first.";
        setProgress({ phase: reason, percent: 0 });
        setGenerating(false);
        return;
      }

      // Drop locks (and reserved fill-empty entries) for classes the admin
      // is excluding this run, so excluded-class slots can't reserve teacher
      // availability or accidentally appear in the result.
      const filteredLockedSlots = lockedSlots.filter(s => !excludedSet.has(s.grade));

      // ── JSS 3 → SSS subject injection ────────────────────────────────────────
      // When mode is on: remove JSS 3's own JSS assignments and replace them
      // with assignments for the selected SSS subjects, borrowing the teacher
      // already assigned to each subject at SSS level.
      // JSS 3 is not in SS_GRADES so the solver automatically skips pairing for it.
      let effectiveAssignments = assignments;
      if (jss3SSSMode && jss3SSSSubjects.length > 0) {
        const withoutJSS3 = assignments.filter(a => a.grade !== "JSS 3");
        const jss3Injected = jss3SSSSubjects.flatMap(subjectName => {
          // Prefer an SSS assignment that already has a teacher
          const sssAssignment =
            assignments.find(a => SS_GRADE_LIST.includes(a.grade) && a.subject === subjectName && a.subject_teacher_id) ||
            assignments.find(a => SS_GRADE_LIST.includes(a.grade) && a.subject === subjectName);
          if (!sssAssignment) return [];
          return [{ ...sssAssignment, grade: "JSS 3", id: `jss3-sss-${subjectName}` }];
        });
        effectiveAssignments = [...withoutJSS3, ...jss3Injected];
      }

      const res = await runInWorker('generate', {
        algorithm: selectedAlgorithm,
        grades: effectiveGrades,
        subjects,
        assignments: effectiveAssignments,
        teachers,
        availabilities,
        allSlots,
        lockedSlots: filteredLockedSlots,
        priorityTeacherIds,
        ssPairings,
      }, (workerProgress) => {
        setProgress({
          phase: workerProgress?.phase || "Running solver...",
          percent: Number(workerProgress?.percent || 0),
        });
      });

      // Surface skipped grades so the admin sees plainly why their timetable
      // doesn't include those classes — instead of wondering why the result
      // came back blank for them.
      const augmentedWarnings = [
        ...(Array.isArray(res?.warnings) ? res.warnings : []),
        ...(skippedByUser.length > 0
          ? [`Excluded by you: ${skippedByUser.join(", ")}`]
          : []),
        ...(skippedNoTeachers.length > 0
          ? [`Skipped (no teachers assigned): ${skippedNoTeachers.join(", ")}`]
          : []),
      ];

      setResult({
        ...res,
        warnings: augmentedWarnings,
        skippedByUser,
        skippedNoTeachers,
        generation_mode: fillEmptyOnly ? "fill_empty" : "replace_all",
      });
      setProgress({ phase: "Generation complete.", percent: 100 });
    } catch (err) {
      console.error('Generation failed:', err);
      setProgress({ phase: "Generation failed.", percent: 0 });
    } finally {
      setGenerating(false);
    }
  };


  const handleApply = async () => {
    if (result && !applying) {
      setApplying(true);
      await onGenerate(result.result, { fillEmptyOnly: result.generation_mode === "fill_empty" });
      setApplying(false);
      onClose();
    }
  };

  // Only warn about assignments that are actually active (subject exists in the
  // subjects list and has periods_per_week > 0).  Orphaned/stale assignments for
  // subjects that have since been deleted or renamed are silently ignored.
  const validSubjectNamesSet = new Set(subjects.map(s => s.subject_name));
  const unassignedSubjects = assignments.filter(
    a => !a.subject_teacher_id
      && validSubjectNamesSet.has(a.subject)
      && (a.periods_per_week || 0) > 0
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5 text-blue-600" />
            Auto-Generate Timetable — All Classes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              {selectedAlgorithm === "cpsat_lns" ? (
                <>
                  <p>Uses a <strong>CP-SAT + Large Neighbourhood Search</strong> engine across all {grades.length} classes.</p>
                  <p className="mt-1 text-xs text-blue-600">
                    <strong>Hard constraints</strong>: no teacher/class clashes, blocked periods, availability, max day/week load, subject frequency, long break.<br />
                    <strong>Soft constraints (LNS)</strong>: even subject spread, fewer teacher gaps, daily load balance, grade imbalance minimization.
                  </p>
                </>
              ) : selectedAlgorithm === "adaptive_tabu" ? (
                <>
                  <p>Uses a <strong>Multi-Restart CSP + Tabu Search</strong> engine — built for hard constraint conditions.</p>
                  <p className="mt-1 text-xs text-blue-600">
                    <strong>Phase 1 (Multi-Restart CBJ)</strong>: runs up to 6 independent attempts with Conflict-Directed Backjumping and 3× the normal backtrack budget. Picks the best feasible result.<br />
                    <strong>Phase 2 (Tabu Search)</strong>: systematic forbidden-move optimization — avoids revisiting recent states for a more thorough search than SA.<br />
                    <strong>Conflict analysis</strong>: reports which specific constraints are bottlenecks when subjects cannot be placed.
                  </p>
                </>
              ) : (
                <>
                  <p>Uses a <strong>Greedy + Repair</strong> engine across all {grades.length} classes.</p>
                  <p className="mt-1 text-xs text-blue-600">Teacher clashes, blocked slots, availability, and load limits are enforced first. Then the timetable is cleaned up with repairs and quick improvements.</p>
                </>
              )}
              <p className="mt-1 text-xs text-blue-600">Term: <strong>{term} {academicYear}</strong> — Locked &amp; blocked slots preserved.</p>
            </div>
          </div>

          {teacherCapacityIssues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold text-red-700">
                Pre-flight check: {teacherCapacityIssues.length} teacher(s) are over weekly load.
              </p>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {teacherCapacityIssues.map((issue) => (
                  <p key={issue.teacherId} className="text-xs text-red-600">
                    {issue.teacherName}: {issue.load}/{issue.limit} periods per week (over by {issue.overBy})
                  </p>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-red-700">
                <input
                  type="checkbox"
                  checked={ackCapacityRisk}
                  onChange={(e) => setAckCapacityRisk(e.target.checked)}
                  className="w-3.5 h-3.5 accent-red-600"
                />
                I understand this may produce partial timetables and want to continue.
              </label>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
            <p className="text-sm font-semibold text-slate-700">Generation Mode</p>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={fillEmptyOnly}
                onChange={(e) => setFillEmptyOnly(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-600"
              />
              <span>
                Fill only empty slots
                <span className="block text-xs text-slate-500">
                  Keeps existing timetable entries and generates only for unfilled periods.
                </span>
              </span>
            </label>
          </div>

          {/* Per-class exclusion — primarily for WAEC season when JSS 3 / SSS 3
              are out and the admin wants their teachers redirected to the
              remaining classes. Selection persists across modal opens. */}
          <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <BookX className="w-4 h-4 text-slate-500" />
                Classes to include
              </p>
              {excludedGrades.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExcludedGrades([])}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Include all
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Uncheck a class to skip it this round (e.g. JSS 3 / SSS 3 during WAEC). All assignments stay intact; teachers just become free for the remaining classes.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {grades.map(g => {
                const included = !excludedGrades.includes(g);
                return (
                  <label
                    key={g}
                    className={
                      "flex items-center gap-2 text-sm rounded-md border px-2 py-1.5 cursor-pointer transition-colors " +
                      (included
                        ? "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                        : "border-slate-200 text-slate-400 bg-slate-50 line-through")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setExcludedGrades(prev => prev.filter(x => x !== g));
                        } else {
                          setExcludedGrades(prev => Array.from(new Set([...prev, g])));
                        }
                      }}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span>{g}</span>
                  </label>
                );
              })}
            </div>
            {excludedGrades.length > 0 && (
              <p className="text-xs text-amber-700">
                Excluding {excludedGrades.length} class{excludedGrades.length === 1 ? "" : "es"}: {excludedGrades.join(", ")}
              </p>
            )}
          </div>

          {/* JSS 3 → SSS Transition */}
          <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-slate-700">JSS 3 Takes SSS Subjects</p>
              </div>
              <button
                type="button"
                onClick={() => setJss3SSSMode(prev => !prev)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  jss3SSSMode ? "bg-indigo-600" : "bg-slate-200"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  jss3SSSMode ? "translate-x-[18px]" : "translate-x-0.5"
                }`} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              JSS 3 students study selected SSS subjects (taught by the SSS subject teachers in separate JSS 3 slots).
              Their original JSS subjects are dropped — freeing JSS teachers for JSS 1 &amp; 2.
              No subject pairing for JSS 3.
            </p>

            {jss3SSSMode && (
              <div className="pt-1 space-y-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">Choose which SSS subjects JSS 3 will study:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setJss3SSSSubjects(sssSubjectOptions)}
                      className="text-xs text-indigo-600 hover:underline">All</button>
                    <button type="button" onClick={() => setJss3SSSSubjects([])}
                      className="text-xs text-slate-400 hover:underline">None</button>
                  </div>
                </div>
                {sssSubjectOptions.length === 0 ? (
                  <p className="text-xs text-amber-600 italic">No SSS subject assignments found. Set up SSS class assignments first.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                    {sssSubjectOptions.map(subject => {
                      const included = jss3SSSSubjects.includes(subject);
                      const hasTeacher = assignments.some(
                        a => SS_GRADE_LIST.includes(a.grade) && a.subject === subject && a.subject_teacher_id
                      );
                      return (
                        <label
                          key={subject}
                          className={`flex items-center gap-1.5 text-xs rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                            included
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={e => {
                              if (e.target.checked) setJss3SSSSubjects(prev => [...prev, subject]);
                              else setJss3SSSSubjects(prev => prev.filter(s => s !== subject));
                            }}
                            className="w-3.5 h-3.5 accent-indigo-600 flex-shrink-0"
                          />
                          <span className="truncate flex-1">{subject}</span>
                          {!hasTeacher && (
                            <span className="text-amber-400 flex-shrink-0 text-[10px]" title="No teacher assigned in SSS">⚠</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {jss3SSSSubjects.length > 0 && (
                  <p className="text-xs font-semibold text-indigo-600">
                    ✓ {jss3SSSSubjects.length} subject{jss3SSSSubjects.length !== 1 ? "s" : ""} selected for JSS 3
                  </p>
                )}
                {jss3SSSMode && excludedGrades.includes("JSS 3") && (
                  <p className="text-xs text-amber-600">
                    ⚠ JSS 3 is currently excluded above — include it for this mode to take effect.
                  </p>
                )}
              </div>
            )}
          </div>

          {generating && (
            <div className="border border-blue-200 rounded-lg bg-blue-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                <span>{progress.phase || "Running solver..."}</span>
                <span>{Math.max(0, Math.min(100, Math.round(progress.percent || 0)))}%</span>
              </div>
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.min(100, Number(progress.percent || 0)))}%` }}
                />
              </div>
            </div>
          )}

          {/* Algorithm Selector */}
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Solver Algorithm</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ALGORITHMS.map(algo => (
                <button
                  key={algo.id}
                  onClick={() => { setSelectedAlgorithm(algo.id); setResult(null); }}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    selectedAlgorithm === algo.id
                      ? algo.id === "adaptive_tabu"
                        ? "border-rose-500 bg-rose-50"
                        : "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col gap-1 mb-1">
                    <span className="text-sm font-semibold text-slate-800">{algo.icon} {algo.name}</span>
                    <span className={`self-start text-xs px-2 py-0.5 rounded-full font-medium ${algo.badgeColor}`}>{algo.badge}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{algo.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Priority Teachers — only shown for CSP+SA */}
          {selectedAlgorithm === "csp_sa" && (
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-slate-700">Priority Teachers <span className="text-xs font-normal text-slate-400">(scheduled first)</span></p>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Part-time teachers are auto-prioritized first. Select any extra teachers you also want moved up.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {teachers.filter(t => t.employment_status !== "inactive").map(t => {
                const isPriority = priorityTeacherIds.includes(t.id);
                const isAutoPriority = autoPriorityTeacherIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => togglePriority(t.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isPriority
                        ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600"
                    }`}
                  >
                    {isPriority && <Star className="w-3 h-3" />}
                    {t.first_name} {t.last_name}
                    {isAutoPriority && <span className="text-[10px] opacity-80">(PT)</span>}
                  </button>
                );
              })}
            </div>
            {priorityTeacherIds.length > 0 && (
              <p className="text-xs text-amber-600 mt-2 font-medium">
                ★ {priorityTeacherIds.length} teacher(s) will be prioritized in scheduling
              </p>
            )}
          </div>
          )}

          {unassignedSubjects.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-amber-700 mb-1">⚠ {unassignedSubjects.length} subject(s) have no teacher assigned:</p>
              <div className="flex flex-wrap gap-1">
                {unassignedSubjects.map((a, i) => (
                  <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                    {a.grade}: {a.subject}
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-600 mt-1">These will be <strong>skipped</strong> — assign teachers in the Subject Setup tab first.</p>
            </div>
          )}

          {/* Grade summary */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Subject Assignments Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {grades.map(grade => {
                // Only count assignments for subjects that actually exist and are active
                const ga = assignments.filter(
                  a => a.grade === grade
                    && validSubjectNamesSet.has(a.subject)
                    && (a.periods_per_week || 0) > 0
                );
                const unassignedCount = ga.filter(a => !a.subject_teacher_id).length;
                return (
                  <div key={grade} className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <div className="font-semibold text-slate-700 text-sm">{grade}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{ga.length} subjects</div>
                    <div className="text-xs text-slate-500">{ga.reduce((s, a) => s + (a.periods_per_week || 0), 0)} periods/week</div>
                    {unassignedCount > 0 && (
                      <div className="text-xs text-amber-500 mt-0.5">⚠ {unassignedCount} unassigned</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="border-t pt-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {result.warnings.length === 0 && result.infeasibleConflicts.length === 0
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500" />
                  }
                  <p className="text-sm font-semibold text-slate-700">
                    {result.result.length} slots generated
                  </p>
                  {result.generation_mode === "fill_empty" && (
                    <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      Fill Empty Mode
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Quality score: <span className="font-bold text-slate-700">{Math.max(0, 10000 - result.penalty)}</span>
                  {result.algorithm && <span className="text-slate-400 hidden sm:inline">| {result.algorithm}</span>}
                  {result.backtracks > 0 && <span className="text-slate-400">| {result.backtracks} backtracks</span>}
                </div>
              </div>

              {/* Infeasible conflicts */}
              {result.infeasibleConflicts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <p className="text-xs font-semibold text-red-700">Conflicting Constraints — could not fully satisfy ({result.infeasibleConflicts.length})</p>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {result.infeasibleConflicts.map((c, i) => (
                      <p key={i} className="text-xs text-red-600">{c}</p>
                    ))}
                  </div>
                  <p className="text-xs text-red-500 mt-1">Consider relaxing teacher constraints or reducing required periods for the above subjects.</p>
                </div>
              )}

              {/* Soft warnings */}
              {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Partial Placement ({result.warnings.length})</p>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Success log */}
              {result.log.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-0.5">
                  {result.log.map((line, i) => (
                    <p key={i} className="text-xs text-green-700">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          {!result ? (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating || (teacherCapacityIssues.length > 0 && !ackCapacityRisk)}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating...</>
                : <><Zap className="w-4 h-4 mr-1.5" /> Generate</>}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <Zap className="w-3.5 h-3.5 mr-1.5" /> Re-generate
              </Button>
              <Button size="sm" onClick={handleApply} disabled={applying} className="bg-green-600 hover:bg-green-700 text-white min-w-[160px]">
                {applying
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                  : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> {applyLabel}</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
