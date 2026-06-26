import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { restoreDriveConnection } from "@/lib/googleDriveService";
import { getVaultDriveConfig } from "@/lib/vaultConfig";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Student } from "@/entities/all";
import { useAuth } from "@/lib/AuthContext";
import { GraduationCap, LayoutDashboard, Users, CreditCard, UserCheck, GraduationCap as TeacherIcon, FileText, CalendarDays, BookOpen, TrendingDown, ClipboardCheck, LayoutGrid, Settings as SettingsIcon, Wallet, MessageSquare, IdCard, FlaskConical, Banknote, Moon, Sun, Shield, RefreshCw, ChevronLeft, ChevronRight, LogOut, CheckSquare, Flame, Gift, Receipt, Camera, Package } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import StreakPanel from "@/components/StreakPanel";
import { getStreaks } from "@/lib/streakUtils";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import useAppUsageTracker from "@/hooks/useAppUsageTracker";
import { canAccessPage, filterNavigationGroups, getDefaultPageForRole, ROLES } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  useSidebar } from
"@/components/ui/sidebar.jsx";

const navItem = (title, page, icon) => ({
  title,
  page,
  url: createPageUrl(page),
  icon,
});

// Navigation items for different roles
const adminNav = {
  main: [
  navItem("Dashboard", "Dashboard", LayoutDashboard),
  navItem("Students", "Students", Users),
  navItem("Teachers", "Teachers", TeacherIcon)],

  academic: [
  navItem("Academic Records", "AcademicRecords", BookOpen),
  navItem("Attendance", "Attendance", UserCheck),
  navItem("CBT Management", "CBT", ClipboardCheck),
  navItem("Scheme of Work", "SchemeOfWork", BookOpen),
  navItem("Timetable", "Timetable", LayoutGrid)],

  finance: [
  navItem("Payments", "Payments", CreditCard),
  navItem("Expenses", "Expenses", TrendingDown)],

  general: [
  navItem("Library", "Library", BookOpen),
  navItem("Exam Practice", "PracticeExam", FlaskConical),
  navItem("Photo Gallery", "Gallery", Camera),
  navItem("Communications", "Communications", MessageSquare),
  navItem("Academic Calendar", "Events", CalendarDays),
  navItem("Documents", "Documents", IdCard),
  navItem("Reports", "Reports", FileText),
  navItem("Settings", "Settings", SettingsIcon)]

};

const teacherNav = {
  main: [
  navItem("Dashboard", "Dashboard", LayoutDashboard),
  navItem("My Students", "Students", Users)],

  academic: [
  navItem("Academic Records", "AcademicRecords", BookOpen),
  navItem("Attendance", "Attendance", UserCheck),
  navItem("CBT Management", "CBT", ClipboardCheck),
  navItem("Scheme of Work", "SchemeOfWork", BookOpen),
  navItem("Timetable", "Timetable", LayoutGrid)],

  general: [
  navItem("Library", "Library", BookOpen),
  navItem("Photo Gallery", "Gallery", Camera),
  navItem("Events", "Events", CalendarDays)]

};

// studentNav is built dynamically inside the component based on grade

