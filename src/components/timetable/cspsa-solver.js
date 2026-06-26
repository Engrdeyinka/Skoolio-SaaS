/**
 * Greedy + Repair timetable solver.
 * Pure JS, worker-safe, and intentionally simpler than the old CSP + SA flow.
 */
import { buildSSPairMap, DEFAULT_SS_PAIRINGS } from "./ssPairings.js";
import { DAYS, PERIODS } from "./constants.js";
import { getAutomaticPriorityTeacherIds, sortTasksForPriority } from "./priority.js";

const ALL_COMBOS = DAYS.flatMap((day) => PERIODS.map((period) => ({ day, period })));

const SS_GRADES = ["SSS 1", "SSS 2", "SSS 3"];

const SOFT_WEIGHTS = {
  UNPLACED: 2000,          // ↑ was 1000 — every class MUST get its required periods
  SAME_SUBJECT_DAY: 18,
  TEACHER_DAY_LOAD: 7,
  TEACHER_WEEK_LOAD: 2,
  LATE_PERIOD: 4,
  GRADE_DAY_LOAD: 4,
  GRADE_GAP: 6,
  REWARD_NEW_DAY: -7,
  REWARD_MIDDAY: -2,
};

const IMPROVE_ITERATIONS = 400;
const DEEP_IMPROVE_ITERATIONS = 4200; // split across 3 passes inside deepOptimize

function keyOf(day, period) {
  return `${day}-${period}`;
}

function parseKey(key) {
  const [day, period] = key.split("-");
  return { day, period: Number(period) };
}

function isLockedSlot(lockedSlots, grade, day, period) {
  return lockedSlots.some((slot) =>
    slot.grade === grade &&
    slot.day === day &&
    slot.period === period &&
    slot.is_locked
  );
}

function isUnavailable(avail, day, period) {
  if (!avail) return false;
  if (avail.employment_type === "part_time") {
    return (avail.unavailable_periods_by_day?.[day] || []).includes(period);
  }
  if (avail.unavailable_days?.includes(day)) return true;
  return (avail.unavailable_periods || []).includes(period);
}

