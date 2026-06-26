import { createEntity } from '@/lib/createEntity';
import { me } from '@/api/auth';

export const Student = createEntity('students');
export const Teacher = createEntity('teachers');
export const Payment = createEntity('payments');
export const Attendance = createEntity('attendance');
export const AttendanceCheckIn = createEntity('attendance_check_ins');
export const BirthdaySmsLog    = createEntity('birthday_sms_log');
export const Event = createEntity('events');
export const Expense = createEntity('expenses');
export const ExamResult = createEntity('exam_results');
export const Quiz = createEntity('quizzes');
export const Question = createEntity('questions');
export const CBTAttempt = createEntity('cbt_attempts');
export const ClassAssignment = createEntity('class_assignments');
export const TimetableSlot = createEntity('timetable_slots');
export const Subject = createEntity('subjects');
export const TeacherAvailability = createEntity('teacher_availability');
export const AcademicRecord = createEntity('academic_records');
export const GradebookEntry = createEntity('gradebook_entries');
export const SchoolSettings = createEntity('school_settings');
export const SchemeOfWork = createEntity('scheme_of_work');

// User entity — wraps profiles table + auth helper
export const User = {
  ...createEntity('profiles'),
  me,
};

export { AuditLog } from "./AuditLog";
