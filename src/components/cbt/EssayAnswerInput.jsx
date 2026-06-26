import React, { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import MathRenderer from './MathRenderer';
import { Camera, X } from 'lucide-react';

// ── Math symbol toolbar ────────────────────────────────────────────────────────
// Each entry: { label, before, after?, tip? }  OR  { separator: true }
// "before" is inserted before selected text; "after" is inserted after selected text.
// If nothing is selected, cursor lands between before and after.
const SYMBOLS = [
  // Unicode operators — inserted as plain characters
  { label: '×',   before: '×',          tip: 'Multiply' },
  { label: '÷',   before: '÷',          tip: 'Divide' },
  { label: '±',   before: '±',          tip: 'Plus/minus' },
  { label: '≠',   before: '≠',          tip: 'Not equal' },
  { label: '≤',   before: '≤',          tip: 'Less or equal' },
  { label: '≥',   before: '≥',          tip: 'Greater or equal' },
  { label: '≈',   before: '≈',          tip: 'Approximately' },
  { label: 'π',   before: 'π',          tip: 'Pi' },
  { label: '∞',   before: '∞',          tip: 'Infinity' },
  { label: 'α',   before: 'α',          tip: 'Alpha' },
  { label: 'β',   before: 'β',          tip: 'Beta' },
  { label: 'θ',   before: 'θ',          tip: 'Theta' },
  { separator: true },
  // LaTeX snippets — wrap the selection (or place cursor inside {})
  { label: '√',   before: '$\\sqrt{',   after: '}$',    tip: 'Square root  (select text first to wrap it)' },
  { label: '∛',   before: '$\\sqrt[3]{',after: '}$',    tip: 'Cube root' },
  { label: 'a/b', before: '$\\frac{',   after: '}{}$',  tip: 'Fraction  (select numerator first)' },
  { label: 'xⁿ',  before: '^{',         after: '}',     tip: 'Power / exponent  (select base first)' },
  { label: 'x²',  before: '^{2}',       after: '',      tip: 'Squared' },
  { label: 'x³',  before: '^{3}',       after: '',      tip: 'Cubed' },
  { label: '|x|', before: '|',          after: '|',     tip: 'Absolute value' },
  { label: 'sin', before: 'sin ',       tip: 'Sine' },
  { label: 'cos', before: 'cos ',       tip: 'Cosine' },
  { label: 'tan', before: 'tan ',       tip: 'Tangent' },
  { label: 'log', before: 'log ',       tip: 'Logarithm' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Parse stored value → { textPart, photoPart } (backward-compatible with plain strings) */
function parseValue(v) {
  if (v === null || v === undefined || v === '') return { textPart: '', photoPart: null };
  if (typeof v === 'object') return { textPart: v.text || '', photoPart: v.photo || null };
  try {
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { textPart: parsed.text || '', photoPart: parsed.photo || null };
    }
  } catch {}
  return { textPart: String(v), photoPart: null };
}

/** Compress an image file to a JPEG data-URL (max 900 px wide/tall, 75% quality) */
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function EssayAnswerInput({ questionId, value, onChange }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const { textPart: initText, photoPart: initPhoto } = parseValue(value);
  const [textPart,  setTextPart]  = useState(initText);
  const [photoPart, setPhotoPart] = useState(initPhoto);

  // Reset local state whenever the question changes
  useEffect(() => {
    const { textPart: t, photoPart: p } = parseValue(value);
    setTextPart(t);
    setPhotoPart(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Push combined value up to parent
  const save = (text, photo) => {
    if (photo) {
      onChange(questionId, JSON.stringify({ text, photo }));
    } else {
      onChange(questionId, text);
    }
  };

  const handleTextChange = (e) => {
    setTextPart(e.target.value);
    save(e.target.value, photoPart);
  };

  // Insert a symbol at the textarea cursor / wrap the current selection
  const insertAtCursor = (before, after = '') => {
    const ta = textareaRef.current;
    const start = ta ? (ta.selectionStart ?? textPart.length) : textPart.length;
    const end   = ta ? (ta.selectionEnd   ?? textPart.length) : textPart.length;
    const selected = textPart.slice(start, end);
    const newText  = textPart.slice(0, start) + before + selected + after + textPart.slice(end);
    setTextPart(newText);
    save(newText, photoPart);
    // Restore cursor: if something was selected → place after full insertion; else → between before/after
    requestAnimationFrame(() => {
      if (!ta) return;
      const pos = selected.length > 0
        ? start + before.length + selected.length + after.length
        : start + before.length;
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
    });
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    setPhotoPart(dataUrl);
    save(textPart, dataUrl);
    e.target.value = ''; // allow re-selecting same file
  };

  const removePhoto = () => {
    setPhotoPart(null);
    save(textPart, null);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b text-xs text-emerald-700 font-medium">
        <span>Answer Editor</span>
        <span className="text-emerald-400">
          — type normally · click a symbol to insert · select text then click √ or a/b to wrap it
        </span>
      </div>

      {/* ── Math keyboard ── */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-slate-50 border-b">
        {SYMBOLS.map((sym, i) =>
          sym.separator ? (
            <div key={i} className="w-px self-stretch bg-slate-300 mx-1" />
          ) : (
            <button
              key={i}
              type="button"
              title={sym.tip || sym.label}
              onClick={() => insertAtCursor(sym.before, sym.after || '')}
              className="px-2 py-0.5 text-sm font-medium rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 transition-colors min-w-[2rem] leading-6"
            >
              {sym.label}
            </button>
          )
        )}
      </div>

      {/* ── Dual-panel editor ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        {/* Input */}
        <div className="p-2">
          <p className="text-xs text-slate-400 mb-1 px-1">Input</p>
          <Textarea
            ref={textareaRef}
            value={textPart}
            onChange={handleTextChange}
            placeholder={"Type your answer here...\n\nTips:\n• Click a symbol button above to insert it\n• Select text then click √ or a/b to wrap it\n• Or upload a photo of your handwritten working below"}
            className="min-h-[160px] border-0 focus-visible:ring-0 resize-none text-sm"
          />
        </div>
        {/* Preview */}
        <div className="p-3 bg-white min-h-[160px]">
          <p className="text-xs text-slate-400 mb-2">Preview</p>
          {textPart ? (
            <div className="text-base leading-relaxed">
              <MathRenderer text={textPart} />
            </div>
          ) : (
            <p className="text-slate-300 text-sm italic">Your answer will appear here…</p>
          )}
        </div>
      </div>

      {/* ── Photo upload ── */}
      <div className="border-t p-3 bg-slate-50 flex flex-col gap-2">
        {photoPart ? (
          <div className="flex items-start gap-3">
            <div className="relative inline-block">
              <img
                src={photoPart}
                alt="Uploaded working"
                className="max-h-48 rounded border border-slate-200 object-contain"
              />
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-slate-500 hover:text-emerald-600 underline"
            >
              Change photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors w-fit"
          >
            <Camera className="w-4 h-4" />
            Upload photo of your working
            <span className="text-xs text-slate-400">(optional)</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </div>
    </div>
  );
}