const NavMenuLink = ({ item, location }) => {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton
        asChild
        className={`hover:bg-emerald-100 hover:text-emerald-900 transition-all duration-200 rounded-lg mb-0.5 font-medium ${
        location.pathname === item.url ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700'}`
        }>

        <Link
          to={item.url}
          onClick={() => { if (isMobile) setOpenMobile(false); }}
          className="flex items-center gap-3 px-3 py-2.5">
          <item.icon className="w-4 h-4 flex-shrink-0" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const NavGroup = ({ title, items, location }) =>
<SidebarGroup>
    <SidebarGroupLabel className="text-xs font-semibold text-emerald-500 uppercase tracking-wider px-3 py-2">
      {title}
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu className="space-y-0.5">
        {items.map((item) => <NavMenuLink key={item.title} item={item} location={location} />)}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>;


/**
 * Header reload button — essential in the installed PWA where there is no
 * browser address bar / refresh button. Tapping forces a page reload; the SW
 * (registerType: 'autoUpdate') will pull the latest build on the way back in.
 *
 * Animates a 360° spin while the new page is loading so the user gets visual
 * feedback that the tap registered. Disabled briefly after click to prevent
 * double-taps from triggering two reloads.
 */
const ReloadButton = () => {
  const [spinning, setSpinning] = React.useState(false);
  const handleReload = async () => {
    setSpinning(true);
    try {
      // Ask the service worker to check for a new version before we reload,
      // so we never sit on a stale build for a full extra page-load cycle.
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
    } catch { /* update check failure is fine — reload anyway */ }
    window.location.reload();
  };
  return (
    <button
      type="button"
      onClick={handleReload}
      disabled={spinning}
      title="Reload the app"
      aria-label="Reload the app"
      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white disabled:opacity-60"
    >
      <RefreshCw className={"w-5 h-5 " + (spinning ? "animate-spin" : "")} />
    </button>
  );
};


export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, isLoadingAuth, logout } = useAuth();
  const { schoolLogoUrl, schoolName: settingsSchoolName } = useSchoolSettings();
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("tops_dark") === "true");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("tops_dark", darkMode);
  }, [darkMode]);

  const [previewRole, setPreviewRole] = useState(() => sessionStorage.getItem('previewRole') || null);
  const [previewStudentId, setPreviewStudentId] = useState(null);
  const [studentGrade, setStudentGrade] = useState(null);
  const [streakPanelOpen, setStreakPanelOpen] = useState(false);
  const [topStreak, setTopStreak] = useState(0);
  const isMobile = useIsMobile();

  useAppUsageTracker(currentUser);

  // Restore Google Drive connection from server once on app load so Drive
  // works universally for all users on all devices without needing to reconnect.
  useEffect(() => {
    getVaultDriveConfig()
      .then(cfg => {
        const clientId = cfg?.google_client_id;
        if (clientId) restoreDriveConnection(clientId).catch(() => {});
      })
      .catch(() => {});
  }, []);

  // Prefetch the JS chunks for the most-visited pages during browser idle time.
  // This means the first click on any of these pages is instant (chunk already
  // downloaded) rather than waiting for a network round-trip.
  useEffect(() => {
    const prefetch = () => {
      const chunks = [
        () => import('./pages/Dashboard'),
        () => import('./pages/Students'),
        () => import('./pages/Payments'),
        () => import('./pages/Attendance'),
        () => import('./pages/AcademicRecords'),
        () => import('./pages/CBT'),
        () => import('./pages/Settings'),
        () => import('./pages/StudentDashboard'),
        () => import('./pages/StudentResults'),
        () => import('./pages/StudentCBT'),
      ];
      chunks.forEach(fn => { try { fn(); } catch {} });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(prefetch, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    } else {
      const t = setTimeout(prefetch, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  // Load top streak for admin/teacher users — also re-runs whenever a
  // streak-updated event fires (dispatched by recordStreak in streakUtils.js)
  useEffect(() => {
    const role = authUser?.school_role;
    if (!authUser?.id || !['admin', 'super_admin', 'teacher'].includes(role)) return;

    const refreshBadge = () => {
      getStreaks(authUser.id).then(data => {
        const best = Object.values(data).reduce((max, s) => Math.max(max, s.current_streak || 0), 0);
        setTopStreak(best);
      }).catch(() => {});
    };

    refreshBadge(); // initial load
    window.addEventListener("streak-updated", refreshBadge);
    return () => window.removeEventListener("streak-updated", refreshBadge);
  }, [authUser?.id, authUser?.school_role]);

  // Load student grade so we can conditionally show Exam Practice
  useEffect(() => {
    const linkedId = authUser?.linked_student_id;
    if (authUser?.school_role === 'student' && linkedId && linkedId !== '0000' && linkedId.length > 4) {
      Student.get(linkedId)
        .then(s => setStudentGrade(s?.grade || null))
        .catch(() => {});
    }
  }, [authUser?.linked_student_id]);

  useEffect(() => {
    if (isLoadingAuth) return;

    if (authUser) {
      setCurrentUser(authUser);

      // Redirect to onboarding if user hasn't set a role yet
      if (!authUser.school_role && !window.location.pathname.toLowerCase().includes("onboarding")) {
        window.location.href = createPageUrl("Onboarding");
        return;
      }

      // Redirect students to profile selection if not linked
      const isStudentUnlinked = authUser.school_role === "student" && (!authUser.linked_student_id || authUser.linked_student_id === "0000" || authUser.linked_student_id.length <= 4);
      const alreadyOnStudentDashboard = window.location.pathname.toLowerCase().includes("studentdashboard");
      if (isStudentUnlinked && !alreadyOnStudentDashboard) {
        window.location.href = createPageUrl("StudentDashboard");
        return;
      }
    } else {
      setCurrentUser({ school_role: 'student' });
    }

    setIsLoading(false);
  }, [authUser, isLoadingAuth]);

  const isOnboarding = window.location.pathname.toLowerCase().includes("onboarding");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>);
  }

  // Render onboarding without any sidebar
  if (isOnboarding) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">{children}</div>;
  }

  const actualRole = currentUser?.school_role || null;

  // If no school_role yet, user is being redirected to Onboarding — render nothing
  if (!actualRole) {
    return null;
  }

  const userRole = actualRole === ROLES.SUPER_ADMIN && previewRole ? previewRole : (actualRole || ROLES.STUDENT);
  const effectiveNavRole = actualRole === 'super_admin' && !previewRole ? 'super_admin' : userRole;
  const isPreviewingStudent = actualRole === 'super_admin' && userRole === 'student' && previewStudentId;

  // Build student nav dynamically — Exam Practice only for SSS 2 / SSS 3
  const examPracticeGrades = ["SSS 2", "SSS 3"];
  const showExamPractice = studentGrade && examPracticeGrades.includes(studentGrade);
  const studentNav = {
    main: [
      navItem("My Dashboard", "StudentDashboard", LayoutDashboard),
      navItem("Take Test", "StudentCBT", ClipboardCheck),
    ],
    academic: [
      navItem("My Results", "StudentResults", BookOpen),
      navItem("Library", "StudentLibrary", BookOpen),
      ...(showExamPractice ? [navItem("Exam Practice", "PracticeExam", FlaskConical)] : []),
      navItem("My Payments", "StudentPayments", Wallet),
      navItem("Timetable", "Timetable", LayoutGrid),
      navItem("Events", "Events", CalendarDays),
    ],
  };

  let rawNavigationConfig;

  switch (effectiveNavRole) {
    case 'teacher':
      rawNavigationConfig = teacherNav;
      break;
    case 'student':
      rawNavigationConfig = studentNav;
      break;
    case 'admin':
    case 'super_admin':
    default:
      rawNavigationConfig = adminNav;
  }

  const navigationConfig = filterNavigationGroups(effectiveNavRole, rawNavigationConfig);
  const navSequence = (() => {
    const orderedGroups = [
      ...(navigationConfig.main || []),
      ...(navigationConfig.academic || []),
      ...(navigationConfig.finance || []),
      ...(navigationConfig.general || []),
    ];

    if (effectiveNavRole === 'super_admin') {
      orderedGroups.push(
        navItem("Payroll", "Payroll", Banknote),
        navItem("Approvals & Audit", "SuperAdminAudit", CheckSquare),
        navItem("School Vault", "SchoolVault", Shield),
        navItem("Streak Rewards", "Rewards", Gift),
      );
    }

    return orderedGroups;
  })();

  const currentNavIndex = navSequence.findIndex((item) => location.pathname === item.url);
  const canGoBack = currentNavIndex > 0;
  const canGoForward = currentNavIndex >= 0 && currentNavIndex < navSequence.length - 1;
  const handleNavigateBack = () => {
    if (!canGoBack) return;
    navigate(navSequence[currentNavIndex - 1].url);
  };
  const handleNavigateForward = () => {
    if (!canGoForward) return;
    navigate(navSequence[currentNavIndex + 1].url);
  };

  if (currentPageName && !canAccessPage(effectiveNavRole, currentPageName)) {
    window.location.href = getDefaultPageForRole(effectiveNavRole);
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-50 dark:bg-slate-950">
        <Sidebar className="border-r border-emerald-200/70 bg-emerald-50 dark:bg-slate-900 dark:border-slate-700">
          <SidebarHeader className="border-b border-emerald-200/60 p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-lg bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center">
                {schoolLogoUrl
                  ? <img src={schoolLogoUrl} alt="School logo" className="w-full h-full object-cover" />
                  : <GraduationCap className="w-5 h-5 text-white" />
                }
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-emerald-900 text-sm leading-tight truncate dark:text-slate-100">
                  {settingsSchoolName || BRAND.schoolName}
                </h2>
                <p className="text-xs text-emerald-600 font-medium dark:text-slate-400">Private School</p>
              </div>
            </div>

            <div className="mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize
                ${userRole === 'super_admin' ? 'bg-emerald-100 text-emerald-700' :
              userRole === 'admin' ? 'bg-blue-100 text-blue-700' :
              userRole === 'teacher' ? 'bg-emerald-100 text-emerald-700' :
              'bg-slate-100 text-slate-600'}`}>
                {userRole.replace('_', ' ')}
              </span>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            {navigationConfig.main && <NavGroup title="Main" items={navigationConfig.main} location={location} />}
            {navigationConfig.academic && <NavGroup title="Academics" items={navigationConfig.academic} location={location} />}
            {navigationConfig.finance && <NavGroup title="Finance" items={navigationConfig.finance} location={location} />}
            {navigationConfig.general && <NavGroup title="General" items={navigationConfig.general} location={location} />}

            {effectiveNavRole === 'super_admin' && (
            <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold text-emerald-500 uppercase tracking-wider px-3 py-2">
                  Super Admin
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-0.5">
                    {[
                      { title: "Payroll",      url: createPageUrl("Payroll"),      icon: Banknote },
                      { title: "Approvals & Audit", url: createPageUrl("SuperAdminAudit"), icon: CheckSquare },
                      { title: "School Vault", url: createPageUrl("SchoolVault"),  icon: Shield   },
                      { title: "Streak Rewards", url: createPageUrl("Rewards"),   icon: Gift     },
                    ].map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild className={`hover:bg-emerald-100 hover:text-emerald-900 transition-all duration-200 rounded-lg mb-0.5 font-medium ${location.pathname === item.url ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700'}`}>
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                            <item.icon className="w-4 h-4 flex-shrink-0" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>












                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          {actualRole === 'super_admin' &&
          <div className="px-4 pb-3 border-t border-emerald-200/60 pt-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2">Preview As</p>
                <div className="flex flex-wrap gap-1.5">
                  {['super_admin', 'admin', 'teacher', 'student'].map((role) =>
                <button
                  key={role}
                  onClick={() => {
                    const newRole = role === actualRole ? null : role;
                    setPreviewRole(newRole);
                    if (newRole) {
                      sessionStorage.setItem('previewRole', newRole);
                    } else {
                      sessionStorage.removeItem('previewRole');
                    }
                    if (role !== 'student') setPreviewStudentId(null);
                    // Navigate without page reload so previewRole state is preserved
                    const effectiveRole = newRole || actualRole;
                    navigate(effectiveRole === 'student' ? createPageUrl("StudentDashboard") : createPageUrl("Dashboard"));
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors capitalize ${
                  userRole === role ?
                  'bg-emerald-600 text-white' :
                  'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-900'}`
                  }>

                      {role.replace('_', ' ')}
                    </button>
                )}
                </div>
              </div>

              {isPreviewingStudent &&
            <div className="pt-2 border-t border-emerald-200/50">
                  <button
                onClick={() => setPreviewStudentId(null)}
                className="text-xs text-emerald-500 hover:text-emerald-700 underline">

                    ✕ Clear student preview
                  </button>
                </div>
            }
            </div>
          }

          <SidebarFooter className="border-t border-emerald-200/60 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-100 to-emerald-200 border border-emerald-300/50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-700 font-bold text-sm">
                  {currentUser?.full_name?.[0] || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-emerald-900 text-sm truncate dark:text-slate-100">{currentUser?.full_name || 'User'}</p>
                <p className="text-xs text-emerald-600 truncate capitalize dark:text-slate-400">{userRole.replace('_', ' ')}</p>
              </div>
              <button
                onClick={() => setDarkMode(d => !d)}
                className="text-emerald-500 hover:text-emerald-700 transition-colors p-1"
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { sessionStorage.removeItem('previewRole'); logout(); }}
                className="text-emerald-500 hover:text-red-500 transition-colors p-1"
                title="Logout">

                ⏻
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header
            className="bg-white border-b border-slate-200 px-3 py-3 sm:px-4 flex items-center justify-between sticky top-0 z-30 dark:bg-slate-900 dark:border-slate-700"
            style={{ paddingTop: isMobile ? "max(0.75rem, env(safe-area-inset-top))" : undefined }}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200 shrink-0" />
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={handleNavigateBack}
                  disabled={!canGoBack}
                  title="Go back"
                  aria-label="Go back"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNavigateForward}
                  disabled={!canGoForward}
                  title="Go forward"
                  aria-label="Go forward"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="max-w-[40vw] truncate font-semibold text-slate-800 text-sm sm:max-w-none dark:text-slate-100">
                {currentPageName || BRAND.schoolName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ReloadButton />
              <NotificationBell userRole={userRole} />
              {['admin', 'super_admin', 'teacher'].includes(actualRole) && (
                <button
                  type="button"
                  onClick={() => setStreakPanelOpen(p => !p)}
                  title="Activity Streaks"
                  aria-label="Activity Streaks"
                  className="relative w-9 h-9 flex items-center justify-center rounded-lg text-orange-500 hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 transition-colors"
                >
                  <Flame className="w-5 h-5" />
                  {topStreak > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {topStreak > 99 ? "99+" : topStreak}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => { sessionStorage.removeItem('previewRole'); logout(); }}
                className="flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700"
                title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div
            className="flex-1 overflow-auto"
            style={{ paddingBottom: isMobile ? "max(0.75rem, env(safe-area-inset-bottom))" : undefined }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Streak Panel */}
      <StreakPanel
        userId={currentUser?.id}
        open={streakPanelOpen}
        onClose={() => setStreakPanelOpen(false)}
      />
    </SidebarProvider>);

}