function areConsecutive(p1, p2) {
  const [a, b] = p1 < p2 ? [p1, p2] : [p2, p1];
  return b === a + 1 && !(a === 4 && b === 5);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildTaskDefinitions({ grades, subjects, assignments, availabilities, lockedSlots, ssPairings }) {
  const validSubjectNames = new Set(subjects.map((subject) => subject.subject_name));
  const tasks = [];
  const taskByKey = {};
  const processedPairs = new Set();
  const ssPairMap = buildSSPairMap(ssPairings);

  grades.forEach((grade) => {
    const rawAssignments = assignments.filter((assignment) =>
      assignment.grade === grade &&
      validSubjectNames.has(assignment.subject) &&
      Number(assignment.periods_per_week || 0) > 0 &&
      assignment.subject_teacher_id  // skip subjects with no assigned teacher
    );

    // Defensive dedupe: we should only have one row per (grade, subject).
    // If duplicates exist in DB, merge to a single effective assignment.
    const mergedBySubject = {};
    rawAssignments.forEach((assignment) => {
      const key = assignment.subject;
      if (!mergedBySubject[key]) {
        mergedBySubject[key] = { ...assignment };
        return;
      }
      const current = mergedBySubject[key];
      mergedBySubject[key] = {
        ...current,
        periods_per_week: Math.max(Number(current.periods_per_week || 0), Number(assignment.periods_per_week || 0)),
        max_per_day: Math.max(Number(current.max_per_day || 0), Number(assignment.max_per_day || 0)),
        subject_teacher_id: current.subject_teacher_id ?? assignment.subject_teacher_id ?? null,
      };
    });
    const gradeAssignments = Object.values(mergedBySubject);

    gradeAssignments.forEach((assignment) => {
      const pairedSubject = SS_GRADES.includes(grade) ? ssPairMap[assignment.subject] : null;
      if (pairedSubject) {
        const pairKey = [assignment.subject, pairedSubject].sort().join("|") + `|${grade}`;
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
      }

      const pairedAssignment = pairedSubject
        ? gradeAssignments.find((candidate) => candidate.subject === pairedSubject)
        : null;
      const avail = assignment.subject_teacher_id
        ? availabilities.find((item) => item.teacher_id === assignment.subject_teacher_id) || null
        : null;
      const pairedAvail = pairedAssignment?.subject_teacher_id
        ? availabilities.find((item) => item.teacher_id === pairedAssignment.subject_teacher_id) || null
        : null;

      const lockedCount = lockedSlots.filter((slot) =>
        slot.grade === grade &&
        !slot.is_blocked &&
        (slot.subject_name === assignment.subject || slot.paired_subject === assignment.subject)
      ).length;
      const periodsPerWeek = Number(assignment.periods_per_week || 0);
      const periodsNeeded = periodsPerWeek - lockedCount;
      if (periodsNeeded <= 0) return;

      const task = {
        grade,
        subject_name: assignment.subject,
        teacher_id: assignment.subject_teacher_id || null,
        maxPerDay: Number(assignment.max_per_day || 2),
        allowDouble: !!assignment.allow_double,
        periodsPerWeek,
        periodsNeeded,
        lockedCount,
        pairedSubject: pairedSubject || null,
        pairedTeacherId: pairedAssignment?.subject_teacher_id || null,
        avail,
        pairedAvail,
        maxTeacherDay: Number(avail?.max_periods_per_day ?? 8),
        maxTeacherWeek: Number(avail?.max_periods_per_week ?? 40),
        pairedMaxTeacherDay: Number(pairedAvail?.max_periods_per_day ?? 8),
        pairedMaxTeacherWeek: Number(pairedAvail?.max_periods_per_week ?? 40),
      };

      tasks.push(task);
      taskByKey[`${grade}|${assignment.subject}`] = task;
    });
  });

  return { tasks, taskByKey };
}

// Returns the ID of the most-constrained teacher involved in a task.
// For a paired task (e.g. Geography/Yoruba) the "primary" teacher is the one
// named in the assignment; the "paired" teacher is the counterpart.
// Whichever has fewer available slots is the bottleneck and becomes the
// group key — this pulls ALL tasks that share that bottleneck into one
// interleaving group, regardless of whether they appear as primary or paired.
function bottleneckTeacherId(task) {
  if (!task.teacher_id && !task.pairedTeacherId) return null;
  if (!task.teacher_id)    return task.pairedTeacherId;
  if (!task.pairedTeacherId) return task.teacher_id;

  // Count individually available slots for each teacher
  const primarySlots = DAYS.reduce((sum, day) => {
    let c = 0;
    PERIODS.forEach((p) => { if (!isUnavailable(task.avail,       day, p)) c++; });
    return sum + c;
  }, 0);
  const pairedSlots = DAYS.reduce((sum, day) => {
    let c = 0;
    PERIODS.forEach((p) => { if (!isUnavailable(task.pairedAvail, day, p)) c++; });
    return sum + c;
  }, 0);

  // The teacher with fewer free slots is the bottleneck
  return pairedSlots < primarySlots ? task.pairedTeacherId : task.teacher_id;
}

function buildUnits(tasks, priorityTeacherIds = []) {
  // ── Step 1: enrich every task ────────────────────────────────────────────
  const prioritySet = priorityTeacherIds instanceof Set ? priorityTeacherIds : new Set(priorityTeacherIds);
  const enriched = tasks.map((task) => {
    // Priority is set if EITHER the primary or paired teacher is priority — for
    // SS elective blocks (e.g. Geography/Yoruba), a part-time paired teacher
    // means the whole block must be placed in the priority band.
    const priority = (prioritySet.has(task.teacher_id) || prioritySet.has(task.pairedTeacherId)) ? 1 : 0;
    // Intersection scarcity (both teachers must be free) used for slot scoring
    const scarcity = DAYS.reduce((sum, day) => {
      let cnt = 0;
      PERIODS.forEach((p) => {
        if (!isUnavailable(task.avail, day, p) && !isUnavailable(task.pairedAvail, day, p)) cnt++;
      });
      return sum + cnt;
    }, 0);
    return { ...task, priority, scarcity, _bottleneck: bottleneckTeacherId(task) };
  });

  // ── Step 2: group by bottleneck teacher ──────────────────────────────────
  //
  // KEY INSIGHT: when a teacher appears as the PRIMARY teacher for JSS classes
  // (e.g. Yoruba in JSS 1-3) AND as the PAIRED teacher for SS elective blocks
  // (e.g. Geography/Yoruba in SSS 1-3), the old code put those tasks in
  // SEPARATE groups.  The SS tasks were placed first and consumed all of her
  // available slots; the JSS classes got zero periods.
  //
  // By grouping on the BOTTLENECK teacher (most constrained of primary/paired),
  // every task that competes for the same teacher's time lands in ONE group
  // and is interleaved in rounds.  If her capacity is exceeded, every class
  // is equally short-changed instead of some classes getting everything.
  const groupMap = new Map();
  enriched.forEach((task) => {
    const gk = task._bottleneck
      ? `t:${task._bottleneck}`                       // all tasks for this teacher
      : `noT:${task.grade}|s:${task.subject_name}`;   // no teacher → solo group

    if (!groupMap.has(gk)) {
      groupMap.set(gk, { tasks: [], priority: 0, scarcity: Infinity,
                         hasPaired: false, maxPPW: 0, minMPD: Infinity });
    }
    const g = groupMap.get(gk);
    g.tasks.push(task);
    g.priority  = Math.max(g.priority,  task.priority);
    g.scarcity  = Math.min(g.scarcity,  task.scarcity);
    g.hasPaired = g.hasPaired || !!task.pairedSubject;
    g.maxPPW    = Math.max(g.maxPPW,    task.periodsPerWeek);
    g.minMPD    = Math.min(g.minMPD,    task.maxPerDay);
  });

  // ── Step 3: sort groups — most-constrained first ─────────────────────────
  const sortedGroups = [...groupMap.values()].sort((a, b) => {
    if (b.priority  !== a.priority)  return b.priority  - a.priority;
    if (b.hasPaired !== a.hasPaired) return Number(b.hasPaired) - Number(a.hasPaired);
    if (a.scarcity  !== b.scarcity)  return a.scarcity  - b.scarcity;
    if (b.maxPPW    !== a.maxPPW)    return b.maxPPW    - a.maxPPW;
    if (a.minMPD    !== b.minMPD)    return a.minMPD    - b.minMPD;
    return 0;
  });

  // ── Step 4: round-robin interleaving within each group ───────────────────
  const units = [];

  sortedGroups.forEach(({ tasks: groupTasks }) => {
    if (groupTasks.length === 1) {
      const task = groupTasks[0];
      for (let i = 0; i < task.periodsNeeded; i++) {
        units.push({ ...task, unit_id: `${task.grade}|${task.subject_name}|${i}` });
      }
      return;
    }

    // Round 0 → one slot per class/task (every class gets its 1st period before
    // any class gets a 2nd).  Round 1 → 2nd period, etc.
    // When the bottleneck teacher runs out of capacity partway through a round,
    // every remaining class is equally short-changed rather than one class
    // monopolising all available slots.
    const maxRounds = Math.max(...groupTasks.map((t) => t.periodsNeeded));
    for (let round = 0; round < maxRounds; round++) {
      const shuffled = shuffle([...groupTasks]); // vary class order each round
      for (const task of shuffled) {
        if (round < task.periodsNeeded) {
          units.push({ ...task, unit_id: `${task.grade}|${task.subject_name}|${round}` });
        }
      }
    }
  });

  return units;
}

function buildState({ grades, teachers, allSlots, lockedSlots }) {
  const grids = {};
  const blockedKeys = {};
  const teacherBusy = {};
  const teacherDayLoad = {};
  const teacherWeekLoad = {};

  grades.forEach((grade) => {
    grids[grade] = {};
    blockedKeys[grade] = new Set();
  });

  teachers.forEach((teacher) => {
    teacherBusy[teacher.id] = new Set();
    teacherDayLoad[teacher.id] = {};
    DAYS.forEach((day) => {
      teacherDayLoad[teacher.id][day] = 0;
    });
    teacherWeekLoad[teacher.id] = 0;
  });

  allSlots
    .filter((slot) => slot.is_blocked)
    .forEach((slot) => {
      blockedKeys[slot.grade]?.add(keyOf(slot.day, slot.period));
    });

  lockedSlots
    .filter((slot) => !slot.is_blocked && slot.subject_name)
    .forEach((slot) => {
      const key = keyOf(slot.day, slot.period);
      grids[slot.grade][key] = {
        subject_name: slot.subject_name,
        teacher_id: slot.teacher_id || null,
        paired_subject: slot.paired_subject || (slot.subject_name.includes("/") ? slot.subject_name.split("/")[1]?.trim() || null : null),
        paired_teacher_id: slot.paired_teacher_id || slot.second_teacher_id || null,
        source: "locked",
      };
      [slot.teacher_id, slot.second_teacher_id, slot.paired_teacher_id].filter(Boolean).forEach((teacherId) => {
        if (!teacherBusy[teacherId]) return;
        teacherBusy[teacherId].add(key);
        teacherDayLoad[teacherId][slot.day] = (teacherDayLoad[teacherId][slot.day] || 0) + 1;
        teacherWeekLoad[teacherId] = (teacherWeekLoad[teacherId] || 0) + 1;
      });
    });

  return { grids, blockedKeys, teacherBusy, teacherDayLoad, teacherWeekLoad };
}

function getGradeDaySlots(grid, day) {
  return Object.entries(grid)
    .filter(([key]) => key.startsWith(`${day}-`))
    .map(([key, value]) => ({ key, ...parseKey(key), ...value }));
}

function getSubjectDayPeriods(grid, day, subjectName) {
  return getGradeDaySlots(grid, day)
    .filter((slot) => slot.subject_name === subjectName)
    .map((slot) => slot.period);
}

function violatesHard(unit, day, period, state) {
  const slotKey = keyOf(day, period);
  const { grade } = unit;

  if (state.grids[grade][slotKey]) return "class-occupied";
  if (state.blockedKeys[grade]?.has(slotKey)) return "blocked-slot";

  if (unit.teacher_id) {
    if (isUnavailable(unit.avail, day, period)) return "teacher-unavailable";
    if (state.teacherBusy[unit.teacher_id]?.has(slotKey)) return "teacher-busy";
    if ((state.teacherDayLoad[unit.teacher_id]?.[day] || 0) >= unit.maxTeacherDay) return "teacher-day-limit";
    if ((state.teacherWeekLoad[unit.teacher_id] || 0) >= unit.maxTeacherWeek) return "teacher-week-limit";
  }

  if (unit.pairedTeacherId) {
    if (isUnavailable(unit.pairedAvail, day, period)) return "paired-teacher-unavailable";
    if (state.teacherBusy[unit.pairedTeacherId]?.has(slotKey)) return "paired-teacher-busy";
    if ((state.teacherDayLoad[unit.pairedTeacherId]?.[day] || 0) >= unit.pairedMaxTeacherDay) return "paired-teacher-day-limit";
    if ((state.teacherWeekLoad[unit.pairedTeacherId] || 0) >= unit.pairedMaxTeacherWeek) return "paired-teacher-week-limit";
  }

  const sameDayPeriods = getSubjectDayPeriods(state.grids[grade], day, unit.subject_name);
  if (sameDayPeriods.length >= unit.maxPerDay) return "subject-day-limit";
  // UNCONDITIONAL: if a subject sits twice on the same day, the two periods
  // must be strictly consecutive AND must not straddle the long break (P4+P5).
  // Spreading is preferred via SC1, but when doubling is forced the pair has
  // to read as a real double period. Anything else (P2+P5, P1+P3, P4+P5) is
  // rejected so the solver picks another day instead.
  if (sameDayPeriods.length === 1) {
    const ep = sameDayPeriods[0];
    const [a, b] = ep < period ? [ep, period] : [period, ep];
    if (a === 4 && b === 5) return "double-crosses-break";
    if (b !== a + 1)        return "double-not-consecutive";
  }

  return null;
}

function assignSlot(unit, day, period, state, source = "generated") {
  const slotKey = keyOf(day, period);
  state.grids[unit.grade][slotKey] = {
    subject_name: unit.subject_name,
    teacher_id: unit.teacher_id || null,
    paired_subject: unit.pairedSubject || null,
    paired_teacher_id: unit.pairedTeacherId || null,
    source,
  };

  [unit.teacher_id, unit.pairedTeacherId].filter(Boolean).forEach((teacherId) => {
    state.teacherBusy[teacherId].add(slotKey);
    state.teacherDayLoad[teacherId][day] = (state.teacherDayLoad[teacherId][day] || 0) + 1;
    state.teacherWeekLoad[teacherId] = (state.teacherWeekLoad[teacherId] || 0) + 1;
  });
}

function unassignSlot(unit, day, period, state) {
  const slotKey = keyOf(day, period);
  delete state.grids[unit.grade][slotKey];

  [unit.teacher_id, unit.pairedTeacherId].filter(Boolean).forEach((teacherId) => {
    state.teacherBusy[teacherId].delete(slotKey);
    state.teacherDayLoad[teacherId][day] = Math.max(0, (state.teacherDayLoad[teacherId][day] || 1) - 1);
    state.teacherWeekLoad[teacherId] = Math.max(0, (state.teacherWeekLoad[teacherId] || 1) - 1);
  });
}

function slotScore(unit, day, period, state) {
  const gradeSlotsForDay = getGradeDaySlots(state.grids[unit.grade], day);
  const sameSubjectPeriods = getSubjectDayPeriods(state.grids[unit.grade], day, unit.subject_name);
  const teacherDayLoad = unit.teacher_id ? (state.teacherDayLoad[unit.teacher_id]?.[day] || 0) : 0;
  const teacherWeekLoad = unit.teacher_id ? (state.teacherWeekLoad[unit.teacher_id] || 0) : 0;

  let score = 0;
  score += sameSubjectPeriods.length * SOFT_WEIGHTS.SAME_SUBJECT_DAY;
  score += teacherDayLoad * SOFT_WEIGHTS.TEACHER_DAY_LOAD;
  score += teacherWeekLoad * SOFT_WEIGHTS.TEACHER_WEEK_LOAD;
  score += gradeSlotsForDay.length * SOFT_WEIGHTS.GRADE_DAY_LOAD;
  if (period >= 7) score += SOFT_WEIGHTS.LATE_PERIOD;
  if (period >= 3 && period <= 6) score += SOFT_WEIGHTS.REWARD_MIDDAY;
  if (sameSubjectPeriods.length === 0) score += SOFT_WEIGHTS.REWARD_NEW_DAY;

  const occupiedPeriods = gradeSlotsForDay.map((slot) => slot.period).sort((a, b) => a - b);
  if (occupiedPeriods.length > 0) {
    const minPeriod = Math.min(...occupiedPeriods);
    const maxPeriod = Math.max(...occupiedPeriods);
    const projected = [...occupiedPeriods, period].sort((a, b) => a - b);
    const newSpan = projected[projected.length - 1] - projected[0];
    const currentSpan = maxPeriod - minPeriod;
    if (newSpan > currentSpan + 1) score += SOFT_WEIGHTS.GRADE_GAP;
  }

  // Small random jitter so equally-valid slots are picked differently on each
  // Generate click, producing a visibly different (but still quality) timetable.
  // ±2.5 is large enough to break ties but small enough not to override
  // meaningful score differences (smallest soft weight is 2).
  score += Math.random() * 5 - 2.5;

  return score;
}

function getCandidateSlots(unit, state) {
  return shuffle(ALL_COMBOS)
    .filter(({ day, period }) => !violatesHard(unit, day, period, state))
    .sort((a, b) => slotScore(unit, a.day, a.period, state) - slotScore(unit, b.day, b.period, state));
}

function findPlacedUnitAt(grade, day, period, state, taskByKey) {
  const slot = state.grids[grade][keyOf(day, period)];
  if (!slot || slot.source === "locked") return null;
  const task = taskByKey[`${grade}|${slot.subject_name}`];
  if (!task) return null;
  return { ...task };
}

function collectConflictingPlacedUnits(unit, day, period, state, taskByKey) {
  const conflicts = [];
  const seen = new Set();
  const addConflict = (candidate) => {
    if (!candidate) return;
    const id = `${candidate.grade}|${candidate.subject_name}|${candidate.teacher_id || ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    conflicts.push(candidate);
  };

  addConflict(findPlacedUnitAt(unit.grade, day, period, state, taskByKey));

  const slotKey = keyOf(day, period);
  if (unit.teacher_id) {
    Object.entries(state.grids).forEach(([grade, grid]) => {
      const slot = grid[slotKey];
      if (slot?.teacher_id === unit.teacher_id || slot?.paired_teacher_id === unit.teacher_id) {
        addConflict(findPlacedUnitAt(grade, day, period, state, taskByKey));
      }
    });
  }
  if (unit.pairedTeacherId) {
    Object.entries(state.grids).forEach(([grade, grid]) => {
      const slot = grid[slotKey];
      if (slot?.teacher_id === unit.pairedTeacherId || slot?.paired_teacher_id === unit.pairedTeacherId) {
        addConflict(findPlacedUnitAt(grade, day, period, state, taskByKey));
      }
    });
  }

  return conflicts;
}

function tryDirectPlace(unit, state, placements) {
  const candidates = getCandidateSlots(unit, state);
  if (candidates.length === 0) return false;
  const best = candidates[0];
  assignSlot(unit, best.day, best.period, state);
  placements[unit.unit_id] = best;
  return true;
}

function tryRepairPlace(unit, state, placements, taskByKey, depth = 2) {
  if (tryDirectPlace(unit, state, placements)) return true;
  if (depth <= 0) return false;

  const sortedSlots = shuffle(ALL_COMBOS).sort((a, b) => slotScore(unit, a.day, a.period, state) - slotScore(unit, b.day, b.period, state));
  for (const candidate of sortedSlots) {
    const conflicts = collectConflictingPlacedUnits(unit, candidate.day, candidate.period, state, taskByKey)
      .filter((conflict) => placements[conflict.unit_id]);
    if (conflicts.length === 0 || conflicts.length > 1) continue;

    const blocker = conflicts[0];
    const blockerPlacement = placements[blocker.unit_id];
    if (!blockerPlacement) continue;

    unassignSlot(blocker, blockerPlacement.day, blockerPlacement.period, state);
    delete placements[blocker.unit_id];

    if (!violatesHard(unit, candidate.day, candidate.period, state)) {
      assignSlot(unit, candidate.day, candidate.period, state);
      placements[unit.unit_id] = candidate;
      if (tryRepairPlace(blocker, state, placements, taskByKey, depth - 1)) {
        return true;
      }
      unassignSlot(unit, candidate.day, candidate.period, state);
      delete placements[unit.unit_id];
    }

    assignSlot(blocker, blockerPlacement.day, blockerPlacement.period, state);
    placements[blocker.unit_id] = blockerPlacement;
  }

  return false;
}

function computePenalty(state, grades, tasks) {
  let penalty = 0;

  grades.forEach((grade) => {
    const grid = state.grids[grade];
    const entries = Object.entries(grid);

    tasks
      .filter((task) => task.grade === grade)
      .forEach((task) => {
        const placedCount = entries.filter(([, slot]) => slot.subject_name === task.subject_name).length + task.lockedCount;
        if (placedCount < task.periodsPerWeek) {
          penalty += (task.periodsPerWeek - placedCount) * SOFT_WEIGHTS.UNPLACED;
        }
      });

    const bySubject = {};
    entries.forEach(([slotKey, slot]) => {
      const { day, period } = parseKey(slotKey);
      if (!bySubject[slot.subject_name]) bySubject[slot.subject_name] = [];
      bySubject[slot.subject_name].push({ day, period });
      if (period >= 7) penalty += SOFT_WEIGHTS.LATE_PERIOD;
    });

    Object.values(bySubject).forEach((placements) => {
      const days = new Set(placements.map((item) => item.day));
      if (placements.length > days.size) {
        penalty += (placements.length - days.size) * SOFT_WEIGHTS.SAME_SUBJECT_DAY;
      }
    });

    DAYS.forEach((day) => {
      const periods = getGradeDaySlots(grid, day).map((slot) => slot.period).sort((a, b) => a - b);
      if (periods.length > 1) {
        const gaps = periods[periods.length - 1] - periods[0] + 1 - periods.length;
        penalty += gaps * SOFT_WEIGHTS.GRADE_GAP;
      }
    });
  });

  Object.values(state.teacherDayLoad).forEach((loadsByDay) => {
    DAYS.forEach((day) => {
      penalty += (loadsByDay[day] || 0) * SOFT_WEIGHTS.TEACHER_DAY_LOAD;
    });
  });

  return penalty;
}

function collectMoveablePlacements(state, grades, taskByKey, lockedSlots) {
  const moveable = [];

  grades.forEach((grade) => {
    Object.entries(state.grids[grade]).forEach(([slotKey, slot]) => {
      const { day, period } = parseKey(slotKey);
      if (slot.source === "locked" || isLockedSlot(lockedSlots, grade, day, period)) return;
      const task = taskByKey[`${grade}|${slot.subject_name}`];
      if (!task) return;
      moveable.push({ grade, day, period, slotKey, task });
    });
  });

  return moveable;
}

// Rebuild teacher tracking data to be consistent with current grids.
// Must be called after restoring best-grids so SA passes start with correct state.
function rebuildTeacherLoads(state, grades) {
  Object.keys(state.teacherBusy).forEach(tid => {
    state.teacherBusy[tid] = new Set();
    DAYS.forEach(d => { state.teacherDayLoad[tid][d] = 0; });
    state.teacherWeekLoad[tid] = 0;
  });
  grades.forEach(grade => {
    Object.entries(state.grids[grade]).forEach(([key, slot]) => {
      const { day } = parseKey(key);
      [slot.teacher_id, slot.paired_teacher_id].filter(Boolean).forEach(tid => {
        if (!state.teacherBusy[tid]) return;
        state.teacherBusy[tid].add(key);
        state.teacherDayLoad[tid][day] = (state.teacherDayLoad[tid][day] || 0) + 1;
        state.teacherWeekLoad[tid] = (state.teacherWeekLoad[tid] || 0) + 1;
      });
    });
  });
}

function optimizeSchedule(state, grades, tasks, taskByKey, lockedSlots, iterations, startTemp = 40, endTemp = 0.5) {
  // Simulated Annealing with two move types:
  //   Swap  (55%): swap two non-locked slots in same grade — effective when timetable is full
  //   Relocate (45%): move one slot to a different position — effective when empty slots exist
  // Starts hot (accepts some worse moves to escape local optima), cools to near-zero.

  let currentPenalty = computePenalty(state, grades, tasks);
  let bestPenalty    = currentPenalty;

  // Save best state seen so we can restore it at the end
  const saveBestGrids = () => {
    const snap = {};
    grades.forEach(g => {
      snap[g] = {};
      Object.entries(state.grids[g]).forEach(([k, v]) => { snap[g][k] = { ...v }; });
    });
    return snap;
  };
  let bestGrids = saveBestGrids();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temp = startTemp + (endTemp - startTemp) * (iteration / Math.max(1, iterations - 1));

    const moveable = collectMoveablePlacements(state, grades, taskByKey, lockedSlots);
    if (moveable.length === 0) break;

    // ── Try a SWAP move first (55%) — most useful when timetable is nearly full ──
    let moved = false;
    if (Math.random() < 0.55 && moveable.length >= 2) {
      // Pick a random grade that has at least 2 moveable slots
      const grade = grades[Math.floor(Math.random() * grades.length)];
      const gm = moveable.filter(m => m.grade === grade);
      if (gm.length >= 2) {
        const i1 = Math.floor(Math.random() * gm.length);
        let i2;
        do { i2 = Math.floor(Math.random() * gm.length); } while (i2 === i1);
        const m1 = gm[i1], m2 = gm[i2];

        // Only swap different subjects (swapping same subject is a no-op)
        if (m1.task.subject_name !== m2.task.subject_name) {
          unassignSlot(m1.task, m1.day, m1.period, state);
          unassignSlot(m2.task, m2.day, m2.period, state);

          const v1 = violatesHard(m1.task, m2.day, m2.period, state);
          const v2 = violatesHard(m2.task, m1.day, m1.period, state);

          if (!v1 && !v2) {
            assignSlot(m1.task, m2.day, m2.period, state);
            assignSlot(m2.task, m1.day, m1.period, state);
            const nextPenalty = computePenalty(state, grades, tasks);
            const delta = nextPenalty - currentPenalty;
            if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
              currentPenalty = nextPenalty;
              if (currentPenalty < bestPenalty) { bestPenalty = currentPenalty; bestGrids = saveBestGrids(); }
            } else {
              // Revert the swap
              unassignSlot(m1.task, m2.day, m2.period, state);
              unassignSlot(m2.task, m1.day, m1.period, state);
              assignSlot(m1.task, m1.day, m1.period, state);
              assignSlot(m2.task, m2.day, m2.period, state);
            }
            moved = true;
          } else {
            // Swap violates a hard constraint — put both back
            assignSlot(m1.task, m1.day, m1.period, state);
            assignSlot(m2.task, m2.day, m2.period, state);
          }
        }
      }
    }

    // ── Fall back to RELOCATE move if swap didn't fire or had no valid grade ──
    if (!moved) {
      const chosen   = moveable[Math.floor(Math.random() * moveable.length)];
      const original = { day: chosen.day, period: chosen.period };
      const unit     = chosen.task;

      unassignSlot(unit, original.day, original.period, state);

      const candidates = getCandidateSlots(unit, state);
      if (candidates.length === 0) {
        assignSlot(unit, original.day, original.period, state);
        continue;
      }

      // Pick from top-4 candidates to balance exploitation vs exploration
      const target = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
      assignSlot(unit, target.day, target.period, state);
      const nextPenalty = computePenalty(state, grades, tasks);
      const delta       = nextPenalty - currentPenalty;

      if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
        currentPenalty = nextPenalty;
        if (currentPenalty < bestPenalty) { bestPenalty = currentPenalty; bestGrids = saveBestGrids(); }
      } else {
        unassignSlot(unit, target.day, target.period, state);
        assignSlot(unit, original.day, original.period, state);
      }
    }
  }

  // Restore best solution found during the run, then sync teacher loads to match
  grades.forEach(g => {
    Object.keys(state.grids[g]).forEach(k => { delete state.grids[g][k]; });
    Object.entries(bestGrids[g]).forEach(([k, v]) => { state.grids[g][k] = v; });
  });
  rebuildTeacherLoads(state, grades);

  return bestPenalty;
}

/**
 * fairnessRepair — run after the greedy phase, before SA.
 *
 * For every (teacher × subject) group that spans multiple classes, check
 * whether any class has fewer placed periods than required.  If it does,
 * try harder (depth-3 repair) to squeeze a slot in.  This catches cases
 * where the round-robin ordering still leaves a class short because the
 * teacher's capacity was tight and later rounds could not be placed.
 */
function fairnessRepair(tasks, state, placements, taskByKey) {
  // Use the same bottleneck-teacher grouping as buildUnits so we catch
  // cases where the teacher is a paired teacher (not the primary).
  const groups = {};
  tasks.forEach((task) => {
    const bId = bottleneckTeacherId(task);
    if (!bId) return;
    if (!groups[bId]) groups[bId] = [];
    groups[bId].push(task);
  });

  let extraPlacements = 0;

  Object.values(groups).forEach((group) => {
    if (group.length <= 1) return; // single-class teacher — nothing to balance

    group.forEach((task) => {
      const alreadyPlaced = Object.values(state.grids[task.grade] || {})
        .filter((s) => s.subject_name === task.subject_name).length;
      const stillNeeded = task.periodsNeeded - alreadyPlaced;
      if (stillNeeded <= 0) return;

      // Try to fill missing slots using deeper repair (depth 3)
      for (let i = 0; i < stillNeeded; i++) {
        const syntheticUnit = {
          ...task,
          unit_id: `${task.grade}|${task.subject_name}|fair-${extraPlacements}`,
        };
        if (tryRepairPlace(syntheticUnit, state, placements, taskByKey, 3)) {
          extraPlacements++;
        }
      }
    });
  });

  return extraPlacements;
}

/**
 * checkTeacherCapacity — pre-flight validation.
 *
 * Returns a list of warning strings for every teacher whose total assigned
 * periods across all classes exceeds their declared max_periods_per_week.
 * The generator can still run, but the warnings tell the admin why some
 * classes will inevitably be short.
 */
function checkTeacherCapacity(tasks) {
  const teacherLoad  = {}; // teacher_id → total periods assigned across all classes
  const teacherLimit = {}; // teacher_id → maxTeacherWeek

  tasks.forEach((task) => {
    // Count primary teacher
    if (task.teacher_id) {
      teacherLoad[task.teacher_id]  = (teacherLoad[task.teacher_id]  || 0) + task.periodsPerWeek;
      teacherLimit[task.teacher_id] = task.maxTeacherWeek;
    }
    // Count paired teacher — they teach the same slot so same period count
    if (task.pairedTeacherId) {
      teacherLoad[task.pairedTeacherId]  = (teacherLoad[task.pairedTeacherId]  || 0) + task.periodsPerWeek;
      teacherLimit[task.pairedTeacherId] = task.pairedMaxTeacherWeek;
    }
  });

  const warnings = [];
  Object.entries(teacherLoad).forEach(([tid, load]) => {
    const limit = teacherLimit[tid] ?? 40;
    if (load > limit) {
      warnings.push(
        `Teacher ${tid}: assigned ${load} periods/week across all classes but max is ${limit}. ` +
        `${load - limit} period(s) cannot be scheduled — reduce assignments or raise the teacher's weekly limit.`
      );
    }
  });
  return warnings;
}

