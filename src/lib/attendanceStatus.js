/**
 * Attendance status resolver
 * ─────────────────────────────────────────────────────────────────────────────
 * The school's attendance flow is a "default-present" model — only absences /
 * lates / excused are written to the `attendance` table; presence is implicit
 * by the absence of a record. That model only works if a real human actually
 * opens the page each day, otherwise every student is silently marked present
 * regardless of what really happened.
 *
 * To force engagement, the class teacher (or admin) must check in for that
 * class on that day. The check-in writes one row to `attendance_check_ins`.
 * From then on:
 *
 *   - No absence record  →  PRESENT
 *   - Absence record     →  use record.status (absent / late / excused)
 *
 * If NO check-in exists for `(grade, attendance_date)`, every student in that
 * class is counted as ABSENT regardless of whether an absence record exists or
 * not. That way a class with a missing check-in shows up as 0% attendance in
 * every report / dashboard widget, and admin can chase the teacher before
 * close of business.
 */

/**
 * Build a Set of "grade|attendance_date" keys that have a check-in.
 *
 * @param {Array<{grade?: string, attendance_date?: string}>} checkIns
 * @returns {Set<string>}
 */
export function buildCheckInIndex(checkIns = []) {
  const idx = new Set();
  for (const row of checkIns) {
    if (row?.grade && row?.attendance_date) {
      idx.add(`${row.grade}|${row.attendance_date}`);
    }
  }
  return idx;
}

/**
 * @param {Set<string>} checkInIndex
 * @param {string} grade
 * @param {string} attendanceDate  yyyy-mm-dd
 */
export function hasCheckIn(checkInIndex, grade, attendanceDate) {
  if (!checkInIndex || !grade || !attendanceDate) return false;
  return checkInIndex.has(`${grade}|${attendanceDate}`);
}

/**
 * Resolve a single attendance status for one (student, date).
 *
 * @param {object} args
 * @param {string} args.grade                      – Student's class for that day
 * @param {string} args.attendanceDate             – yyyy-mm-dd
 * @param {Set<string>} args.checkInIndex          – From buildCheckInIndex()
 * @param {object|null} [args.absenceRecord]       – The attendance row if any
 *
 * @returns {"present"|"absent"|"late"|"excused"}
 */
export function resolveAttendanceStatus({
  grade,
  attendanceDate,
  checkInIndex,
  absenceRecord,
}) {
  if (!hasCheckIn(checkInIndex, grade, attendanceDate)) {
    // No teacher check-in → treat the whole class as absent for the day.
    return "absent";
  }
  if (absenceRecord && absenceRecord.status) {
    return absenceRecord.status;
  }
  return "present";
}

/**
 * Bulk-count statuses for a set of attendance rows, gated by check-ins.
 * Used by Reports + Dashboard widgets so the "0% present without check-in"
 * rule is enforced consistently.
 *
 * @param {object} args
 * @param {Array<{student_id, attendance_date, grade, status}>} args.records
 * @param {Set<string>} args.checkInIndex
 * @param {Array<string>} args.expectedDates   – School days expected in range
 * @param {Array<{id: string, grade: string}>} args.students
 *
 * @returns {{present: number, absent: number, late: number, excused: number, expected: number}}
 */
export function tallyAttendance({
  records = [],
  checkInIndex,
  expectedDates = [],
  students = [],
}) {
  // Build a fast lookup of records keyed by (student_id, date).
  const recordIndex = new Map();
  for (const r of records) {
    if (r?.student_id && r?.attendance_date) {
      recordIndex.set(`${r.student_id}|${r.attendance_date}`, r);
    }
  }

  let present = 0, absent = 0, late = 0, excused = 0;
  for (const student of students) {
    for (const date of expectedDates) {
      const absenceRecord = recordIndex.get(`${student.id}|${date}`) || null;
      const status = resolveAttendanceStatus({
        grade: student.grade,
        attendanceDate: date,
        checkInIndex,
        absenceRecord,
      });
      if      (status === "present") present += 1;
      else if (status === "absent")  absent  += 1;
      else if (status === "late")    late    += 1;
      else if (status === "excused") excused += 1;
    }
  }

  return {
    present,
    absent,
    late,
    excused,
    expected: students.length * expectedDates.length,
  };
}
