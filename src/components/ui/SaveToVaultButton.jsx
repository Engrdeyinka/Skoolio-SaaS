import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { saveModuleToVault } from "@/lib/termVaultExport";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

const MODULE_LABELS = {
  financial:  "Financial records",
  gradebooks: "Gradebooks",
  exams:      "Exam questions",
  staff:      "Staff records",
  students:   "Student records",
};

/**
 * Saves one module's records to Google Drive Vault for the given term/year.
 * module: "financial" | "gradebooks" | "exams" | "staff" | "students"
 *
 * term/year are optional - if not provided (or empty) they fall back to the
 * current term/year from school settings, so the button works on every page.
 * On completion it shows a built-in confirmation dialog (does not rely on any
 * global toaster being mounted).
 */
export default function SaveToVaultButton({ module, term, year, size = "sm", className = "" }) {
  const { term: settingsTerm, year: settingsYear } = useSchoolSettings();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok: boolean, message: string }

  const effTerm = term || settingsTerm;
  const effYear = year || settingsYear;
  const label = MODULE_LABELS[module] || "Records";

  const handleSave = async () => {
    if (!effTerm || !effYear) {
      setResult({ ok: false, message: "Current term and year are not set. Please set them in Settings first." });
      return;
    }
    setSaving(true);
    try {
      const count = await saveModuleToVault(module, effTerm, effYear);
      if (typeof count === "number" && count === 0) {
        setResult({
          ok: false,
          message: `No ${label.toLowerCase()} were found for ${effTerm} ${effYear}, so nothing was saved.`,
        });
      } else {
        const docs = typeof count === "number" ? `${count} document${count === 1 ? "" : "s"}` : "Records";
        setResult({
          ok: true,
          message: `${docs} for ${label.toLowerCase()} (${effTerm}, ${effYear}) ${count === 1 ? "was" : "were"} saved to the Vault as a new version.`,
        });
      }
    } catch (e) {
      setResult({ ok: false, message: e?.message || "Failed to save to Vault. Make sure Google Drive is connected in Settings." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={handleSave}
        disabled={saving}
        className={`gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300 ${className}`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
        {saving ? "Saving..." : "Save to Vault"}
      </Button>

      {result && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {result.ok ? (
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            ) : (
              <XCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
            )}
            <h3 className="mb-1 text-lg font-bold text-slate-900">
              {result.ok ? "Saved to Vault" : "Couldn't save"}
            </h3>
            <p className="mb-5 text-sm text-slate-600">{result.message}</p>
            <Button
              onClick={() => setResult(null)}
              className={result.ok ? "w-full bg-emerald-600 hover:bg-emerald-700" : "w-full bg-slate-800 hover:bg-slate-900"}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
