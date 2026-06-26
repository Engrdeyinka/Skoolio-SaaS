/**
 * CP-SAT Style Timetable Solver with Large Neighbourhood Search (LNS)
 *
 * Architecture:
 *  Phase 1 – Feasibility Search: greedy + repair loop that enforces ALL hard
 *             constraints. If infeasible, returns which constraints are violated.
 *  Phase 2 – LNS Improvement: repeatedly destroys a random neighbourhood
 *             (one grade × one day) and rebuilds it greedily, accepting only
 *             improvements to the weighted soft-constraint objective.
 *
 * Hard constraints (non-negotiable):
 *   HC1  No teacher clash: a teacher cannot appear in two grades at the same time slot
 *   HC2  No class clash: a grade cannot have two subjects in the same slot
 *   HC3  Blocked / reserved periods: locked or blocked slots are never touched
 *   HC4  Teacher unavailability (by day for full-time, by day+period for part-time)
 *   HC5  Max teacher load per day
 *   HC6  Max teacher load per week
 *   HC7  Subject max occurrences per day (max_per_day from assignment)
 *   HC8  Required periods per week per subject per grade (exact target)
 *   HC9  Long break: periods 4→5 are non-consecutive for double-period rules
 *
 * Soft constraints (weighted penalties, lower = better):
 *   SC1  Subject spread: penalise same subject on same day (prefer spread across week)
 *   SC2  Teacher gaps: penalise idle periods surrounded by teaching periods (same day)
 *   SC3  Late periods: prefer earlier slots (periods 7–8 penalised)
 *   SC4  Daily load balance per class: penalise uneven period count per day
 *   SC5  Teacher grade imbalance: same teacher+subject should appear equally across grades
 */
import { buildSSPairMap, DEFAULT_SS_PAIRINGS } from "../ssPairings.js";
import { DAYS, PERIODS } from "../constants.js";
import { getAutomaticPriorityTeacherIds, sortTasksForPriority } from "../priority.js";

const ALL_SLOTS = [];
DAYS.forEach(d => PERIODS.forEach(p => ALL_SLOTS.push({ day: d, period: p })));

const SS_GRADES = ["SSS 1", "SSS 2", "SSS 3"];

// Soft-constraint weights
const SW = {
  SPREAD:            25,   // per extra occurrence of subject on same day
  TEACHER_GAP:       10,   // per idle gap between teaching periods (same teacher, same day)
  LATE_PERIOD:        3,   // per slot in period 7 or 8
  DAILY_IMBALANCE:    8,   // variance of per-day slot count across the week for a class
  GRADE_IMBALANCE:   18,   // variance of teacher+subject count across grades
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (avail.employment_type === "part_time") {
    return (avail.unavailable_periods_by_day?.[day] || []).includes(period);
  }
  if (avail.unavailable_days?.includes(day)) return true;
  return (avail.unavailable_periods || []).includes(period);
}

// ─── State ────────────────────────────────────────────────────────────────────
// grids[grade][day-period] = { subject_name, teacher_id }
// teacherBusy[teacher_id] = Set of "day-period"
// teacherDayLoad[teacher_id][day] = count
// teacherWeekLoad[teacher_id] = count

