import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { UploadFile, InvokeLLM } from '@/integrations/Core';
import { Question } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Save, AlertCircle, Loader2, CheckCircle, FileText, Image, FileType } from 'lucide-react';

// Accept ALL common file types
const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.gif,.docx,.doc,.rtf,.txt,.odt,.pptx,.ppt,.xls,.xlsx,.csv';

const EXTRACTION_STEPS = [
  "Reading file...",
  "Uploading document...",
  "Detecting question types...",
  "Converting math to LaTeX...",
  "Locating diagram regions...",
  "Cropping & uploading diagrams...",
  "Saving to database...",
];

// ─── File helpers ─────────────────────────────────────────────────────────────

function extractRtfText(content) {
  let text = content;
  for (let i = 0; i < 10; i++) text = text.replace(/\{\\[^{}]+\}/g, '');
  text = text.replace(/\\[a-z]+\-?\d*\s?/gi, ' ');
  text = text.replace(/\\\*/g, '').replace(/\\'/gi, "'").replace(/[{}\\]/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let i = 0;
  while (i < uint8.length - 30) {
    if (uint8[i] === 0x50 && uint8[i+1] === 0x4B && uint8[i+2] === 0x03 && uint8[i+3] === 0x04) {
      const compressionMethod = uint8[i+8] | (uint8[i+9] << 8);
      const compressedSize    = uint8[i+18] | (uint8[i+19] << 8) | (uint8[i+20] << 16) | (uint8[i+21] << 24);
      const filenameLen       = uint8[i+26] | (uint8[i+27] << 8);
      const extraLen          = uint8[i+28] | (uint8[i+29] << 8);
      const filename = new TextDecoder().decode(uint8.slice(i+30, i+30+filenameLen));
      const dataStart = i + 30 + filenameLen + extraLen;
      if (filename === 'word/document.xml') {
        const compressedData = uint8.slice(dataStart, dataStart + compressedSize);
        let xmlBytes;
        if (compressionMethod === 0) {
          xmlBytes = compressedData;
        } else if (compressionMethod === 8) {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          writer.write(compressedData); writer.close();
          const chunks = [];
          while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          xmlBytes = new Uint8Array(total);
          let off = 0; for (const c of chunks) { xmlBytes.set(c, off); off += c.length; }
        } else throw new Error('Unsupported DOCX compression: ' + compressionMethod);
        const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);
        const texts = [];
        const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) texts.push(match[1]);
        return texts.join(' ').replace(/\s+/g, ' ').trim();
      }
      i = dataStart + Math.max(0, compressedSize);
    } else i++;
  }
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function QuestionUploader({ quizId, onCancel, onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const setFileAndReset = (f) => { setFile(f); setResult(null); setError(null); };

  const handleFileChange = (e) => { if (e.target.files?.[0]) setFileAndReset(e.target.files[0]); };
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) setFileAndReset(e.dataTransfer.files[0]);
  };

  const isImageFile = (f) => f?.type.startsWith('image/');
  const isDocxFile  = (f) => f?.name.toLowerCase().endsWith('.docx');
  const isDocFile   = (f) => f?.name.toLowerCase().endsWith('.doc');
  const isRtfFile   = (f) => f?.name.toLowerCase().endsWith('.rtf');
  const isTextFile  = (f) => f?.name.toLowerCase().match(/\.(txt|csv)$/);
  const isTextBased = (f) => isDocxFile(f) || isRtfFile(f) || isTextFile(f);

  const extractTextFromFile = async (f) => {
    if (isDocxFile(f)) {
      const text = await extractDocxText(f);
      if (!text) throw new Error('Could not read this Word document. Please save as PDF and try again.');
      return text;
    }
    if (isRtfFile(f) || isTextFile(f)) {
      const text = await f.text();
      return isRtfFile(f) ? extractRtfText(text) : text;
    }
    if (isDocFile(f)) throw new Error('Old .doc format not supported. Save as .docx or PDF first.');
    return null;
  };

  const UNIFIED_PROMPT = `You are an expert question extractor for Nigerian school exams.
Extract ALL questions from this document — both multiple-choice (Section A) and essay/structured (Section B).

━━━ QUESTION NUMBER RULE (CRITICAL) ━━━
- ALWAYS preserve the original question number exactly as it appears on the paper.
- Set "question_number" to the integer from the paper (e.g. 21, 22, 33).
- NEVER renumber or reorder questions. Output them in the exact order they appear.
- Do NOT strip the number — store it in "question_number", not in "text".

━━━ CLOZE / GAP-FILL / FILL-IN-THE-BLANK FORMAT ━━━
This is very common in Nigerian exams. Recognise it when you see:
  • A passage of text where numbered blanks appear (e.g. "Displaying __21__ on his neck, he walked through the __22__")
  • A separate answer table below listing options A B C D for each blank number

How to handle it — CRITICAL RULES:
- Each numbered blank = ONE separate MCQ question.
- question_number = the blank's original number (21, 22, 23 …)
- text = THE FULL PASSAGE exactly as written, with ALL blanks shown as __21__, __22__, __23__ etc.
  • Copy the ENTIRE passage for every question — do not cut or shorten it.
  • The student needs the full context to answer any single blank.
  • Label every blank with its number: __21__, __22__, __23__ so the student knows which one they are answering.
- options = ONLY the 4 choices (A, B, C, D) from the answer table for THAT specific blank number.
- correct_option_index = your best guess (0-based)
- type = "mcq"

Example — if the passage has blanks 21-23 and the answer table gives options for each:
  Question 21 → text: full passage with __21__ __22__ __23__ labelled → options: choices for blank 21
  Question 22 → text: same full passage with __21__ __22__ __23__ labelled → options: choices for blank 22
  Question 23 → text: same full passage with __21__ __22__ __23__ labelled → options: choices for blank 23

━━━ STANDARD MCQ FORMAT ━━━
- Questions with lettered options (A)(B)(C)(D) or A. B. C. D. or (a)(b)(c)(d)
- type = "mcq", keep options as clean text without the letter prefix

━━━ ESSAY / STRUCTURED FORMAT ━━━
- Open-ended questions, may have sub-parts (a)(b)(c) or (i)(ii)(iii)
- Keep ALL sub-parts together in one text block
- type = "essay"

━━━ DIAGRAM DETECTION ━━━
- Set "has_diagram": true if the question references or needs a figure, diagram, chart, graph, image, map, or any visual element.
- Examples: "Use the diagram below", "In the figure above", "Refer to the graph", "The circuit shown"
- Also true if a drawing/figure visually appears next to the question in the image.
- If text alone is sufficient, set "has_diagram": false.

━━━ MATH CONVERSION (apply to ALL text) ━━━
- Inline math: $x^2 + y = 5$
- Display math: $$\\frac{a}{b} = c$$
- Fractions: $\\frac{1}{2}$, surds: $\\sqrt{3}$, powers: $2^{x-1}$
- Logs: $\\log_{10}(x)$, trig: $\\sin\\theta$, Greek: $\\alpha$, $\\pi$
- Chemical: $H_2O$, $CO_2$

━━━ TABLE CONVERSION ━━━
- Convert any table (values, data, frequency) to HTML using this exact format:
  <table style="border-collapse:collapse;margin:8px 0"><thead><tr><th style="border:1px solid #333;padding:4px 8px">Header</th></tr></thead><tbody><tr><td style="border:1px solid #333;padding:4px 8px">Value</td></tr></tbody></table>
- Embed the HTML table directly inside the question text string.

━━━ GENERAL RULES ━━━
1. Extract ALL questions in document order — never skip any
2. For MCQ options: remove the letter prefix (A., B., (a)) from the option text itself
3. For Essay: keep sub-parts (a)(b)(i)(ii) inside the question text
4. Do NOT rephrase or modify question content

Return JSON with a "questions" array. Each item must have:
- "question_number": integer (original number from the paper)
- "type": "mcq" or "essay"
- "text": question text (no number prefix) with LaTeX where needed
- "has_diagram": true or false
- For mcq only: "options" (array of strings), "correct_option_index" (0-based, best guess)`;

  const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_number: { type: "number" },
            type: { type: "string", enum: ["mcq", "essay"] },
            text: { type: "string" },
            has_diagram: { type: "boolean" },
            options: { type: "array", items: { type: "string" } },
            correct_option_index: { type: "number" }
          },
          required: ["type", "text"]
        }
      }
    },
    required: ["questions"]
  };

  // ── Canvas crop helper ────────────────────────────────────────────────
  const cropAndUpload = async (objectUrl, bbox) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const PAD = 0.01; // 1% padding around the bbox
        const x = Math.max(0, (bbox.x - PAD) * img.naturalWidth);
        const y = Math.max(0, (bbox.y - PAD) * img.naturalHeight);
        const w = Math.min(img.naturalWidth  - x, (bbox.w + PAD * 2) * img.naturalWidth);
        const h = Math.min(img.naturalHeight - y, (bbox.h + PAD * 2) * img.naturalHeight);

        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);

        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(null); return; }
          try {
            const croppedFile = new File([blob], 'diagram.png', { type: 'image/png' });
            const { file_url } = await UploadFile({ file: croppedFile });
            resolve(file_url || null);
          } catch {
            resolve(null);
          }
        }, 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
  };

  const handleImport = async () => {
    if (!file) { setError("Please select a file to upload."); return; }
    setIsProcessing(true); setError(null); setResult(null); setStep(0);

    let response;
    let uploadedFileUrl = null;
    let objectUrl = null;
    try {
      if (isTextBased(file)) {
        setStep(0);
        const extractedText = await extractTextFromFile(file);
        setStep(2);
        response = await InvokeLLM({
          prompt: `${UNIFIED_PROMPT}\n\n--- DOCUMENT CONTENT ---\n${extractedText}\n--- END ---`,
          response_json_schema: RESPONSE_SCHEMA,
        });
      } else {
        setStep(0);
        objectUrl = URL.createObjectURL(file);
        const { file_url } = await UploadFile({ file });
        if (!file_url) throw new Error("File upload failed.");
        uploadedFileUrl = file_url;
        setStep(1); setStep(2); setStep(3);
        response = await InvokeLLM({
          prompt: UNIFIED_PROMPT,
          file_urls: [uploadedFileUrl],
          response_json_schema: RESPONSE_SCHEMA,
        });
      }

      const allQuestions = response?.questions;
      if (!allQuestions?.length) throw new Error("No questions found. Make sure the document contains readable questions.");

      const diagramQuestions = allQuestions.filter(q => q.has_diagram);

      // ── Step 2: Dedicated bbox call for image files ───────────────────
      // Ask AI to locate ONLY the visual region of each diagram question.
      // This focused call is far more accurate than embedding it in extraction.
      if (diagramQuestions.length > 0 && uploadedFileUrl && objectUrl) {
        setStep(4); // "Locating diagram regions..."

        const BBOX_SCHEMA = {
          type: "object",
          properties: {
            diagrams: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index:     { type: "number" },
                  x:         { type: "number" },
                  y:         { type: "number" },
                  w:         { type: "number" },
                  h:         { type: "number" },
                  not_found: { type: "boolean" }
                },
                required: ["index"]
              }
            }
          },
          required: ["diagrams"]
        };

        const bboxPrompt = `You are a precise visual region locator for exam papers.
The image contains exam questions. For each question below, locate the bounding box of ONLY its diagram/figure/drawing.

CRITICAL RULES:
- Return the bounding box of the VISUAL ELEMENT ONLY (the drawing, shape, graph, circuit, map, etc.)
- Do NOT include: question text, answer options (A B C D), question numbers
- The box must tightly fit just the diagram — not the whole question block
- x, y = top-left corner of diagram, w = width, h = height
- All values are fractions of the TOTAL image dimensions (0.0 to 1.0)
- If you genuinely cannot find a specific diagram, set not_found: true

Questions with diagrams (index matches array position):
${diagramQuestions.map((q, i) => `[${i}] "${q.text.slice(0, 120)}"`).join('\n')}

Return one entry per question in the "diagrams" array.`;

        try {
          const bboxResponse = await InvokeLLM({
            prompt: bboxPrompt,
            file_urls: [uploadedFileUrl],
            response_json_schema: BBOX_SCHEMA,
          });

          setStep(5); // "Cropping & uploading diagrams..."
          const bboxList = bboxResponse?.diagrams || [];

          await Promise.all(bboxList.map(async (entry) => {
            if (entry.not_found) return;
            const q = diagramQuestions[entry.index];
            if (!q) return;
            const { x, y, w, h } = entry;
            if (w > 0 && h > 0) {
              q._cropped_url = await cropAndUpload(objectUrl, { x, y, w, h });
            }
          }));
        } catch (bboxErr) {
          console.warn("Diagram bbox call failed, falling back to manual crop:", bboxErr);
        }
      }

      setStep(6);
      const mcqQuestions   = allQuestions.filter(q => q.type === 'mcq');
      const essayQuestions = allQuestions.filter(q => q.type === 'essay');
      const autoCropped    = diagramQuestions.filter(q => q._cropped_url).length;
      const needsManual    = diagramQuestions.filter(q => !q._cropped_url).length;

      const toCreate = [
        ...mcqQuestions.map(q => ({
          quiz_id: quizId,
          question_type: 'multiple_choice',
          section: 'A',
          text: q.text,
          options: q.options || [],
          correct_option_index: q.correct_option_index ?? 0,
          max_score: 1,
          ...(q.question_number != null ? { question_number: q.question_number } : {}),
          ...(q._cropped_url ? { image_url: q._cropped_url, needs_diagram: false }
                              : q.has_diagram ? { needs_diagram: true } : {}),
        })),
        ...essayQuestions.map(q => ({
          quiz_id: quizId,
          question_type: 'essay',
          section: 'B',
          text: q.text,
          max_score: 10,
          ...(q.question_number != null ? { question_number: q.question_number } : {}),
          ...(q._cropped_url ? { image_url: q._cropped_url, needs_diagram: false }
                              : q.has_diagram ? { needs_diagram: true } : {}),
        })),
      ];

      await Question.bulkCreate(toCreate);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setResult({ mcq: mcqQuestions.length, essay: essayQuestions.length, autoCropped, needsManual });
      setTimeout(onUploadComplete, 2500);
    } catch (e) {
      setError(e.message);
      console.error(e);
    }
    setIsProcessing(false);
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-8 h-8 text-blue-400" />;
    if (isImageFile(file)) return <Image className="w-8 h-8 text-green-500" />;
    if (isDocxFile(file) || isDocFile(file) || isRtfFile(file)) return <FileType className="w-8 h-8 text-emerald-500" />;
    return <FileText className="w-8 h-8 text-blue-500" />;
  };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="mb-8">
      <Card className="bg-blue-50/50 backdrop-blur-xl shadow-xl border border-blue-200/60">
        <CardHeader className="border-b border-blue-200/60">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-800">
              <Upload className="w-5 h-5" />
              Upload & Extract Questions (AI-Powered)
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}><X className="w-4 h-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-blue-700">
            Upload any document or image. The AI will automatically detect and categorise <strong>Section A (MCQ)</strong> and <strong>Section B (Essay)</strong> questions, and convert all math to LaTeX.
          </p>

          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "PDF", color: "bg-red-100 text-red-700" },
              { label: "Word (.docx)", color: "bg-blue-100 text-blue-700" },
              { label: "Images (JPG/PNG/WEBP)", color: "bg-green-100 text-green-700" },
              { label: "RTF / TXT", color: "bg-indigo-100 text-indigo-700" },
              { label: "MCQ + Essay ✓", color: "bg-emerald-100 text-emerald-700" },
              { label: "Math → LaTeX ✓", color: "bg-amber-100 text-amber-700" },
              { label: "Handwritten (OCR)", color: "bg-pink-100 text-pink-700" },
            ].map(({ label, color }) => (
              <span key={label} className={`px-2 py-1 rounded-full font-medium ${color}`}>{label}</span>
            ))}
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center bg-white transition-colors cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 hover:border-blue-400'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex justify-center mb-2">{getFileIcon()}</div>
            {file ? (
              <div>
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                {isDocFile(file) && <p className="text-xs text-amber-600 mt-1 font-medium">⚠ Old .doc — please save as .docx or PDF</p>}
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-600">Drag & drop or click to choose a file</p>
                <p className="text-xs text-slate-400 mt-1">PDF, Word, Images, RTF, TXT and more</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileChange} className="hidden" />
          </div>

          {isProcessing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              {EXTRACTION_STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm transition-all ${i < step ? 'text-green-600' : i === step ? 'text-blue-700 font-medium' : 'text-slate-400'}`}>
                  {i < step ? <CheckCircle className="w-4 h-4 shrink-0" /> : i === step ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />}
                  {s}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 text-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="p-3 bg-green-100 text-green-800 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <div className="text-sm font-medium space-y-1">
                <p>Extracted — <strong>{result.mcq}</strong> MCQ and <strong>{result.essay}</strong> Essay question{result.mcq + result.essay !== 1 ? 's' : ''}. Math converted to LaTeX.</p>
                {result.autoCropped > 0 && (
                  <p className="text-green-700">✓ {result.autoCropped} diagram{result.autoCropped !== 1 ? 's' : ''} automatically cropped and attached.</p>
                )}
                {result.needsManual > 0 && (
                  <p className="text-amber-700 font-semibold">⚠ {result.needsManual} question{result.needsManual !== 1 ? 's' : ''} still need a diagram — use the Crop &amp; Attach button on those cards.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-blue-200/60">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>Cancel</Button>
            <Button onClick={handleImport} disabled={isProcessing || !file || isDocFile(file)}>
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {isProcessing ? "Processing..." : "Extract Questions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
