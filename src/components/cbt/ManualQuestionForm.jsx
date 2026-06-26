import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Question } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PenLine, X, Save, Loader2, Plus, Trash2, CheckCircle2, Crop, XCircle } from "lucide-react";
import { toast } from "sonner";
import ImageCropModal from "./ImageCropModal";

const LETTERS = ["A", "B", "C", "D", "E"];

function OptionRow({ index, value, isCorrect, onChange, onRemove, onMarkCorrect, canRemove }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onMarkCorrect(index)}
        className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
          isCorrect
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-500"
        }`}
        title={isCorrect ? "Correct answer" : "Mark as correct"}
      >
        {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : LETTERS[index]}
      </button>
      <Input
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder={`Option ${LETTERS[index]}`}
        className="h-9 text-sm flex-1"
      />
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ManualQuestionForm({ quizId, onSaved, onCancel }) {
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(null);
  const [marks, setMarks] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);

  const handleOptionChange = (index, value) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const handleAddOption = () => {
    if (options.length >= 5) return;
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setCorrectIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const handleSave = async () => {
    // Validation
    if (!text.trim()) {
      toast.error("Please enter the question text.");
      return;
    }
    if (questionType === "multiple_choice") {
      const filled = options.filter((o) => o.trim());
      if (filled.length < 2) {
        toast.error("Please fill in at least 2 options.");
        return;
      }
      if (correctIndex === null) {
        toast.error("Please select the correct answer.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        quiz_id: quizId,
        text: text.trim(),
        question_type: questionType,
        marks: Number(marks) || 1,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };

      if (questionType === "multiple_choice") {
        payload.options = options.filter((o) => o.trim());
        payload.correct_option_index = correctIndex;
      }

      await Question.create(payload);
      toast.success("Question added!");
      onSaved();
    } catch (err) {
      console.error("Error saving question:", err);
      toast.error("Failed to save question.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      className="mb-6"
    >
      <Card className="border-blue-200 shadow-md shadow-blue-50">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <PenLine className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-base text-slate-800">Add Question Manually</CardTitle>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {/* Question type toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Question Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setQuestionType("multiple_choice")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  questionType === "multiple_choice"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                Section A — MCQ
              </button>
              <button
                type="button"
                onClick={() => setQuestionType("essay")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  questionType === "essay"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-600"
                }`}
              >
                Section B — Essay
              </button>
            </div>
          </div>

          {/* Question text */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">
              Question Text <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your question here…"
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* MCQ options */}
          {questionType === "multiple_choice" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Answer Options{" "}
                <span className="text-slate-400 font-normal text-xs ml-1">
                  — click a letter to mark the correct answer
                </span>
              </Label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <OptionRow
                    key={i}
                    index={i}
                    value={opt}
                    isCorrect={correctIndex === i}
                    onChange={handleOptionChange}
                    onRemove={handleRemoveOption}
                    onMarkCorrect={setCorrectIndex}
                    canRemove={options.length > 2}
                  />
                ))}
              </div>
              {options.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add option {LETTERS[options.length]}
                </button>
              )}
              {correctIndex === null && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ Click a letter button to mark the correct answer.
                </p>
              )}
            </div>
          )}

          {/* Diagram image */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">
              Diagram / Image{" "}
              <span className="text-slate-400 font-normal text-xs ml-1">— optional, attach if question needs a visual</span>
            </Label>
            {imageUrl ? (
              <div className="space-y-2">
                <img
                  src={imageUrl}
                  alt="Question diagram"
                  className="max-h-52 rounded-lg border border-slate-200 object-contain bg-slate-50"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCropModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-600 text-xs font-medium transition-colors"
                  >
                    <Crop className="w-3 h-3" /> Replace (Crop)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors"
                  >
                    <XCircle className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCropModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
              >
                <Crop className="w-4 h-4" />
                Crop &amp; Attach Diagram
              </button>
            )}
            <ImageCropModal
              open={showCropModal}
              onClose={() => setShowCropModal(false)}
              onCropped={(url) => { setImageUrl(url); setShowCropModal(false); }}
            />
          </div>

          {/* Marks */}
          <div className="flex items-center gap-4">
            <div className="w-32 space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Marks</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                className="h-9 text-sm text-center"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving} className="h-9">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`h-9 gap-2 min-w-[140px] ${
                questionType === "essay"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-4 h-4" /> Save Question</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