function buildLogsAndWarnings(state, tasks) {
  const log = [];
  const warnings = [];

  tasks.forEach((task) => {
    const placed = Object.values(state.grids[task.grade]).filter((slot) => slot.subject_name === task.subject_name).length;
    const total = placed + task.lockedCount;
    const label = task.pairedSubject
      ? `${task.subject_name}/${task.pairedSubject}`
      : task.subject_name;

    if (total < task.periodsPerWeek) {
      warnings.push(`${task.grade} - ${label}: scheduled ${total}/${task.periodsPerWeek} periods`);
    } else {
      log.push(`${task.grade} - ${label}: ${total} periods`);
    }
  });

  return { log, warnings };
}

const HARD_REASON_LABELS = {
  "class-occupied": "class timetable slots already occupied",
  "blocked-slot": "blocked or preserved slots",
  "teacher-unavailable": "teacher unavailable at candidate times",
  "teacher-busy": "teacher already booked in another class",
  "teacher-day-limit": "teacher daily load limit reached",
  "teacher-week-limit": "teacher weekly load limit reached",
  "paired-teacher-unavailable": "paired teacher unavailable",
  "paired-teacher-busy": "paired teacher already booked",
  "paired-teacher-day-limit": "paired teacher daily load limit reached",
  "paired-teacher-week-limit": "paired teacher weekly load limit reached",
  "subject-day-limit": "subject max-per-day limit reached",
  "double-not-consecutive": "double period adjacency rule",
};

