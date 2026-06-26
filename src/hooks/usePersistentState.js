import { useState, useEffect } from "react";

/**
 * Like useState, but persists to sessionStorage so the value survives
 * in-session navigation (page switches inside the SPA).
 *
 * @param {string} key           - Unique key for sessionStorage (use page-prefixed names, e.g. "attendance_tab")
 * @param {*}      defaultValue  - Initial value when nothing is stored yet
 */
export function usePersistentState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable (private mode, quota exceeded, etc.) — fail silently
    }
  }, [key, state]);

  return [state, setState];
}
