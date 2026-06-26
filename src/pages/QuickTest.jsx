/**
 * QuickTest — public, no auth required.
 * Students enter their registration number to find and start an available test.
 */
import React, { useState } from "react";
import { BRAND } from "@/config/brand";
import { useNavigate } from "react-router-dom";
import { Student } from "@/entities/Student";
import { Quiz } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getLagosYear } from "@/lib/timezone";
import {
  GraduationCap, ArrowRight, ArrowLeft, BookOpen,
  Loader2, Search, Clock, User, AlertCircle,
} from "lucide-react";

const SUBJECT_COLORS = [
  "from-emerald-500 to-emerald-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-sky-600",
];
function subjectColor(subject = "") {
  const n = (subject.charCodeAt(0) || 0) + (subject.charCodeAt(1) || 0);
  return SUBJECT_COLORS[n % SUBJECT_COLORS.length];
}

function SchoolLogo({ size = "md" }) {
  const { schoolLogoUrl, schoolName } = useSchoolSettings();
  const dim = size === "sm" ? "w-9 h-9" : size === "lg" ? "w-16 h-16" : "w-11 h-11";
  const icon = size === "sm" ? "w-5 h-5" : size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return (
    <div className={`${dim} rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-emerald-600 to-indigo-700 flex items-center justify-center shadow-md`}>
      {schoolLogoUrl
        ? <img src={schoolLogoUrl} alt={schoolName || "School"} className="w-full h-full object-cover" />
        : <GraduationCap className={`${icon} text-white`} />}
    </div>
  );
}

export default function QuickTest() {
  const navigate = useNavigate();
  const { schoolName } = useSchoolSettings();

  // Step: "enter" | "tests"
  const [step,     setStep]     = useState("enter");
  const [regInput, setRegInput] = useState("");
  const [student,  setStudent]  = useState(null);
  const [quizzes,  setQuizzes]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // ── Step 1: look up student by reg number ─────────────────────────────────
  async function handleLookup(e) {
    e.preventDefault();
    const reg = regInput.trim().toUpperCase();
    if (!reg) return;

    setLoading(true);
    setError(null);
    try {
      const results = await Student.filter({ reg_number: reg });
      if (!results || results.length === 0) {
        setError("No student found with that registration number. Please check and try again.");
        setLoading(false);
        return;
      }
      const found = results[0];
      setStudent(found);

      // Load published quizzes for this student's grade
      const allQuizzes = await Quiz.filter({ grade: found.grade });
      const published  = allQuizzes.filter(q => q.is_published !== false);
      setQuizzes(published);
      setStep("tests");
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    }
    setLoading(false);
  }

  // ── Step 2: start a test ──────────────────────────────────────────────────
  function startTest(quiz) {
    navigate(`/CBTTest?quizId=${quiz.id}&studentId=${student.id}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-indigo-50/40 flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <SchoolLogo size="sm" />
          <span className="text-base font-bold text-slate-900">{schoolName || "School Portal"}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-800"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">

        {/* ── Step 1: Enter Reg Number ── */}
        {step === "enter" && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex justify-center">
                <SchoolLogo size="lg" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">Take a Test</h1>
              <p className="text-slate-500 mt-2 text-sm">
                Enter your registration number to see available tests
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6">
              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Registration Number
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      value={regInput}
                      onChange={e => { setRegInput(e.target.value); setError(null); }}
                      placeholder="e.g. TOP/25/123"
                      className="pl-9 text-sm font-medium uppercase tracking-wide"
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading || !regInput.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Looking up…</>
                    : <><ArrowRight className="w-4 h-4 mr-2" />Find My Tests</>
                  }
                </Button>
              </form>
            </div>

            <p className="text-center text-xs text-slate-400 mt-4">
              Your registration number is on your school ID card or report sheet
            </p>
          </div>
        )}

        {/* ── Step 2: Select a Test ── */}
        {step === "tests" && student && (
          <div className="w-full max-w-lg">

            {/* Student info chip */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 mb-6 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  {student.first_name} {student.last_name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {student.grade}&nbsp;·&nbsp;
                  <span className="font-semibold text-emerald-600">{student.reg_number}</span>
                </p>
              </div>
              <button
                onClick={() => { setStep("enter"); setStudent(null); setQuizzes([]); setError(null); }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
              >
                Not you?
              </button>
            </div>

            <h2 className="text-lg font-bold text-slate-900 mb-1">Available Tests</h2>
            <p className="text-sm text-slate-500 mb-5">
              {quizzes.length > 0
                ? `${quizzes.length} test${quizzes.length > 1 ? "s" : ""} available for ${student.grade}`
                : `No tests available for ${student.grade} right now`}
            </p>

            {quizzes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
                <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  Check back later — your teacher will publish tests here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {quizzes.map(quiz => (
                  <div
                    key={quiz.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex items-stretch"
                  >
                    {/* Colour accent bar */}
                    <div className={`w-1.5 flex-shrink-0 bg-gradient-to-b ${subjectColor(quiz.subject)}`} />

                    <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${subjectColor(quiz.subject)} shadow-sm`}>
                        <BookOpen className="w-5 h-5 text-white" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{quiz.title}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {quiz.subject && (
                            <span className="text-xs text-slate-500 font-medium">{quiz.subject}</span>
                          )}
                          {quiz.duration_minutes && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3 h-3" />
                              {quiz.duration_minutes} min
                            </span>
                          )}
                          {quiz.quiz_type && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full capitalize">
                              {quiz.quiz_type.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CTA */}
                      <Button
                        size="sm"
                        onClick={() => startTest(quiz)}
                        className={`flex-shrink-0 bg-gradient-to-r ${subjectColor(quiz.subject)} text-white border-0 shadow hover:opacity-90`}
                      >
                        Start
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400">
        © {getLagosYear()} {BRAND.schoolName}
      </footer>
    </div>
  );
}
