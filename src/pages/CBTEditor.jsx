import React, { useState, useEffect, useCallback } from "react";
import { BRAND } from "@/config/brand";
import { Quiz, Question, User } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, UploadCloud, Save, Trash2, AlertCircle, Plus, Printer, GripVertical } from "lucide-react";
import MathRenderer from "../components/cbt/MathRenderer";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AnimatePresence } from "framer-motion";
import { Toaster, toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

import QuestionUploader from "../components/cbt/QuestionUploader";
import EditableQuestionCard from "../components/cbt/EditableQuestionCard";
import ManualQuestionForm from "../components/cbt/ManualQuestionForm";
import { recordStreak, STREAK_TYPES } from "@/lib/streakUtils";

export default function CBTEditorPage() {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [questionChanges, setQuestionChanges] = useState({});
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const quizId = urlParams.get('quizId');

  const loadData = useCallback(async () => {
    if (!quizId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [quizData, questionsData] = await Promise.all([
        Quiz.get(quizId),
        Question.filter({ quiz_id: quizId }, "-created_date")
      ]);
      setQuiz(quizData);
      
      // Sort by sort_order if set, fallback to question_number
      const sortedQuestions = [...questionsData].sort((a, b) => {
        if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
        if (a.sort_order != null) return -1;
        if (b.sort_order != null) return 1;
        return (a.question_number ?? 0) - (b.question_number ?? 0);
      });
      
      setQuestions(sortedQuestions);
      setQuestionChanges({});
      setSelectedQuestions([]);
    } catch (error) {
      console.error("Error loading quiz data:", error);
      toast.error("Failed to load quiz data.");
    } finally {
      setIsLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    const checkAccessAndLoad = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
        
        if (user.school_role !== 'admin' && user.school_role !== 'teacher' && user.school_role !== 'super_admin') {
          setAccessDenied(true);
          setIsLoading(false);
          return;
        }
        
        loadData();
      } catch (error) {
        console.error("Error checking access or loading user:", error);
        setAccessDenied(true);
        setIsLoading(false);
        toast.error("Failed to verify user access.");
      }
    };
    checkAccessAndLoad();
  }, [loadData]);

  const handleQuestionChange = (questionId, correctOptionIndex) => {
    setQuestionChanges(prev => ({
      ...prev,
      [questionId]: correctOptionIndex
    }));
  };

  const handleSaveAll = async () => {
    if (Object.keys(questionChanges).length === 0) {
      toast.info("No changes to save");
      return;
    }

    setIsSaving(true);
    try {
      const updatePromises = Object.entries(questionChanges).map(([questionId, correctOptionIndex]) => {
        const question = questions.find(q => q.id === questionId);
        if (question) {
            return Question.update(questionId, {
                ...question,
                correct_option_index: Number(correctOptionIndex)
            });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      toast.success(`Successfully saved ${Object.keys(questionChanges).length} question(s)!`);
      recordStreak(currentUser?.id, STREAK_TYPES.CBT);
      loadData();
    } catch (error) {
      console.error("Error saving questions:", error);
      toast.error("Failed to save changes. Please try again.");
    }
    setIsSaving(false);
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await Question.delete(questionId);
      toast.success("Question deleted");
      loadData();
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    }
  };

  const handleToggleSelect = (questionId) => {
    setSelectedQuestions(prev => 
      prev.includes(questionId) 
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedQuestions.length === questions.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(questions.map(q => q.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedQuestions.length === 0) {
      toast.info("No questions selected");
      return;
    }

    setIsDeleting(true);
    try {
      const deletePromises = selectedQuestions.map(id => Question.delete(id));
      await Promise.all(deletePromises);
      toast.success(`Successfully deleted ${selectedQuestions.length} question(s)!`);
      loadData();
    } catch (error) {
      console.error("Error deleting questions:", error);
      toast.error("Failed to delete questions");
    }
    setIsDeleting(false);
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;

    // Separate MCQ and essay lists
    const mcqList  = questions.filter(q => q.question_type === 'multiple_choice');
    const essayList = questions.filter(q => q.question_type !== 'multiple_choice');

    const isMcqDrop  = source.droppableId === 'mcq-list';
    const workingList = isMcqDrop ? [...mcqList] : [...essayList];

    // Reorder within the working list
    const [moved] = workingList.splice(source.index, 1);
    workingList.splice(destination.index, 0, moved);

    // Rebuild full questions array preserving the other section's order
    const newQuestions = isMcqDrop
      ? [...workingList, ...essayList]
      : [...mcqList, ...workingList];

    setQuestions(newQuestions);

    // Persist sort_order to DB so all users see the same order
    try {
      await Promise.all(
        newQuestions.map((q, idx) => Question.update(q.id, { sort_order: idx }))
      );
    } catch (err) {
      console.error("Failed to save question order:", err);
      toast.error("Could not save new order.");
    }
  };

  const handlePrint = () => {
    const sectionA = questions.filter(q => q.question_type === 'multiple_choice');
    const sectionB = questions.filter(q => q.question_type !== 'multiple_choice');
    const unsectioned = [];

    // Escape HTML special chars but preserve $ (KaTeX) and <table>...</table> blocks
    const safe = (text) => {
      if (!text) return '';
      const str = String(text);
      // Extract table blocks first, replace with placeholders
      const tables = [];
      const withPlaceholders = str.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
        tables.push(match);
        return `\x00TABLE${tables.length - 1}\x00`;
      });
      // Escape remaining HTML
      const escaped = withPlaceholders
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      // Restore table blocks
      return escaped.replace(/\x00TABLE(\d+)\x00/g, (_, i) => tables[parseInt(i)]);
    };

    const mcqHTML = (q, num) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const letters = ['A', 'B', 'C', 'D', 'E'];
      const optionsLine = opts
        .map((o, i) => `<span class="opt"><strong>(${letters[i]})</strong>&nbsp;${safe(o)}</span>`)
        .join('');
      return `
        <div class="mcq-question">
          <div class="qtext"><strong>${num}.</strong>&nbsp;${safe(q.text)}</div>
          <div class="opts">${optionsLine}</div>
        </div>`;
    };

    const essayHTML = (q, num) => {
      return `
        <div class="essay-question">
          <p><strong>${num}.</strong>&nbsp;${safe(q.text)}</p>
          <div class="answer-lines"></div>
        </div>`;
    };

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Question Paper</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"/>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: serif; font-size: 10pt; line-height: 1.5; margin: 15mm 18mm; text-align: left; }
    h1 { font-size: 13pt; text-align: center; margin: 0 0 3px; }
    .sub { text-align: center; font-size: 10pt; margin: 0 0 2px; }
    .divider { border-bottom: 2px solid #000; margin: 8px 0 14px; }
    h2 { font-size: 10pt; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 3px; margin: 16px 0 10px; text-transform: uppercase; }
    /* Force KaTeX display math to align left instead of centring */
    .katex-display { text-align: left !important; margin: 4px 0 !important; }
    td, th { text-align: left; }

    /* ── Section A: 2-column MCQ ── */
    .mcq-grid {
      column-count: 2;
      column-gap: 18pt;
      column-rule: 1px solid #ccc;
    }
    .mcq-question {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 10px;
    }
    .qtext { margin-bottom: 3px; }
    .opts { display: flex; flex-wrap: wrap; gap: 4px 14px; padding-left: 14px; }
    .opt { white-space: nowrap; }

    /* ── Section B: 1-column essay ── */
    .essay-question { margin-bottom: 7px; page-break-inside: avoid; }
    .answer-lines {
      margin-top: 3px;
      border-bottom: 1px solid #aaa;
      min-height: 18px;
    }

    /* ── Tables inside questions ── */
    table { border-collapse: collapse; margin: 6px 0; font-size: 9.5pt; }
    th, td { border: 1px solid #333; padding: 3px 8px; text-align: center; }
    th { background: #f0f0f0; font-weight: bold; }

    @page { size: A4; margin: 15mm 18mm; }
    @media print {
      body { margin: 0; }
      .mcq-grid { column-count: 2; }
    }
  </style>
</head>
<body>
  <h1>${BRAND.schoolName.toUpperCase()}</h1>
  ${quiz ? `
  <p class="sub"><strong>${safe(quiz.subject)}</strong> &mdash; ${safe(quiz.grade)} &nbsp;|&nbsp; ${safe(quiz.term)} &nbsp;|&nbsp; ${safe(quiz.academic_year)}</p>
  <p class="sub">${(quiz.test_type||'').replace(/_/g,' ').toUpperCase()} &nbsp;&middot;&nbsp; Duration: ${quiz.duration_minutes} mins &nbsp;&middot;&nbsp; Total Marks: ${quiz.total_marks}</p>
  ` : ''}
  <div class="divider"></div>

  ${sectionA.length > 0 ? (() => {
    const half = Math.ceil(sectionA.length / 2);
    const left  = sectionA.slice(0, half);
    const right = sectionA.slice(half);
    return `
  <h2>SECTION A &mdash; MULTIPLE CHOICE QUESTIONS</h2>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:10pt;">
        ${left.map((q, i) => mcqHTML(q, i + 1)).join('')}
      </td>
      <td style="width:50%;vertical-align:top;padding-left:10pt;border-left:1px solid #bbb;">
        ${right.map((q, i) => mcqHTML(q, half + i + 1)).join('')}
      </td>
    </tr>
  </table>`;
  })() : ''}

  ${sectionB.length > 0 ? `
  <h2 style="margin-top:${sectionA.length > 0 ? '24px' : '0'};">${sectionA.length > 0 ? 'SECTION B &mdash; ESSAY QUESTIONS' : 'QUESTIONS'}</h2>
  ${sectionB.map((q, i) => essayHTML(q, i + 1)).join('')}
  ` : ''}

  <p style="text-align:center;margin-top:24px;font-size:9pt;color:#555">&mdash; End of Examination &mdash;</p>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    // Wait for KaTeX to render before printing
    setTimeout(() => { win.focus(); win.print(); }, 1500);
  };

  const handleUploadComplete = () => {
    setShowUploader(false);
    loadData();
  };

  if (accessDenied) {
    return (
      <div className="p-8 text-center flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-600 mb-6">
            You don't have permission to manage questions. This area is for teachers and administrators only.
          </p>
          <Link to={createPageUrl("StudentCBT")}>
            <Button>Go to Student Tests</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin"/></div>;
  }

  if (!quiz) {
    return <div className="p-8 text-center text-red-500">Quiz not found. Please go back and select a valid quiz.</div>;
  }

  const hasChanges = Object.keys(questionChanges).length > 0;
  const hasSelection = selectedQuestions.length > 0;

  return (
    <div className="p-6 md:p-8">
      <Toaster />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to={createPageUrl("CBT")} className="flex items-center gap-2 text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4"/> Back to Quizzes
          </Link>
          
          <div className="flex gap-2">
            {hasSelection && (
              <Button 
                onClick={handleDeleteSelected} 
                disabled={isDeleting}
                variant="destructive"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2"/>
                    Delete Selected ({selectedQuestions.length})
                  </>
                )}
              </Button>
            )}
            
            {hasChanges && (
              <Button 
                onClick={handleSaveAll} 
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2"/>
                    Save All Changes ({Object.keys(questionChanges).length})
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <Card className="mb-8 bg-slate-50 border-slate-200">
          <CardHeader>
            <CardTitle>{quiz.title}</CardTitle>
            <p className="text-slate-600">{quiz.subject} - {quiz.grade}</p>
          </CardHeader>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-4">
              <span>Manage Questions</span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => { setShowManualForm(true); setShowUploader(false); }}
                  disabled={showManualForm}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4"/>
                  Add Question Manually
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowUploader(true); setShowManualForm(false); }}
                  disabled={showUploader}
                  className="gap-2"
                >
                  <UploadCloud className="w-4 h-4"/>
                  Upload & Extract Questions
                </Button>
              </div>
            </CardTitle>
            <p className="text-sm text-slate-500 pt-2">
              Type questions manually, or upload any document/image — AI will automatically detect and categorise Section A (MCQ) and Section B (Essay) questions.
            </p>
          </CardHeader>
        </Card>

        <AnimatePresence>
          {showManualForm && (
            <ManualQuestionForm
              quizId={quizId}
              onSaved={() => { setShowManualForm(false); loadData(); }}
              onCancel={() => setShowManualForm(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showUploader && (
            <QuestionUploader
              quizId={quizId}
              onCancel={() => setShowUploader(false)}
              onUploadComplete={handleUploadComplete}
            />
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800">
              Questions in this Quiz ({questions.length})
            </h2>
            <div className="flex items-center gap-2">
              {questions.length > 0 && (
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                  <Printer className="w-4 h-4" /> Print Questions
                </Button>
              )}
              {questions.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {selectedQuestions.length === questions.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
          </div>
          
          {questions.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              <UploadCloud className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>No questions yet. Click <strong>Add Question Manually</strong> to type one, or <strong>Upload &amp; Extract</strong> to import from a document.</p>
            </Card>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              {/* Section A - Multiple Choice */}
              {questions.some(q => q.question_type === 'multiple_choice') && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-blue-800 border-b-2 border-blue-200 pb-2 mb-4">
                    Section A - Multiple Choice Questions
                  </h3>
                  <Droppable droppableId="mcq-list">
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex flex-col gap-4"
                      >
                        {questions
                          .filter(q => q.question_type === 'multiple_choice')
                          .map((q, index) => (
                            <Draggable key={q.id} draggableId={q.id} index={index}>
                              {(drag, snapshot) => (
                                <div
                                  ref={drag.innerRef}
                                  {...drag.draggableProps}
                                  className={snapshot.isDragging ? "opacity-80 shadow-2xl" : ""}
                                >
                                  <div className="relative">
                                    <div
                                      {...drag.dragHandleProps}
                                      className="absolute top-3 left-3 z-10 p-1 rounded cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                                      title="Drag to reorder"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <EditableQuestionCard
                                      question={q}
                                      index={index}
                                      onDelete={handleDeleteQuestion}
                                      onChange={handleQuestionChange}
                                      hasUnsavedChanges={questionChanges.hasOwnProperty(q.id)}
                                      isSelected={selectedQuestions.includes(q.id)}
                                      onToggleSelect={handleToggleSelect}
                                      onRefresh={loadData}
                                    />
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )}

              {/* Section B - Essay Questions */}
              {questions.some(q => q.question_type !== 'multiple_choice') && (
                <div>
                  <h3 className="text-xl font-bold text-emerald-800 border-b-2 border-emerald-200 pb-2 mb-4">
                    {questions.some(q => q.question_type === 'multiple_choice') ? 'Section B - Essay Questions' : 'Questions'}
                  </h3>
                  <Droppable droppableId="essay-list">
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex flex-col gap-4"
                      >
                        {questions
                          .filter(q => q.question_type !== 'multiple_choice')
                          .map((q, index) => (
                            <Draggable key={q.id} draggableId={q.id} index={index}>
                              {(drag, snapshot) => (
                                <div
                                  ref={drag.innerRef}
                                  {...drag.draggableProps}
                                  className={snapshot.isDragging ? "opacity-80 shadow-2xl" : ""}
                                >
                                  <div className="relative">
                                    <div
                                      {...drag.dragHandleProps}
                                      className="absolute top-3 left-3 z-10 p-1 rounded cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                                      title="Drag to reorder"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <EditableQuestionCard
                                      question={q}
                                      index={index}
                                      onDelete={handleDeleteQuestion}
                                      onChange={handleQuestionChange}
                                      hasUnsavedChanges={questionChanges.hasOwnProperty(q.id)}
                                      isSelected={selectedQuestions.includes(q.id)}
                                      onToggleSelect={handleToggleSelect}
                                      onRefresh={loadData}
                                    />
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )}
            </DragDropContext>
          )}
        </div>
      </div>

    </div>
  );
}