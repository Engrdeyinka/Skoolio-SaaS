import React, { useEffect, useState, useMemo } from "react";
import { SchemeOfWork, Subject } from "@/entities/all";
import { InvokeLLM, UploadFile } from "@/integrations/Core";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useTeacherAccess } from "@/lib/useTeacherAccess";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  BookOpen, Upload, Sparkles, Save, Edit2, Trash2, Plus,
  CheckCircle2, Loader2, FileText, X,
} from "lucide-react";

const GRADES = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];
const TERMS  = ["First Term", "Second Term", "Third Term"];

const weekSchema = {
  type: "object",
  properties: {
    weeks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week_number: { type: "string" },
          topic:       { type: "string" },
          content:     { type: "string" },
        },
        required: ["week_number", "topic", "content"],
      },
    },
  },
  required: ["weeks"],
};

export default function SchemeOfWorkPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { term: defaultTerm } = useSchoolSettings();
  const { isTeacher, teacherSubjects, teacherClasses } = useTeacherAccess();
  const isAdmin = ["admin", "super_admin"].includes(currentUser?.school_role);

  // ── Selectors ──────────────────────────────────────────────────────────────
  const [grade,   setGrade]   = useState(null);
  const [subject, setSubject] = useState(null);
  const [term,    setTerm]    = useState(null);

  useEffect(() => { if (defaultTerm && !term) setTerm(defaultTerm); }, [defaultTerm]);

  const availableGrades = useMemo(() =>
    isTeacher && teacherClasses.length ? teacherClasses.filter(g => GRADES.includes(g)) : GRADES,
  [isTeacher, teacherClasses]);

  const [allSubjects, setAllSubjects] = useState([]);
  useEffect(() => {
    Subject.list().then(s => setAllSubjects(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  const availableSubjects = useMemo(() => {
    const base = allSubjects
      .filter(s => !grade || !s.grade_levels?.length || s.grade_levels.includes(grade))
      .map(s => s.subject_name || s.name || s.subject)
      .filter(Boolean);
    const list = [...new Set(base)].sort();
    if (isTeacher && teacherSubjects.length) return list.filter(s => teacherSubjects.includes(s));
    return list;
  }, [allSubjects, grade, isTeacher, teacherSubjects]);

  useEffect(() => {
    if (availableGrades.length && !grade) setGrade(availableGrades[0]);
  }, [availableGrades]);
  useEffect(() => {
    if (availableSubjects.length && (!subject || !availableSubjects.includes(subject)))
      setSubject(availableSubjects[0]);
  }, [availableSubjects]);

  // ── Scheme data ────────────────────────────────────────────────────────────
  const [scheme,    setScheme]    = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadScheme = async () => {
    if (!grade || !subject || !term) return;
    setIsLoading(true);
    try {
      const results = await SchemeOfWork.filter({ grade, subject, term });
      setScheme(results[0] || null);
    } catch { setScheme(null); }
    setIsLoading(false);
  };

  useEffect(() => { loadScheme(); }, [grade, subject, term]);

  // ── Import / parse state ───────────────────────────────────────────────────
  const [showImport,  setShowImport]  = useState(false);
  const [pastedText,  setPastedText]  = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]); // [{ name, url }]
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing,   setIsParsing]   = useState(false);
  const [isSaving,    setIsSaving]    = useState(false);
  const [parsedWeeks, setParsedWeeks] = useState(null);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploading(true);
    const results = [];
    for (const file of files) {
      try {
        const { file_url } = await UploadFile({ file });
        results.push({ name: file.name, url: file_url });
      } catch (err) {
        toast({ title: `Upload failed: ${file.name}`, description: err.message, variant: "destructive" });
      }
    }
    if (results.length) {
      setUploadedFiles(prev => [...prev, ...results]);
      toast({ title: `${results.length} file${results.length > 1 ? "s" : ""} uploaded` });
    }
    e.target.value = "";
    setIsUploading(false);
  };

  const removeFile = (index) =>
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));

  const handleParse = async () => {
    if (!pastedText && !uploadedFiles.length) {
      toast({ title: "Nothing to parse", description: "Paste the scheme text or upload a file first.", variant: "destructive" });
      return;
    }
    setIsParsing(true);
    try {
      const fileCount = uploadedFiles.length;
      const prompt = `Extract the scheme of work from the content below into a structured weekly breakdown.
${fileCount > 1 ? `There are ${fileCount} files attached — treat them as pages of the same scheme and combine all weeks into one list.` : ""}

For each week, extract:
- week_number: the week number or range as a string (e.g. "1", "2", "11-13")
- topic: the main topic title for that week
- content: the content description for that week. If the content column is empty or shows only a dash, use an empty string "".

Include ALL weeks exactly as they appear — teaching weeks, midterm exams, midterm break, revision weeks, and closing weeks. Do not skip any row.

Return ONLY the structured JSON — no commentary.

${pastedText ? `Pasted scheme content:\n${pastedText}` : "(See uploaded file(s).)"}`;

      const result = await InvokeLLM({
        prompt,
        file_urls: uploadedFiles.length ? uploadedFiles.map(f => f.url) : undefined,
        response_json_schema: weekSchema,
      });

      if (!result?.weeks?.length) throw new Error("No weeks were extracted — check the pasted content.");
      setParsedWeeks(result.weeks);
      toast({ title: "Parsed successfully", description: `${result.weeks.length} weeks extracted. Review and save.` });
    } catch (err) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    }
    setIsParsing(false);
  };

  const updateParsedWeek = (i, field, value) =>
    setParsedWeeks(prev => prev.map((w, idx) => idx === i ? { ...w, [field]: value } : w));

  const removeParsedWeek = (i) =>
    setParsedWeeks(prev => prev.filter((_, idx) => idx !== i));

  const addBlankWeek = () =>
    setParsedWeeks(prev => [...(prev || []), { week_number: "", topic: "", content: "" }]);

  const handleSave = async () => {
    if (!parsedWeeks?.length) return;
    setIsSaving(true);
    try {
      const payload = {
        grade, subject, term,
        weeks: parsedWeeks,
        raw_text: pastedText || null,
        updated_date: new Date().toISOString(),
      };
      if (scheme) {
        await SchemeOfWork.update(scheme.id, payload);
        toast({ title: "Scheme updated", description: `${grade} ${subject} — ${term}` });
      } else {
        await SchemeOfWork.create(payload);
        toast({ title: "Scheme saved", description: `${grade} ${subject} — ${term}` });
      }
      setShowImport(false);
      setParsedWeeks(null);
      setPastedText("");
      setUploadedFiles([]);
      await loadScheme();
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!scheme) return;
    try {
      await SchemeOfWork.delete(scheme.id);
      setScheme(null);
      toast({ title: "Scheme deleted" });
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const openEdit = () => {
    setPastedText(scheme?.raw_text || "");
    setParsedWeeks(scheme?.weeks || []);
    setUploadedFiles([]);
    setShowImport(true);
  };

  const weeks = scheme?.weeks || [];

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <Toaster />
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Scheme of Work</h1>
            <p className="text-slate-500 text-sm mt-1">Weekly teaching plan by class, subject, and term</p>
          </div>
          {isAdmin && scheme && !showImport && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button size="sm" variant="outline" onClick={openEdit} className="gap-1.5 border-slate-200">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          )}
        </div>

        {/* ── Selectors ── */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Class</span>
            <Select value={grade || ""} onValueChange={setGrade}>
              <SelectTrigger className="w-32 bg-white border-slate-200 text-sm font-medium text-slate-800 rounded-lg shadow-sm">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {availableGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Subject</span>
            <Select value={subject || ""} onValueChange={setSubject}>
              <SelectTrigger className="w-52 bg-white border-slate-200 text-sm font-medium text-slate-800 rounded-lg shadow-sm">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">Term</span>
            <Select value={term || ""} onValueChange={setTerm}>
              <SelectTrigger className="w-40 bg-white border-slate-200 text-sm font-medium text-slate-800 rounded-lg shadow-sm">
                <SelectValue placeholder="Term" />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading scheme…
          </div>
        )}

        {/* ── Import / Parse panel (admin only) ── */}
        {!isLoading && isAdmin && (showImport || !scheme) && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">
                    {scheme ? "Edit Scheme" : "Import Scheme"}
                  </p>
                  <p className="text-xs text-slate-500">Paste scheme text or upload a file, then parse with AI</p>
                </div>
              </div>
              {showImport && scheme && (
                <button onClick={() => { setShowImport(false); setParsedWeeks(null); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Paste scheme content</label>
                <Textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  rows={6}
                  placeholder={`Paste the scheme of work for ${grade || "this class"} ${subject || ""} — ${term || ""} here…`}
                  className="text-sm resize-y"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="cursor-pointer">
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" multiple className="hidden" onChange={handleFileUpload} />
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                      ${isUploading ? "bg-slate-50 text-slate-400 border-slate-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"}`}>
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {isUploading ? "Uploading…" : "Upload files"}
                    </span>
                  </label>
                  <span className="text-xs text-slate-400">PDF, image, or text — select multiple at once</span>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                        <span className="max-w-[180px] truncate">{f.name}</span>
                        <button onClick={() => removeFile(i)} className="ml-0.5 text-emerald-500 hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button onClick={handleParse} disabled={isParsing || (!pastedText && !uploadedFiles.length)}
                  className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isParsing ? "Parsing…" : "Parse with AI"}
                </Button>
                <p className="text-xs text-slate-400">AI will extract the weekly breakdown from your content</p>
              </div>
            </div>

            {parsedWeeks && (
              <div className="border-t border-slate-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Preview — {parsedWeeks.length} weeks extracted</p>
                  <button onClick={addBlankWeek}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                    <Plus className="w-3.5 h-3.5" /> Add week
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-16">Week</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-56">Topic</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Content</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedWeeks.map((w, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2">
                            <input value={w.week_number} onChange={e => updateParsedWeek(i, "week_number", e.target.value)}
                              className="w-full text-xs font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-1.5 py-1 outline-none" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={w.topic} onChange={e => updateParsedWeek(i, "topic", e.target.value)}
                              className="w-full text-sm text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-1.5 py-1 outline-none" />
                          </td>
                          <td className="px-3 py-2">
                            <textarea value={w.content} onChange={e => updateParsedWeek(i, "content", e.target.value)} rows={2}
                              className="w-full text-sm text-slate-600 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-1.5 py-1 outline-none resize-none" />
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeParsedWeek(i)}
                              className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-1">
                  <Button onClick={handleSave} disabled={isSaving || !parsedWeeks.length}
                    className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? "Saving…" : "Save Scheme"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Scheme viewer ── */}
        {!isLoading && !showImport && scheme && weeks.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{grade} — {subject}</p>
                <p className="text-xs text-slate-500">{term} · {weeks.length} weeks</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">Week</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-64">Topic</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Content</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weeks.map((w, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-5 py-3.5 text-xs font-bold text-slate-500 align-top">{w.week_number}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-800 align-top">{w.topic}</td>
                      <td className="px-5 py-3.5 text-slate-600 align-top leading-relaxed">{w.content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Empty state (teacher, no scheme) ── */}
        {!isLoading && !isAdmin && !scheme && (
          <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No scheme available</p>
            <p className="text-sm text-slate-400 mt-1">
              The scheme of work for {grade} {subject} — {term} has not been uploaded yet.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
