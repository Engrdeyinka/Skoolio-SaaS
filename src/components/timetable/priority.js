export function isPartTimeAvailability(availability) {
  return availability?.employment_type === "part_time";
}

export function getAutomaticPriorityTeacherIds(availabilities = []) {
  return [...new Set(
    availabilities
      .filter(isPartTimeAvailability)
      .map((availability) => availability?.teacher_id)
      .filter(Boolean)
  )];
}

function hasPriorityTeacher(task, priorityIds) {
  return [task?.teacher_id, task?.pairedTeacherId].some((teacherId) => teacherId && priorityIds.has(teacherId));
}

function hasPartTimeTeacher(task) {
  return [task?.avail, task?.pairedAvail].some(isPartTimeAvailability);
}

function countAvailableSlots(availability, days, periods, isUnavailable) {
  if (!availability) return days.length * periods.length;
  let total = 0;
  days.forEach((day) => {
    periods.forEach((period) => {
      if (!isUnavailable(availability, day, period)) total += 1;
    });
  });
  return total;
}

export function compareTasksByPriority(a, b, { priorityTeacherIds = [], days = [], periods = [], isUnavailable = () => false } = {}) {
  const priorityIds = priorityTeacherIds instanceof Set ? priorityTeacherIds : new Set(priorityTeacherIds);

  const aHasPartTime = hasPartTimeTeacher(a);
  const bHasPartTime = hasPartTimeTeacher(b);
  if (aHasPartTime !== bHasPartTime) return Number(bHasPartTime) - Number(aHasPartTime);

  const aHasManualPriority = hasPriorityTeacher(a, priorityIds);
  const bHasManualPriority = hasPriorityTeacher(b, priorityIds);
  if (aHasManualPriority !== bHasManualPriority) return Number(bHasManualPriority) - Number(aHasManualPriority);

  const aScarcity = Math.min(
    countAvailableSlots(a?.avail, days, periods, isUnavailable),
    countAvailableSlots(a?.pairedAvail, days, periods, isUnavailable)
  );
  const bScarcity = Math.min(
    countAvailableSlots(b?.avail, days, periods, isUnavailable),
    countAvailableSlots(b?.pairedAvail, days, periods, isUnavailable)
  );
  if (aScarcity !== bScarcity) return aScarcity - bScarcity;

  if ((b?.periodsNeeded || 0) !== (a?.periodsNeeded || 0)) {
    return (b?.periodsNeeded || 0) - (a?.periodsNeeded || 0);
  }

  return String(a?.grade || "").localeCompare(String(b?.grade || "")) ||
    String(a?.subject_name || "").localeCompare(String(b?.subject_name || ""));
}

export function sortTasksForPriority(tasks = [], options = {}) {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const result = compareTasksByPriority(left.task, right.task, options);
      return result !== 0 ? result : left.index - right.index;
    })
    .map(({ task }) => task);
}