function makeState(grades, teachers, blockedMap, lockedSlots) {
  const grids = {};
  grades.forEach(g => { grids[g] = {}; });

  const teacherBusy = {};
  const teacherDayLoad = {};
  const teacherWeekLoad = {};
  teachers.forEach(t => {
    teacherBusy[t.id] = new Set();
    teacherDayLoad[t.id] = {};
    DAYS.forEach(d => { teacherDayLoad[t.id][d] = 0; });
    teacherWeekLoad[t.id] = 0;
  });

  // Pre-fill locked (non-blocked) slots
  lockedSlots.forEach(slot => {
    if (!slot.is_blocked && slot.subject_name && grids[slot.grade]) {
      const key = `${slot.day}-${slot.period}`;
      grids[slot.grade][key] = {
        subject_name: slot.subject_name,
        teacher_id: slot.teacher_id || "",
        paired_subject:    slot.paired_subject    || null,
        paired_teacher_id: slot.paired_teacher_id || slot.second_teacher_id || null,
      };
      if (slot.teacher_id && teacherBusy[slot.teacher_id]) {
        teacherBusy[slot.teacher_id].add(key);
        teacherDayLoad[slot.teacher_id][slot.day] = (teacherDayLoad[slot.teacher_id][slot.day] || 0) + 1;
        teacherWeekLoad[slot.teacher_id] = (teacherWeekLoad[slot.teacher_id] || 0) + 1;
      }
      if (slot.second_teacher_id && teacherBusy[slot.second_teacher_id]) {
        teacherBusy[slot.second_teacher_id].add(key);
        teacherDayLoad[slot.second_teacher_id][slot.day] = (teacherDayLoad[slot.second_teacher_id][slot.day] || 0) + 1;
        teacherWeekLoad[slot.second_teacher_id] = (teacherWeekLoad[slot.second_teacher_id] || 0) + 1;
      }
      if (slot.paired_teacher_id && teacherBusy[slot.paired_teacher_id]) {
        teacherBusy[slot.paired_teacher_id].add(key);
        teacherDayLoad[slot.paired_teacher_id][slot.day] = (teacherDayLoad[slot.paired_teacher_id][slot.day] || 0) + 1;
        teacherWeekLoad[slot.paired_teacher_id] = (teacherWeekLoad[slot.paired_teacher_id] || 0) + 1;
      }
    }
  });

  return { grids, teacherBusy, teacherDayLoad, teacherWeekLoad };
}

function place(state, grade, day, period, subject_name, teacher_id, paired_subject, paired_teacher_id) {
  const key = `${day}-${period}`;
  state.grids[grade][key] = {
    subject_name,
    teacher_id: teacher_id || "",
    paired_subject: paired_subject || null,
    paired_teacher_id: paired_teacher_id || null,
  };
  if (teacher_id && state.teacherBusy[teacher_id]) {
    state.teacherBusy[teacher_id].add(key);
    state.teacherDayLoad[teacher_id][day] = (state.teacherDayLoad[teacher_id][day] || 0) + 1;
    state.teacherWeekLoad[teacher_id] = (state.teacherWeekLoad[teacher_id] || 0) + 1;
  }
  if (paired_teacher_id && state.teacherBusy[paired_teacher_id]) {
    state.teacherBusy[paired_teacher_id].add(key);
    state.teacherDayLoad[paired_teacher_id][day] = (state.teacherDayLoad[paired_teacher_id][day] || 0) + 1;
    state.teacherWeekLoad[paired_teacher_id] = (state.teacherWeekLoad[paired_teacher_id] || 0) + 1;
  }
}

function unplace(state, grade, day, period) {
  const key = `${day}-${period}`;
  const existing = state.grids[grade][key];
  if (!existing) return;
  const tid = existing.teacher_id;
  const ptid = existing.paired_teacher_id;
  delete state.grids[grade][key];
  if (tid && state.teacherBusy[tid]) {
    state.teacherBusy[tid].delete(key);
    state.teacherDayLoad[tid][day] = Math.max(0, (state.teacherDayLoad[tid][day] || 1) - 1);
    state.teacherWeekLoad[tid] = Math.max(0, (state.teacherWeekLoad[tid] || 1) - 1);
  }
  if (ptid && state.teacherBusy[ptid]) {
    state.teacherBusy[ptid].delete(key);
    state.teacherDayLoad[ptid][day] = Math.max(0, (state.teacherDayLoad[ptid][day] || 1) - 1);
    state.teacherWeekLoad[ptid] = Math.max(0, (state.teacherWeekLoad[ptid] || 1) - 1);
  }
}

// ─── Hard-constraint check for a candidate placement ─────────────────────────

