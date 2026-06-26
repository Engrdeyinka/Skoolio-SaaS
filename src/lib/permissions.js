export const ROLES = {
  STUDENT: "student",
  TEACHER: "teacher",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

export const PAGE_ACCESS = {
  AcademicRecords: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Attendance: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  CBT: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  CBTEditor: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  CBTGrading: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  CBTTest: [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  ClassAssignments: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Communications: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Dashboard: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Documents: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Events: [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Expenses: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Gallery: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Library: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Onboarding: [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Payments: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Payroll: [ROLES.SUPER_ADMIN],
  PracticeExam: [ROLES.STUDENT, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Reports: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Settings: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  StudentCBT: [ROLES.STUDENT],
  StudentDashboard: [ROLES.STUDENT],
  StudentLibrary: [ROLES.STUDENT],
  StudentPayments: [ROLES.STUDENT],
  StudentResults: [ROLES.STUDENT],
  SuperAdminAudit: [ROLES.SUPER_ADMIN],
  Students: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Subjects: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Teachers: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  Timetable: [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  UserManagement: [ROLES.SUPER_ADMIN],
  TermSetup: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  ResultsWorkflow: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  SchemeOfWork: [ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  SchoolVault: [ROLES.SUPER_ADMIN],
  Rewards:     [ROLES.SUPER_ADMIN],
};

export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function hasRole(userOrRole, allowedRoles = []) {
  const role = normalizeRole(typeof userOrRole === "string" ? userOrRole : userOrRole?.school_role);
  return allowedRoles.map(normalizeRole).includes(role);
}

export function isStudent(userOrRole) {
  return hasRole(userOrRole, [ROLES.STUDENT]);
}

export function isTeacher(userOrRole) {
  return hasRole(userOrRole, [ROLES.TEACHER]);
}

export function isAdmin(userOrRole) {
  return hasRole(userOrRole, [ROLES.ADMIN]);
}

export function isSuperAdmin(userOrRole) {
  return hasRole(userOrRole, [ROLES.SUPER_ADMIN]);
}

export function isAdminLike(userOrRole) {
  return hasRole(userOrRole, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
}

export function canAccessPage(userOrRole, pageName) {
  const allowedRoles = PAGE_ACCESS[pageName];
  if (!allowedRoles) return true;
  return hasRole(userOrRole, allowedRoles);
}

export function getPageNameFromUrl(url) {
  const cleanPath = String(url || "")
    .split("?")[0]
    .replace(/^\/+/, "")
    .trim();
  return cleanPath || null;
}

export function filterNavigationItems(userOrRole, items = []) {
  return items.filter((item) => {
    const pageName = item.page || getPageNameFromUrl(item.url);
    if (!pageName) return true;
    return canAccessPage(userOrRole, pageName);
  });
}

export function filterNavigationGroups(userOrRole, groups = {}) {
  return Object.fromEntries(
    Object.entries(groups)
      .map(([groupName, items]) => [groupName, filterNavigationItems(userOrRole, items)])
      .filter(([, items]) => items.length > 0)
  );
}

export function getDefaultPageForRole(role) {
  return isStudent(role) ? "/StudentDashboard" : "/Dashboard";
}

export function canViewFullParentPhone(userOrRole) {
  return isAdminLike(userOrRole);
}

export function canManageStudents(userOrRole) {
  return isAdminLike(userOrRole);
}

export function canManageExpenses(userOrRole) {
  return isAdminLike(userOrRole);
}

export function canApproveChanges(userOrRole) {
  return isSuperAdmin(userOrRole);
}

export function canViewTeacherWorkload(userOrRole) {
  return !isTeacher(userOrRole) && !isStudent(userOrRole);
}

export function canBrowseTeacherTimetables(userOrRole) {
  return !isStudent(userOrRole);
}
