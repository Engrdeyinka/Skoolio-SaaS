import React from "react";
import { Sparkles } from "lucide-react";
import { getDailyMotivation } from "@/lib/dailyMotivation";

const ROLE_TONES = {
  admin: {
    wrap: "border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-white",
    icon: "bg-emerald-100 text-emerald-700",
    eyebrow: "text-emerald-700",
  },
  super_admin: {
    wrap: "border-blue-200/70 bg-gradient-to-r from-blue-50 to-white",
    icon: "bg-blue-100 text-blue-700",
    eyebrow: "text-blue-700",
  },
  teacher: {
    wrap: "border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-white",
    icon: "bg-emerald-100 text-emerald-700",
    eyebrow: "text-emerald-700",
  },
  student: {
    wrap: "border-amber-200/70 bg-gradient-to-r from-amber-50 to-white",
    icon: "bg-amber-100 text-amber-700",
    eyebrow: "text-amber-700",
  },
};

const ROLE_LABELS = {
  admin: "Today's Leadership Note",
  super_admin: "Leadership Note",
  teacher: "Daily Motivation",
  student: "Daily Motivation",
};

export default function DailyMotivationQuote({ role, className = "" }) {
  const motivation = getDailyMotivation(role);
  const tone = ROLE_TONES[motivation.role] || ROLE_TONES.admin;
  const label = ROLE_LABELS[motivation.role] || "Daily Motivation";

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${tone.wrap} ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tone.eyebrow}`}>{label}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900 md:text-[15px]">
            "{motivation.quote}"
          </p>
          {motivation.author && (
            <p className="mt-1 text-xs text-slate-500 italic">— {motivation.author}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {motivation.focus}
          </p>
        </div>
      </div>
    </div>
  );
}