function checkHard(state, blockedMap, availabilities, task, day, period) {
  const key = `${day}-${period}`;
  const { grade, teacher_id, maxPerDay, avail, maxTeacherDay, maxTeacherWeek, subject_name,
          pairedTeacherId, pairedAvail } = task;

  // HC2: class clash
  if (state.grids[grade][key]) return "Class clash";
  // HC3: blocked
  if (blockedMap[grade]?.has(key)) return "Slot blocked";

  // HC4/HC1/HC5/HC6: primary teacher constraints
  if (teacher_id) {
    if (isTeacherUnavailable(avail, day, period)) return "Teacher unavailable";
    if (state.teacherBusy[teacher_id]?.has(key)) return "Teacher clash";
    if ((state.teacherDayLoad[teacher_id]?.[day] || 0) >= maxTeacherDay) return "Teacher day limit";
    if ((state.teacherWeekLoad[teacher_id] || 0) >= maxTeacherWeek) return "Teacher week limit";
  }

  // HC4/HC1/HC5/HC6: paired teacher constraints (SS elective pairs)
  if (pairedTeacherId) {
    const pAvail = pairedAvail || null;
    if (isTeacherUnavailable(pAvail, day, period)) return "Paired teacher unavailable";
    if (state.teacherBusy[pairedTeacherId]?.has(key)) return "Paired teacher clash";
    const pMaxDay = pAvail?.max_periods_per_day ?? 8;
    const pMaxWeek = pAvail?.max_periods_per_week ?? 40;
    if ((state.teacherDayLoad[pairedTeacherId]?.[day] || 0) >= pMaxDay) return "Paired teacher day limit";
    if ((state.teacherWeekLoad[pairedTeacherId] || 0) >= pMaxWeek) return "Paired teacher week limit";
  }

  // HC7: subject max per day
  const sameDayCount = Object.entries(state.grids[grade])
    .filter(([k, v]) => k.startsWith(day + "-") && v.subject_name === subject_name).length;
  if (sameDayCount >= maxPerDay) return "Subject day limit";

  // HC9 (UNCONDITIONAL): if a subject appears twice on the same day, the two
  // periods MUST be strictly consecutive AND must NOT straddle the long break
  // (P4 + P5). Spreading is preferred via SC1; but when doubling is forced
  // (periods_per_week > school days, etc.), the pair has to read as a real
  // double period. P2 + P5 / P1 + P3 / P4 + P5 are all rejected so the solver
  // picks a different day or shuffles another subject out of the way.
  if (sameDayCount === 1) {
    const existingPeriod = Number(
      Object.keys(state.grids[grade]).find(k => k.startsWith(day + "-") && state.grids[grade][k].subject_name === subject_name)?.split("-")[1]
    );
    const [a, b] = existingPeriod < period ? [existingPeriod, period] : [period, existingPeriod];
    if (a === 4 && b === 5) return "Double period crosses long break";
    if (b !== a + 1)        return "Double period must be consecutive";
  }

  return null; // ✓
}

// ─── Build tasks (same logic as CSP engine for consistency) ──────────────────

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
        subject_name: assignment.subject,
        teacher_id: assignment.subject_teacher_id || null,
        maxPerDay: assignment.max_per_day || 2,
        allowDouble: !!assignment.allow_double,
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

  return tasks;
}

// ─── Soft-constraint penalty ──────────────────────────────────────────────────

function computePenalty(grids, grades, tasks) {
  let p = 0;

  grades.forEach(grade => {
    const entries = Object.entries(grids[grade]);

    // SC1: subject spread (same subject same day)
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

    // SC4: daily load balance for class (variance of periods per day)
    const dayCount = {};
    DAYS.forEach(d => { dayCount[d] = 0; });
    entries.forEach(([key]) => { dayCount[key.split("-")[0]]++; });
    const loads = Object.values(dayCount);
    const mean = loads.reduce((a, b) => a + b, 0) / 5;
    const variance = loads.reduce((s, l) => s + (l - mean) ** 2, 0) / 5;
    p += SW.DAILY_IMBALANCE * variance;
  });

  // SC2: teacher gaps (idle periods between first and last teaching period per day)
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
    const span = sorted[sorted.length - 1] - sorted[0] + 1;
    const gaps = span - sorted.length;
    p += SW.TEACHER_GAP * gaps;
  });

  // SC5: teacher+subject grade imbalance
  const teacherSubGrade = {};
  grades.forEach(grade => {
    Object.values(grids[grade]).forEach(val => {
      if (!val.teacher_id || !val.subject_name) return;
      const key = `${val.teacher_id}|${val.subject_name}`;
      if (!teacherSubGrade[key]) teacherSubGrade[key] = {};
      teacherSubGrade[key][grade] = (teacherSubGrade[key][grade] || 0) + 1;
    });
  });
  Object.values(teacherSubGrade).forEach(gradeMap => {
    const counts = Object.values(gradeMap);
    if (counts.length < 2) return;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    p += SW.GRADE_IMBALANCE * variance;
  });

  return p;
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

