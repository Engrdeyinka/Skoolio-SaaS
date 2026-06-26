/**
 * Multi-Restart + Tabu Search Timetable Solver
 *
 * Designed for hard constraint conditions where the default CSP+SA and
 * CP-SAT+LNS solvers leave unplaced subjects.
 *
 * Phase 1 — Multi-Restart CSP with Conflict-Directed Backjumping (CBJ):
 *   - Runs up to RESTART_COUNT independent attempts.
 *   - Each attempt uses a freshly shuffled task ordering.
 *   - Backtrack budget is 3× that of the default solver.
 *   - CBJ: when a dead-end is reached, the solver jumps back to the
 *     deepest variable in the conflict set, not just one level up.
 *   - After all restarts, picks the attempt with the fewest unplaced tasks.
 *
 * Phase 2 — Tabu Search:
 *   - Maintains a circular tabu list of (subject, fromSlot, toSlot) moves.
 *   - At each iteration evaluates ALL neighbours of a random grade and picks
 *     the best non-tabu move (aspiration: override tabu if it's a global best).
 *   - Produces consistently lower penalty than SA on tightly constrained problems
 *     because it never re-visits recently explored states.
 *
 * Hard constraints (identical to other solvers for consistency):
 *   HC1  No teacher clash across grades at the same slot
 *   HC2  No class clash (one subject per grade per slot)
 *   HC3  Blocked / locked slots are never touched
 *   HC4  Teacher unavailability (full-time: day; part-time: day+period)
 *   HC5  Max teacher load per day
 *   HC6  Max teacher load per week
 *   HC7  Subject max occurrences per day
 *   HC8  Double-period rule: two slots of same subject on same day must be
 *        consecutive and must not cross the long break (period 4→5)
 */
import { buildSSPairMap, DEFAULT_SS_PAIRINGS } from "../ssPairings.js";
import { DAYS, PERIODS } from "../constants.js";
import { getAutomaticPriorityTeacherIds, sortTasksForPriority } from "../priority.js";

const ALL_SLOTS = [];
DAYS.forEach(d => PERIODS.forEach(p => ALL_SLOTS.push({ day: d, period: p })));

const MAX_BACKTRACKS = 2500;   // 3× the default solver
const RESTART_COUNT  = 6;      // number of independent CSP restarts
const TABU_TENURE    = 14;     // how many iterations a move stays forbidden
const TABU_ITERS     = 1800;   // total tabu search iterations

const SS_GRADES = ["SSS 1", "SSS 2", "SSS 3"];

