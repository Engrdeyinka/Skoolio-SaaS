import React, { useEffect, useMemo, useState } from "react";
import { ExamResult } from "@/entities/ExamResult";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock, Eye, ClipboardCheck, FileCheck, Loader2 } from "lucide-react";
import { isAdminLike } from "@/lib/permissions";
import { RESULTS_WORKFLOW_STATES, getResultsWorkflowStatus, setResultsWorkflowStatus } from "@/lib/resultsWorkflow";
import { toast } from "sonner";

const TERMS = ["First Term", "Second Term", "Third Term"];

export default function ResultsWorkflow() {
  const { user } = useAuth();
  const { term, year } = useSchoolSettings();
  const [selectedTerm, setSelectedTerm] = useState(term || "Second Term");
  const [selectedYear, setSelectedYear] = useState(year || "2025/2026");
  const [results, setResults] = useState([]);
  const [workflow, setWorkflow] = useState({ status: "draft" });
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setSelectedTerm(term || "Second Term");
  }, [term]);

  useEffect(() => {
    setSelectedYear(year || "2025/2026");
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, status] = await Promise.all([
        ExamResult.filter({ term: selectedTerm, academic_year: selectedYear }).catch(() => []),
        getResultsWorkflowStatus(selectedTerm, selectedYear).catch(() => ({ status: "draft" })),
      ]);
      setResults(rows || []);
      setWorkflow(status || { status: "draft" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedTerm, selectedYear]);

  const stats = useMemo(() => {
    const released = results.filter((row) => row.results_released === true).length;
    const hidden = results.length - released;
    return {
      total: results.length,
      released,
      hidden,
      students: new Set(results.map((row) => row.student_id).filter(Boolean)).size,
    };
  }, [results]);

  const setStatus = async (status, options = {}) => {
    setApplying(true);
    try {
      if (options.releaseAll) {
        await Promise.all(results.map((row) => ExamResult.update(row.id, { results_released: true })));
      }
      if (options.hideAll) {
        await Promise.all(results.map((row) => ExamResult.update(row.id, { results_released: false })));
      }
      await setResultsWorkflowStatus({
        term: selectedTerm,
        academicYear: selectedYear,
        status,
        performedBy: user?.school_role || user?.full_name || "admin",
        summary: `Results workflow set to ${status} for ${selectedTerm} ${selectedYear}.`,
      });
      toast.success(`Results workflow set to ${status}.`);
      await load();
    } catch (error) {
      toast.error(error?.message || "Could not update results workflow.");
    } finally {
      setApplying(false);
    }
  };

  const isSuperAdmin = isAdminLike(user);

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-500">Academics Control</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Results Workflow</h1>
          <p className="mt-2 text-slate-600">Move results through draft, review, approval, publication, and final lock with one controlled flow.</p>
        </div>

        <Card className="border-slate-200">
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-[220px_220px_auto] gap-4 items-end">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Term</p>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Academic Year</p>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[selectedYear, "2025/2026", "2026/2027", "2027/2028"].filter((value, index, arr) => value && arr.indexOf(value) === index).map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 px-3 py-1 text-sm">Current status: {workflow.status}</Badge>
              {!isSuperAdmin && <span className="text-sm text-slate-500">Admin or Superadmin required for approval actions.</span>}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-200"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Students</p><p className="mt-2 text-3xl font-bold text-slate-950">{stats.students}</p></CardContent></Card>
          <Card className="border-slate-200"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Rows</p><p className="mt-2 text-3xl font-bold text-slate-950">{stats.total}</p></CardContent></Card>
          <Card className="border-slate-200"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Released</p><p className="mt-2 text-3xl font-bold text-emerald-700">{stats.released}</p></CardContent></Card>
          <Card className="border-slate-200"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Hidden</p><p className="mt-2 text-3xl font-bold text-amber-700">{stats.hidden}</p></CardContent></Card>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Workflow Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStatus("draft", { hideAll: true })} disabled={loading || applying}>
              {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button variant="outline" onClick={() => setStatus("review")} disabled={loading || applying}>
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Send to Review
            </Button>
            <Button variant="outline" onClick={() => setStatus("approved")} disabled={!isSuperAdmin || loading || applying}>
              <FileCheck className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button onClick={() => setStatus("published", { releaseAll: true })} disabled={!isSuperAdmin || loading || applying} className="bg-emerald-600 hover:bg-emerald-700">
              <Eye className="w-4 h-4 mr-2" />
              Publish to Students
            </Button>
            <Button onClick={() => setStatus("locked", { releaseAll: true })} disabled={!isSuperAdmin || loading || applying} className="bg-red-700 hover:bg-red-800">
              <Lock className="w-4 h-4 mr-2" />
              Lock from Students
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Workflow Guide</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {RESULTS_WORKFLOW_STATES.map((item) => (
              <div key={item.value} className={`rounded-2xl border p-4 ${workflow.status === item.value ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.value === "draft" ? "Teachers can still work." : item.value === "review" ? "Waiting for checks." : item.value === "approved" ? "Ready to publish." : item.value === "published" ? "Visible to students." : "No more edits allowed."}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
