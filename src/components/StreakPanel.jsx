import React, { useEffect, useState, useCallback } from "react";
import { Flame, Trophy, Calendar, TrendingUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getStreaks, STREAK_META, STREAK_TYPES } from "@/lib/streakUtils";

function StreakCard({ type, data }) {
  const meta    = STREAK_META[type];
  const streak  = data?.current_streak  || 0;
  const longest = data?.longest_streak  || 0;
  const total   = data?.total_days      || 0;

  return (
    <div className={`rounded-xl border p-4 ${meta.bg} ${meta.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Flame className={`w-4 h-4 ${streak > 0 ? "text-orange-500" : "text-slate-300"}`} />
          <span className={`text-2xl font-black ${streak > 0 ? "text-orange-500" : "text-slate-300"}`}>
            {streak}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-slate-500">
          <Trophy className="w-3 h-3 text-amber-500" />
          <span>Best: <strong className="text-slate-700">{longest} days</strong></span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <Calendar className="w-3 h-3 text-blue-400" />
          <span>Sessions: <strong className="text-slate-700">{total}</strong></span>
        </div>
      </div>

      {streak > 0 && streak === longest && longest > 1 && (
        <div className="mt-2 text-xs text-amber-600 font-medium">
          🏆 Personal best!
        </div>
      )}
    </div>
  );
}

export default function StreakPanel({ userId, open, onClose }) {
  const [streaks, setStreaks] = useState({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !open) return;
    setLoading(true);
    const data = await getStreaks(userId);
    setStreaks(data);
    setLoading(false);
  }, [userId, open]);

  useEffect(() => { load(); }, [load]);

  const allStreaks = Object.values(streaks).map(s => s.current_streak || 0);
  const overallBest = allStreaks.length > 0 ? Math.max(...allStreaks) : 0;
  const activeCount = allStreaks.filter(s => s > 0).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={onClose} />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed top-16 right-4 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-white" />
                <span className="text-white font-bold text-sm">Activity Streaks</span>
              </div>
              <button onClick={onClose} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary bar */}
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-orange-700">
                <TrendingUp className="w-4 h-4" />
                <span><strong>{activeCount}</strong> active streak{activeCount !== 1 ? "s" : ""}</span>
              </div>
              {overallBest > 0 && (
                <div className="text-xs text-orange-600 font-medium">
                  🔥 Best: {overallBest} days
                </div>
              )}
            </div>

            {/* Streak cards */}
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-6 text-slate-400 text-sm">Loading streaks...</div>
              ) : (
                Object.values(STREAK_TYPES).map(type => (
                  <StreakCard key={type} type={type} data={streaks[type]} />
                ))
              )}
            </div>

            {/* Footer tip */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
              <p className="text-xs text-slate-400 text-center">
                Mon–Fri only. Each work session counts — come back after 15 min for a new one! 🔥
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
