/**
 * Rewards.jsx — Super-Admin only
 *
 * Monitor per-user streak totals for the selected term, set a reward rate
 * (₦ per streak day), issue rewards individually or in bulk, and reset
 * all streaks when a new term begins.
 *
 * Data sources:
 *  • profiles          → admin / teacher / super_admin users
 *  • user_streaks      → live total_days per (user, streak_type)
 *  • streak_rewards    → archived reward records per (user, term, year)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Flame, Trophy, Gift, RefreshCw, Users, TrendingUp,
  Loader2, AlertTriangle, CheckCircle2, DollarSign,
} from "lucide-react";
import { AuditLog } from "@/entities/AuditLog";
import { STREAK_META } from "@/lib/streakUtils";

// ─── constants ───────────────────────────────────────────────────────────────
const TERMS = ["First Term", "Second Term", "Third Term"];
const YEARS = ["2024/2025", "2025/2026", "2026/2027", "2027/2028"];
const STREAK_TYPE_COLS = [
  { key: "attendance",        label: "📋 Attend.",   field: "attendance_days"       },
  { key: "academic_records",  label: "📝 Academic",  field: "academic_records_days" },
  { key: "cbt",               label: "💻 CBT",       field: "cbt_days"              },
  { key: "timetable",         label: "🗓️ Timetable", field: "timetable_days"        },
  { key: "payments",          label: "💰 Payments",  field: "payments_days"         },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);

const fmtNum = (n) =>
  new Intl.NumberFormat("en-NG").format(n || 0);

// ─── sub-components ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = "text-slate-700" }) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-slate-100 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className={`text-xl font-black ${color}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function Rewards() {
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();

  const [selectedTerm, setSelectedTerm] = useState(schoolTerm || "Third Term");
  const [selectedYear, setSelectedYear] = useState(schoolYear || "2025/2026");

  // Sync to school settings once they finish loading (they arrive async)
  useEffect(() => {
    if (schoolTerm) setSelectedTerm(schoolTerm);
    if (schoolYear) setSelectedYear(schoolYear);
  }, [schoolTerm, schoolYear]);

  const [users,   setUsers]   = useState([]);
  const [streaks, setStreaks] = useState({}); // { userId: { attendance: n, academic_records: n, ... } }
  const [rewards, setRewards] = useState({}); // { userId: streak_rewards row }
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [rate, setRate]           = useState(""); // ₦ per streak day
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [lastResetAt,  setLastResetAt]  = useState(null); // ISO timestamp of last streak reset

  // ── load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Eligible staff profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, email, school_role")
        .in("school_role", ["admin", "teacher", "super_admin"])
        .order("full_name");

      const profiles = profileData || [];
      setUsers(profiles);

      if (profiles.length === 0) { setLoading(false); return; }

      const profileIds = profiles.map(p => p.id);

      // 2. Current user_streaks (total_days per user+type)
      const { data: streakData } = await supabase
        .from("user_streaks")
        .select("user_id, streak_type, total_days, current_streak, longest_streak")
        .in("user_id", profileIds);

      const streakMap = {};
      for (const row of (streakData || [])) {
        if (!streakMap[row.user_id]) streakMap[row.user_id] = {};
        streakMap[row.user_id][row.streak_type] = row;
      }
      setStreaks(streakMap);

      // 3. Last streak reset timestamp (stored in school_settings)
      const { data: resetSetting } = await supabase
        .from("school_settings")
        .select("value")
        .eq("key", "streak_last_reset_at")
        .maybeSingle();
      const resetTs = resetSetting?.value || null;
      setLastResetAt(resetTs);

      // 4. Existing reward records for this term/year
      const { data: rewardData } = await supabase
        .from("streak_rewards")
        .select("*")
        .eq("term", selectedTerm)
        .eq("academic_year", selectedYear)
        .in("user_id", profileIds);

      const rewardMap = {};
      for (const row of (rewardData || [])) {
        // Skip rewards that were issued before (or at) the last reset — they're stale
        if (resetTs && new Date(row.rewarded_at) <= new Date(resetTs)) continue;
        rewardMap[row.user_id] = row;
      }
      setRewards(rewardMap);

      // Pre-fill rate from an existing record if available
      const existingRate = Object.values(rewardMap).find(r => r.reward_rate > 0)?.reward_rate;
      if (existingRate && !rate) setRate(String(existingRate));

    } catch (err) {
      console.error("Rewards load error:", err);
      toast.error("Failed to load data: " + (err?.message || "Unknown error"));
    }
    setLoading(false);
  }, [selectedTerm, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // ── derived per-user data ─────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    const r = parseFloat(rate) || 0;
    return users.map(user => {
      const s = streaks[user.id] || {};
      const attDays  = s["attendance"]?.total_days        || 0;
      const acadDays = s["academic_records"]?.total_days  || 0;
      const cbtDays  = s["cbt"]?.total_days               || 0;
      const ttDays   = s["timetable"]?.total_days         || 0;
      const payDays  = s["payments"]?.total_days          || 0;
      const total    = attDays + acadDays + cbtDays + ttDays + payDays;
      const reward   = Math.round(total * r);
      // Highest consecutive-day streak currently active across all types
      const hotStreak = Math.max(
        s["attendance"]?.current_streak        || 0,
        s["academic_records"]?.current_streak  || 0,
        s["cbt"]?.current_streak               || 0,
        s["timetable"]?.current_streak         || 0,
        s["payments"]?.current_streak          || 0,
      );
      const existing = rewards[user.id];
      return {
        ...user,
        attDays, acadDays, cbtDays, ttDays, payDays, total, reward, hotStreak,
        existing,
        status: existing?.status || "pending",
        alreadyRewarded: existing?.status === "rewarded",
      };
    });
  }, [users, streaks, rewards, rate]);

  // ── live name lookup: userId → full_name from profiles ───────────────────
  const usersById = useMemo(() => {
    const map = {};
    for (const u of users) map[u.id] = u;
    return map;
  }, [users]);

  // ── summary stats ─────────────────────────────────────────────────────────
  const totalUsers       = tableRows.length;
  const totalDays        = tableRows.reduce((s, r) => s + r.total, 0);
  const totalPayout      = tableRows.reduce((s, r) => s + r.reward, 0);
  const rewardedCount    = tableRows.filter(r => r.alreadyRewarded).length;

  // ── issue reward for a single user ───────────────────────────────────────
  const issueOne = async (row) => {
    const r = parseFloat(rate);
    if (!r || r <= 0) { toast.error("Set a reward rate first."); return; }
    setSaving(true);
    try {
      await supabase.from("streak_rewards").upsert({
        user_id:               row.id,
        user_name:             row.full_name || row.email || "",
        user_role:             row.school_role || "",
        term:                  selectedTerm,
        academic_year:         selectedYear,
        attendance_days:       row.attDays,
        academic_records_days: row.acadDays,
        cbt_days:              row.cbtDays,
        timetable_days:        row.ttDays,
        payments_days:         row.payDays,
        total_days:            row.total,
        reward_rate:           r,
        total_reward:          row.reward,
        status:                "rewarded",
        rewarded_by:           currentUser?.full_name || currentUser?.email || "Super Admin",
        rewarded_at:           new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      }, { onConflict: "user_id,term,academic_year" });

      // Reset this user's streak counts to zero after reward is archived
      await supabase
        .from("user_streaks")
        .update({
          current_streak:     0,
          total_days:         0,
          last_activity_date: null,
          updated_at:         new Date().toISOString(),
        })
        .eq("user_id", row.id);

      // Mark reward record as completed so badge clears from the leaderboard
      await supabase
        .from("streak_rewards")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("user_id", row.id)
        .eq("term", selectedTerm)
        .eq("academic_year", selectedYear);

      await AuditLog.log({
        action: "reward_issued",
        entityType: "streak_rewards",
        entityId: row.id,
        performedBy: currentUser?.full_name || "super_admin",
        summary: `Reward issued to ${row.full_name || row.email}: ${fmt(row.reward)} — streak reset to 0`,
        details: { term: selectedTerm, academic_year: selectedYear, total_sessions: row.total, rate: r },
      });

      toast.success(`Reward issued to ${row.full_name || row.email} — ${fmt(row.reward)}. Streak reset.`);
      await loadData();
    } catch (err) {
      toast.error("Failed: " + err?.message);
    }
    setSaving(false);
  };

  // ── issue rewards for all pending users ───────────────────────────────────
  const issueAll = async () => {
    const r = parseFloat(rate);
    if (!r || r <= 0) { toast.error("Set a reward rate first."); return; }
    const pending = tableRows.filter(row => !row.alreadyRewarded && row.total > 0);
    if (pending.length === 0) {
      const alreadyAll = tableRows.every(row => row.alreadyRewarded);
      if (alreadyAll) {
        toast.info("All staff have already been rewarded for this term.");
      } else {
        toast.warning("No staff have any recorded streak days for this term yet.");
      }
      return;
    }
    setSaving(true);
    try {
      const upserts = pending.map(row => ({
        user_id:               row.id,
        user_name:             row.full_name || row.email || "",
        user_role:             row.school_role || "",
        term:                  selectedTerm,
        academic_year:         selectedYear,
        attendance_days:       row.attDays,
        academic_records_days: row.acadDays,
        cbt_days:              row.cbtDays,
        timetable_days:        row.ttDays,
        payments_days:         row.payDays,
        total_days:            row.total,
        reward_rate:           r,
        total_reward:          row.reward,
        status:                "rewarded",
        rewarded_by:           currentUser?.full_name || currentUser?.email || "Super Admin",
        rewarded_at:           new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("streak_rewards")
        .upsert(upserts, { onConflict: "user_id,term,academic_year" });

      if (error) throw error;

      // Reset streaks for all rewarded users
      const pendingIds = pending.map(row => row.id);
      await supabase
        .from("user_streaks")
        .update({
          current_streak:     0,
          total_days:         0,
          last_activity_date: null,
          updated_at:         new Date().toISOString(),
        })
        .in("user_id", pendingIds);

      // Mark all reward records as completed so badges clear from the leaderboard
      await supabase
        .from("streak_rewards")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .in("user_id", pendingIds)
        .eq("term", selectedTerm)
        .eq("academic_year", selectedYear);

      await AuditLog.log({
        action:      "bulk_rewards_issued",
        entityType:  "streak_rewards",
        entityId:    null,
        performedBy: currentUser?.full_name || "super_admin",
        summary:     `Bulk rewards issued — ${pending.length} users, total ${fmt(pending.reduce((s,r) => s + r.reward, 0))} — streaks reset`,
        details:     { term: selectedTerm, academic_year: selectedYear, rate: r, count: pending.length },
      });

      toast.success(`Rewards issued to ${pending.length} user${pending.length !== 1 ? "s" : ""}! All streaks reset.`);
      await loadData();
    } catch (err) {
      toast.error("Failed: " + err?.message);
    }
    setSaving(false);
  };

  // ── reset all streaks for a new term ─────────────────────────────────────
  const resetStreaks = async () => {
    setResetting(true);
    try {
      // Zero out current_streak and total_days for all users
      // longest_streak is preserved as the all-time personal best
      const { error } = await supabase
        .from("user_streaks")
        .update({
          current_streak:     0,
          total_days:         0,
          last_activity_date: null,
          updated_at:         new Date().toISOString(),
        })
        .not("user_id", "is", null); // target all rows

      if (error) throw error;

      // Save the reset timestamp to school_settings so loadData can filter out stale badges
      const resetTimestamp = new Date().toISOString();
      await supabase
        .from("school_settings")
        .upsert({ key: "streak_last_reset_at", value: resetTimestamp }, { onConflict: "key" });

      // Optimistically clear badges in UI immediately
      setLastResetAt(resetTimestamp);
      setRewards({});

      await AuditLog.log({
        action:      "streaks_reset",
        entityType:  "user_streaks",
        entityId:    null,
        performedBy: currentUser?.full_name || "super_admin",
        summary:     `All streaks reset for new term (${selectedTerm} ${selectedYear})`,
        details:     { term: selectedTerm, academic_year: selectedYear },
      });

      toast.success("All streaks reset for the new term. Longest-streak records are preserved.");
      setResetConfirm(false);
      await loadData();
    } catch (err) {
      toast.error("Reset failed: " + err?.message);
    }
    setResetting(false);
  };

  // ── role badge ────────────────────────────────────────────────────────────
  const roleBadge = (role) => {
    const map = {
      super_admin: "bg-emerald-100 text-emerald-700",
      admin:       "bg-blue-100 text-blue-700",
      teacher:     "bg-emerald-100 text-emerald-700",
    };
    return map[role] || "bg-slate-100 text-slate-600";
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Super Admin"
        title="Streak Rewards"
        description="Monitor activity streaks, set a reward rate per streak day, and issue term-end rewards."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setResetConfirm(true)}
              className="gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Reset for New Term
            </Button>
          </div>
        }
      />

      {/* ── Term / Year filter ── */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Term:</span>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Year:</span>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="mt-5 flex flex-wrap gap-3">
        <StatCard icon={Users}      label="Staff tracked"     value={fmtNum(totalUsers)}   color="text-slate-600" />
        <StatCard icon={Flame}      label="Total sessions"      value={fmtNum(totalDays)}    color="text-orange-500" />
        <StatCard icon={DollarSign} label="Projected payout"   value={fmt(totalPayout)}     color="text-emerald-600" />
        <StatCard icon={Trophy}     label="Already rewarded"   value={`${rewardedCount} / ${totalUsers}`} color="text-amber-500" />
      </div>

      {/* ── Rate + bulk action bar ── */}
      <div className="mt-5 flex flex-wrap items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <Flame className="w-5 h-5 text-orange-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-amber-800">Reward Rate</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-500">₦</span>
          <Input
            type="number"
            min="0"
            step="50"
            placeholder="e.g. 500"
            value={rate}
            onChange={e => setRate(e.target.value)}
            className="w-32 h-9 text-sm"
          />
          <span className="text-sm text-slate-500 ml-1">per session</span>
        </div>
        <Button
          onClick={issueAll}
          disabled={saving || loading || !rate || parseFloat(rate) <= 0}
          className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          size="sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          Issue All Pending Rewards
        </Button>
      </div>

      {/* ── Users table ── */}
      <Card className="mt-5 overflow-hidden">
        <CardHeader className="py-3 px-5 border-b bg-slate-50">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            Staff Streak Leaderboard — {selectedTerm} {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading…
            </div>
          ) : tableRows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No admin or teacher accounts found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-center px-3 py-3 whitespace-nowrap text-orange-500">🔥 Current</th>
                    {STREAK_TYPE_COLS.map(c => (
                      <th key={c.key} className="text-center px-3 py-3 whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="text-center px-3 py-3">Sessions</th>
                    <th className="text-right px-4 py-3">Reward (₦)</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableRows
                    .sort((a, b) => b.total - a.total)
                    .map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        idx === 0 && row.total > 0 ? "bg-amber-50/40" : ""
                      }`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {idx === 0 && row.total > 0 && (
                            <span title="Top performer">🥇</span>
                          )}
                          <span className="font-medium text-slate-800">
                            {row.full_name || row.email || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${roleBadge(row.school_role)}`}>
                          {row.school_role?.replace("_", " ") || "—"}
                        </span>
                      </td>

                      {/* Current (hot) streak */}
                      <td className="text-center px-3 py-3">
                        {row.hotStreak > 0 ? (
                          <span className="inline-flex items-center gap-0.5 font-black text-orange-500 text-base">
                            <Flame className="w-3.5 h-3.5" />{row.hotStreak}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>

                      {/* Streak type columns */}
                      {[row.attDays, row.acadDays, row.cbtDays, row.ttDays, row.payDays].map((days, i) => (
                        <td key={i} className="text-center px-3 py-3">
                          <span className={`font-bold ${days > 0 ? "text-orange-600" : "text-slate-300"}`}>
                            {days}
                          </span>
                        </td>
                      ))}

                      {/* Total */}
                      <td className="text-center px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {row.total > 0 && <Flame className="w-3.5 h-3.5 text-orange-400" />}
                          <span className={`font-black text-base ${row.total > 0 ? "text-orange-600" : "text-slate-300"}`}>
                            {row.total}
                          </span>
                        </div>
                      </td>

                      {/* Reward amount */}
                      <td className="text-right px-4 py-3 font-semibold text-emerald-700">
                        {parseFloat(rate) > 0 ? fmt(row.reward) : "—"}
                      </td>

                      {/* Status */}
                      <td className="text-center px-3 py-3">
                        {row.alreadyRewarded ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Rewarded
                          </Badge>
                        ) : row.total > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 border-0">
                            Pending
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-400 border-0">
                            No activity
                          </Badge>
                        )}
                      </td>

                      {/* Action */}
                      <td className="text-right px-4 py-3">
                        {row.alreadyRewarded ? (
                          <span className="text-xs text-slate-400 italic">
                            {row.existing?.rewarded_at
                              ? new Date(row.existing.rewarded_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })
                              : "Done"}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving || !rate || parseFloat(rate) <= 0 || row.total === 0}
                            onClick={() => issueOne(row)}
                            className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          >
                            <Gift className="w-3 h-3" />
                            Issue
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer totals row */}
                {tableRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700 text-xs">
                      <td className="px-4 py-2" colSpan={2}>TOTALS</td>
                      <td />
                      <td className="text-center px-3 py-2 text-orange-600">
                        {tableRows.reduce((s, r) => s + r.attDays, 0)}
                      </td>
                      <td className="text-center px-3 py-2 text-orange-600">
                        {tableRows.reduce((s, r) => s + r.acadDays, 0)}
                      </td>
                      <td className="text-center px-3 py-2 text-orange-600">
                        {tableRows.reduce((s, r) => s + r.cbtDays, 0)}
                      </td>
                      <td className="text-center px-3 py-2 text-orange-600">
                        {tableRows.reduce((s, r) => s + r.ttDays, 0)}
                      </td>
                      <td className="text-center px-3 py-2 text-orange-600">
                        {tableRows.reduce((s, r) => s + r.payDays, 0)}
                      </td>
                      <td className="text-center px-3 py-2 text-orange-700 font-black">
                        {fmtNum(totalDays)}
                      </td>
                      <td className="text-right px-4 py-2 text-emerald-700">
                        {parseFloat(rate) > 0 ? fmt(totalPayout) : "—"}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Reward history section ── */}
      {Object.keys(rewards).length > 0 && (
        <Card className="mt-5">
          <CardHeader className="py-3 px-5 border-b bg-slate-50">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Reward Records — {selectedTerm} {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Staff</th>
                  <th className="text-center px-3 py-3">Streak Days</th>
                  <th className="text-center px-3 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Total Reward</th>
                  <th className="text-center px-3 py-3">Rewarded By</th>
                  <th className="text-center px-3 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.values(rewards)
                  .filter(r => r.status === "rewarded" || r.status === "completed")
                  .sort((a, b) => b.total_reward - a.total_reward)
                  .map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{usersById[r.user_id]?.full_name || r.user_name || "—"}</td>
                    <td className="text-center px-3 py-2.5 text-orange-600 font-bold">{r.total_days}</td>
                    <td className="text-center px-3 py-2.5 text-slate-500">₦{r.reward_rate}/day</td>
                    <td className="text-right px-4 py-2.5 font-semibold text-emerald-700">{fmt(r.total_reward)}</td>
                    <td className="text-center px-3 py-2.5 text-slate-500 text-xs">{r.rewarded_by}</td>
                    <td className="text-center px-3 py-2.5 text-slate-500 text-xs">
                      {r.rewarded_at
                        ? new Date(r.rewarded_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Reset confirmation dialog ── */}
      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Reset All Streaks for New Term?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>This will <strong>zero out all current streaks and total day counts</strong> for every admin and teacher.</p>
              <p className="text-amber-700 font-medium">⚠️ Make sure you have issued rewards before resetting — streak day counts cannot be recovered after reset.</p>
              <p>Personal-best (longest streak) records will be preserved.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={resetStreaks}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {resetting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Resetting…</>
                : "Yes, Reset All Streaks"
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
