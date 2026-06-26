import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { AuditLog } from "@/entities/all";

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const HEARTBEAT_FLUSH_MS = 5 * 60 * 1000;
const ACTIVE_GRACE_MS = 75 * 1000;

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function useAppUsageTracker(currentUser) {
  const location = useLocation();
  const sessionIdRef = useRef(null);
  const sessionStartMsRef = useRef(0);
  const lastInteractionMsRef = useRef(0);
  const lastFlushMsRef = useRef(0);
  const totalActiveSecondsRef = useRef(0);
  const pendingActiveSecondsRef = useRef(0);
  const lastPageRef = useRef("");
  const sessionEndedRef = useRef(false);

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    const actorName = currentUser.full_name || currentUser.email || "Unknown user";
    const actorRole = currentUser.school_role || "unknown";
    const sessionId = `${currentUser.id}:${Date.now()}`;

    sessionIdRef.current = sessionId;
    sessionStartMsRef.current = Date.now();
    lastInteractionMsRef.current = Date.now();
    lastFlushMsRef.current = Date.now();
    totalActiveSecondsRef.current = 0;
    pendingActiveSecondsRef.current = 0;
    lastPageRef.current = location.pathname || "/";
    sessionEndedRef.current = false;

    const logUsage = async (action, summary, details = {}) => {
      await AuditLog.log({
        action,
        entityType: "app_usage",
        entityId: sessionIdRef.current,
        performedBy: actorName,
        summary,
        details: {
          module: "app_usage",
          session_id: sessionIdRef.current,
          actor_id: currentUser.id,
          actor_role: actorRole,
          page: lastPageRef.current || "/",
          ...details,
        },
      });
    };

    const flushHeartbeat = () => {
      const now = Date.now();
      const activeDelta = toSafeNumber(pendingActiveSecondsRef.current);
      if (activeDelta <= 0) {
        lastFlushMsRef.current = now;
        return;
      }

      pendingActiveSecondsRef.current = 0;
      lastFlushMsRef.current = now;

      logUsage("updated", "Session heartbeat", {
        usage_type: "session_heartbeat",
        active_seconds_delta: activeDelta,
        total_active_seconds: toSafeNumber(totalActiveSecondsRef.current),
      }).catch(() => {});
    };

    const markInteraction = () => {
      lastInteractionMsRef.current = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushHeartbeat();
      } else {
        markInteraction();
      }
    };

    const onTick = () => {
      const now = Date.now();
      const recentlyActive = now - lastInteractionMsRef.current <= ACTIVE_GRACE_MS;

      if (document.visibilityState === "visible" && recentlyActive) {
        totalActiveSecondsRef.current += 60;
        pendingActiveSecondsRef.current += 60;
      }

      const shouldFlush =
        now - lastFlushMsRef.current >= HEARTBEAT_FLUSH_MS ||
        pendingActiveSecondsRef.current >= 300;

      if (shouldFlush) flushHeartbeat();
    };

    const endSession = () => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;
      flushHeartbeat();

      const now = Date.now();
      const sessionDurationSeconds = Math.max(
        0,
        Math.round((now - sessionStartMsRef.current) / 1000)
      );
      const totalActiveSeconds = toSafeNumber(totalActiveSecondsRef.current);

      logUsage("updated", "Session ended", {
        usage_type: "session_ended",
        session_duration_seconds: sessionDurationSeconds,
        total_active_seconds: totalActiveSeconds,
      }).catch(() => {});
    };

    logUsage("created", "Session started", {
      usage_type: "session_started",
      page: lastPageRef.current || "/",
    }).catch(() => {});

    const intervalId = window.setInterval(onTick, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("mousemove", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("click", markInteraction, { passive: true });
    window.addEventListener("scroll", markInteraction, { passive: true });
    window.addEventListener("focus", markInteraction);
    window.addEventListener("pagehide", endSession);
    window.addEventListener("beforeunload", endSession);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("mousemove", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("click", markInteraction);
      window.removeEventListener("scroll", markInteraction);
      window.removeEventListener("focus", markInteraction);
      window.removeEventListener("pagehide", endSession);
      window.removeEventListener("beforeunload", endSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      endSession();
    };
  }, [currentUser?.id, currentUser?.full_name, currentUser?.email, currentUser?.school_role]);

  useEffect(() => {
    if (!currentUser?.id || !sessionIdRef.current) return;
    const pathname = location.pathname || "/";
    if (!pathname || pathname === lastPageRef.current) return;

    lastPageRef.current = pathname;
    AuditLog.log({
      action: "updated",
      entityType: "app_usage",
      entityId: sessionIdRef.current,
      performedBy: currentUser.full_name || currentUser.email || "Unknown user",
      summary: `Opened ${pathname}`,
      details: {
        module: "app_usage",
        usage_type: "page_view",
        session_id: sessionIdRef.current,
        actor_id: currentUser.id,
        actor_role: currentUser.school_role || "unknown",
        page: pathname,
      },
    }).catch(() => {});
  }, [location.pathname, currentUser?.id, currentUser?.full_name, currentUser?.email, currentUser?.school_role]);
}