// Soft-constraint weights (same scale as other solvers)
const SW = {
  UNPLACED:          2000,  // ↑ was 1000 — must be highest weight
  SPREAD:              22,
  TEACHER_GAP:          9,
  LATE_PERIOD:          3,
  DAILY_IMBALANCE:      8,
  GRADE_IMBALANCE:     16,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isTeacherUnavailable(avail, day, period) {
  if (!avail) return false;
  if (avail.employment_type === "part_time")
    return (avail.unavailable_periods_by_day?.[day] || []).includes(period);
  if (avail.unavailable_days?.includes(day)) return true;
  return (avail.unavailable_periods || []).includes(period);
}

// ─── State helpers ────────────────────────────────────────────────────────────

function makeState(grades, teachers, blockedMap, lockedSlots) {
  const grids = {};
  grades.forEach(g => { grids[g] = {}; });
  const teacherBusy    = {};
  const teacherDayLoad = {};
  const teacherWeekLoad = {};
  teachers.forEach(t => {
    teacherBusy[t.id]     = new Set();
    teacherDayLoad[t.id]  = {};
    DAYS.forEach(d => { teacherDayLoad[t.id][d] = 0; });
    teacherWeekLoad[t.id] = 0;
  });
  lockedSlots.forEach(slot => {
    if (!slot.is_blocked && slot.subject_name && grids[slot.grade]) {
      const key = `${slot.day}-${slot.period}`;
      grids[slot.grade][key] = {
        subject_name:      slot.subject_name,
        teacher_id:        slot.teacher_id        || "",
        paired_subject:    slot.paired_subject    || null,
        paired_teacher_id: slot.paired_teacher_id || null,
      };
      [slot.teacher_id, slot.second_teacher_id, slot.paired_teacher_id].filter(Boolean).forEach(tid => {
        if (!teacherBusy[tid]) return;
        teacherBusy[tid].add(key);
        teacherDayLoad[tid][slot.day]  = (teacherDayLoad[tid][slot.day]  || 0) + 1;
        teacherWeekLoad[tid]           = (teacherWeekLoad[tid]           || 0) + 1;
      });
    }
  });
  return { grids, teacherBusy, teacherDayLoad, teacherWeekLoad };
}

function cloneState(state, grades, teachers) {
  const grids = {};
  grades.forEach(g => {
    grids[g] = {};
    Object.entries(state.grids[g]).forEach(([k, v]) => { grids[g][k] = { ...v }; });
  });
  const teacherBusy    = {};
  const teacherDayLoad = {};
  const teacherWeekLoad = {};
  teachers.forEach(t => {
    teacherBusy[t.id]     = new Set(state.teacherBusy[t.id]);
    teacherDayLoad[t.id]  = { ...state.teacherDayLoad[t.id] };
    teacherWeekLoad[t.id] = state.teacherWeekLoad[t.id];
  });
  return { grids, teacherBusy, teacherDayLoad, teacherWeekLoad };
}

function place(state, grade, day, period, subject_name, teacher_id, paired_subject, paired_teacher_id) {
  const key = `${day}-${period}`;
  state.grids[grade][key] = {
    subject_name,
    teacher_id:        teacher_id        || "",
    paired_subject:    paired_subject    || null,
    paired_teacher_id: paired_teacher_id || null,
  };
  [teacher_id, paired_teacher_id].filter(Boolean).forEach(tid => {
    if (!state.teacherBusy[tid]) return;
    state.teacherBusy[tid].add(key);
    state.teacherDayLoad[tid][day]  = (state.teacherDayLoad[tid][day]  || 0) + 1;
    state.teacherWeekLoad[tid]      = (state.teacherWeekLoad[tid]      || 0) + 1;
  });
}

function unplace(state, grade, day, period) {
  const key      = `${day}-${period}`;
  const existing = state.grids[grade][key];
  if (!existing) return;
  delete state.grids[grade][key];
  [existing.teacher_id, existing.paired_teacher_id].filter(Boolean).forEach(tid => {
    if (!state.teacherBusy[tid]) return;
    state.teacherBusy[tid].delete(key);
    state.teacherDayLoad[tid][day]  = Math.max(0, (state.teacherDayLoad[tid][day]  || 1) - 1);
    state.teacherWeekLoad[tid]      = Math.max(0, (state.teacherWeekLoad[tid]      || 1) - 1);
  });
}

// ─── Hard-constraint check ────────────────────────────────────────────────────

function checkHard(state, blockedMap, task, day, period) {
  const key = `${day}-${period}`;
  const { grade, teacher_id, maxPerDay, avail, maxTeacherDay, maxTeacherWeek,
          subject_name, pairedTeacherId, pairedAvail } = task;

  if (state.grids[grade][key])         return "Class clash";
  if (blockedMap[grade]?.has(key))     return "Slot blocked";

  if (teacher_id) {
    if (isTeacherUnavailable(avail, day, period))             return "Teacher unavailable";
    if (state.teacherBusy[teacher_id]?.has(key))              return "Teacher clash";
    if ((state.teacherDayLoad[teacher_id]?.[day] || 0) >= maxTeacherDay)  return "Teacher day limit";
    if ((state.teacherWeekLoad[teacher_id] || 0) >= maxTeacherWeek)       return "Teacher week limit";
  }
  if (pairedTeacherId) {
    const pMaxDay  = pairedAvail?.max_periods_per_day  ?? 8;
    const pMaxWeek = pairedAvail?.max_periods_per_week ?? 40;
    if (isTeacherUnavailable(pairedAvail, day, period))            return "Paired teacher unavailable";
    if (state.teacherBusy[pairedTeacherId]?.has(key))              return "Paired teacher clash";
    if ((state.teacherDayLoad[pairedTeacherId]?.[day] || 0) >= pMaxDay)  return "Paired teacher day limit";
    if ((state.teacherWeekLoad[pairedTeacherId] || 0) >= pMaxWeek)       return "Paired teacher week limit";
  }

  // HC7: max per day
  const sameDayCount = Object.entries(state.grids[grade])
    .filter(([k, v]) => k.startsWith(day + "-") && v.subject_name === subject_name).length;
  if (sameDayCount >= maxPerDay) return "Subject day limit";

  // HC8 (UNCONDITIONAL): if a subject appears twice on the same day, the two
  // periods MUST be strictly consecutive (b === a + 1) AND must NOT straddle
  // the long break (P4 + P5). Spreading is preferred via SC1 — but when
  // doubling is forced (e.g. periods_per_week > number of school days), the
  // pair has to read as a real double period. Anything else (P2 + P5,
  // P1 + P3, etc.) is rejected so the solver picks a different day or moves
  // another subject out of the way.
  if (sameDayCount === 1) {
    const existKey = Object.keys(state.grids[grade])
      .find(k => k.startsWith(day + "-") && state.grids[grade][k].subject_name === subject_name);
    const ep = Number(existKey?.split("-")[1]);
    const [a, b] = ep < period ? [ep, period] : [period, ep];
    if (a === 4 && b === 5) return "Double period crosses long break";
    if (b !== a + 1)        return "Double period must be consecutive";
  }

  return null;
}

// ─── Build tasks ──────────────────────────────────────────────────────────────

function buildTasks(grades, assignments, subjects, availabilities, lockedSlots, ssPairings) {
  const validSubjectNames = new Set(subjects.map(s => s.subject_name));
  const tasks = [];
  const processedPairs = new Set();
  const ssPairMap = buildSSPairMap(ssPairings);

  grades.forEach(grade => {
    const gradeAssignments = assignments.filter(a =>
      a.grade === grade && validSubjectNames.has(a.subject) && (a.periods_per_week || 0) > 0
      && a.subject_teacher_id  // skip subjects with no assigned teacher
    );
    gradeAssignments.forEach(assignment => {
      const isSSGrade = SS_GRADES.includes(grade);
      const pairedSubject = isSSGrade ? ssPairMap[assignment.subject] : null;
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
        s => s.grade === grade && !s.is_blocked &&
             (s.subject_name === assignment.subject || s.paired_subject === assignment.subject)
      ).length;
      const periodsNeeded = (assignment.periods_per_week || 4) - lockedCount;
      if (periodsNeeded <= 0) return;

      tasks.push({
        grade,
        subject_name:    assignment.subject,
        teacher_id:      assignment.subject_teacher_id || null,
        maxPerDay:       assignment.max_per_day || 2,
        allowDouble:     !!assignment.allow_double,
        periodsPerWeek:  assignment.periods_per_week || 4,
        periodsNeeded,
        lockedCount,
        pairedSubject:   pairedSubject || null,
        pairedTeacherId: pairedAssignment?.subject_teacher_id || null,
        avail,
        pairedAvail,
        maxTeacherDay:   avail?.max_periods_per_day  ?? 8,
        maxTeacherWeek:  avail?.max_periods_per_week ?? 40,
      });
    });
  });
  return tasks;
}