function collectFailureReasons(task, state) {
  const counts = {};
  ALL_COMBOS.forEach(({ day, period }) => {
    const reason = violatesHard(task, day, period, state);
    if (reason) counts[reason] = (counts[reason] || 0) + 1;
  });
  return counts;
}

function summarizeUnplacedTasks(state, tasks) {
  const missingRows = [];

  tasks.forEach((task) => {
    const placed = Object.values(state.grids[task.grade]).filter(
      (slot) => slot.subject_name === task.subject_name
    ).length;
    const totalPlaced = placed + task.lockedCount;
    const missing = Math.max(0, task.periodsPerWeek - totalPlaced);
    if (missing <= 0) return;

    const reasonCounts = collectFailureReasons(task, state);
    const topReasonEntry = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0] || null;
    const topReasonCode = topReasonEntry?.[0] || null;
    const topReasonBlockedSlots = topReasonEntry?.[1] || 0;
    const topReasonLabel = topReasonCode ? (HARD_REASON_LABELS[topReasonCode] || topReasonCode) : "unknown bottleneck";
    const label = task.pairedSubject
      ? `${task.subject_name}/${task.pairedSubject}`
      : task.subject_name;

    missingRows.push({
      grade: task.grade,
      label,
      missing,
      topReasonLabel,
      topReasonBlockedSlots,
    });
  });

  return missingRows
    .sort((a, b) => b.missing - a.missing || a.grade.localeCompare(b.grade))
    .map(
      (row) =>
        `${row.grade} - ${row.label}: missing ${row.missing} period(s) — top blocker: ${row.topReasonLabel} (${row.topReasonBlockedSlots}/40 candidate slots)`
    );
}

