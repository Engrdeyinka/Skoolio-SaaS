import React from "react";
import { X, Ban, Lock, Unlock } from "lucide-react";
import { PERIOD_TIMES as DEFAULT_PERIOD_TIMES } from "./constants";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function getSlot(slots, day, period) {
  return slots.find(s => s.day === day && s.period === period) || null;
}

function getSlots(slots, day, period) {
  return slots.filter(s => s.day === day && s.period === period);
}

function getTeacherViolations(teacherId, slot, availabilities, allSlots, label) {
  if (!teacherId) return [];
  const avail = availabilities.find(a => a.teacher_id === teacherId);
  const issues = [];
  if (avail) {
    // Full-time: check flat unavailable_days and unavailable_periods
    if (avail.employment_type !== "part_time") {
      if (avail.unavailable_days?.includes(slot.day)) issues.push(`${label}: unavailable on this day`);
      if (avail.unavailable_periods?.includes(slot.period)) issues.push(`${label}: unavailable at this period`);
    } else {
      // Part-time: check per-day period availability
      const periodsForDay = avail.unavailable_periods_by_day?.[slot.day] || [];
      if (periodsForDay.includes(slot.period)) issues.push(`${label}: unavailable at this period on ${slot.day}`);
    }

    const teachingSlots = allSlots.filter(s => !s.is_blocked && (s.teacher_id === teacherId || s.second_teacher_id === teacherId));
    const dayCount = teachingSlots.filter(s => s.day === slot.day).length;
    const maxDay = avail.max_periods_per_day ?? 8;
    if (dayCount > maxDay) issues.push(`${label}: exceeds max ${maxDay} periods/day`);

    const weekCount = teachingSlots.length;
    const maxWeek = avail.max_periods_per_week ?? 40;
    if (weekCount > maxWeek) issues.push(`${label}: exceeds max ${maxWeek} periods/week`);
  }
  const clashes = allSlots.filter(
    s => s.id !== slot.id && !s.is_blocked && (s.teacher_id === teacherId || s.second_teacher_id === teacherId) && s.day === slot.day && s.period === slot.period
  );
  if (clashes.length > 0) issues.push(`${label}: double-booked (also in ${clashes.map(c => c.grade).join(", ")})`);
  return issues;
}

function getViolations(slot, availabilities, allSlots) {
  if (slot.is_blocked) return [];
  const issues = [
    ...getTeacherViolations(slot.teacher_id, slot, availabilities, allSlots, "Teacher 1"),
    ...(slot.second_teacher_id ? getTeacherViolations(slot.second_teacher_id, slot, availabilities, allSlots, "Teacher 2") : []),
  ];
  return issues;
}

// Subject colour palette
const SUBJECT_COLORS = [
  "bg-blue-50 border-blue-200 text-blue-800",
  "bg-emerald-50 border-emerald-200 text-emerald-800",
  "bg-emerald-50 border-emerald-200 text-emerald-800",
  "bg-amber-50 border-amber-200 text-amber-800",
  "bg-pink-50 border-pink-200 text-pink-800",
  "bg-cyan-50 border-cyan-200 text-cyan-800",
  "bg-orange-50 border-orange-200 text-orange-800",
  "bg-indigo-50 border-indigo-200 text-indigo-800",
  "bg-teal-50 border-teal-200 text-teal-800",
  "bg-rose-50 border-rose-200 text-rose-800",
];

function buildColorMap(slots) {
  const map = {};
  let idx = 0;
  slots.forEach(s => {
    if (!s.subject_name) return;
    const parts = s.subject_name.includes("/") ? s.subject_name.split("/").map(p => p.trim()) : [s.subject_name];
    parts.forEach(name => {
      if (!map[name]) {
        map[name] = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
        idx++;
      }
    });
  });
  return map;
}

