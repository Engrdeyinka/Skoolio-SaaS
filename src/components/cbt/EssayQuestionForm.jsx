import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UploadFile, InvokeLLM } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X, Plus, ImageUp, Loader2 } from 'lucide-react';
import { Question } from '@/entities/Question';
import { toast } from 'sonner';
import MathRenderer from './MathRenderer';

export default function EssayQuestionForm({ quizId, onCancel, onComplete }) {
  const [questions, setQuestions] = useState(['']);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleAddQuestion = () => setQuestions([...questions, '']);

  const handleQuestionChange = (index, value) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleImageExtract = async (file) => {
    if (!file) return;
    setIsExtracting(true);
    const { file_url } = await UploadFile({ file });

    const response = await InvokeLLM({
      prompt: `You are extracting essay/structured questions from a Nigerian school exam paper image.

INSTRUCTIONS:
1. Extract ALL numbered questions (1, 2, 3, ...) as separate items.
2. Each numbered question may have sub-parts like (a), (b), (c) or (i), (ii), (iii) — keep them ALL together as one single question text.
3. PRESERVE the full structure including sub-questions within each main question number.
4. Convert ALL mathematical expressions, equations, fractions, superscripts, subscripts, Greek letters, and symbols to LaTeX:
   - Inline math: $...$  e.g. $2^x - 5(2^0) + 4 = 0$
   - Display/block math: $$...$$ for standalone equations
   - Fractions: $\\frac{a}{b}$
   - Square roots: $\\sqrt{x}$
   - Superscripts: $x^2$, $2^{x-1}$
   - Logarithms: $\\log_{10}(2x^2 + 5x - 2)$
   - Trig: $\\sin\\theta$, $\\cos^2\\theta$
   - Greek: $\\theta$, $\\alpha$, $\\pi$
5. Do NOT split sub-questions into separate items — keep (a), (b), (c) together under their parent question number.
6. Remove the outer question number (e.g., "1.", "2.") from the text — it will be used as the array index.

Return a JSON object:
{
  "questions": [
    { "text": "full question 1 text with all sub-parts and LaTeX" },
    { "text": "full question 2 text with all sub-parts and LaTeX" },
    ...
  ]
}`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"]
            }
          }
        },
        required: ["questions"]
      }
    });

    if (response?.questions?.length > 0) {
      setQuestions(response.questions.map(q => q.text));
      toast.success(`Extracted ${response.questions.length} questions from image!`);
    } else {
      toast.error("Could not extract questions. Please try again.");
    }
    setIsExtracting(false);
  };

  const handleSubmit = async () => {
    const validQuestions = questions.filter(q => q.trim() !== '');
    if (validQuestions.length === 0) {
      toast.error("Please add at least one question");
      return;
    }
    setIsSaving(true);
    const questionsToCreate = validQuestions.map(text => ({
      quiz_id: quizId,
      question_type: 'essay',
      section: 'B',
      text: text.trim(),
      max_score: 10
    }));
    await Question.bulkCreate(questionsToCreate);
    toast.success(`Added ${validQuestions.length} essay question(s)!`);
    onComplete();
    setIsSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-8"
    >
      <Card className="bg-emerald-50/50 backdrop-blur-xl shadow-xl border border-emerald-200/60">
        <CardHeader className="border-b border-emerald-200/60">
          <CardTitle className="flex items-center justify-between">
            <span className="text-emerald-800">Add Section B - Essay Questions</span>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-emerald-700">
                Add questions manually or upload an image — questions will be auto-extracted and split by number with LaTeX.
              </p>
              <label className="cursor-pointer shrink-0 ml-4">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImageExtract(e.target.files[0])}
                />
                <Button variant="outline" size="sm" asChild disabled={isExtracting}>
                  <span className="flex items-center gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                    {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />}
                    {isExtracting ? "Extracting..." : "Upload Image"}
                  </span>
                </Button>
              </label>
            </div>

            {questions.map((question, index) => (
              <div key={index} className="space-y-2 p-4 bg-white rounded-lg border border-emerald-200">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-emerald-800">Question {index + 1}</Label>
                  {questions.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveQuestion(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Live LaTeX preview */}
                {question.trim() && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-md p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    <p className="text-xs text-emerald-500 font-medium mb-1">Preview:</p>
                    <MathRenderer text={question} />
                  </div>
                )}

                <Textarea
                  placeholder="Enter question text here, or upload an image above to auto-populate..."
                  value={question}
                  onChange={(e) => handleQuestionChange(index, e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
              </div>
            ))}

            <Button
              variant="outline"
              onClick={handleAddQuestion}
              className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Question
            </Button>

            <div className="flex justify-end gap-3 pt-4 border-t border-emerald-200/60">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? "Saving..." : `Save ${questions.filter(q => q.trim()).length} Question(s)`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}