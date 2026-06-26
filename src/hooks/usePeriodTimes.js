import { useState, useCallback, useEffect } from "react";
import { PERIOD_TIMES as DEFAULT_TIMES } from "@/components/timetable/constants";
import { loadSchoolSetting, saveSchoolSetting } from "@/lib/schoolSettingUtils";

export const PERIOD_TIMES_STORAGE_KEY = "tunmise_period_times_v1";
export const BREAK_TIME_STORAGE_KEY   = "tunmise_break_time_v1";
export const DEFAULT_BREAK_TIME       = "12:00 – 12:30";

// ── localStorage cache helpers (fast load before DB responds) ────────────────
function loadTimesFromCache() {
  try {
    const raw = localStorage.getItem(PERIOD_TIMES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length >= 8) return parsed;
    }
  } catch {}
  return null;
}
function loadBreakFromCache() {
  try { return localStorage.getItem(BREAK_TIME_STORAGE_KEY) || null; } catch { return null; }
}
function cacheTimesToStorage(times) {
  try { localStorage.setItem(PERIOD_TIMES_STORAGE_KEY, JSON.stringify(times)); } catch {}
}
function cacheBreakToStorage(brk) {
  try { localStorage.setItem(BREAK_TIME_STORAGE_KEY, brk); } catch {}
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePeriodTimes() {
  const [periodTimes, setPeriodTimes] = useState(
    () => loadTimesFromCache() || { ...DEFAULT_TIMES }
  );
  const [breakTime, setBreakTimeState] = useState(
    () => loadBreakFromCache() || DEFAULT_BREAK_TIME
  );

  // On mount: sync from DB (overrides cache with authoritative server value)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dbTimes, dbBreak] = await Promise.all([
          loadSchoolSetting("period_times"),
          loadSchoolSetting("break_time"),
        ]);
        if (cancelled) return;
        if (dbTimes && typeof dbTimes === "object" && Object.keys(dbTimes).length >= 8) {
          setPeriodTimes(dbTimes);
          cacheTimesToStorage(dbTimes);
        }
        if (dbBreak && typeof dbBreak === "string") {
          setBreakTimeState(dbBreak);
          cacheBreakToStorage(dbBreak);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const savePeriodTimes = useCallback(async (newTimes) => {
    setPeriodTimes(newTimes);
    cacheTimesToStorage(newTimes);
    await saveSchoolSetting("period_times", newTimes);
  }, []);

  const saveBreakTime = useCallback(async (newBreak) => {
    setBreakTimeState(newBreak);
    cacheBreakToStorage(newBreak);
    await saveSchoolSetting("break_time", newBreak);
  }, []);

  const resetPeriodTimes = useCallback(async () => {
    setPeriodTimes({ ...DEFAULT_TIMES });
    setBreakTimeState(DEFAULT_BREAK_TIME);
    try {
      localStorage.removeItem(PERIOD_TIMES_STORAGE_KEY);
      localStorage.removeItem(BREAK_TIME_STORAGE_KEY);
    } catch {}
    await saveSchoolSetting("period_times", { ...DEFAULT_TIMES });
    await saveSchoolSetting("break_time", DEFAULT_BREAK_TIME);
  }, []);

  return { periodTimes, breakTime, savePeriodTimes, saveBreakTime, resetPeriodTimes };
}