function flattenResult(state, grades, lockedSlots) {
  const result = [];

  grades.forEach((grade) => {
    Object.entries(state.grids[grade]).forEach(([slotKey, slot]) => {
      const { day, period } = parseKey(slotKey);
      if (isLockedSlot(lockedSlots, grade, day, period)) return;

      if (slot.paired_subject) {
        result.push({
          grade,
          day,
          period,
          subject_name: `${slot.subject_name}/${slot.paired_subject}`,
          teacher_id: slot.teacher_id || null,
          second_teacher_id: slot.paired_teacher_id || null,
        });
      } else {
        result.push({
          grade,
          day,
          period,
          subject_name: slot.subject_name,
          teacher_id: slot.teacher_id || null,
        });
      }
    });
  });

  return result;
}

export function generateAllTimetables({
  grades,
  subjects,
  assignments,
  teachers,
  availabilities,
  allSlots,
  lockedSlots,
  priorityTeacherIds = [],
  ssPairings = DEFAULT_SS_PAIRINGS,
}) {
  const { tasks, taskByKey } = buildTaskDefinitions({
    grades,
    subjects,
    assignments,
    availabilities,
    lockedSlots,
    ssPairings,
  });

  // Pre-flight: warn if any teacher is over-assigned relative to their weekly limit
  const capacityWarnings = checkTeacherCapacity(tasks);
  const effectivePriorityTeacherIds = [
    ...new Set([
      ...getAutomaticPriorityTeacherIds(availabilities),
      ...priorityTeacherIds,
    ]),
  ];
  const prioritizedTasks = sortTasksForPriority(tasks, {
    priorityTeacherIds: effectivePriorityTeacherIds,
    days: DAYS,
    periods: PERIODS,
    isUnavailable,
  });

  const units = buildUnits(prioritizedTasks, effectivePriorityTeacherIds);
  const state = buildState({ grades, teachers, allSlots, lockedSlots });
  const placements = {};
  const unplacedUnits = [];
  let repairCount = 0;

  // ── Phase 1: greedy placement (round-robin ordered) ───────────────────────
  units.forEach((unit) => {
    if (!tryDirectPlace(unit, state, placements)) {
      unplacedUnits.push(unit);
    }
  });

  // ── Phase 2: standard repair (depth 3) ───────────────────────────────────
  unplacedUnits.forEach((unit) => {
    const repaired = tryRepairPlace(unit, state, placements, taskByKey, 3);
    if (repaired) {
      repairCount += 1;
    }
  });

  // ── Phase 3: fairness repair — specifically targets multi-class teacher
  //    groups where some classes are still short after phases 1+2 ──────────
  const fairnessCount = fairnessRepair(prioritizedTasks, state, placements, taskByKey);
  repairCount += fairnessCount;

  // ── Phase 4: SA optimisation ──────────────────────────────────────────────
  const penalty = optimizeSchedule(state, grades, prioritizedTasks, taskByKey, lockedSlots, IMPROVE_ITERATIONS);
  const { log, warnings: scheduleWarnings } = buildLogsAndWarnings(state, prioritizedTasks);
  const infeasibleConflicts = summarizeUnplacedTasks(state, prioritizedTasks);

  // Merge capacity warnings (over-assigned teachers) with schedule warnings
  const warnings = [...capacityWarnings, ...scheduleWarnings];

  return {
    result: flattenResult(state, grades, lockedSlots),
    log,
    warnings,
    infeasibleConflicts,
    feasible: scheduleWarnings.length === 0 && infeasibleConflicts.length === 0,
    penalty: Math.round(penalty),
    backtracks: repairCount,
    algorithm: "Greedy + Repair",
  };
}

