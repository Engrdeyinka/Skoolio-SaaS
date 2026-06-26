import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { updateMe } from "@/api/auth";
import { Student } from "@/entities/Student";
import { CBTAttempt } from "@/entities/CBTAttempt";
import { ExamResult } from "@/entities/ExamResult";
import { SchoolCalendarEvent } from "@/entities/SchoolCalendarEvent";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Calendar, ClipboardCheck, UserCircle, AlertCircle, RefreshCw, Wallet, ArrowLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import DailyMotivationQuote from "@/components/dashboard/DailyMotivationQuote";
import { formatDateInLagos, getLagosDateString } from "@/lib/timezone";

export default function StudentDashboard() {
  const { user: currentUser, checkAppState } = useAuth();
  const navigate = useNavigate();
  const [linkedStudent, setLinkedStudent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsProfileCreation, setNeedsProfileCreation] = useState(false);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState({ testsTaken: 0, averageScore: 0, upcomingEvents: 0 });
  const [upcomingCalEvents, setUpcomingCalEvents] = useState([]);
  const [profileForm, setProfileForm] = useState({
    first_name: "", last_name: "", grade: "", date_of_birth: "",
    parent_name: "", parent_phone: "", parent_email: ""
  });
  // Profile link search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (currentUser !== null) {
      loadStudentData();
    }
  }, [currentUser]);

  const loadStudentData = async (retryCount = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      // Admin previewing a student takes priority over linked_student_id
      const previewId = currentUser.preview_student_id;
      const linkedId = currentUser.linked_student_id;
      const lookupId = (previewId && previewId.length > 4) ? previewId
                     : (linkedId && linkedId !== "0000" && linkedId.length > 4) ? linkedId
                     : null;

      if (lookupId) {
        try {
          const students = await Student.filter({ id: lookupId });
          const student = students[0] || null;
          if (student) {
            setLinkedStudent(student);
            loadStats(student);
          } else {
            setNeedsProfileCreation(true);
            setProfileForm(f => ({
              ...f,
              parent_email: currentUser.email || "",
              grade: currentUser.preview_student_grade || f.grade,
            }));
          }
        } catch (err) {
          console.error("Error loading student:", err);
          setNeedsProfileCreation(true);
        }
      } else {
        setNeedsProfileCreation(true);
        // Pre-fill email and grade from user account / onboarding
        setProfileForm(f => ({
          ...f,
          parent_email: currentUser.email || "",
          grade: currentUser.preview_student_grade || f.grade,
        }));
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading student data:", error);

      // Retry logic - retry up to 2 times with exponential backoff
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        setTimeout(() => loadStudentData(retryCount + 1), delay);
        return;
      }

      // If all retries failed, show error
      setError("Failed to load your profile. Please check your internet connection and try again.");
      setIsLoading(false);
    }
  };

  const loadStats = async (student) => {
    try {
      const [attempts, results, calEvents] = await Promise.all([
        CBTAttempt.list().catch(() => []),
        ExamResult.list().catch(() => []),
        SchoolCalendarEvent.list("-event_date").catch(() => []),
      ]);

      const myAttempts = attempts.filter(a => a.student_id === student.id && a.status === 'submitted');
      const myResults = results.filter(r => r.student_id === student.id && r.total_score != null);
      const avgScore = myResults.length > 0
        ? Math.round(myResults.reduce((sum, r) => sum + (r.total_score || 0), 0) / myResults.length)
        : 0;
      const today = getLagosDateString();
      const upcoming = (calEvents || [])
        .filter(e => e.event_date && e.event_date >= today)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 5);

      setUpcomingCalEvents(upcoming);
      setStats({
        testsTaken: myAttempts.length,
        averageScore: avgScore,
        upcomingEvents: upcoming.length,
      });
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  };

  const handleCreateProfile = async () => {
    if (!profileForm.first_name.trim() || !profileForm.last_name.trim() || !profileForm.grade) {
      setError("Please fill in your first name, last name, and class.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const newStudent = await Student.create({
        ...profileForm,
        enrollment_status: 'active',
        termly_tuition: 0,
        parent_name: profileForm.parent_name || currentUser?.full_name || "",
      });
      await supabase
        .from("profiles")
        .update({ linked_student_id: newStudent.id })
        .eq("id", currentUser.id);
      await checkAppState(); // refresh currentUser so linked_student_id is persisted
      setLinkedStudent(newStudent);
      setNeedsProfileCreation(false);
    } catch (err) {
      setError(err.message || "Failed to create profile. Please try again.");
    }
    setIsSaving(false);
  };

  const handleSearchStudent = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const all = await Student.list();
      const q = searchQuery.toLowerCase();
      const matches = all.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.first_name?.toLowerCase().includes(q) ||
        s.last_name?.toLowerCase().includes(q)
      );
      setSearchResults(matches);
    } catch (err) {
      setError("Search failed. Please try again.");
    }
    setIsSearching(false);
  };

  const handleLinkStudent = async (student) => {
    setIsSaving(true);
    setError(null);
    try {
      await supabase
        .from("profiles")
        .update({ linked_student_id: student.id })
        .eq("id", currentUser.id);
      await checkAppState(); // refresh currentUser so linked_student_id is persisted
      setLinkedStudent(student);
      setNeedsProfileCreation(false);
      loadStats(student);
    } catch (err) {
      setError(err.message || "Failed to link profile.");
    }
    setIsSaving(false);
  };

  const handleRetry = () => {
    setError(null);
    loadStudentData();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show error screen if loading failed
  if (error && !needsProfileCreation) {
    return (
      <div className="p-8 text-center flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Connection Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button onClick={handleRetry} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show profile setup screen if not linked
  if (needsProfileCreation) {
    const grades = ["KG 1","KG 2","Nursery 1","Nursery 2","Primary 1","Primary 2","Primary 3","Primary 4","JSS 1","JSS 2","JSS 3","SSS 1","SSS 2","SSS 3"];
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="w-full max-w-lg">
          <Card className="bg-white border border-slate-200">
            <CardHeader className="text-center pb-2">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <UserCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <CardTitle>{showCreateForm ? "Create Your Profile" : "Find Your Student Profile"}</CardTitle>
              <p className="text-slate-500 text-sm mt-1">
                {showCreateForm ? "Fill in your details below" : "Search for your name as added by your school admin"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}

              {!showCreateForm ? (
                <>
                  {/* Search step */}
                  <div className="flex gap-2">
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSearchStudent()}
                      placeholder="Type your name to search..."
                      className="flex-1"
                    />
                    <Button onClick={handleSearchStudent} disabled={isSearching} className="bg-emerald-600 hover:bg-emerald-700 px-4">
                      {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select your profile:</p>
                      {searchResults.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleLinkStudent(s)}
                          disabled={isSaving}
                          className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                        >
                          <p className="font-semibold text-slate-800">{s.first_name} {s.last_name}</p>
                          <p className="text-sm text-slate-500">{s.grade} {s.admission_number ? `· ${s.admission_number}` : ""}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.length === 0 && searchQuery && !isSearching && (
                    <p className="text-sm text-slate-500 text-center py-2">No match found. Try a different name or create a new profile.</p>
                  )}

                  <div className="pt-2 border-t border-slate-100 text-center">
                    <p className="text-sm text-slate-500 mb-2">Not registered by admin yet?</p>
                    <Button variant="outline" onClick={() => setShowCreateForm(true)} className="w-full">
                      Create New Profile
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Create form step */}
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)} className="text-slate-500 -mt-2 mb-1">
                    ← Back to search
                  </Button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">First Name *</Label>
                      <Input value={profileForm.first_name} onChange={e => setProfileForm(f => ({...f, first_name: e.target.value}))} placeholder="First name" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Last Name *</Label>
                      <Input value={profileForm.last_name} onChange={e => setProfileForm(f => ({...f, last_name: e.target.value}))} placeholder="Last name" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Class / Grade *</Label>
                    <Select value={profileForm.grade} onValueChange={val => setProfileForm(f => ({...f, grade: val}))}>
                      <SelectTrigger><SelectValue placeholder="Select your class" /></SelectTrigger>
                      <SelectContent>
                        {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Date of Birth</Label>
                    <Input type="date" value={profileForm.date_of_birth} onChange={e => setProfileForm(f => ({...f, date_of_birth: e.target.value}))} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Parent / Guardian Name</Label>
                    <Input value={profileForm.parent_name} onChange={e => setProfileForm(f => ({...f, parent_name: e.target.value}))} placeholder="Parent or guardian name" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Parent Phone</Label>
                    <Input value={profileForm.parent_phone} onChange={e => setProfileForm(f => ({...f, parent_phone: e.target.value}))} placeholder="Parent phone number" />
                  </div>
                  <Button onClick={handleCreateProfile} disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-700">
                    {isSaving ? "Creating Profile..." : "Create Profile & Continue"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isPreviewMode = currentUser?.preview_student_id && currentUser?.school_role !== 'student';

  const handleExitPreview = async () => {
    sessionStorage.removeItem('previewRole');
    try { await updateMe({ preview_student_id: null, preview_student_name: null, preview_student_grade: null }); } catch {}
    window.location.href = '/Students';
  };

  // Show normal dashboard once linked
  return (
    <div className="p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {isPreviewMode && (
          <div className="mb-5 flex items-center justify-between gap-3 px-4 py-3 bg-blue-600 text-white rounded-2xl text-sm shadow-md">
            <div className="flex items-center gap-2">
              <UserCircle className="w-4 h-4 flex-shrink-0" />
              <span>Previewing as <strong>{currentUser?.preview_student_name || linkedStudent?.first_name || 'Student'}</strong> — you are seeing exactly what this student sees.</span>
            </div>
            <button
              onClick={handleExitPreview}
              className="flex items-center gap-1.5 text-blue-100 hover:text-white text-xs font-semibold bg-blue-700/60 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              ✕ Exit Preview
            </button>
          </div>
        )}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-2">
            Welcome back, {linkedStudent?.first_name || currentUser?.full_name?.split(' ')[0] || 'Student'}!
          </h1>
          <p className="text-slate-600 text-lg">
            {linkedStudent?.grade} • Here's your academic overview
          </p>
        </div>

        <div className="mb-6">
          <DailyMotivationQuote role="student" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <ClipboardCheck className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-slate-600 font-medium">Tests Taken</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.testsTaken}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-slate-600 font-medium">Average Score</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.averageScore}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-slate-600 font-medium">Upcoming Events</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.upcomingEvents}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to={createPageUrl("StudentCBT")} className="block p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                <p className="font-semibold text-slate-900">Take a Test</p>
                <p className="text-sm text-slate-600">View available quizzes and exams</p>
              </Link>
              <Link to={createPageUrl("StudentResults")} className="block p-3 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition">
                <p className="font-semibold text-slate-900">View Results</p>
                <p className="text-sm text-slate-600">Check your released exam scores</p>
              </Link>
              <Link to={createPageUrl("StudentPayments")} className="block p-3 bg-amber-50 hover:bg-amber-100 rounded-lg transition">
                <p className="font-semibold text-slate-900">My Payments</p>
                <p className="text-sm text-slate-600">View fees paid and outstanding balance</p>
              </Link>
              <Link to={createPageUrl("Events")} className="block p-3 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition">
                <p className="font-semibold text-slate-900">School Events</p>
                <p className="text-sm text-slate-600">See upcoming activities and events</p>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Upcoming School Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingCalEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No upcoming events scheduled</p>
              ) : (
                <div className="space-y-3">
                  {upcomingCalEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm leading-snug">{event.title || event.event_type}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDateInLagos(`${event.event_date}T12:00:00`, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          {event.end_date && event.end_date !== event.event_date && (
                            <> – {formatDateInLagos(`${event.end_date}T12:00:00`, { day: "numeric", month: "short" })}</>
                          )}
                        </p>
                        {event.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{event.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
