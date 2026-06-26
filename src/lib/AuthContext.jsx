import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();
const STORAGE_KEY = 'sb-vuacujvzizfuuzbzkbhj-auth-token';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError] = useState(null);
  const [appPublicSettings] = useState({ requiresAuth: true });

  useEffect(() => {
    let mounted = true;
    initAuth(mounted);

    // Listen for storage changes (login/logout from other tabs)
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        if (e.newValue) {
          try {
            const session = JSON.parse(e.newValue);
            if (session?.user && mounted) loadUserProfile(session.user, mounted);
          } catch {}
        } else {
          // Logged out
          if (mounted) { setUser(null); setIsAuthenticated(false); }
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => { mounted = false; window.removeEventListener('storage', handleStorage); };
  }, []);

  const initAuth = async (mounted) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        if (mounted) { setIsLoadingAuth(false); setIsAuthenticated(false); }
        return;
      }

      const session = JSON.parse(stored);
      const now = Math.floor(Date.now() / 1000);

      if (!session?.user || (session.expires_at && now > session.expires_at)) {
        if (mounted) { setIsLoadingAuth(false); setIsAuthenticated(false); }
        return;
      }

      await loadUserProfile(session.user, mounted);
    } catch (error) {
      console.error('Auth init failed:', error);
      if (mounted) { setIsLoadingAuth(false); setIsAuthenticated(false); }
    }
  };

  const loadUserProfile = async (authUser, mounted = true) => {
    try {
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      // Banned users are forcibly signed out and shown an explanation
      if (profile?.is_banned === true) {
        await supabase.auth.signOut();
        localStorage.removeItem(STORAGE_KEY);
        if (mounted) { setIsLoadingAuth(false); setIsAuthenticated(false); }
        window.location.href = '/Login?reason=account_removed';
        return;
      }

      if (!profile) {
        // New user — create a bare profile; school_role is set during onboarding
        const { data: newProfile } = await supabase.from('profiles').upsert({
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || '',
          // school_role intentionally omitted — set in /Onboarding
        }, { onConflict: 'id' }).select().single();
        profile = newProfile;
      }

      const fullUser = {
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || '',
        school_role: profile?.school_role || null,
        approval_status: profile?.approval_status || 'pending',
        linked_student_id: profile?.linked_student_id || null,
        linked_teacher_id: profile?.linked_teacher_id || null,
        current_term: profile?.current_term || 'Third Term',
        current_academic_year: profile?.current_academic_year || '2025/2026',
        preview_student_id: profile?.preview_student_id || null,
        preview_student_name: profile?.preview_student_name || null,
        preview_student_grade: profile?.preview_student_grade || null,
        ...profile,
      };

      // Accounts that completed onboarding but haven't been approved yet
      // are authenticated but blocked from the main app until the super admin approves.
      const approvalStatus = profile?.approval_status || 'pending';
      const hasRole = Boolean(profile?.school_role);

      if (hasRole && approvalStatus === 'rejected') {
        if (mounted) {
          setUser(fullUser);
          setIsAuthenticated(true);
          setIsPendingApproval(false);
          setIsRejected(true);
        }
        return;
      }

      // Students are never gated by approval — only teachers and admins need super-admin sign-off.
      const needsApproval = profile?.school_role !== 'student';
      if (hasRole && approvalStatus === 'pending' && needsApproval) {
        if (mounted) {
          setUser(fullUser);
          setIsAuthenticated(true);
          setIsPendingApproval(true);
          setIsRejected(false);
        }
        return;
      }

      // Fully approved (or no role yet = still in onboarding)
      if (mounted) {
        setUser(fullUser);
        setIsAuthenticated(true);
        setIsPendingApproval(false);
        setIsRejected(false);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      // On profile-load failure we do NOT grant any role — user stays unauthenticated
      // to prevent a network-error from silently escalating privileges.
      if (mounted) {
        setUser(null);
        setIsAuthenticated(false);
        setIsPendingApproval(false);
        setIsRejected(false);
      }
    } finally {
      if (mounted) setIsLoadingAuth(false);
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null); setIsAuthenticated(false); setIsPendingApproval(false); setIsRejected(false);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('returnUrl');
    sessionStorage.removeItem('previewRole');
    await supabase.auth.signOut();
    if (shouldRedirect) window.location.href = '/';
  };

  const navigateToLogin = () => {
    // Save the attempted URL so Login can redirect back after sign-in
    const current = window.location.pathname;
    if (current !== '/' && current !== '/Login') {
      sessionStorage.setItem('returnUrl', window.location.href);
    }
    window.location.href = '/Login';
  };

  const checkAppState = async () => {
    await initAuth(true);
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isPendingApproval, isRejected,
      isLoadingAuth, isLoadingPublicSettings,
      authError, appPublicSettings, logout, navigateToLogin, checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