export default function TimetableGrid({ slots, allSlots, grade, term, academicYear, teachers, availabilities, onSlotClick, onClearSlot, onToggleLock, periodTimes = DEFAULT_PERIOD_TIMES, breakTime = "12:00 – 12:30" }) {
  const colorMap = buildColorMap(slots);

  const getTeacherName = (id) => {
    const t = teachers.find(t => t.id === id);
    return t ? `${t.first_name} ${t.last_name}` : "";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
      {/* Print header */}
      <div className="hidden print:block px-6 py-3 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">{grade} — {term} {academicYear} Timetable</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="w-28 px-3 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-600">
                Period / Time
              </th>
              {DAYS.map(d => (
                <th key={d} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider border-r border-slate-600 min-w-[140px]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period, idx) => {
              // Insert Long Break row before period 5
              const rows = [];
              if (period === 5) {
                rows.push(
                  <tr key="break" className="bg-amber-50">
                    <td className="px-3 py-2 border-r border-b border-slate-200">
                      <div className="font-bold text-amber-700 text-xs uppercase tracking-wide">Long Break</div>
                      <div className="text-[10px] text-amber-500 font-medium">{breakTime}</div>
                    </td>
                    {DAYS.map(day => (
                      <td key={day} className="px-3 py-2 border-r border-b border-amber-200 text-center">
                        <div className="text-amber-500 text-xs font-semibold italic">— Break —</div>
                      </td>
                    ))}
                  </tr>
                );
              }

              rows.push(
                <tr key={period} className={`${period % 2 === 0 ? "bg-slate-50/50" : "bg-white"} hover:bg-blue-50/30 transition-colors`}>
                  <td className="px-3 py-2 border-r border-b border-slate-200 bg-slate-50">
                    <div className="font-bold text-slate-800 text-sm">P{period}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{periodTimes[period]}</div>
                  </td>
                  {DAYS.map(day => {
                   const cellSlots = getSlots(slots, day, period);
                   const slot = cellSlots[0] || null; // primary slot (for blocked/empty checks)

                   return (
                     <td key={day} className="px-1.5 py-1.5 border-r border-b border-slate-200 align-top">
                       {cellSlots.length === 0 ? (
                         <div
                           className="min-h-[52px] rounded-lg border border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all text-slate-300 hover:text-blue-400 text-lg font-light"
                           onClick={() => onSlotClick(day, period, null)}
                         >
                           +
                         </div>
                       ) : slot?.is_blocked ? (
                         <div
                           className="relative rounded-lg px-2 py-2 text-xs cursor-pointer group/cell bg-slate-100 border border-dashed border-slate-400 hover:bg-slate-200 transition-all min-h-[52px]"
                           onClick={() => onSlotClick(day, period, slot)}
                         >
                           <button
                             className="absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                             onClick={e => { e.stopPropagation(); onClearSlot(slot); }}
                           >
                             <X className="w-3 h-3" />
                           </button>
                           <div className="flex items-center gap-1 text-slate-600 font-semibold mt-1">
                             <Ban className="w-3 h-3 flex-shrink-0" />
                             <span className="truncate">{slot.block_label || "Blocked"}</span>
                           </div>
                         </div>
                       ) : cellSlots.length >= 2 ? (
                         // Paired subjects (Science/Art split)
                         <div className="space-y-0.5 min-h-[52px]">
                           {cellSlots.map((s, si) => {
                             const violations = getViolations(s, availabilities, allSlots);
                             const colorClass = s.subject_name ? (colorMap[s.subject_name] || SUBJECT_COLORS[si % SUBJECT_COLORS.length]) : "";
                             return (
                               <div
                                 key={s.id || si}
                                 className={`relative rounded px-2 py-1.5 text-xs cursor-pointer group/cell border transition-all ${violations.length > 0 ? "bg-red-50 border-red-300" : colorClass} ${s.is_locked ? "ring-1 ring-amber-400" : ""}`}
                                 onClick={() => onSlotClick(day, period, s)}
                                 title={violations.join("\n")}
                               >
                                 <div className="flex items-start justify-between gap-0.5">
                                   <div className="font-bold text-xs leading-tight">{s.subject_name}</div>
                                   <button
                                     onClick={e => { e.stopPropagation(); onClearSlot(s); }}
                                     className="p-0.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover/cell:opacity-100"
                                   >
                                     <X className="w-2.5 h-2.5" />
                                   </button>
                                 </div>
                                 {s.teacher_id && (
                                   <div className="text-[10px] opacity-70 truncate">{getTeacherName(s.teacher_id)}</div>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                       ) : (
                         // Single subject (may be a combined "Sub1/Sub2" period)
                         (() => {
                           const isCombined = slot.subject_name?.includes("/");
                           if (isCombined) {
                             const [sub1, sub2] = slot.subject_name.split("/").map(s => s.trim());
                             const color1 = colorMap[sub1] || SUBJECT_COLORS[0];
                             const color2 = colorMap[sub2] || SUBJECT_COLORS[1];
                             const v1 = getTeacherViolations(slot.teacher_id, slot, availabilities, allSlots, sub1);
                             const v2 = getTeacherViolations(slot.second_teacher_id, slot, availabilities, allSlots, sub2);
                             const parts = [
                               { subj: sub1, tid: slot.teacher_id, color: color1, violations: v1 },
                               { subj: sub2, tid: slot.second_teacher_id || "", color: color2, violations: v2 },
                             ];
                             return (
                               <div className="space-y-0.5 min-h-[52px]">
                                 {parts.map((p, pi) => (
                                   <div
                                     key={pi}
                                     className={`relative rounded px-2 py-1.5 text-xs cursor-pointer group/cell border transition-all ${p.violations.length > 0 ? "bg-red-50 border-red-300" : p.color} ${pi === 0 && slot.is_locked ? "ring-1 ring-amber-400" : ""}`}
                                     onClick={() => onSlotClick(day, period, slot)}
                                     title={p.violations.join("\n")}
                                   >
                                     <div className="flex items-start justify-between gap-0.5">
                                       <div className={`font-bold text-xs leading-tight ${p.violations.length > 0 ? "text-red-700" : ""}`}>{p.subj}</div>
                                       {pi === 0 && (
                                         <button
                                           onClick={e => { e.stopPropagation(); onClearSlot(slot); }}
                                           className="p-0.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover/cell:opacity-100"
                                         >
                                           <X className="w-2.5 h-2.5" />
                                         </button>
                                       )}
                                     </div>
                                     {p.tid && (
                                       <div className={`text-[10px] truncate ${p.violations.length > 0 ? "text-red-500" : "opacity-70"}`}>{getTeacherName(p.tid)}</div>
                                     )}
                                     {p.violations.length > 0 && <div className="text-[10px] text-red-600 font-bold">⚠ Conflict</div>}
                                   </div>
                                 ))}
                               </div>
                             );
                           }

                           const violations = getViolations(slot, availabilities, allSlots);
                           const hasViolation = violations.length > 0;
                           const colorClass = slot.subject_name ? (colorMap[slot.subject_name] || SUBJECT_COLORS[0]) : "";
                           return (
                             <div
                               className={`relative rounded-lg px-2 py-2 text-xs cursor-pointer group/cell transition-all min-h-[52px] border ${hasViolation ? "bg-red-50 border-red-300" : colorClass} ${slot.is_locked ? "ring-1 ring-offset-0 ring-amber-400" : ""}`}
                               onClick={() => onSlotClick(day, period, slot)}
                               title={violations.join("\n")}
                             >
                               <div className="flex items-start justify-between gap-0.5">
                                 <div className={`font-bold text-xs leading-tight ${hasViolation ? "text-red-700" : ""}`}>
                                   {slot.subject_name}
                                 </div>
                                 <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                   <button
                                     onClick={e => { e.stopPropagation(); onToggleLock(slot); }}
                                     className={`p-0.5 rounded ${slot.is_locked ? "text-amber-500 hover:text-amber-700" : "text-slate-300 hover:text-amber-500"}`}
                                   >
                                     {slot.is_locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                                   </button>
                                   <button
                                     onClick={e => { e.stopPropagation(); onClearSlot(slot); }}
                                     className="p-0.5 rounded text-slate-300 hover:text-red-500"
                                   >
                                     <X className="w-2.5 h-2.5" />
                                   </button>
                                 </div>
                               </div>
                               {slot.teacher_id && (
                                 <div className={`text-[10px] mt-1 ${hasViolation ? "text-red-500" : "opacity-70"} truncate`}>
                                   {getTeacherName(slot.teacher_id)}
                                 </div>
                               )}
                               {hasViolation && <div className="text-[10px] text-red-600 mt-0.5 font-bold">⚠ Conflict</div>}
                               {slot.is_locked && <div className="absolute bottom-1 right-1"><Lock className="w-2.5 h-2.5 text-amber-400" /></div>}
                             </div>
                           );
                         })()
                       )}
                     </td>
                   );
                  })}
                </tr>
              );

              return rows;
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-3 items-center print:hidden">
        <span className="text-xs text-slate-400 font-medium">Legend:</span>
        {Object.entries(colorMap).slice(0, 6).map(([subj, cls]) => (
          <span key={subj} className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{subj}</span>
        ))}
        <span className="text-xs px-2 py-0.5 rounded border bg-slate-100 border-slate-300 text-slate-600 flex items-center gap-1">
          <Ban className="w-3 h-3" /> Blocked
        </span>
        <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-300 text-amber-700 flex items-center gap-1">
          <Lock className="w-3 h-3" /> Locked
        </span>
        <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">Long Break</span>
      </div>
    </div>
  );
}