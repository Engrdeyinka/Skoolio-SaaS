import React, { useEffect, useRef } from "react";
import { GraduationCap, Clock, XCircle, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";

const ROLE_LABELS = {
  admin:   "Admin",
  teacher: "Teacher",
  student: "Student",
};

export default function PendingApproval() {
  const { user, logout, isRejected, checkAppState } = useAuth();
  const role      = user?.school_role || "staff";
  const roleLabel = ROLE_LABELS[role] || "staff";
  const intervalRef = useRef(null);

  // Poll every 30 s — if the super admin approved, reload the session
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("approval_status")
          .eq("id", user?.id)
          .single();

        if (data?.approval_status === "approved") {
          // Trigger a full session reload so AuthContext picks up the new status
          await checkAppState();
          window.location.href = "/Dashboard";
        } else if (data?.approval_status === "rejected") {
          await checkAppState();
        }
      } catch { /* silent */ }
    }, 30_000);

    return () => clearInterval(intervalRef.current);
  }, [user?.id, checkAppState]);

  const handleRefresh = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("id", user?.id)
        .single();

      if (data?.approval_status === "approved") {
        await checkAppState();
        window.location.href = "/Dashboard";
      } else if (data?.approval_status === "rejected") {
        await checkAppState();
      }
    } catch { /* silent */ }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 p-4">
      <div className="w-full max-w-md text-center space-y-6">

        {/* Logo */}
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <GraduationCap className="w-9 h-9 text-white" />
        </div>

        {isRejected ? (
          /* ── Rejected ─────────────────────────────────────────────── */
          <div className="bg-white rounded-2xl shadow-xl border border-red-100 p-8 space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
              <p className="text-sm text-slate-500 mt-1">
                Your <strong>{roleLabel}</strong> account request was not approved.
              </p>
              {user?.rejection_reason && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  Reason: {user.rejection_reason}
                </div>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Please contact the school administrator if you believe this is a mistake.
            </p>
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>

        ) : (
          /* ── Pending ──────────────────────────────────────────────── */
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 space-y-5">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center">
                <Clock className="w-7 h-7 text-amber-500" />
              </div>
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">Waiting for Approval</h1>
              <p className="text-sm text-slate-500 mt-1">
                Your <strong>{roleLabel}</strong> account has been created and is waiting for the
                super administrator to grant access.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account details</p>
              <p className="text-sm text-slate-700 font-medium">{user?.full_name || "—"}</p>
              <p className="text-xs text-slate-500">{user?.email || "—"}</p>
              <span className="inline-block mt-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full capitalize">
                {roleLabel} · Pending
              </span>
            </div>

            <p className="text-xs text-slate-400">
              This page checks automatically every 30 seconds. You'll be redirected as soon as your account is approved.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Check now
              </button>
              <button
                onClick={() => logout()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
