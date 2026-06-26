import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, FileText, Loader2, PenLine, Save, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Quiz, Question, Subject, SchemeOfWork } from "@/entities/all";
import { InvokeLLM, UploadFile } from "@/integrations/Core";
import { useToast } from "@/components/ui/use-toast";

const GRADES_LIST = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

const TERMS_LIST = ["First Term", "Second Term", "Third Term"];
const TEST_TYPES = ["CA1", "CA2", "CA3", "Exam"];
const STANDARDS = ["WAEC", "NECO", "JAMB", "School Exam"];
const DIFFICULTIES = ["Balanced", "Easy", "Medium", "Hard"];
const COUNTS = [10, 20, 30, 40, 50, 60];
const ESSAY_COUNTS = [2, 3, 4, 5, 6, 8, 10];
const LETTERS = ["A", "B", "C", "D"];

const questionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_option_index: { type: "number" },
          explanation: { type: "string" },
          difficulty: { type: "string" },
        },
        required: ["topic", "text", "options", "correct_option_index", "explanation"],
      },
    },
  },
  required: ["questions"],
};

const essaySchema = {
  type: "object",
  properties: {
    essay_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic:        { type: "string" },
          text:         { type: "string" },
          model_answer: { type: "string" },
          marks:        { type: "number" },
          difficulty:   { type: "string" },
        },
        required: ["topic", "text", "model_answer", "marks"],
      },
    },
  },
  required: ["essay_questions"],
};

function buildEssayPrompt({ grade, subject, term, standard, difficulty, essayCount, schemeText }) {
  return `You are an experienced Nigerian secondary school exam setter.

Generate ${essayCount} high-quality Section B theory/essay questions for:
- Class: ${grade}
- Subject: ${subject}
- Term: ${term}
- Exam standard/style: ${standard}
- Difficulty: ${difficulty}

Use ONLY the scheme of work below. Do not invent topics outside it.

Rules:
- Each question requires a written paragraph or structured response (NOT multiple choice).
- Frame questions in the style of ${standard} Section B / Theory questions.
- Questions should test understanding, application, and analysis.
- Assign appropriate marks to each question (typically 5–15 marks each).
- Provide a detailed model answer and marking guide the teacher can use when grading.
- Spread questions across different topics from the scheme.
- Break multi-part questions into clear lettered parts: (a), (b), (c) — each on its own line.

FORMATTING RULES (strictly follow these):
- For ALL chemical formulas, mathematical expressions, or equations, wrap them in LaTeX using $...$ for inline (e.g. $H_2SO_4$, $CO_2$, $2x + 3 = 7$) or $$...$$ for block equations.
- For any table in a question or model answer, use a markdown pipe table (| Header | Header | on separate lines).
- Do NOT write formulas as plain text like H2SO4 or CO2 — always use LaTeX.
- Subscripts: use _ e.g. $H_2O$. Superscripts: use ^ e.g. $x^2$.

Scheme of work:
${schemeText || "(See attached scheme file.)"}`;
}

function normaliseEssayQuestion(q, index) {
  return {
    id: `essay-${Date.now()}-${index}`,
    topic:        String(q.topic        || "General").trim(),
    text:         String(q.text         || "").trim(),
    model_answer: String(q.model_answer || "").trim(),
    marks:        Number.isFinite(Number(q.marks)) ? Number(q.marks) : 10,
    difficulty:   String(q.difficulty   || "").trim(),
  };
}

function normaliseQuestion(q, index) {
  const options = Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [];
  while (options.length < 4) options.push("");
  const correct = Number.isFinite(Number(q.correct_option_index))
    ? Math.max(0, Math.min(3, Number(q.correct_option_index)))
    : 0;

  return {
    id: `generated-${Date.now()}-${index}`,
    topic: String(q.topic || "General").trim(),
    text: String(q.text || "").trim(),
    options,
    correct_option_index: correct,
    explanation: String(q.explanation || "").trim(),
    difficulty: String(q.difficulty || "").trim(),
  };
}