// ─── Phase 1: Feasibility Search ─────────────────────────────────────────────
// Greedy placement with interleaved ordering. Tracks which hard constraints
// caused failures and returns a diagnostics report.

function feasibilitySearch(tasks, state, blockedMap, availabilities, priorityTeacherIds = []) {
  const prioritySet = new Set(priorityTeacherIds);
  // Interleave tasks grouped by BOTTLENECK teacher so paired teachers (e.g.
  // Yoruba teacher who also appears as pairedTeacherId in SS Geography/Yoruba
  // blocks) are treated as a single constrained resource.  Without this, the
  // SS classes would consume all her available slots before JSS classes get any.
  const groups = {};
  const groupOrder = [];
  tasks.forEach(t => {
    const bn  = bottleneckTeacherId(t);
    const key = bn ? `t:${bn}` : `noT:${t.grade}|${t.subject_name}`;
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(t);
  });

  // A group is "priority" if any of its tasks belongs to a part-time teacher.
  // ALL priority groups' units must be placed BEFORE any non-priority group's
  // units — part-time teachers' periods get fully exhausted first.
  const isPriorityGroup = (key) =>
    groups[key].some(t =>
      t?.avail?.employment_type === "part_time" ||
      t?.pairedAvail?.employment_type === "part_time" ||
      prioritySet.has(t?.teacher_id) ||
      prioritySet.has(t?.pairedTeacherId)
    );
  const priorityKeys = groupOrder.filter(isPriorityGroup);
  const otherKeys    = groupOrder.filter(k => !isPriorityGroup(k));

  const buildQueue = (key) => {
    const grp = groups[key];
    if (grp.length <= 1) {
      return grp.flatMap(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
    }
    const byGrade = grp.map(t => Array.from({ length: t.periodsNeeded }, () => ({ ...t })));
    const interleaved = [];
    let added = true;
    while (added) {
      added = false;
      byGrade.forEach(uList => { if (uList.length > 0) { interleaved.push(uList.shift()); added = true; } });
    }
    return interleaved;
  };

  // Round-robin merge WITHIN each band (priority and non-priority), then
  // concatenate priority-first.  This guarantees that no non-priority unit is
  // placed until every priority unit has been placed.
  const mergeQueues = (queues) => {
    const out = [];
    let anyLeft = true;
    while (anyLeft) {
      anyLeft = false;
      queues.forEach(q => { if (q.length > 0) { out.push(q.shift()); anyLeft = true; } });
    }
    return out;
  };
  const priorityUnits = mergeQueues(priorityKeys.map(buildQueue));
  const otherUnits    = mergeQueues(otherKeys.map(buildQueue));
  const units = [...priorityUnits, ...otherUnits];

  const failureMap = {}; // HC reason → Set of task descriptions
  const unplacedTasks = [];
  const unplacedUnits = [];

  for (const unit of units) {
    // Try all slots in shuffled order, prefer spread (sort by days already used)
    const dayUsage = {};
    DAYS.forEach(d => {
      dayUsage[d] = Object.keys(state.grids[unit.grade])
        .filter(k => k.startsWith(d + "-") && state.grids[unit.grade][k].subject_name === unit.subject_name).length;
    });
    const candidateSlots = shuffle(ALL_SLOTS).sort((a, b) => (dayUsage[a.day] || 0) - (dayUsage[b.day] || 0));

    let placed = false;
    const reasons = new Set();
    for (const { day, period } of candidateSlots) {
      const reason = checkHard(state, blockedMap, availabilities, unit, day, period);
      if (!reason) {
        place(state, unit.grade, day, period, unit.subject_name, unit.teacher_id,
              unit.pairedSubject || null, unit.pairedTeacherId || null);
        placed = true;
        break;
      }
      reasons.add(reason);
    }

    if (!placed) {
      const desc = `${unit.grade} – ${unit.subject_name}${unit.pairedSubject ? "/" + unit.pairedSubject : ""}`;
      unplacedTasks.push(desc);
      unplacedUnits.push({ ...unit });
      reasons.forEach(r => {
        if (!failureMap[r]) failureMap[r] = new Set();
        failureMap[r].add(desc);
      });
    }
  }

  return { unplacedTasks, unplacedUnits, failureMap };
}

// ─── Phase 1.5: Repair Pass ───────────────────────────────────────────────────
// Swap-based repair for units that greedy Phase 1 couldn't place.
// For each unplaced unit:
//   (a) retry direct placement (state may have changed as earlier repairs succeed)
//   (b) 1-level swap: unplace the class-clash occupant, try to move it to another
//       slot, then place the unplaced unit in the freed slot.
// Iterates until no further progress is made (cascade placements).

function repairPass(unplacedUnits, tasks, state, blockedMap, availabilities) {
  let remaining = [...unplacedUnits];
  let progress = true;

  while (progress && remaining.length > 0) {
    progress = false;
    const nextRemaining = [];

    for (const unit of remaining) {
      const dayUsage = {};
      DAYS.forEach(d => {
        dayUsage[d] = Object.keys(state.grids[unit.grade])
          .filter(k => k.startsWith(d + "-") && state.grids[unit.grade][k].subject_name === unit.subject_name).length;
      });
      const candidateSlots = shuffle(ALL_SLOTS).sort(
        (a, b) => (dayUsage[a.day] || 0) - (dayUsage[b.day] || 0)
      );

      let placed = false;

      // (a) Direct placement
      for (const { day, period } of candidateSlots) {
        if (!checkHard(state, blockedMap, availabilities, unit, day, period)) {
          place(state, unit.grade, day, period, unit.subject_name, unit.teacher_id,
                unit.pairedSubject || null, unit.pairedTeacherId || null);
          placed = true;
          break;
        }
      }

      if (!placed) {
        // (b) 1-level swap: look for slots where only a class clash blocks the unit
        for (const { day, period } of candidateSlots) {
          if (placed) break;
          const key = `${day}-${period}`;
          const occupant = state.grids[unit.grade][key];
          if (!occupant) continue; // no class clash — another constraint failed; swap won't help

          // Temporarily unplace occupant and re-check unit
          unplace(state, unit.grade, day, period);
          const residualReason = checkHard(state, blockedMap, availabilities, unit, day, period);

          if (residualReason) {
            // Another constraint still blocks unit even without the class clash
            place(state, unit.grade, day, period, occupant.subject_name, occupant.teacher_id,
                  occupant.paired_subject || null, occupant.paired_teacher_id || null);
            continue;
          }

          // Unit can go here if the occupant can move elsewhere
          const occupantTaskDef = tasks.find(
            t => t.grade === unit.grade && t.subject_name === occupant.subject_name
          ) || {
            grade: unit.grade,
            subject_name: occupant.subject_name,
            teacher_id: occupant.teacher_id,
            pairedSubject: occupant.paired_subject || null,
            pairedTeacherId: occupant.paired_teacher_id || null,
            maxPerDay: 2,
            allowDouble: false,
            maxTeacherDay: 8,
            maxTeacherWeek: 40,
            avail: availabilities.find(a => a.teacher_id === occupant.teacher_id) || null,
            pairedAvail: occupant.paired_teacher_id
              ? availabilities.find(a => a.teacher_id === occupant.paired_teacher_id) || null
              : null,
          };

          const occDayUsage = {};
          DAYS.forEach(d => {
            occDayUsage[d] = Object.keys(state.grids[unit.grade])
              .filter(k => k.startsWith(d + "-") && state.grids[unit.grade][k].subject_name === occupant.subject_name).length;
          });
          const occCandidates = shuffle(ALL_SLOTS)
            .filter(s => !(s.day === day && s.period === period))
            .sort((a, b) => (occDayUsage[a.day] || 0) - (occDayUsage[b.day] || 0));

          let occupantNewDay = null, occupantNewPeriod = null;
          for (const { day: nd, period: np } of occCandidates) {
            if (!checkHard(state, blockedMap, availabilities, occupantTaskDef, nd, np)) {
              place(state, unit.grade, nd, np, occupant.subject_name, occupant.teacher_id,
                    occupant.paired_subject || null, occupant.paired_teacher_id || null);
              occupantNewDay = nd;
              occupantNewPeriod = np;
              break;
            }
          }

          if (occupantNewDay !== null) {
            // Occupant moved — try to place unit in the freed slot
            if (!checkHard(state, blockedMap, availabilities, unit, day, period)) {
              place(state, unit.grade, day, period, unit.subject_name, unit.teacher_id,
                    unit.pairedSubject || null, unit.pairedTeacherId || null);
              placed = true;
            } else {
              // Unexpected residual failure — undo occupant move and restore original
              unplace(state, unit.grade, occupantNewDay, occupantNewPeriod);
              place(state, unit.grade, day, period, occupant.subject_name, occupant.teacher_id,
                    occupant.paired_subject || null, occupant.paired_teacher_id || null);
            }
          } else {
            // Occupant has nowhere to go — restore it
            place(state, unit.grade, day, period, occupant.subject_name, occupant.teacher_id,
                  occupant.paired_subject || null, occupant.paired_teacher_id || null);
          }
        }
      }

      if (placed) {
        progress = true;
      } else {
        nextRemaining.push(unit);
      }
    }

    remaining = nextRemaining;
  }

  return remaining;
}

// ─── Phase 1.6: Teacher Clash Resolution ─────────────────────────────────────
// After repair, scan for any remaining teacher double-bookings (same teacher in
// two grades at the same day+period) and try to move one of the clashing slots.
// Iterates until no further clashes can be fixed.

function resolveTeacherClashes(state, grades, tasks, blockedMap, availabilities) {
  for (let iter = 0; iter < 200; iter++) {
    // Build teacher → [{grade, day, period, subject_name}] from current state
    const teacherSlots = {};
    grades.forEach(grade => {
      Object.entries(state.grids[grade]).forEach(([key, val]) => {
        const [day, ...ps] = key.split("-");
        const period = Number(ps.join("-"));
        // Primary teacher — store primary subject so task lookup works
        if (val.teacher_id) {
          if (!teacherSlots[val.teacher_id]) teacherSlots[val.teacher_id] = [];
          teacherSlots[val.teacher_id].push({ grade, day, period, subject_name: val.subject_name });
        }
        // Paired teacher (SS elective) — also keyed by primary subject
        if (val.paired_teacher_id) {
          if (!teacherSlots[val.paired_teacher_id]) teacherSlots[val.paired_teacher_id] = [];
          teacherSlots[val.paired_teacher_id].push({ grade, day, period, subject_name: val.subject_name });
        }
      });
    });

    let fixedAny = false;

    outer:
    for (const slots of Object.values(teacherSlots)) {
      // Group by day+period
      const byTime = {};
      slots.forEach(s => {
        const tk = `${s.day}-${s.period}`;
        if (!byTime[tk]) byTime[tk] = [];
        byTime[tk].push(s);
      });

      for (const gradeSlots of Object.values(byTime)) {
        if (gradeSlots.length <= 1) continue;

        // Double-booking: try to move slots[1..n] to a different time
        for (let ci = 1; ci < gradeSlots.length; ci++) {
          const toMove = gradeSlots[ci];
          const task = tasks.find(t => t.grade === toMove.grade && t.subject_name === toMove.subject_name);
          if (!task) continue;

          unplace(state, toMove.grade, toMove.day, toMove.period);

          const dayUsage = {};
          DAYS.forEach(d => {
            dayUsage[d] = Object.keys(state.grids[toMove.grade])
              .filter(k => k.startsWith(d + "-") && state.grids[toMove.grade][k].subject_name === toMove.subject_name).length;
          });
          const candidates = shuffle(ALL_SLOTS)
            .filter(s => !(s.day === toMove.day && s.period === toMove.period))
            .sort((a, b) => (dayUsage[a.day] || 0) - (dayUsage[b.day] || 0));

          let moved = false;
          for (const { day: nd, period: np } of candidates) {
            if (!checkHard(state, blockedMap, availabilities, task, nd, np)) {
              place(state, toMove.grade, nd, np, toMove.subject_name, task.teacher_id,
                    task.pairedSubject || null, task.pairedTeacherId || null);
              moved = true;
              break;
            }
          }

          if (moved) {
            fixedAny = true;
            break outer; // Rebuild the map and re-scan
          } else {
            // Can't move — restore and try the next clashing slot
            place(state, toMove.grade, toMove.day, toMove.period, toMove.subject_name, task.teacher_id,
                  task.pairedSubject || null, task.pairedTeacherId || null);
          }
        }
      }
    }

    if (!fixedAny) break; // No more fixable clashes
  }
}

// ─── Phase 2: LNS Improvement ────────────────────────────────────────────────
// Destroy neighbourhood = remove all non-locked slots from a random grade on a random day
// Rebuild = re-place them greedily (spread-sorted), accept if penalty improves

function lnsImprovement(state, grades, tasks, blockedMap, availabilities, lockedSlots, iterations = 600) {
  const isLocked = (grade, day, period) =>
    lockedSlots.some(s => s.grade === grade && s.day === day && s.period === period && s.is_locked);

  let bestPenalty = computePenalty(state.grids, grades, tasks);

  for (let iter = 0; iter < iterations; iter++) {
    // Pick a random grade
    const grade = grades[Math.floor(Math.random() * grades.length)];

    // Destroy: choose either a random day (60%) or 2 random grades sharing a teacher+subject (40%)
    let destroyedSlots = []; // { day, period, subject_name, teacher_id }

    if (Math.random() < 0.6) {
      // Neighbourhood A: one grade × one day
      const day = DAYS[Math.floor(Math.random() * DAYS.length)];
      Object.entries(state.grids[grade]).forEach(([key, val]) => {
        const [kDay, kPeriod] = key.split("-");
        if (kDay === day && !isLocked(grade, kDay, Number(kPeriod))) {
          destroyedSlots.push({ day: kDay, period: Number(kPeriod), ...val });
        }
      });
    } else {
      // Neighbourhood B: one random subject in one grade (all its non-locked periods)
      const subjKeys = [...new Set(Object.values(state.grids[grade]).map(v => v.subject_name))];
      if (subjKeys.length === 0) continue;
      const subj = subjKeys[Math.floor(Math.random() * subjKeys.length)];
      Object.entries(state.grids[grade]).forEach(([key, val]) => {
        if (val.subject_name === subj) {
          const [kDay, kPeriod] = key.split("-");
          if (!isLocked(grade, kDay, Number(kPeriod))) {
            destroyedSlots.push({ day: kDay, period: Number(kPeriod), ...val });
          }
        }
      });
    }

    if (destroyedSlots.length === 0) continue;

    // Snapshot state for rollback
    const snapshot = {};
    destroyedSlots.forEach(s => {
      snapshot[`${s.day}-${s.period}`] = { ...s };
    });

    // Remove destroyed slots
    destroyedSlots.forEach(s => unplace(state, grade, s.day, s.period));

    // Rebuild: for each destroyed unit, find best valid slot (spread-preference)
    const rebuilt = [];
    let rebuildFailed = false;
    for (const ds of shuffle(destroyedSlots)) {
      const task = tasks.find(t => t.grade === grade && t.subject_name === ds.subject_name) || {
        grade,
        subject_name: ds.subject_name,
        teacher_id: ds.teacher_id,
        maxPerDay: 2,
        allowDouble: false,
        maxTeacherDay: 8,
        maxTeacherWeek: 40,
        avail: availabilities.find(a => a.teacher_id === ds.teacher_id) || null,
      };

      const dayUsage = {};
      DAYS.forEach(d => {
        dayUsage[d] = Object.keys(state.grids[grade])
          .filter(k => k.startsWith(d + "-") && state.grids[grade][k]?.subject_name === ds.subject_name).length;
      });
      const candidates = shuffle(ALL_SLOTS).sort((a, b) => (dayUsage[a.day] || 0) - (dayUsage[b.day] || 0));

      let placed = false;
      for (const { day, period } of candidates) {
        if (!checkHard(state, blockedMap, availabilities, task, day, period)) {
          place(state, grade, day, period, ds.subject_name, ds.teacher_id,
                ds.paired_subject || null, ds.paired_teacher_id || null);
          rebuilt.push({ day, period, subject_name: ds.subject_name, teacher_id: ds.teacher_id,
                         paired_subject: ds.paired_subject || null, paired_teacher_id: ds.paired_teacher_id || null });
          placed = true;
          break;
        }
      }
      if (!placed) { rebuildFailed = true; break; }
    }

    if (rebuildFailed) {
      // Rollback: undo rebuilt placements
      rebuilt.forEach(r => unplace(state, grade, r.day, r.period));
      // Restore original — must pass paired data or SS elective pairs get stripped
      Object.entries(snapshot).forEach(([key, val]) => {
        const [day, period] = key.split("-");
        place(state, grade, day, Number(period), val.subject_name, val.teacher_id,
              val.paired_subject || null, val.paired_teacher_id || null);
      });
      continue;
    }

    // Evaluate
    const newPenalty = computePenalty(state.grids, grades, tasks);
    if (newPenalty < bestPenalty) {
      bestPenalty = newPenalty;
      // Keep the new state (already applied)
    } else {
      // Rollback — must pass paired data or SS elective pairs get stripped
      rebuilt.forEach(r => unplace(state, grade, r.day, r.period));
      Object.entries(snapshot).forEach(([key, val]) => {
        const [day, period] = key.split("-");
        place(state, grade, day, Number(period), val.subject_name, val.teacher_id,
              val.paired_subject || null, val.paired_teacher_id || null);
      });
    }
  }

  return bestPenalty;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function generateCPSAT({
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
  // Build blocked map
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
  const state = makeState(grades, teachers, blockedMap, lockedSlots);

  // Phase 1: Feasibility
  const { unplacedUnits } = feasibilitySearch(tasks, state, blockedMap, availabilities, effectivePriorityTeacherIds);

  // Phase 1.5: Repair pass — swap-based repair for greedy failures
  const stillUnplacedUnits = repairPass(unplacedUnits, tasks, state, blockedMap, availabilities);

  // Phase 1.6: Resolve any teacher double-bookings introduced by greedy/repair
  resolveTeacherClashes(state, grades, tasks, blockedMap, availabilities);

  // Diagnostics (report only units still unplaced after repair)
  const infeasibleConflicts = [];
  if (stillUnplacedUnits.length > 0) {
    const postRepairFailMap = {};
    stillUnplacedUnits.forEach(unit => {
      const desc = `${unit.grade} – ${unit.subject_name}${unit.pairedSubject ? "/" + unit.pairedSubject : ""}`;
      for (const { day, period } of ALL_SLOTS) {
        const r = checkHard(state, blockedMap, availabilities, unit, day, period);
        if (r) {
          if (!postRepairFailMap[r]) postRepairFailMap[r] = new Set();
          postRepairFailMap[r].add(desc);
        }
      }
    });
    Object.entries(postRepairFailMap).forEach(([reason, taskSet]) => {
      infeasibleConflicts.push(`[${reason}]: ${[...taskSet].join(", ")}`);
    });
  }

  // Phase 2: LNS (run even if partially infeasible — improves what was placed)
  const finalPenalty = lnsImprovement(state, grades, tasks, blockedMap, availabilities, lockedSlots, 700);

  // Phase 2.5: Re-resolve any teacher clashes the LNS may have introduced
  resolveTeacherClashes(state, grades, tasks, blockedMap, availabilities);

  // Build log / warnings (count placed by checking primary subject in grid)
  const log = [];
  const warnings = [];
  tasks.forEach(task => {
    const { grade, subject_name, pairedSubject, periodsPerWeek, lockedCount } = task;
    // For paired tasks the grid stores the primary subject; count those entries
    const placed = Object.values(state.grids[grade]).filter(v => v.subject_name === subject_name).length;
    const total = placed + lockedCount;
    const label = `${grade} – ${subject_name}${pairedSubject ? "/" + pairedSubject : ""}`;
    if (total < periodsPerWeek) {
      warnings.push(`⚠ ${label}: scheduled ${total}/${periodsPerWeek} periods`);
    } else {
      log.push(`✓ ${label}: ${total} periods`);
    }
  });

  // Flatten grids → result array (emit both subjects for SS paired slots)
  const result = [];
  grades.forEach(grade => {
    Object.entries(state.grids[grade]).forEach(([key, val]) => {
      const [day, ...parts] = key.split("-");
      const period = Number(parts.join("-"));
      const locked = lockedSlots.some(
        s => s.grade === grade && s.day === day && s.period === period && s.is_locked
      );
      if (!locked && val.subject_name) {
        result.push({ grade, day, period, subject_name: val.subject_name, teacher_id: val.teacher_id || "" });
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
    backtracks: 0, // N/A for this solver
    algorithm: "CP-SAT + LNS",
  };
}
