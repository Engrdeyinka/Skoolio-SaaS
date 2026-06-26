import { lazy } from 'react';
/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import __Layout from './Layout.jsx';

const AcademicRecords = lazy(() => import('./pages/AcademicRecords'));
const Attendance = lazy(() => import('./pages/Attendance'));
const CBT = lazy(() => import('./pages/CBT'));
const CBTEditor = lazy(() => import('./pages/CBTEditor'));
const CBTGrading = lazy(() => import('./pages/CBTGrading'));
const CBTTest = lazy(() => import('./pages/CBTTest'));
const ClassAssignments = lazy(() => import('./pages/ClassAssignments'));
const Communications = lazy(() => import('./pages/Communications'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Documents = lazy(() => import('./pages/Documents'));
const Events = lazy(() => import('./pages/Events'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Home = lazy(() => import('./pages/Home'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Payments = lazy(() => import('./pages/Payments'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const StudentCBT = lazy(() => import('./pages/StudentCBT'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const StudentPayments = lazy(() => import('./pages/StudentPayments'));
const StudentResults = lazy(() => import('./pages/StudentResults'));
const Students = lazy(() => import('./pages/Students'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Timetable = lazy(() => import('./pages/Timetable'));
const PracticeExam = lazy(() => import('./pages/PracticeExam'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Library = lazy(() => import('./pages/Library'));
const StudentLibrary = lazy(() => import('./pages/StudentLibrary'));
const SuperAdminAudit = lazy(() => import('./pages/SuperAdminAudit'));
const TermSetup = lazy(() => import('./pages/TermSetup'));
const ResultsWorkflow = lazy(() => import('./pages/ResultsWorkflow'));
const SchoolVault = lazy(() => import('./pages/SchoolVault'));
const SchemeOfWork = lazy(() => import('./pages/SchemeOfWork'));
const Rewards = lazy(() => import('./pages/Rewards'));
const Gallery = lazy(() => import('./pages/Gallery'));


export const PAGES = {
    "AcademicRecords": AcademicRecords,
    "Attendance": Attendance,
    "CBT": CBT,
    "CBTEditor": CBTEditor,
    "CBTGrading": CBTGrading,
    "CBTTest": CBTTest,
    "ClassAssignments": ClassAssignments,
    "Communications": Communications,
    "Dashboard": Dashboard,
    "Documents": Documents,
    "Events": Events,
    "Expenses": Expenses,
    "Home": Home,
    "Onboarding": Onboarding,
    "Payments": Payments,
    "Reports": Reports,
    "Settings": Settings,
    "StudentCBT": StudentCBT,
    "StudentDashboard": StudentDashboard,
    "StudentPayments": StudentPayments,
    "StudentResults": StudentResults,
    "SuperAdminAudit": SuperAdminAudit,
    "Students": Students,
    "Subjects": Subjects,
    "Teachers": Teachers,
    "Timetable": Timetable,
    "PracticeExam": PracticeExam,
    "Payroll": Payroll,
    "Library": Library,
    "StudentLibrary": StudentLibrary,
    "TermSetup": TermSetup,
    "ResultsWorkflow": ResultsWorkflow,
    "SchoolVault": SchoolVault,
    "SchemeOfWork": SchemeOfWork,
    "Rewards": Rewards,
    "Gallery": Gallery,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