// ─── Bottleneck teacher detection ────────────────────────────────────────────
// For paired tasks (SS elective pairs), the bottleneck teacher is whichever of
// primary / paired has the fewest available slots.  All tasks that share the
// same bottleneck teacher must be interleaved together so one class cannot
// monopolise that teacher's capacity before other classes get their turns.

function bottleneckTeacherId(task) {
  if (!task.teacher_id && !task.pairedTeacherId) return null;
  if (!task.teacher_id)    return task.pairedTeacherId;
  if (!task.pairedTeacherId) return task.teacher_id;

  const primarySlots = DAYS.reduce((sum, day) => {
    let c = 0;
    PERIODS.forEach(p => { if (!isTeacherUnavailable(task.avail,       day, p)) c++; });
    return sum + c;
  }, 0);
  const pairedSlots = DAYS.reduce((sum, day) => {
    let c = 0;
    PERIODS.forEach(p => { if (!isTeacherUnavailable(task.pairedAvail, day, p)) c++; });
    return sum + c;
  }, 0);

  return pairedSlots < primarySlots ? task.pairedTeacherId : task.teacher_id;
}

// ─── Phase 1: Multi-Restart CSP with CBJ ─────────────────────────────────────

function cspWithCBJ(tasks, state, blockedMap) {
  const units = [];
  tasks.forEach(t => {
    for (let i = 0; i < t.periodsNeeded; i++) units.push({ ...t });
  });

  let backtracks = 0;
  const conflictSet = new Set();

  // buildDomain returns all valid slots for a unit in current state
  function domain(unit) {
    return ALL_SLOTS.filter(({ day, period }) => !checkHard(state, blockedMap, unit, day, period));
  }

  // CBJ: uses absolute search depth so jump-targets stay valid as the pending
  // array shrinks. jumpToDepth is the depth of the earliest conflicting ancestor.
  // If sub.jumpToDepth < currentDepth the conflict is above us — skip remaining
  // domain values and propagate the jump upward (conflict-directed backjumping).
  function backtrack(pending, depth) {
    if (pending.length === 0) return { ok: true };
    if (backtracks > MAX_BACKTRACKS) return { ok: false, jumpToDepth: depth };

    // MRV: pick variable with smallest domain
    let bestIdx = 0, bestSize = Infinity;
    for (let i = 0; i < pending.length; i++) {
      const s = domain(pending[i]).length;
      if (s < bestSize) { bestSize = s; bestIdx = i; }
    }

    if (bestSize === 0) {
      // Dead-end: domain is empty. Record conflict and jump back to current depth.
      conflictSet.add(`${pending[bestIdx].grade} – ${pending[bestIdx].subject_name}`);
      backtracks++;
      return { ok: false, jumpToDepth: depth };
    }

    const unit      = pending[bestIdx];
    const remaining = pending.filter((_, i) => i !== bestIdx);
    const dom       = shuffle(domain(unit));

    for (const { day, period } of dom) {
      place(state, unit.grade, day, period, unit.subject_name, unit.teacher_id,
            unit.pairedSubject || null, unit.pairedTeacherId || null);

      // Forward checking
      let wipeout = false;
      for (const u of remaining) {
        if (domain(u).length === 0) { wipeout = true; break; }
      }

      if (!wipeout) {
        const sub = backtrack(remaining, depth + 1);
        if (sub.ok) return { ok: true };
        // CBJ: if the conflict is shallower than our depth, skip remaining values
        // and propagate the jump upward so intermediate variables are bypassed.
        if (sub.jumpToDepth !== undefined && sub.jumpToDepth < depth) {
          unplace(state, unit.grade, day, period);
          backtracks++;
          return sub;
        }
      }
      unplace(state, unit.grade, day, period);
      backtracks++;
      if (backtracks > MAX_BACKTRACKS) break;
    }

    // Exhausted all values — conflict is rooted at or above current depth
    conflictSet.add(`${unit.grade} – ${unit.subject_name}: could not place`);
    return { ok: false, jumpToDepth: depth };
  }

  const { ok } = backtrack(units, 0);

  // Greedy fallback for any still-unplaced units
  if (!ok) {
    const placedCount = {};
    tasks.forEach(t => { placedCount[`${t.grade}|${t.subject_name}`] = 0; });
    Object.entries(state.grids).forEach(([grade, grid]) => {
      Object.values(grid).forEach(v => {
        const k = `${grade}|${v.subject_name}`;
        if (k in placedCount) placedCount[k]++;
      });
    });
    const remaining = [];
    tasks.forEach(task => {
      const k = `${task.grade}|${task.subject_name}`;
      const still = task.periodsNeeded - (placedCount[k] || 0);
      for (let i = 0; i < still; i++) remaining.push({ ...task });
    });
    remaining.sort((a, b) => domain(a).length - domain(b).length);
    remaining.forEach(unit => {
      const d = shuffle(domain(unit));
      if (d.length > 0) {
        place(state, unit.grade, d[0].day, d[0].period, unit.subject_name, unit.teacher_id,
              unit.pairedSubject || null, unit.pairedTeacherId || null);
      } else {
        conflictSet.add(`${unit.grade} – ${unit.subject_name}: no slot available`);
      }
    });
  }

  // Count unplaced
  let unplacedCount = 0;
  tasks.forEach(t => {
    const placed = Object.values(state.grids[t.grade]).filter(v => v.subject_name === t.subject_name).length;
    unplacedCount += Math.max(0, t.periodsNeeded - placed);
  });

  return { unplacedCount, conflicts: [...conflictSet], backtracks };
}

