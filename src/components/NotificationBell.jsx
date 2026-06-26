import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { Bell, X, Check, CheckCheck, CreditCard, BookOpen, UserCheck, Calendar, AlertCircle, Info, Megaphone, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

const TYPE_CONFIG = {
  payment:    { icon: CreditCard,  color: "text-emerald-600", bg: "bg-emerald-50",  label: "Payment"    },
  exam:       { icon: BookOpen,    color: "text-blue-600",    bg: "bg-blue-50",     label: "Exam"       },
  attendance: { icon: UserCheck,   color: "text-amber-600",   bg: "bg-amber-50",    label: "Attendance" },
  event:      { icon: Calendar,    color: "text-emerald-600",  bg: "bg-emerald-50",   label: "Event"      },
  alert:      { icon: AlertCircle, color: "text-red-600",     bg: "bg-red-50",      label: "Alert"      },
  announcement:{ icon: Megaphone,  color: "text-indigo-600",  bg: "bg-indigo-50",   label: "Announcement"},
  general:    { icon: Info,        color: "text-slate-600",   bg: "bg-slate-50",    label: "General"    },
  paid_adjustment_request:  { icon: AlertCircle, color: "text-indigo-600", bg: "bg-indigo-50", label: "Paid Change" },
  paid_adjustment_reminder: { icon: Bell,        color: "text-amber-600",  bg: "bg-amber-50",  label: "Reminder"    },
  approval_request: { icon: AlertCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "Approval" },
  approval_reminder: { icon: Bell, color: "text-amber-600", bg: "bg-amber-50", label: "Approval Reminder" },
};

const PAID_ADJUSTMENT_REQUEST_TYPE = "paid_adjustment_request";
const PAID_ADJUSTMENT_REMINDER_TYPE = "paid_adjustment_reminder";

function formatNaira(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N0";
  return `N${Math.round(num).toLocaleString()}`;
}

function formatPaidAdjustmentMessage(notification) {
  const text = String(notification?.message || "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return text;

    const student = parsed.student_name || "Student";
    const termBits = [parsed.term, parsed.academic_year].filter(Boolean);
    const termLabel = termBits.length ? ` (${termBits.join(" ")})` : "";
    const from = formatNaira(parsed.current_total_paid || 0);
    const to = formatNaira(parsed.requested_total_paid || 0);
    const status = String(parsed.status || "pending").toLowerCase();

    if (status === "approved") return `${student}: approved ${from} -> ${to}${termLabel}.`;
    if (status === "rejected") return `${student}: request rejected${termLabel}.`;
    if (status === "superseded") return `${student}: replaced by a newer request${termLabel}.`;
    return `${student}: requested ${from} -> ${to}${termLabel}.`;
  } catch {
    return "Paid change request submitted for review.";
  }
}

function formatApprovalRequestMessage(notification) {
  const text = String(notification?.message || "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return text;
    const actor = parsed.requested_by_name || parsed.requested_by_role || "Admin";
    const target = parsed.entity_label || parsed.entity_type || "record";
    if (parsed.status === "approved") return `${target}: approval request approved.`;
    if (parsed.status === "rejected") return `${target}: approval request rejected.`;
    if (parsed.operation === "create") return `${actor} requested to create ${target}.`;
    if (parsed.operation === "delete") return `${actor} requested to delete ${target}.`;
    return `${actor} requested to update ${target}.`;
  } catch {
    return "A change is waiting for approval.";
  }
}

function getNotificationMessage(notification) {
  const text = String(notification?.message || "").trim();
  if (!text) return "";

  if (notification.type === PAID_ADJUSTMENT_REQUEST_TYPE) {
    return formatPaidAdjustmentMessage(notification);
  }

  if (notification.type === PAID_ADJUSTMENT_REMINDER_TYPE) {
    return "Pending paid-column changes need superadmin review.";
  }

  if (notification.type === "approval_request") {
    return formatApprovalRequestMessage(notification);
  }

  if (notification.type === "approval_reminder") {
    return "There are pending approval requests to review.";
  }

  return text;
}

export default function NotificationBell({ userRole }) {
  const dismissKey = `tunmise_dismissed_notifications_v1:${userRole || "guest"}`;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [newType, setNewType] = useState("announcement");
  const [newTarget, setNewTarget] = useState("all");
  const [sending, setSending] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const unread = notifications.filter(n => !n.is_read).length;

  const readDismissedIds = useCallback(() => {
    try {
      const raw = localStorage.getItem(dismissKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
    } catch {
      return [];
    }
  }, [dismissKey]);

  const saveDismissedIds = useCallback((ids) => {
    try {
      localStorage.setItem(dismissKey, JSON.stringify([...new Set(ids.map((id) => String(id)))]));
    } catch {
      // Ignore storage failures and still update in-memory UI.
    }
  }, [dismissKey]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .or(`target_role.eq.all,target_role.eq.${userRole}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      const dismissedIds = new Set(readDismissedIds());
      setNotifications(data.filter((item) => !dismissedIds.has(String(item.id))));
    }
    setLoading(false);
  }, [readDismissedIds, userRole]);

  useEffect(() => { load(); }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markRead = async (id) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    const normalizedId = String(id);
    setNotifications(prev => prev.filter(n => String(n.id) !== normalizedId));
    const nextDismissed = [...new Set([...readDismissedIds(), normalizedId])];
    saveDismissedIds(nextDismissed);

    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete notification from database:", error);
    }
  };

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  const handleSend = async () => {
    if (!newTitle.trim()) return;
    setSending(true);
    const { data } = await supabase.from("notifications").insert({
      title: newTitle.trim(),
      message: newMsg.trim() || null,
      type: newType,
      target_role: newTarget,
      is_read: false,
    }).select().single();
    if (data) setNotifications(prev => [data, ...prev]);
    setNewTitle(""); setNewMsg(""); setShowCompose(false);
    setSending(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-11 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden" style={{ maxHeight: "80vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="font-bold text-slate-900 text-sm">Notifications</span>
              {unread > 0 && <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{unread} new</span>}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} title="Mark all read"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                  <CheckCheck className="w-3.5 h-3.5" /> All read
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setShowCompose(c => !c)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors font-medium">
                  + New
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Compose form (admin only) */}
          {showCompose && isAdmin && (
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 space-y-2">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Notification title *"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <textarea
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                placeholder="Message (optional)"
                rows={2}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
              <div className="flex gap-2">
                <select value={newType} onChange={e => setNewType(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={newTarget} onChange={e => setNewTarget(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                  <option value="all">Everyone</option>
                  <option value="admin">Admin only</option>
                  <option value="teacher">Teachers only</option>
                  <option value="student">Students only</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSend} disabled={!newTitle.trim() || sending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  {sending ? "Sending..." : "Send Notification"}
                </button>
                <button onClick={() => setShowCompose(false)}
                  className="px-3 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general;
                const Icon = cfg.icon;
                const messageText = getNotificationMessage(n);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors group hover:bg-slate-50 ${!n.is_read ? "bg-blue-50/40" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-sm leading-snug ${!n.is_read ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!n.is_read && (
                            <button onClick={e => { e.stopPropagation(); markRead(n.id); }}
                              title="Mark read" className="p-0.5 hover:text-blue-600 text-slate-400">
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={e => deleteNotif(e, n.id)}
                            title="Delete" className="p-0.5 hover:text-red-500 text-slate-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {messageText && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{messageText}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {n.target_role !== "all" && <span className="ml-1.5 bg-slate-100 text-slate-400 px-1 rounded">→ {n.target_role}</span>}
                      </p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
