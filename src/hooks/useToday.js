import { useEffect, useState } from "react";
import { getLagosDateString } from "@/lib/timezone";

/**
 * Returns today's date in yyyy-mm-dd form using Lagos time, and re-renders
 * consumers when the Lagos calendar day changes.
 */
export function useToday() {
  const [today, setToday] = useState(() => getLagosDateString());

  useEffect(() => {
    const syncToday = () => {
      const fresh = getLagosDateString();
      setToday((prev) => (prev === fresh ? prev : fresh));
    };

    const intervalId = setInterval(syncToday, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      syncToday();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return today;
}
