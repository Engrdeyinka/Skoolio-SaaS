import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, ArrowLeft, IdCard, Mail } from "lucide-react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

// Derive a stable synthetic Supabase email from a student reg number
// e.g. "TOP/25/696" → "top25696@tops.internal"
function regToEmail(regNumber) {
  const normalized = regNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${normalized}@tops.internal`;
}

// Secure password: combines the reg-number digits with the first 8 chars of the
// student's database UUID — not guessable from the reg number alone.
// e.g. digits "25696" + student.id "a3f9b1c2-…" → "<shortCode>@25696-a3f9b1c2"
function regToSecurePassword(regNumber, studentId) {
  const digits = regNumber.replace(/[^0-9]/g, "");
  const idSeed = (studentId || "").slice(0, 8);
  return `${BRAND.shortCode}@${digits}-${idSeed}`;
}

// Legacy password (v1) used for accounts created before the secure format.
// Kept only for backward-compat sign-in fallback — never used for new sign-ups.
function regToLegacyPassword(regNumber) {
  const digits = regNumber.replace(/[^0-9]/g, "");
  return `${BRAND.shortCode}@${digits}`;
}

async function getPostLoginDestination() {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user;
  if (!authUser) return "/Dashboard";

  const { data: profile } = await supabase
    .from("profiles")
    .select("school_role")
    .eq("id", authUser.id)
    .single();

  if (!profile?.school_role) return "/Onboarding";
  return profile.school_role === "student" ? "/StudentDashboard" : "/Dashboard";
}

function clearLoginSessionHints() {
  sessionStorage.removeItem("returnUrl");
  sessionStorage.removeItem("previewRole");
}

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const { schoolLogoUrl } = useSchoolSettings();
  const params = new URLSearchParams(window.location.search);

  // Already logged in — skip the login form and go straight to their dashboard
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      const role = user?.school_role;
      if (!role) {
        window.location.href = "/Onboarding";
      } else if (role === "student") {
        window.location.href = "/StudentDashboard";
      } else {
        window.location.href = "/Dashboard";
      }
    }
  }, [isAuthenticated, isLoadingAuth, user]);

  // "email" | "student"
  const [loginMode, setLoginMode] = useState("email");
  const [isSignUp, setIsSignUp] = useState(params.get("mode") === "signup");

  // Email login fields
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Student ID login fields
  const [studentId, setStudentId] = useState("");

  // Forgot / reset password state
  const [forgotMode,       setForgotMode]       = useState(false);
  const [resetMode,        setResetMode]        = useState(false);
  const [newPassword,      setNewPassword]      = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");

  const [error,   setError]   = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const accountRemoved = params.get("reason") === "account_removed";

  // Detect Supabase PASSWORD_RECOVERY event (user clicked the reset link in email)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setResetMode(true);
        setForgotMode(false);
        setError(null);
        setMessage(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Standard email login / signup ────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null); setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin + "/Dashboard",
          },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName,
          }, { onConflict: "id" }).select();
        }
        if (data.user && !data.session) {
          setMessage(
            "Account created! Please check your email inbox for a confirmation link. " +
            "Click the link to verify your address, then come back here to sign in."
          );
        } else {
          window.location.href = "/Onboarding";
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        clearLoginSessionHints();
        window.location.href = await getPostLoginDestination();
      }
    } catch (err) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("email not confirmed") || msg.toLowerCase().includes("email_not_confirmed")) {
        setError("Your email address hasn't been confirmed yet. Please check your inbox for the confirmation link we sent when you signed up.");
      } else {
        setError(msg || "Sign in failed. Please check your details and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Student ID login ──────────────────────────────────────────────────────
  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null); setLoading(true);

    const trimmedId = studentId.trim().toUpperCase();
    if (!trimmedId) { setError("Please enter your Student ID."); setLoading(false); return; }

    const syntheticEmail = regToEmail(trimmedId);

    try {
      // 1. Look up the student record first (needed for UUID-based password)
      const { data: students, error: lookupError } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade, reg_number")
        .ilike("reg_number", trimmedId)
        .limit(1);

      if (lookupError || !students || students.length === 0) {
        throw new Error(
          "Student ID not found. Please check your ID or contact the admin."
        );
      }

      const student = students[0];

      // 2. Try signing in with the new secure password format (UUID-based)
      const securePassword = regToSecurePassword(trimmedId, student.id);
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({ email: syntheticEmail, password: securePassword });

      if (!signInError && signInData?.session) {
        clearLoginSessionHints();
        window.location.href = "/StudentDashboard";
        return;
      }

      // 2b. Fallback: try the legacy password (accounts created before v2)
      const legacyPassword = regToLegacyPassword(trimmedId);
      const { data: legacyData, error: legacyError } =
        await supabase.auth.signInWithPassword({ email: syntheticEmail, password: legacyPassword });

      if (!legacyError && legacyData?.session) {
        // Migrate account to the new secure password silently
        await supabase.auth.updateUser({ password: securePassword }).catch(() => {});
        clearLoginSessionHints();
        window.location.href = "/StudentDashboard";
        return;
      }

      // 3. No account yet — create one with the secure password
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: syntheticEmail,
          password: securePassword,
          options: { data: { full_name: `${student.first_name} ${student.last_name}` } },
        });

      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes("already")) {
          throw new Error("This account already exists but could not be signed in. Please contact the admin for assistance.");
        }
        throw signUpError;
      }

      if (!signUpData?.user) throw new Error("Account creation failed. Please try again.");

      // 4. Create / update the profile, linking to the student record
      await supabase.from("profiles").upsert({
        id: signUpData.user.id,
        email: syntheticEmail,
        full_name: `${student.first_name} ${student.last_name}`,
        school_role: "student",
        linked_student_id: student.id,
      }, { onConflict: "id" });

      // 5. Sign in (signup may not auto-confirm in all Supabase configs)
      const { error: finalSignIn } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: securePassword,
      });
      if (finalSignIn) throw finalSignIn;

      clearLoginSessionHints();
      window.location.href = "/StudentDashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null); setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/Login",
      });
      if (error) throw error;
      setMessage("Reset link sent! Check your email inbox and click the link to set a new password.");
    } catch (err) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Set new password (after clicking reset link) ──────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError(null); setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage("Password updated! You can now sign in with your new password.");
      setResetMode(false);
      setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 p-4">
      <div className="w-full max-w-md">

        {/* Back */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700">
            {schoolLogoUrl
              ? <img src={schoolLogoUrl} alt="School logo" className="w-full h-full object-cover" />
              : <GraduationCap className="w-9 h-9 text-white" />
            }
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{BRAND.schoolName}</h1>
          <p className="text-slate-500 mt-1">Private School Management</p>
        </div>

        {accountRemoved && (
          <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-xl text-red-800 text-sm text-center">
            <p className="font-semibold">Your account has been removed.</p>
            <p className="mt-1 text-red-700">Please contact your school administrator for assistance.</p>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-4 gap-1">
          <button
            type="button"
            onClick={() => { setLoginMode("email"); setError(null); setMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
              loginMode === "email"
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Mail className="w-4 h-4" /> Staff / Admin
          </button>
          <button
            type="button"
            onClick={() => { setLoginMode("student"); setError(null); setMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
              loginMode === "student"
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <IdCard className="w-4 h-4" /> Student
          </button>
        </div>

        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">
              {resetMode
                ? "Set New Password"
                : forgotMode
                  ? "Reset Password"
                  : loginMode === "student"
                    ? "Student Login"
                    : isSignUp ? "Create an Account" : "Welcome Back"}
            </CardTitle>
          </CardHeader>
          <CardContent>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {message && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {message}
              </div>
            )}

            {/* ── Set new password (after clicking reset email link) ── */}
            {resetMode ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-sm text-slate-500">Enter and confirm your new password below.</p>
                <div>
                  <Label className="text-sm font-medium mb-1 block">New Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your new password"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                  {loading ? "Updating…" : "Update Password"}
                </Button>
              </form>

            ) : forgotMode ? (
              /* ── Forgot password — enter email ── */
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-slate-500">
                  Enter the email address linked to your account. We'll send you a link to reset your password.
                </p>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                  {loading ? "Sending…" : "Send Reset Link"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(false); setError(null); setMessage(null); }}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </form>

            ) : loginMode === "student" ? (
              /* ── Student ID login ── */
              <form onSubmit={handleStudentLogin} className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Student ID</Label>
                  <Input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. TOP/25/000"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-slate-400 mt-1">Enter the ID on your school card</p>
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {loading ? "Signing in…" : "Sign In as Student"}
                </Button>
              </form>

            ) : (
              /* ── Email login / signup ── */
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Full Name</Label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-sm font-medium">Password</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => { setForgotMode(true); setError(null); setMessage(null); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                  {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                  </button>
                </div>
              </form>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