function buildPrompt({ grade, subject, term, standard, difficulty, questionCount, schemeText }) {
  return `You are an experienced Nigerian secondary school exam setter.

Generate ${questionCount} high-quality multiple-choice CBT questions for:
- Class: ${grade}
- Subject: ${subject}
- Term: ${term}
- Exam standard/style: ${standard}
- Difficulty: ${difficulty}

Use ONLY the uploaded or pasted scheme of work below. Do not invent topics outside the scheme. If a topic is not in the scheme, do not test it.

Question rules:
- Each question must be age-appropriate for ${grade}.
- Frame questions in the style of ${standard}, but do not copy real copyrighted questions.
- Use clear Nigerian school language.
- Each question must have exactly four options.
- Only one option must be correct.
- correct_option_index must be 0 for A, 1 for B, 2 for C, or 3 for D.
- Include a short explanation that helps the teacher verify the answer.
- Spread questions across the scheme topics as evenly as possible.
- Avoid duplicate questions and avoid repeated wording.

FORMATTING RULES (strictly follow these):
- For ALL chemical formulas, mathematical expressions, or equations, wrap them in LaTeX using $...$ for inline (e.g. $H_2SO_4$, $CO_2$, $2x + 3 = 7$) or $$...$$ for block equations.
- For any table in a question, use a markdown pipe table (| Header | Header | on separate lines) — do NOT inline tables as text.
- Do NOT write formulas as plain text like H2SO4 or CO2 — always use LaTeX.
- Subscripts: use _ e.g. $H_2O$. Superscripts: use ^ e.g. $x^2$.

Scheme of work:
${schemeText || "(See attached scheme file.)"}`;
}

function GeneratedQuestionEditor({ question, index, onChange, onRemove }) {
  const update = (patch) => onChange(index, { ...question, ...patch });
  const updateOption = (optionIndex, value) => {
    const next = question.options.map((opt, i) => (i === optionIndex ? value : opt));
    update({ options: next });
  };

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <Input
                value={question.topic}
                onChange={(e) => update({ topic: e.target.value })}
                placeholder="Topic"
                className="h-8 text-xs font-medium"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
            title="Remove question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <Textarea
          value={question.text}
          onChange={(e) => update({ text: e.target.value })}
          rows={3}
          placeholder="Question"
          className="text-sm"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {question.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => update({ correct_option_index: optionIndex })}
                className={`w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center ${
                  question.correct_option_index === optionIndex
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-white border-slate-300 text-slate-500"
                }`}
                title="Mark correct answer"
              >
                {question.correct_option_index === optionIndex ? <CheckCircle2 className="w-4 h-4" /> : LETTERS[optionIndex]}
              </button>
              <Input
                value={option}
                onChange={(e) => updateOption(optionIndex, e.target.value)}
                placeholder={`Option ${LETTERS[optionIndex]}`}
                className="h-9 text-sm"
              />
            </div>
          ))}
        </div>

        <Textarea
          value={question.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          rows={2}
          placeholder="Short explanation for teacher review"
          className="text-sm"
        />
      </CardContent>
    </Card>
  );
}

