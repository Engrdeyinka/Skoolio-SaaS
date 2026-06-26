import { useState, useEffect } from 'react';
import { ClassAssignment, Teacher } from '@/entities/all';
import { useAuth } from '@/lib/AuthContext';

/**
 * Returns the subject and classes a teacher is allowed to access.
 * For admins / super_admins, all values are null / empty (unrestricted).
 *
 * Pass `previewTeacherId` (a teacher record id) to make a super_admin see the
 * page exactly as that teacher would — useful for verifying subject assignments.
 */
export function useTeacherAccess({ previewTeacherId } = {}) {
  const { user: currentUser } = useAuth();
  const [teacherSubject, setTeacherSubject] = useState(null);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [previewTeacherName, setPreviewTeacherName] = useState(null);
  const [isLoadingTeacher, setIsLoadingTeacher] = useState(false);

  const isTeacher = currentUser?.school_role === 'teacher';
  const isSuperAdmin = currentUser?.school_role === 'super_admin';
  const isAdminOrSuperAdmin = ['admin', 'super_admin'].includes(currentUser?.school_role);

  const isPreviewMode = isSuperAdmin && !!previewTeacherId;

  // The teacher ID to load data for: real teacher's linked ID, or the previewed teacher ID
  const effectiveTeacherId = isPreviewMode
    ? previewTeacherId
    : (isTeacher ? currentUser?.linked_teacher_id : null);

  useEffect(() => {
    if (!effectiveTeacherId) {
      setTeacherSubject(null);
      setTeacherSubjects([]);
      setTeacherClasses([]);
      setPreviewTeacherName(null);
      return;
    }
    setIsLoadingTeacher(true);
    Promise.all([
      Teacher.get(effectiveTeacherId),
      ClassAssignment.list().catch(() => []),
    ])
      .then(([teacher, assignments]) => {
        if (teacher) {
          const assignedRows = (assignments || []).filter(a =>
            a.subject_teacher_id === teacher.id || a.teacher_id === teacher.id
          );
          const assignedSubjects = [...new Set(
            assignedRows
              .map(a => a.subject)
              .filter(Boolean)
          )].sort();
          const assignedClasses = [...new Set([
            ...(teacher.classes_assigned || []),
            ...assignedRows.map(a => a.grade).filter(Boolean),
          ])].sort();

          setTeacherSubjects(assignedSubjects.length ? assignedSubjects : (teacher.subject_specialization ? [teacher.subject_specialization] : []));
          setTeacherSubject(teacher.subject_specialization || assignedSubjects[0] || null);
          setTeacherClasses(assignedClasses);

          if (isPreviewMode) {
            setPreviewTeacherName(`${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || 'Teacher');
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingTeacher(false));
  }, [effectiveTeacherId, isPreviewMode]);

  const effectiveIsTeacher = isTeacher || isPreviewMode;
  const effectiveIsAdminOrSuperAdmin = isAdminOrSuperAdmin && !isPreviewMode;

  /**
   * Given a list of items, returns only the items this teacher is allowed to see.
   * Items must have `subject` (or `subject_name`) and `grade` fields.
   * Admins/super_admins (not in preview) get the full list back unchanged.
   */
  const filterByTeacher = (items, { subjectKey = 'subject', gradeKey = 'grade' } = {}) => {
    if (!effectiveIsTeacher) return items;
    return items.filter(item => {
      const subjectMatch = teacherSubjects.length === 0 || teacherSubjects.includes(item[subjectKey]);
      const gradeMatch = teacherClasses.length === 0 || teacherClasses.includes(item[gradeKey]);
      return subjectMatch && gradeMatch;
    });
  };

  /** Returns true if the teacher can access a given subject name */
  const canAccessSubject = (subject) => !effectiveIsTeacher || teacherSubjects.length === 0 || teacherSubjects.includes(subject);

  /** Returns true if the teacher can access a given class/grade */
  const canAccessClass = (grade) => !effectiveIsTeacher || teacherClasses.length === 0 || teacherClasses.includes(grade);

  return {
    isTeacher: effectiveIsTeacher,
    isAdminOrSuperAdmin: effectiveIsAdminOrSuperAdmin,
    isSuperAdmin,
    isPreviewMode,
    previewTeacherName,
    teacherSubject,
    teacherSubjects,
    teacherClasses,
    isLoadingTeacher,
    filterByTeacher,
    canAccessSubject,
    canAccessClass,
  };
}