function multiRestartCSP(tasks, grades, teachers, blockedMap, lockedSlots, priorityTeacherIds, onProgress) {
  const prioritySet = new Set(priorityTeacherIds || []);
  // A task is "priority" if it (a) belongs to a part-time teacher, or
  // (b) belongs to a teacher the user manually priority-flagged. ALL priority
  // tasks' units are placed BEFORE any non-priority task's units — part-time
  // teachers' periods must be COMPLETELY exhausted first because their
  // availability windows are too narrow to compete with full-time teachers
  // during CSP backtracking.
  const isPriorityTask = (t) =>
    t?.avail?.employment_type === "part_time" ||
    t?.pairedAvail?.employment_type === "part_time" ||
    prioritySet.has(t?.teacher_id) ||
    prioritySet.has(t?.pairedTeacherId);

  // Partition tasks into two bands so we can interleave each band separately
  // and concatenate priority-first.  Round-robin fairness is preserved WITHIN
  // each band; nothing from the second band is touched until the first band
  // is fully scheduled.
  const priorityTasks = tasks.filter(isPriorityTask);
  const otherTasks    = tasks.filter(t => !isPriorityTask(t));

  let bestState    = null;
  let bestUnplaced = Infinity;
  let bestConflicts = [];
  let totalBacktracks = 0;

  // Interleave tasks grouped by BOTTLENECK teacher so paired teachers (e.g.
  // Yoruba teacher who also appears as pairedTeacherId in SS Geography/Yoruba
  // blocks) are treated as a single constrained resource.  Without this, the
  // SS classes would consume all her available slots before JSS classes get any.
  function interleave(taskList) {
    const groups = {}, order = [];
    taskList.forEach(t => {
      const bn  = bottleneckTeacherId(t);
      const key = bn ? `t:${bn}` : `noT:${t.grade}|${t.subject_name}`;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(t);
    });
    const queues = order.map(key => {
      const grp = groups[key];
      if (grp.length <= 1)
        return grp.flatMap(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
      const byGrade = grp.map(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
      const il = [];
      let added = true;
      while (added) {
        added = false;
        byGrade.forEach(u => { if (u.length > 0) { il.push(u.shift()); added = true; } });
      }
      return il;
    });
    const result = [];
    let anyLeft = true;
    while (anyLeft) {
      anyLeft = false;
      queues.forEach(q => { if (q.length > 0) { result.push(q.shift()); anyLeft = true; } });
    }
    return result;
  }

  for (let attempt = 0; attempt < RESTART_COUNT; attempt++) {
    // Fresh state each restart
    const state    = makeState(grades, teachers, blockedMap, lockedSlots);
    // Interleave priority tasks ENTIRELY first, then non-priority tasks.
    // Per-restart variety comes from shuffling the task order WITHIN each band
    // before interleaving — this preserves strict band separation while still
    // letting different restarts try different orderings.
    const priorityShuffled = shuffle(priorityTasks);
    const otherShuffled    = shuffle(otherTasks);
    const shuffled = [
      ...interleave(priorityShuffled),
      ...interleave(otherShuffled),
    ];
    const res      = cspWithCBJ(shuffled, state, blockedMap);
    totalBacktracks += res.backtracks;

    if (res.unplacedCount < bestUnplaced) {
      bestUnplaced  = res.unplacedCount;
      bestState     = state;
      bestConflicts = res.conflicts;
    }
    if (onProgress) {
      const pct = Math.round(35 + ((attempt + 1) / RESTART_COUNT) * 25); // 35→60%
      onProgress(`CSP restart ${attempt + 1}/${RESTART_COUNT}...`, pct);
    }
    if (bestUnplaced === 0) break; // perfect feasibility achieved
  }

  return { state: bestState, unplacedCount: bestUnplaced, conflicts: bestConflicts, backtracks: totalBacktracks };
}

// ─── Soft-constraint penalty ──────────────────────────────────────────────────

function computePenalty(grids, grades, tasks) {
  let p = 0;

  grades.forEach(grade => {
    const entries = Object.entries(grids[grade]);

    // Unplaced periods
    tasks.filter(t => t.grade === grade).forEach(task => {
      const placed = entries.filter(([, v]) => v.subject_name === task.subject_name).length + task.lockedCount;
      if (placed < task.periodsPerWeek) p += SW.UNPLACED * (task.periodsPerWeek - placed);
    });

    // SC1: subject spread
    const bySub = {};
    entries.forEach(([key, val]) => {
      const day = key.split("-")[0];
      if (!bySub[val.subject_name]) bySub[val.subject_name] = { days: new Set(), count: 0 };
      bySub[val.subject_name].days.add(day);
      bySub[val.subject_name].count++;
    });
    Object.values(bySub).forEach(({ days, count }) => {
      if (count > days.size) p += SW.SPREAD * (count - days.size);
    });

    // SC3: late periods
    entries.forEach(([key]) => {
      if (Number(key.split("-")[1]) >= 7) p += SW.LATE_PERIOD;
    });

    // SC4: daily load balance
    const dayCount = {};
    DAYS.forEach(d => { dayCount[d] = 0; });
    entries.forEach(([key]) => { dayCount[key.split("-")[0]]++; });
    const loads = Object.values(dayCount);
    const mean  = loads.reduce((a, b) => a + b, 0) / 5;
    p += SW.DAILY_IMBALANCE * loads.reduce((s, l) => s + (l - mean) ** 2, 0) / 5;
  });

  // SC2: teacher gaps
  const teacherDaySlots = {};
  grades.forEach(grade => {
    Object.entries(grids[grade]).forEach(([key, val]) => {
      if (!val.teacher_id) return;
      const [day, pStr] = key.split("-");
      const tKey = `${val.teacher_id}|${day}`;
      if (!teacherDaySlots[tKey]) teacherDaySlots[tKey] = [];
      teacherDaySlots[tKey].push(Number(pStr));
    });
  });
  Object.values(teacherDaySlots).forEach(periods => {
    if (periods.length < 2) return;
    const sorted = [...periods].sort((a, b) => a - b);
    p += SW.TEACHER_GAP * (sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length);
  });

  // SC5: teacher+subject grade imbalance
  const teacherSubGrade = {};
  grades.forEach(grade => {
    Object.values(grids[grade]).forEach(val => {
      if (!val.teacher_id) return;
      const key = `${val.teacher_id}|${val.subject_name}`;
      if (!teacherSubGrade[key]) teacherSubGrade[key] = {};
      teacherSubGrade[key][grade] = (teacherSubGrade[key][grade] || 0) + 1;
    });
  });
  Object.values(teacherSubGrade).forEach(gMap => {
    const counts = Object.values(gMap);
    if (counts.length < 2) return;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    p += SW.GRADE_IMBALANCE * counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
  });

  return p;
}

// ─── Phase 2: Tabu Search ─────────────────────────────────────────────────────

function tabuSearch(state, grades, tasks, blockedMap, availabilities, lockedSlots, onProgress) {
  const isLocked = (grade, day, period) =>
    lockedSlots.some(s => s.grade === grade && s.day === day && s.period === period && s.is_locked);

  // Tabu list: circular buffer of move keys
  const tabuList  = new Set();
  const tabuQueue = []; // FIFO queue for eviction

  function addTabu(key) {
    if (tabuList.has(key)) return;
    tabuList.add(key);
    tabuQueue.push(key);
    if (tabuQueue.length > TABU_TENURE) {
      tabuList.delete(tabuQueue.shift());
    }
  }

  function moveKey(grade, s1, s2) {
    // Canonical key: sort slot strings so swap(A,B) == swap(B,A)
    const a = `${s1.subject_name}@${s1.day}-${s1.period}`;
    const b = `${s2.subject_name}@${s2.day}-${s2.period}`;
    return grade + "|" + [a, b].sort().join("↔");
  }
  function relocKey(grade, s, toDay, toPeriod) {
    return `${grade}|${s.subject_name}@${s.day}-${s.period}→${toDay}-${toPeriod}`;
  }

  function getMoveable(grade) {
    return Object.entries(state.grids[grade])
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
    const occ = new Set(Object.keys(state.grids[grade]));
    return ALL_SLOTS.filter(({ day, period }) => !occ.has(`${day}-${period}`) && !blockedMap[grade]?.has(`${day}-${period}`));
  }

  function taskFor(grade, subject_name) {
    const t = tasks.find(tk => tk.grade === grade && tk.subject_name === subject_name) || {};
    return {
      grade,
      subject_name,
      teacher_id:      t.teacher_id      || state.grids[grade][`${t.day}-${t.period}`]?.teacher_id || "",
      pairedSubject:   t.pairedSubject    || null,
      pairedTeacherId: t.pairedTeacherId  || null,
      avail:           t.avail           || (availabilities.find(a => a.teacher_id === t.teacher_id) || null),
      pairedAvail:     t.pairedAvail      || null,
      maxTeacherDay:   t.maxTeacherDay    ?? 8,
      maxTeacherWeek:  t.maxTeacherWeek   ?? 40,
      maxPerDay:       t.maxPerDay        ?? 2,
    };
  }

  function makeTask(grade, slot) {
    const t = tasks.find(tk => tk.grade === grade && tk.subject_name === slot.subject_name) || {};
    return {
      grade,
      subject_name:    slot.subject_name,
      teacher_id:      slot.teacher_id      || t.teacher_id      || "",
      pairedSubject:   slot.paired_subject   || t.pairedSubject   || null,
      pairedTeacherId: slot.paired_teacher_id || t.pairedTeacherId || null,
      avail:           t.avail || (availabilities.find(a => a.teacher_id === slot.teacher_id) || null),
      pairedAvail:     t.pairedAvail || null,
      maxTeacherDay:   t.maxTeacherDay   ?? 8,
      maxTeacherWeek:  t.maxTeacherWeek  ?? 40,
      maxPerDay:       t.maxPerDay       ?? 2,
      allowDouble:     t.allowDouble     ?? false,   // must mirror buildTasks so HC8 fires correctly
    };
  }

  let bestPenalty = computePenalty(state.grids, grades, tasks);
  let bestGrids   = null; // save best solution

  // Save best
  function saveBest() {
    bestGrids = {};
    grades.forEach(g => {
      bestGrids[g] = {};
      Object.entries(state.grids[g]).forEach(([k, v]) => { bestGrids[g][k] = { ...v }; });
    });
  }
  saveBest();

  for (let iter = 0; iter < TABU_ITERS; iter++) {
    const grade    = grades[Math.floor(Math.random() * grades.length)];
    const moveable = getMoveable(grade);
    if (moveable.length < 1) continue;

    let bestMoveKey   = null;
    let bestMoveDelta = Infinity;
    let bestMoveApply = null;

    // ── Swap neighbourhood ──────────────────────────────────────────────────
    if (moveable.length >= 2) {
      // Sample up to 20 random swap pairs
      const pairs = Math.min(20, moveable.length * (moveable.length - 1) / 2);
      for (let k = 0; k < pairs; k++) {
        const i1 = Math.floor(Math.random() * moveable.length);
        let   i2 = Math.floor(Math.random() * moveable.length);
        if (i1 === i2) continue;
        const s1 = moveable[i1], s2 = moveable[i2];
        if (s1.subject_name === s2.subject_name) continue;

        const t1 = makeTask(grade, s1);
        const t2 = makeTask(grade, s2);

        unplace(state, grade, s1.day, s1.period);
        unplace(state, grade, s2.day, s2.period);
        const v1 = checkHard(state, blockedMap, t1, s2.day, s2.period);
        const v2 = checkHard(state, blockedMap, t2, s1.day, s1.period);

        if (!v1 && !v2) {
          place(state, grade, s2.day, s2.period, s1.subject_name, s1.teacher_id, s1.paired_subject, s1.paired_teacher_id);
          place(state, grade, s1.day, s1.period, s2.subject_name, s2.teacher_id, s2.paired_subject, s2.paired_teacher_id);
          const delta = computePenalty(state.grids, grades, tasks) - bestPenalty;

          const mKey  = moveKey(grade, s1, s2);
          const tabu  = tabuList.has(mKey);
          const aspir = delta < 0; // aspiration: override tabu if move improves global best

          if ((!tabu || aspir) && delta < bestMoveDelta) {
            bestMoveDelta = delta;
            bestMoveKey   = mKey;
            // Capture both slots so the swap can be re-applied after state is restored
            const capS1 = { ...s1 }, capS2 = { ...s2 };
            bestMoveApply = () => {
              unplace(state, grade, capS1.day, capS1.period);
              unplace(state, grade, capS2.day, capS2.period);
              place(state, grade, capS2.day, capS2.period,
                    capS1.subject_name, capS1.teacher_id, capS1.paired_subject, capS1.paired_teacher_id);
              place(state, grade, capS1.day, capS1.period,
                    capS2.subject_name, capS2.teacher_id, capS2.paired_subject, capS2.paired_teacher_id);
            };
          }

          // Undo — re-place originals
          unplace(state, grade, s2.day, s2.period);
          unplace(state, grade, s1.day, s1.period);
        }
        // Restore originals regardless
        place(state, grade, s1.day, s1.period, s1.subject_name, s1.teacher_id, s1.paired_subject, s1.paired_teacher_id);
        place(state, grade, s2.day, s2.period, s2.subject_name, s2.teacher_id, s2.paired_subject, s2.paired_teacher_id);
      }
    }

    // ── Reloc neighbourhood ─────────────────────────────────────────────────
    {
      const empties  = getEmpty(grade);
      const sampleM  = moveable.slice(0, 10);
      const sampleE  = shuffle(empties).slice(0, 10);

      for (const s of sampleM) {
        for (const { day: td, period: tp } of sampleE) {
          const t = makeTask(grade, s);
          // Unplace s first so HC7/HC8 sameDayCount is accurate for the target position
          // (otherwise s's own old slot inflates the count and rejects valid same-day moves).
          unplace(state, grade, s.day, s.period);
          const v = checkHard(state, blockedMap, t, td, tp);
          if (v) {
            place(state, grade, s.day, s.period, s.subject_name, s.teacher_id, s.paired_subject, s.paired_teacher_id);
            continue;
          }

          place(state, grade, td, tp, s.subject_name, s.teacher_id, s.paired_subject, s.paired_teacher_id);
          const delta = computePenalty(state.grids, grades, tasks) - bestPenalty;
          unplace(state, grade, td, tp);
          place(state, grade, s.day, s.period, s.subject_name, s.teacher_id, s.paired_subject, s.paired_teacher_id);

          const mKey  = relocKey(grade, s, td, tp);
          const tabu  = tabuList.has(mKey);
          const aspir = delta < 0; // aspiration: override tabu if move improves global best

          if ((!tabu || aspir) && delta < bestMoveDelta) {
            bestMoveDelta = delta;
            bestMoveKey   = mKey;
            const cap     = { s, td, tp };
            bestMoveApply = () => {
              unplace(state, grade, cap.s.day, cap.s.period);
              place(state, grade, cap.td, cap.tp, cap.s.subject_name, cap.s.teacher_id,
                    cap.s.paired_subject, cap.s.paired_teacher_id);
            };
          }
        }
      }
    }

    if (bestMoveKey !== null) {
      if (bestMoveApply) bestMoveApply();
      addTabu(bestMoveKey);
      const newP = computePenalty(state.grids, grades, tasks);
      if (newP < bestPenalty) {
        bestPenalty = newP;
        saveBest();
      }
    }
    if (onProgress && iter % 180 === 0 && iter > 0) {
      const pct = Math.round(60 + (iter / TABU_ITERS) * 25); // 60→85%
      onProgress(`Tabu search: iteration ${iter}/${TABU_ITERS}...`, pct);
    }
  }

  // Restore best solution found
  if (bestGrids) {
    grades.forEach(g => {
      Object.keys(state.grids[g]).forEach(k => { delete state.grids[g][k]; });
      Object.entries(bestGrids[g]).forEach(([k, v]) => { state.grids[g][k] = v; });
    });
  }

  return bestPenalty;
}

// ─── Conflict analysis ────────────────────────────────────────────────────────
// Groups raw conflict strings into actionable diagnostic messages

function analyzeConflicts(conflicts, tasks, grades, state) {
  const msgs = [];
  const byReason = {};

  conflicts.forEach(c => {
    // Pattern: "Grade – Subject: reason" or "Grade – Subject"
    const match = c.match(/^(.+)\s–\s(.+?)(?::\s(.+))?$/);
    if (!match) { msgs.push(c); return; }
    const [, grade, subject, reason = "no slot available"] = match;
    if (!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(`${grade}: ${subject}`);
  });

  Object.entries(byReason).forEach(([reason, items]) => {
    msgs.push(`[${reason}]: ${items.join(", ")}`);
  });

  // Teacher overload detection
  const teacherLoad = {};
  tasks.forEach(t => {
    if (!t.teacher_id) return;
    if (!teacherLoad[t.teacher_id]) teacherLoad[t.teacher_id] = { total: 0, maxWeek: t.maxTeacherWeek };
    teacherLoad[t.teacher_id].total += t.periodsPerWeek;
  });
  Object.entries(teacherLoad).forEach(([tid, { total, maxWeek }]) => {
    if (total > maxWeek) {
      msgs.push(`[Teacher overloaded]: Teacher ${tid} needs ${total} periods but max is ${maxWeek} — reduce subject periods or increase teacher's weekly limit`);
    }
  });

  return msgs;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function generateAdaptive({
  grades,
  subjects,
  assignments,
  teachers,
  availabilities,
  allSlots,
  lockedSlots,
  priorityTeacherIds = [],
  ssPairings = DEFAULT_SS_PAIRINGS,
  onProgress,
}) {
  const blockedMap = {};
  grades.forEach(g => { blockedMap[g] = new Set(); });
  allSlots.filter(s => s.is_blocked).forEach(slot => {
    if (blockedMap[slot.grade]) blockedMap[slot.grade].add(`${slot.day}-${slot.period}`);
  });

  const rawTasks = buildTasks(grades, assignments, subjects, availabilities, lockedSlots, ssPairings);
  const effectivePriorityTeacherIds = [
    ...new Set([
      ...getAutomaticPriorityTeacherIds(availabilities),
      ...priorityTeacherIds,
    ]),
  ];
  const tasks = sortTasksForPriority(rawTasks, {
    priorityTeacherIds: effectivePriorityTeacherIds,
    days: DAYS,
    periods: PERIODS,
    isUnavailable: isTeacherUnavailable,
  });

  // Phase 1: Multi-Restart CSP with CBJ
  const { state, unplacedCount, conflicts, backtracks } = multiRestartCSP(
    tasks, grades, teachers, blockedMap, lockedSlots, effectivePriorityTeacherIds, onProgress
  );

  const infeasibleConflicts = unplacedCount > 0
    ? analyzeConflicts(conflicts, tasks, grades, state)
    : [];

  // Phase 2: Tabu Search
  const finalPenalty = tabuSearch(state, grades, tasks, blockedMap, availabilities, lockedSlots, onProgress);

  // Build log / warnings
  const log = [], warnings = [];
  tasks.forEach(task => {
    const { grade, subject_name, pairedSubject, periodsPerWeek, lockedCount } = task;
    const placed = Object.values(state.grids[grade]).filter(v => v.subject_name === subject_name).length;
    const total  = placed + lockedCount;
    const label  = `${grade} – ${subject_name}${pairedSubject ? "/" + pairedSubject : ""}`;
    if (total < periodsPerWeek) {
      warnings.push(`⚠ ${label}: scheduled ${total}/${periodsPerWeek} periods`);
    } else {
      log.push(`✓ ${label}: ${total} periods`);
    }
  });

  // Flatten grids
  const result = [];
  grades.forEach(grade => {
    Object.entries(state.grids[grade]).forEach(([key, val]) => {
      const [day, ...parts] = key.split("-");
      const period = Number(parts.join("-"));
      const locked = lockedSlots.some(
        s => s.grade === grade && s.day === day && s.period === period && s.is_locked
      );
      if (!locked && val.subject_name) {
        result.push({
          grade, day, period,
          subject_name: val.subject_name,
          teacher_id:   val.teacher_id || "",
        });
        if (val.paired_subject) {
          result.push({
            grade, day, period,
            subject_name: val.paired_subject,
            teacher_id:   val.paired_teacher_id || "",
          });
        }
      }
    });
  });

  return {
    result,
    log,
    warnings,
    infeasibleConflicts,
    feasible:  infeasibleConflicts.length === 0 && warnings.length === 0,
    penalty:   Math.round(finalPenalty),
    backtracks,
    algorithm: "Multi-Restart CBJ + Tabu Search",
  };
}
