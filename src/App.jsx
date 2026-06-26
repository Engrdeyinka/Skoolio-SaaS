import { Component, Suspense, lazy } from "react";
import { initTheme } from "@/lib/appTheme";
import { Toaster } from "@/components/ui/toaster"

// Apply saved color theme before first render to avoid flash of wrong color
initTheme();
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PageLoadingState } from "@/components/ui/page-shell";
import { MotionConfig } from "framer-motion";

// On touch/POS devices (coarse pointer = Android terminal, tablet, phone):
// skip all framer-motion animations entirely. This eliminates per-card
// animation tracking on slow ARM CPUs and makes list pages render instantly.
const isCoarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const Login = lazy(() => import('@/pages/Login'));
const Landing = lazy(() => import('@/pages/Landing'));
const QuickTest = lazy(() => import('@/pages/QuickTest'));
const CBTTest = lazy(() => import('@/pages/CBTTest'));
const PendingApproval = lazy(() => import('@/pages/PendingApproval'));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const RouteFallback = () => <PageLoadingState label="Loading page..." />;

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render failed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 font-bold text-red-600">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-950">The app could not open</h1>
          <p className="mt-2 text-sm text-slate-600">
            Reload the page. If this happens again, the error is now visible in the console for quick fixing.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, isPendingApproval, isRejected, user, navigateToLogin } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  // Account is awaiting super-admin approval (or has been rejected)
  if (isPendingApproval || isRejected) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <PendingApproval />
      </Suspense>
    );
  }

  // Authenticated but hasn't completed onboarding yet — force them there
  if (user && !user.school_role && window.location.pathname !== '/Onboarding') {
    window.location.href = '/Onboarding';
    return null;
  }

  return (
    <Routes>
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Suspense fallback={<RouteFallback />}>
                <Page />
              </Suspense>
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion={isCoarsePointer ? "always" : "never"}>
      <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Public routes — no auth required */}
            <Route path="/" element={<Suspense fallback={<RouteFallback />}><Landing /></Suspense>} />
            <Route path="/Login" element={<Suspense fallback={<RouteFallback />}><Login /></Suspense>} />
            <Route path="/QuickTest" element={<Suspense fallback={<RouteFallback />}><QuickTest /></Suspense>} />
            <Route path="/CBTTest" element={<Suspense fallback={<RouteFallback />}><CBTTest /></Suspense>} />
            {/* Everything else requires auth */}
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
      </AuthProvider>
      </MotionConfig>
    </AppErrorBoundary>
  )
}

export default App