function EssayQuestionEditor({ question, index, onChange, onRemove }) {
  const update = (patch) => onChange(index, { ...question, ...patch });

  return (
    <Card className="border-amber-200 shadow-none">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <Input
              value={question.topic}
              onChange={(e) => update({ topic: e.target.value })}
              placeholder="Topic"
              className="h-8 text-xs font-medium"
            />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Label className="text-xs text-slate-500 whitespace-nowrap">Marks:</Label>
              <Input
                type="number"
                value={question.marks}
                onChange={(e) => update({ marks: Number(e.target.value) })}
                className="h-8 w-16 text-sm text-center"
                min={1}
                max={50}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center flex-shrink-0"
            title="Remove question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <Textarea
          value={question.text}
          onChange={(e) => update({ text: e.target.value })}
          rows={3}
          placeholder="Essay / theory question"
          className="text-sm"
        />

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Model Answer & Marking Guide <span className="font-normal">(teacher reference only — not shown to students)</span></Label>
          <Textarea
            value={question.model_answer}
            onChange={(e) => update({ model_answer: e.target.value })}
            rows={4}
            placeholder="Expected answer, key points, and marking scheme..."
            className="text-sm bg-amber-50/60 border-amber-200"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SchemeQuestionGenerator({
  quizzes = [],
  onSaved,
  defaultTerm = "Third Term",
  defaultYear = "2025/2026",
  restrictedGrades,
}) {
  const { toast } = useToast();
  const availableClasses = restrictedGrades?.length ? restrictedGrades : GRADES_LIST;
  const [grade, setGrade] = useState(availableClasses[0] || "JSS 1");
  const [configuredSubjects, setConfiguredSubjects] = useState([]);
  const subjectSuggestions = useMemo(() => {
    const subjectsForGrade = configuredSubjects.filter((item) => {
      const levels = Array.isArray(item.grade_levels) ? item.grade_levels : [];
      return levels.length === 0 || levels.includes(grade);
    });
    const source = subjectsForGrade.length ? subjectsForGrade : configuredSubjects;
    return [...new Set(source.map((item) => item.subject_name || item.name || item.subject).filter(Boolean))].sort();
  }, [configuredSubjects, grade]);

  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState(defaultTerm || "Third Term");
  const [academicYear, setAcademicYear] = useState(defaultYear || "2025/2026");
  const [testType, setTestType] = useState("Exam");
  const [standard, setStandard] = useState("WAEC");
  const [difficulty, setDifficulty] = useState("Balanced");
  const [questionCount, setQuestionCount] = useState("20");
  const [schemeText, setSchemeText] = useState("");
  const [schemeAutoLoaded, setSchemeAutoLoaded] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [includeEssay, setIncludeEssay] = useState(false);
  const [essayCount, setEssayCount] = useState("3");
  const [generatedEssayQuestions, setGeneratedEssayQuestions] = useState([]);

  const matchingQuiz = quizzes.find((q) =>
    q.subject === subject &&
    q.grade === grade &&
    q.term === term &&
    q.academic_year === academicYear &&
    q.test_type === testType
  );

  useEffect(() => {
    Subject.list()
      .then((items) => setConfiguredSubjects(Array.isArray(items) ? items : []))
      .catch(() => setConfiguredSubjects([]));
  }, []);

  useEffect(() => {
    if (subjectSuggestions.length && !subjectSuggestions.includes(subject)) {
      setSubject(subjectSuggestions[0]);
    } else if (!subjectSuggestions.length && subject) {
      setSubject("");
    }
  }, [subjectSuggestions, subject]);

  useEffect(() => {
    if (availableClasses.length && !availableClasses.includes(grade)) {
      setGrade(availableClasses[0]);
    }
  }, [availableClasses, grade]);

  // Auto-load saved scheme when grade/subject/term/year are all set
  useEffect(() => {
    if (!grade || !subject || !term || !academicYear) return;
    SchemeOfWork.filter({ grade, subject, term })
      .then((results) => {
        const saved = results[0];
        if (saved?.weeks?.length) {
          const skipPattern = /exam|revision|midterm|mid-term|break|closing|test/i;
          const teachingWeeks = saved.weeks.filter(w => !skipPattern.test(w.topic));
          const formatted = teachingWeeks
            .map(w => `Week ${w.week_number}: ${w.topic}\n${w.content}`)
            .join("\n\n");
          setSchemeText(formatted);
          setSchemeAutoLoaded(true);
        } else {
          setSchemeAutoLoaded(false);
          setSchemeText("");
        }
      })
      .catch(() => { setSchemeAutoLoaded(false); setSchemeText(""); });
  }, [grade, subject, term, academicYear]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileUrl("");

    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      const text = await file.text();
      setSchemeText((prev) => [prev, text].filter(Boolean).join("\n\n"));
      toast({ title: "Scheme text loaded", description: `${file.name} was added to the prompt.` });
      return;
    }

    const supported = ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type);
    if (!supported) {
      toast({
        title: "Use PDF, image, or text",
        description: "For Word documents, paste the scheme text here or export it as PDF first.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await UploadFile({ file });
      setFileUrl(uploaded.file_url);
      toast({ title: "Scheme uploaded", description: `${file.name} is ready for AI generation.` });
    } catch (error) {
      toast({ title: "Upload failed", description: error?.message || "Could not upload scheme.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!grade || !subject || !term || !academicYear) {
      toast({ title: "Complete the setup", description: "Class, subject, term, and year are required.", variant: "destructive" });
      return;
    }
    if (!schemeText.trim() && !fileUrl) {
      toast({ title: "Add the scheme of work", description: "Paste the scheme or upload a PDF/image first.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGeneratedEssayQuestions([]);
    try {
      // Section A — MCQ
      const mcqCall = InvokeLLM({
        prompt: buildPrompt({ grade, subject, term, standard, difficulty, questionCount, schemeText }),
        file_urls: fileUrl ? [fileUrl] : [],
        response_json_schema: questionSchema,
      });

      // Section B — Essay (parallel call if enabled)
      const essayCall = includeEssay
        ? InvokeLLM({
            prompt: buildEssayPrompt({ grade, subject, term, standard, difficulty, essayCount, schemeText }),
            file_urls: fileUrl ? [fileUrl] : [],
            response_json_schema: essaySchema,
          })
        : Promise.resolve(null);

      const [mcqResponse, essayResponse] = await Promise.all([mcqCall, essayCall]);

      // Process MCQ
      const mcqItems = (mcqResponse?.questions || [])
        .map(normaliseQuestion)
        .filter((q) => q.text && q.options.filter(Boolean).length >= 4);
      if (!mcqItems.length) throw new Error("AI did not return usable MCQ questions.");
      setGeneratedQuestions(mcqItems);

      // Process Essay
      let essayMsg = "";
      if (essayResponse) {
        const essayItems = (essayResponse?.essay_questions || [])
          .map(normaliseEssayQuestion)
          .filter((q) => q.text);
        setGeneratedEssayQuestions(essayItems);
        essayMsg = essayItems.length ? ` + ${essayItems.length} essay question(s)` : "";
      }

      toast({
        title: "Questions generated",
        description: `${mcqItems.length} MCQ${essayMsg} ready for review.`,
      });
    } catch (error) {
      toast({ title: "Generation failed", description: error?.message || "Could not generate questions.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    const validMcq   = generatedQuestions.filter((q) => q.text.trim() && q.options.every((opt) => opt.trim()));
    const validEssay = generatedEssayQuestions.filter((q) => q.text.trim());

    if (!validMcq.length && !validEssay.length) {
      toast({ title: "Nothing to save", description: "Generate and review questions first.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      let quiz = matchingQuiz;
      if (!quiz) {
        quiz = await Quiz.create({
          subject,
          grade,
          term,
          academic_year: academicYear,
          test_type: testType,
          title: `${subject} ${testType}`,
          description: `AI-generated from scheme of work. Teacher should review before publishing.`,
          duration_minutes: testType === "Exam" ? 60 : 30,
          is_published: false,
          results_visible: false,
        });
      }

      const allQuestions = [
        // Section A — MCQ
        ...validMcq.map((q, index) => ({
          quiz_id: quiz.id,
          text: q.text.trim(),
          question_type: "multiple_choice",
          options: q.options.map((opt) => opt.trim()),
          correct_option_index: q.correct_option_index,
          marks: 1,
          explanation: `Topic: ${q.topic || "General"}\nStandard: ${standard}\nDifficulty: ${q.difficulty || difficulty}\n\n${q.explanation || ""}`.trim(),
          sort_order: index + 1,
        })),
        // Section B — Essay
        ...validEssay.map((q, index) => ({
          quiz_id: quiz.id,
          text: q.text.trim(),
          question_type: "essay",
          options: [],
          correct_option_index: null,
          marks: q.marks,
          explanation: `[MODEL ANSWER]\nTopic: ${q.topic || "General"}\nDifficulty: ${q.difficulty || difficulty}\n\n${q.model_answer || ""}`.trim(),
          sort_order: validMcq.length + index + 1,
        })),
      ];

      await Question.bulkCreate(allQuestions);

      const parts = [];
      if (validMcq.length)   parts.push(`${validMcq.length} MCQ (Section A)`);
      if (validEssay.length) parts.push(`${validEssay.length} essay (Section B)`);

      toast({
        title: "Questions saved",
        description: `${parts.join(" + ")} added to ${subject} ${testType}. The quiz remains hidden until published.`,
      });
      setGeneratedQuestions([]);
      setGeneratedEssayQuestions([]);
      onSaved?.();
    } catch (error) {
      toast({ title: "Save failed", description: error?.message || "Could not save generated questions.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateGeneratedQuestion = (index, nextQuestion) => {
    setGeneratedQuestions((prev) => prev.map((q, i) => (i === index ? nextQuestion : q)));
  };

  const removeGeneratedQuestion = (index) => {
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEssayQuestion = (index, next) => {
    setGeneratedEssayQuestions((prev) => prev.map((q, i) => (i === index ? next : q)));
  };

  const removeEssayQuestion = (index) => {
    setGeneratedEssayQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <Card className="border-indigo-100 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border-b border-indigo-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Wand2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">AI Question Generator</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Upload a scheme of work and generate editable CBT questions before saving them to the question bank.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white/80 border border-white px-4 py-2 text-xs text-slate-600">
              Saved quizzes stay <strong>hidden</strong> until a teacher/admin publishes them.
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{availableClasses.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              {subjectSuggestions.length ? (
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {subjectSuggestions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value=""
                  disabled
                  placeholder="No subject configured for this class"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TERMS_LIST.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025/2026" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Test Type</Label>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Standard</Label>
              <Select value={standard} onValueChange={setStandard}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STANDARDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>No. of Questions</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTS.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Section B toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeEssay}
                onChange={(e) => setIncludeEssay(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
              <div className="flex items-center gap-2">
                <PenLine className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-slate-800">Include Section B — Essay / Theory Questions</span>
              </div>
            </label>
            {includeEssay && (
              <div className="mt-3 ml-7 flex items-center gap-3">
                <Label className="text-sm text-slate-600 whitespace-nowrap">Number of essay questions:</Label>
                <Select value={essayCount} onValueChange={setEssayCount}>
                  <SelectTrigger className="w-24 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESSAY_COUNTS.map((c) => (
                      <SelectItem key={c} value={String(c)}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-slate-500">Each question will include a model answer & marking guide for the teacher.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Scheme of Work</Label>
                {schemeAutoLoaded && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Loaded from database
                  </span>
                )}
              </div>
              <Textarea
                value={schemeText}
                onChange={(e) => { setSchemeText(e.target.value); setSchemeAutoLoaded(false); }}
                rows={8}
                placeholder="Paste the term's scheme of work here. Example: Week 1 - Algebraic expressions; Week 2 - Linear equations..."
                className="text-sm"
              />
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-col justify-between gap-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-slate-500" />
                </div>
                <h3 className="font-semibold text-slate-900">Upload scheme</h3>
                <p className="text-xs text-slate-500 mt-1">PDF, image, or text file. For Word docs, export as PDF or paste the content.</p>
                {fileName && (
                  <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 mt-3 break-words">
                    <FileText className="w-3 h-3 inline mr-1" /> {fileName}
                  </p>
                )}
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={handleFile}
                  className="hidden"
                />
                <span className="w-full inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {isUploading ? "Uploading..." : "Choose file"}
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-500">
              Target: <strong className="text-slate-800">{subject || "Subject"} {testType}</strong>{" "}
              {matchingQuiz ? "will receive the approved questions." : "will be created as a hidden quiz when saved."}
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || isUploading || !includeEssay} className="bg-indigo-600 hover:bg-indigo-700 gap-2" title={!includeEssay ? "Check 'Include Section B (Essay)' to enable generation" : ""}>
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? "Generating..." : "Generate Questions"}
            </Button>
            {!includeEssay && (
              <p className="text-xs text-amber-600 font-medium mt-1">&#9888; Check &quot;Include Section B (Essay)&quot; above to enable generation.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {(generatedQuestions.length > 0 || generatedEssayQuestions.length > 0) && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Review Generated Questions</h3>
                  <p className="text-sm text-slate-500">Edit anything you do not like before saving to CBT.</p>
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving
                  ? "Saving..."
                  : `Save ${generatedQuestions.length + generatedEssayQuestions.length} Question(s)`}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-6">
            {/* Section A — MCQ */}
            {generatedQuestions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1">
                    Section A — Multiple Choice ({generatedQuestions.length})
                  </span>
                </div>
                {generatedQuestions.map((question, index) => (
                  <GeneratedQuestionEditor
                    key={question.id}
                    question={question}
                    index={index}
                    onChange={updateGeneratedQuestion}
                    onRemove={removeGeneratedQuestion}
                  />
                ))}
              </div>
            )}

            {/* Divider if both sections present */}
            {generatedQuestions.length > 0 && generatedEssayQuestions.length > 0 && (
              <div className="border-t-2 border-dashed border-amber-200" />
            )}

            {/* Section B — Essay */}
            {generatedEssayQuestions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1">
                    Section B — Essay / Theory ({generatedEssayQuestions.length})
                  </span>
                  <span className="text-xs text-slate-500">Model answers are saved as teacher notes — not visible to students.</span>
                </div>
                {generatedEssayQuestions.map((question, index) => (
                  <EssayQuestionEditor
                    key={question.id}
                    question={question}
                    index={index}
                    onChange={updateEssayQuestion}
                    onRemove={removeEssayQuestion}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
