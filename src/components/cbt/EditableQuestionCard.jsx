import React, { useState } from 'react';
import { Question } from '@/entities/all';
import { UploadFile, InvokeLLM } from '@/integrations/Core';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Trash2, AlertCircle, FileText, Sparkles, Loader2, Pencil, Plus, X, ImagePlus, XCircle, Crop } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { toast } from 'sonner';
import ImageCropModal from './ImageCropModal';

export default function EditableQuestionCard({ question, index, onDelete, onChange, hasUnsavedChanges, isSelected, onToggleSelect, onRefresh }) {
  const [correctOption, setCorrectOption] = useState(String(question.correct_option_index ?? 0));
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState(question.text);
  const [editOptions, setEditOptions] = useState(question.options ? [...question.options] : []);
  const [editCorrect, setEditCorrect] = useState(String(question.correct_option_index ?? 0));
  const [editMaxScore, setEditMaxScore] = useState(question.max_score ?? 1);
  const [editImageUrl, setEditImageUrl] = useState(question.image_url || null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const imageInputRef = React.useRef(null);
  const inlineImageInputRef = React.useRef(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showEditCropModal, setShowEditCropModal] = useState(false);

  const isEssay = question.question_type === 'essay';

  const openEdit = () => {
    setEditText(question.text);
    setEditOptions(question.options ? [...question.options] : []);
    setEditCorrect(String(question.correct_option_index ?? 0));
    setEditMaxScore(question.max_score ?? 1);
    setEditImageUrl(question.image_url || null);
    setShowEditModal(true);
  };

  const handleImageUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIsUploadingImage(true);
    try {
      const { file_url } = await UploadFile({ file: f });
      if (file_url) setEditImageUrl(file_url);
      else toast.error("Image upload failed");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInlineDiagramUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIsUploadingImage(true);
    try {
      const { file_url } = await UploadFile({ file: f });
      if (file_url) {
        await Question.update(question.id, { image_url: file_url, needs_diagram: false });
        toast.success("Diagram attached!");
        if (onRefresh) onRefresh();
      } else {
        toast.error("Image upload failed");
      }
    } catch {
      toast.error("Image upload failed");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editText.trim()) { toast.error("Question text cannot be empty"); return; }
    setIsSavingEdit(true);
    try {
      const updateData = { text: editText, max_score: Number(editMaxScore), image_url: editImageUrl || null, needs_diagram: editImageUrl ? false : question.needs_diagram };
      if (!isEssay) {
        if (editOptions.some(o => !o.trim())) { toast.error("All options must have text"); setIsSavingEdit(false); return; }
        updateData.options = editOptions;
        updateData.correct_option_index = Number(editCorrect);
      }
      await Question.update(question.id, updateData);
      toast.success("Question updated!");
      setShowEditModal(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error("Failed to save question");
    }
    setIsSavingEdit(false);
  };

  const handleOptionChange = (value) => {
    setCorrectOption(value);
    setAiSuggestion(null);
    onChange(question.id, Number(value));
  };

  const handleAISuggest = async () => {
    setIsSuggesting(true);
    try {
      const response = await InvokeLLM({
        prompt: `You are an expert Nigerian school exam marker. Given this multiple-choice question and its options, identify the correct answer.

Question: ${question.text}

Options:
${question.options?.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}

You MUST respond with ONLY a JSON object in this exact format (no other text):
{"correct_index": <0-based integer index of the correct option>, "explanation": "<one sentence why>"}

For example, if option B is correct: {"correct_index": 1, "explanation": "B is correct because..."}`,
        response_json_schema: {
          type: "object",
          properties: {
            correct_index: { type: "number" },
            explanation: { type: "string" }
          },
          required: ["correct_index", "explanation"]
        }
      });

      // Robustly find the index — model may use different key names
      const rawIdx =
        response?.correct_index ??
        response?.answer_index ??
        response?.index ??
        response?.correct_answer_index ??
        response?.answer;
      const idx = rawIdx != null ? parseInt(rawIdx, 10) : NaN;

      if (!isNaN(idx) && idx >= 0 && idx < (question.options?.length ?? 0)) {
        setAiSuggestion({ correct_index: idx, explanation: response?.explanation || '' });
        toast.success("AI suggested an answer — review and confirm!");
      } else {
        toast.error("Could not determine answer. Try again.");
      }
    } catch (err) {
      console.error("AI Suggest error:", err);
      toast.error(err?.message || "Could not determine answer. Try again.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAcceptSuggestion = () => {
    const idx = String(aiSuggestion.correct_index);
    setCorrectOption(idx);
    onChange(question.id, aiSuggestion.correct_index);
    setAiSuggestion(null);
    toast.success("Answer updated!");
  };

  return (
    <Card className={`bg-white border-2 transition-all ${hasUnsavedChanges ? 'border-amber-400 bg-amber-50/30' : isSelected ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200'}`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3 flex-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(question.id)}
              className="mt-7"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant="outline" className={isEssay ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}>
                  Section {question.section || 'A'} - {isEssay ? 'Essay' : 'MCQ'}
                </Badge>
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    Unsaved
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-800 mb-3">{question.question_number ?? (index + 1)}. <MathRenderer text={question.text} /></p>

              {/* Diagram image */}
              {question.image_url ? (
                <div className="mb-3">
                  <img
                    src={question.image_url}
                    alt="Question diagram"
                    className="max-h-64 rounded-lg border border-slate-200 object-contain bg-slate-50"
                  />
                </div>
              ) : question.needs_diagram ? (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-amber-300 bg-amber-50">
                  <Crop className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-amber-700 text-xs font-medium flex-1">This question needs a diagram image.</span>
                  <button
                    type="button"
                    onClick={() => setShowCropModal(true)}
                    disabled={isUploadingImage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors flex-shrink-0"
                  >
                    <Crop className="w-3 h-3" /> Crop &amp; Attach
                  </button>
                </div>
              ) : null}

              {/* Inline crop modal for needs_diagram questions */}
              <ImageCropModal
                open={showCropModal}
                onClose={() => setShowCropModal(false)}
                onCropped={async (url) => {
                  await Question.update(question.id, { image_url: url, needs_diagram: false });
                  if (onRefresh) onRefresh();
                }}
              />

              {isEssay ? (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <FileText className="w-4 h-4" />
                    <span>Essay Question - Students will type their answer</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">This will be manually graded by teachers</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <RadioGroup 
                    value={correctOption}
                    onValueChange={handleOptionChange}
                    className="space-y-2"
                  >
                    {question.options?.map((opt, i) => (
                      <div key={i} className={`flex items-center space-x-2 p-2 rounded-lg transition-colors ${
                        aiSuggestion && aiSuggestion.correct_index === i 
                          ? 'bg-yellow-50 border border-yellow-300' 
                          : String(i) === correctOption ? 'bg-green-50' : ''
                      }`}>
                        <RadioGroupItem value={String(i)} id={`q${question.id}-opt${i}`} />
                        <Label htmlFor={`q${question.id}-opt${i}`} className="text-slate-700 cursor-pointer flex-1">
                          <MathRenderer text={opt} />
                        </Label>
                        {aiSuggestion && aiSuggestion.correct_index === i && (
                          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">AI Pick</Badge>
                        )}
                      </div>
                    )) || <p className="text-red-500 text-sm">No options available</p>}
                  </RadioGroup>

                  {/* AI Suggestion Panel */}
                  {aiSuggestion && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-yellow-800 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI Suggestion
                      </p>
                      <p className="text-xs text-yellow-700">{aiSuggestion.explanation}</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs h-7" onClick={handleAcceptSuggestion}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setAiSuggestion(null)}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                    onClick={handleAISuggest}
                    disabled={isSuggesting}
                  >
                    {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {isSuggesting ? "Thinking..." : "AI Suggest Answer"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="ml-4 flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="w-4 h-4 mr-1"/> Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="px-3"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-1"/> Delete
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> Delete Question?
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 text-sm py-2">
            This will permanently delete question {question.question_number ?? (index + 1)}. This action cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(question.id);
                } finally {
                  setIsDeleting(false);
                  setShowDeleteConfirm(false);
                }
              }}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question {question.question_number ?? (index + 1)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-1 block">Question Text</Label>
              <Textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Max Score</Label>
              <Input
                type="number"
                min={1}
                value={editMaxScore}
                onChange={e => setEditMaxScore(e.target.value)}
                className="w-24"
              />
            </div>

            {/* Image / Diagram */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Diagram / Image</Label>
              {editImageUrl ? (
                <div className="space-y-2">
                  <img
                    src={editImageUrl}
                    alt="Question diagram"
                    className="max-h-52 rounded-lg border border-slate-200 object-contain bg-slate-50"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEditCropModal(true)}
                      className="text-xs gap-1.5"
                    >
                      <Crop className="w-3 h-3" /> Replace (Crop)
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditImageUrl(null)}
                      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEditCropModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
                >
                  <Crop className="w-4 h-4" /> Crop &amp; Attach Diagram
                </button>
              )}
              <ImageCropModal
                open={showEditCropModal}
                onClose={() => setShowEditCropModal(false)}
                onCropped={(url) => { setEditImageUrl(url); setShowEditCropModal(false); }}
              />
            </div>
            {!isEssay && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Options (select the correct one)</Label>
                <RadioGroup value={editCorrect} onValueChange={setEditCorrect} className="space-y-2">
                  {editOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <RadioGroupItem value={String(i)} id={`edit-opt-${i}`} />
                      <Input
                        value={opt}
                        onChange={e => {
                          const updated = [...editOptions];
                          updated[i] = e.target.value;
                          setEditOptions(updated);
                        }}
                        className="flex-1"
                        placeholder={`Option ${i + 1}`}
                      />
                      {editOptions.length > 2 && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          const updated = editOptions.filter((_, idx) => idx !== i);
                          setEditOptions(updated);
                          if (Number(editCorrect) >= updated.length) setEditCorrect(String(updated.length - 1));
                        }}>
                          <X className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  ))}
                </RadioGroup>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setEditOptions([...editOptions, ''])}>
                  <Plus className="w-4 h-4 mr-1" /> Add Option
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="bg-blue-600 hover:bg-blue-700">
              {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}