import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCheck, Save } from "lucide-react";
import { DAYS, PERIODS, PERIOD_START_TIMES as PERIOD_TIMES } from "./constants";

const emptyForm = () => ({
  employment_type: "full_time",
  unavailable_days: [],
  unavailable_periods: [],
  unavailable_periods_by_day: {},
  max_periods_per_day: 6,
  max_periods_per_week: 30,
});

export default function TeacherConstraintPanel({ teachers, availabilities, onSave }) {
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saved, setSaved] = useState(false);

  const selectTeacher = (teacher) => {
    setSelected(teacher);
    setSaved(false);
    const existing = availabilities.find(a => a.teacher_id === teacher.id);
    setForm({
      employment_type: existing?.employment_type || "full_time",
      unavailable_days: existing?.unavailable_days || [],
      unavailable_periods: existing?.unavailable_periods || [],
      unavailable_periods_by_day: existing?.unavailable_periods_by_day || {},
      max_periods_per_day: existing?.max_periods_per_day ?? 6,
      max_periods_per_week: existing?.max_periods_per_week ?? 30,
    });
  };

  const toggleDay = (day) => setForm(prev => ({
    ...prev,
    unavailable_days: prev.unavailable_days.includes(day)
      ? prev.unavailable_days.filter(d => d !== day)
      : [...prev.unavailable_days, day]
  }));

  const togglePeriod = (p) => setForm(prev => ({
    ...prev,
    unavailable_periods: prev.unavailable_periods.includes(p)
      ? prev.unavailable_periods.filter(x => x !== p)
      : [...prev.unavailable_periods, p]
  }));

  const togglePeriodForDay = (day, p) => setForm(prev => {
    const current = prev.unavailable_periods_by_day[day] || [];
    const updated = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    return {
      ...prev,
      unavailable_periods_by_day: { ...prev.unavailable_periods_by_day, [day]: updated },
    };
  });

  const handleSave = async () => {
    await onSave(selected, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isPartTime = form.employment_type === "part_time";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-lg">Teacher Availability & Constraints</h2>
        </div>

        <div>
          <Label className="text-xs text-slate-500 mb-2 block uppercase tracking-wide">Select Teacher</Label>
          <div className="flex flex-wrap gap-2">
            {teachers.map(t => {
              const hasAvail = availabilities.some(a => a.teacher_id === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => selectTeacher(t)}
                  className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                    selected?.id === t.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                  }`}
                >
                  {t.first_name} {t.last_name}
                  {hasAvail && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
                </button>
              );
            })}
            {teachers.length === 0 && (
              <p className="text-sm text-slate-400">No teachers added yet.</p>
            )}
          </div>
        </div>

        {selected && (
          <div className="mt-6 border-t pt-6 space-y-5">
            <h3 className="font-semibold text-slate-700 text-base">
              Constraints for {selected.first_name} {selected.last_name}
            </h3>

            {/* Employment type toggle */}
            <div>
              <Label className="text-xs text-slate-500 mb-2 block uppercase tracking-wide">Employment Type</Label>
              <div className="flex gap-2">
                {["full_time", "part_time"].map(type => (
                  <button
                    key={type}
                    onClick={() => setForm(prev => ({ ...prev, employment_type: type }))}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      form.employment_type === type
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {type === "full_time" ? "Full Time" : "Part Time"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isPartTime
                  ? "Select which periods the teacher is unavailable on each specific day."
                  : "Teacher is available all day, every day. You can still mark globally unavailable days or periods below."}
              </p>
            </div>

            {!isPartTime ? (
              <>
                {/* Full time: global unavailable days */}
                <div>
                  <Label className="text-xs text-slate-500 mb-2 block uppercase tracking-wide">Unavailable Days</Label>
                  <div className="flex gap-3 flex-wrap">
                    {DAYS.map(d => (
                      <label key={d} className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-lg border hover:bg-slate-50 transition-colors">
                        <Checkbox checked={form.unavailable_days.includes(d)} onCheckedChange={() => toggleDay(d)} />
                        {d}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Full time: global unavailable periods */}
                <div>
                  <Label className="text-xs text-slate-500 mb-2 block uppercase tracking-wide">Unavailable Periods</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PERIODS.map(p => (
                      <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer px-3 py-2 rounded-lg border hover:bg-slate-50 transition-colors">
                        <Checkbox checked={form.unavailable_periods.includes(p)} onCheckedChange={() => togglePeriod(p)} />
                        <div>
                          <div className="font-medium">P{p}</div>
                          <div className="text-[10px] text-slate-400">{PERIOD_TIMES[p]}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Part time: per-day period availability */
              <div className="space-y-3">
                <Label className="text-xs text-slate-500 mb-1 block uppercase tracking-wide">Unavailable Periods Per Day</Label>
                {DAYS.map(day => {
                  const dayUnavail = form.unavailable_periods_by_day[day] || [];
                  return (
                    <div key={day} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <div className="text-sm font-semibold text-slate-700 mb-2">{day}</div>
                      <div className="flex gap-2 flex-wrap">
                        {PERIODS.map(p => (
                          <label key={p} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1.5 rounded-lg border transition-colors ${
                            dayUnavail.includes(p) ? "bg-red-50 border-red-300 text-red-700" : "bg-white border-slate-200 hover:bg-slate-100"
                          }`}>
                            <Checkbox
                              checked={dayUnavail.includes(p)}
                              onCheckedChange={() => togglePeriodForDay(day, p)}
                            />
                            <div>
                              <div className="font-medium">P{p}</div>
                              <div className="text-[10px] text-slate-400">{PERIOD_TIMES[p]}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-6 flex-wrap">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Max periods per day</Label>
                <Input
                  type="number" min={1} max={8}
                  value={form.max_periods_per_day}
                  onChange={e => setForm(prev => ({ ...prev, max_periods_per_day: Number(e.target.value) }))}
                  className="w-24 h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Max periods per week</Label>
                <Input
                  type="number" min={1} max={40}
                  value={form.max_periods_per_week}
                  onChange={e => setForm(prev => ({ ...prev, max_periods_per_week: Number(e.target.value) }))}
                  className="w-24 h-9"
                />
              </div>
            </div>

            <Button size="sm" onClick={handleSave} className={saved ? "bg-green-600 hover:bg-green-700" : ""}>
              <Save className="w-4 h-4 mr-1.5" />
              {saved ? "Saved!" : "Save Constraints"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}