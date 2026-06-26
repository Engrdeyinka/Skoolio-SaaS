import React, { useEffect, useState } from "react";
import { BRAND } from "@/config/brand";
import { redirectToLogin } from "@/api/auth";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, LogIn, UserPlus, LogOut, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function Home() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If user is loaded (not undefined/loading state), handle redirect
    if (user !== undefined) {
      if (user) {
        if (user.school_role) {
          window.location.href = createPageUrl(
            user.school_role === "student" ? "StudentDashboard" : "Dashboard"
          );
        } else {
          window.location.href = createPageUrl("Onboarding");
        }
      }
      setLoading(false);
    }
  }, [user]);

  const handleSignUp = () => {
    redirectToLogin(createPageUrl("Home"));
  };

  const handleSignIn = () => {
    redirectToLogin(createPageUrl("Home"));
  };

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      {/* Navigation */}
      <nav className="bg-white/60 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-lg">{BRAND.schoolName}</h1>
              <p className="text-xs text-slate-500">School Management System</p>
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Welcome, {user.full_name}!</span>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl md:text-6xl font-bold text-slate-900">
                Welcome to {BRAND.schoolName}
              </h2>
              <p className="text-xl text-slate-600">
                A comprehensive school management system for teachers, students, and administrators to streamline academic operations.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Key Features:</h3>
              <ul className="space-y-3 text-slate-700">
                <li className="flex gap-3">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Student enrollment and attendance tracking</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Computer-Based Testing (CBT) system</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Academic performance tracking</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Payment management and invoicing</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Event scheduling and management</span>
                </li>
              </ul>
            </div>

            {/* Auth Buttons */}
            <div className="flex gap-4 pt-4">
              <Button
                onClick={handleSignUp}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Sign Up
              </Button>
              <Button
                onClick={handleSignIn}
                variant="outline"
                size="lg"
                className="gap-2"
              >
                <LogIn className="w-5 h-5" />
                Sign In
              </Button>
            </div>
          </div>

          {/* Right Column - Visual */}
          <div className="hidden md:flex flex-col gap-6">
            <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
              <CardContent className="p-6">
                <div className="h-48 bg-gradient-to-br from-blue-600/20 to-indigo-600/20 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-32 h-32 text-blue-600/30" />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
                <CardContent className="p-6 text-center">
                  <p className="text-3xl font-bold text-blue-600">500+</p>
                  <p className="text-sm text-slate-600 mt-2">Students Enrolled</p>
                </CardContent>
              </Card>
              <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
                <CardContent className="p-6 text-center">
                  <p className="text-3xl font-bold text-emerald-600">50+</p>
                  <p className="text-sm text-slate-600 mt-2">Teachers</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200/60 bg-white/40 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-slate-600">
          <p>&copy; 2026 {BRAND.schoolName}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}