export function deepOptimize({
  existingResult,
  grades,
  subjects,
  assignments,
  availabilities,
  teachers,
  allSlots,
  lockedSlots,
  ssPairings = DEFAULT_SS_PAIRINGS,
}) {
  // Build tasks using the exact same logic as generateAllTimetables so field
  // formats (pairedMaxTeacherDay/Week, avail objects, etc.) are always correct.
  const { tasks, taskByKey } = buildTaskDefinitions({
    grades, subjects, assignments, availabilities, lockedSlots, ssPairings,
  });

  // Rebuild state from scratch and repopulate from the existing (non-locked) result
  const state = buildState({ grades, teachers, allSlots, lockedSlots });
  existingResult.forEach((slot) => {
    const [mainSubject, pairedSubject] = String(slot.subject_name || "")
      .split("/").map((v) => v?.trim()).filter(Boolean);
    const task = taskByKey[`${slot.grade}|${mainSubject}`];
    if (!task) return;
    // Skip if this slot is already occupied (could happen with dupes in existingResult)
    if (state.grids[slot.grade]?.[keyOf(slot.day, slot.period)]) return;
    assignSlot(
      {
        ...task,
        pairedSubject: pairedSubject || task.pairedSubject || null,
        pairedTeacherId: slot.second_teacher_id || task.pairedTeacherId || null,
      },
      slot.day, slot.period, state, "generated",
    );
  });

  // Three-pass SA:
  //   Pass 1 (hot, T=80→8):   wide exploration — escape from generate's local optimum
  //   Pass 2 (medium, T=25→2): balance exploration and exploitation
  //   Pass 3 (cool, T=6→0.3): fine-tuning — converge on best found so far
  // Each pass restores its best state and rebuilds teacher loads before the next pass.
  optimizeSchedule(state, grades, tasks, taskByKey, lockedSlots, 1400, 80, 8);
  optimizeSchedule(state, grades, tasks, taskByKey, lockedSlots, 1400, 25, 2);
  const penalty = optimizeSchedule(state, grades, tasks, taskByKey, lockedSlots, 1400, 6, 0.3);

  return {
    result: flattenResult(state, grades, lockedSlots),
    penalty: Math.round(penalty),
  };
}
