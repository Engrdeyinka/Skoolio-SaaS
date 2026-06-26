import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuditLog } from "@/entities/AuditLog";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { approveRequest, getApprovalSummary, listPendingApprovalRequests, rejectRequest } from "@/lib/approvalRequests";
import { applyApprovedPaidAdjustment } from "@/lib/paymentBalances";
import { PageShell } from "@/components/ui/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { CheckSquare, Loader2, RefreshCw, ShieldAlert, UserCheck, UserX, Users } from "lucide-react";
import { formatDateInLagos } from "@/lib/timezone";

const PAID_ADJUSTMENT_REQUEST_TYPE = "paid_adjustment_request";
const AUDIT_HIDDEN_ENTITY_TYPES = new Set(["app_usage"]);

function parsePaidAdjustmentPayload(notification) {
  if (!notification?.message) return null;
  try {
    const parsed = JSON.parse(notification.message);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      request_kind: "paid_adjustment",
      notification_id: notification.id,
      created_at: notification.created_at,
    };
  } catch {
    return null;
  }
}

function getAuditModuleLabel(log) {
  const moduleName = log?.details?.module;
  if (moduleName === "payments") return "Payments";
  if (moduleName === "students") return "Students";
  if (moduleName === "expenses") return "Expenses";
  if (moduleName === "timetable") return "Timetable";
  if (moduleName === "academics") return "Academics";
  if (moduleName === "results") return "Results";
  if (moduleName === "settings") return "Settings";
  if (moduleName === "attendance") return "Attendance";
  if (moduleName === "approvals") return "Approvals";
  if (moduleName === "rollover") return "Term Rollover";
  if (moduleName === "school_vault") return "School Vault";
  return "System";
}

function getAuditTone(log) {
  const action = String(log?.action || "").toLowerCase();
  if (action.includes("delete") || action.includes("reject")) {
    return { dot: "bg-red-500", badge: "bg-red-100 text-red-700" };
  }
  if (action.includes("create") || action.includes("approve") || action.includes("publish")) {
    return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" };
  }
  return { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" };
}

async function setPaidRequestStatus(request, status, currentUser) {
  const nowIso = new Date().toISOString();
  const updatedPayload = {
    ...request,
    status,
    reviewed_at: nowIso,
    reviewed_by_id: currentUser?.id || null,
    reviewed_by_name: currentUser?.full_name || currentUser?.email || "Superadmin",
    reviewed_by_role: currentUser?.school_role || "super_admin",
    last_updated_at: nowIso,
  };

  const { error } = await supabase
    .from("notifications")
    .update({
      title: `${status === "approved" ? "Approved" : "Rejected"} paid change: ${request.student_name}`,
      message: JSON.stringify(updatedPayload),
      is_read: true,
    })
    .eq("id", request.notification_id);

  if (error) throw error;
}


export default function SuperAdminAudit() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [busyMap, setBusyMap] = useState({});
  const [genericRequests, setGenericRequests] = useState([]);
  const [paidRequests, setPaidRequests] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [accountBusyMap, setAccountBusyMap] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [generic, paidNotifications, logs, pendingProfilesResult] = await Promise.all([
        listPendingApprovalRequests().catch(() => []),
        supabase
          .from("notifications")
          .select("*")
          .eq("type", PAID_ADJUSTMENT_REQUEST_TYPE)
          .order("created_at", { ascending: false })
          .limit(300),
        AuditLog.list(300).catch(() => []),
        supabase
          .from("profiles")
          .select("id, full_name, email, school_role, approval_status, created_date")
          .eq("approval_status", "pending")
          .not("school_role", "is", null)
          .order("created_date", { ascending: true })
          .then(r => r, () => ({ data: [] })),
      ]);

      setGenericRequests((generic || []).map((request) => ({ ...request, request_kind: "generic_approval" })));
      setPaidRequests(((paidNotifications?.data || []) || [])
        .map(parsePaidAdjustmentPayload)
        .filter((request) => request?.status === "pending"));
      setAuditLogs((logs || []).filter((log) => log && !AUDIT_HIDDEN_ENTITY_TYPES.has(log.entity_type)));
      setPendingAccounts(pendingProfilesResult?.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pendingRequests = useMemo(() => {
    return [...genericRequests, ...paidRequests].sort((a, b) => {
      const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [genericRequests, paidRequests]);

  const handleApproveAccount = useCallback(async (profile) => {
    setAccountBusyMap((prev) => ({ ...prev, [profile.id]: "approving" }));
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          approval_status: "approved",
          approved_by: currentUser?.full_name || currentUser?.email || "Superadmin",
          approved_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) throw error;

      await AuditLog.log({
        action: "approved",
        entityType: "account_approval",
        entityId: profile.id,
        performedBy: currentUser?.full_name || currentUser?.email || "Superadmin",
        summary: `Approved ${profile.school_role} account for ${profile.full_name || profile.email}.`,
        details: { module: "approvals", profile_id: profile.id, role: profile.school_role },
      });

      toast({ title: "Account approved", description: `${profile.full_name || profile.email} now has access.` });
      await loadData();
    } catch (err) {
      toast({ title: "Approval failed", description: err?.message, variant: "destructive" });
    } finally {
      setAccountBusyMap((prev) => ({ ...prev, [profile.id]: null }));
    }
  }, [currentUser, loadData, toast]);

  const handleRejectAccount = useCallback(async (profile, reason) => {
    setAccountBusyMap((prev) => ({ ...prev, [profile.id]: "rejecting" }));
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          approval_status: "rejected",
          rejection_reason: reason || null,
          approved_by: currentUser?.full_name || currentUser?.email || "Superadmin",
          approved_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) throw error;

      await AuditLog.log({
        action: "rejected",
        entityType: "account_approval",
        entityId: profile.id,
        performedBy: currentUser?.full_name || currentUser?.email || "Superadmin",
        summary: `Rejected ${profile.school_role} account for ${profile.full_name || profile.email}.`,
        details: { module: "approvals", profile_id: profile.id, role: profile.school_role, reason },
      });

      toast({ title: "Account rejected", description: `${profile.full_name || profile.email}'s access was denied.` });
      setRejectingId(null);
      setRejectReason("");
      await loadData();
    } catch (err) {
      toast({ title: "Rejection failed", description: err?.message, variant: "destructive" });
    } finally {
      setAccountBusyMap((prev) => ({ ...prev, [profile.id]: null }));
    }
  }, [currentUser, loadData, toast]);

  const handleApprove = useCallback(async (request) => {
    if (!request?.notification_id) return;
    setBusyMap((prev) => ({ ...prev, [request.notification_id]: true }));
    try {
      if (request.request_kind === "generic_approval") {
        await approveRequest(request, currentUser);
      } else {
        await applyApprovedPaidAdjustment(request);
        await setPaidRequestStatus(request, "approved", currentUser);
        await AuditLog.log({
          action: "approved",
          entityType: "paid_adjustment_request",
          entityId: request.notification_id,
          performedBy: currentUser?.full_name || currentUser?.email || "Superadmin",
          summary: `Approved paid change for ${request.student_name}.`,
          details: { module: "approvals", request },
        });
      }

      toast({ title: "Approved", description: "Request approved successfully." });
      await loadData();
    } catch (error) {
      toast({
        title: "Approve failed",
        description: error?.message || "Could not approve this request.",
        variant: "destructive",
      });
    } finally {
      setBusyMap((prev) => ({ ...prev, [request.notification_id]: false }));
    }
  }, [currentUser, loadData, toast]);

  const handleReject = useCallback(async (request) => {
    if (!request?.notification_id) return;
    setBusyMap((prev) => ({ ...prev, [request.notification_id]: true }));
    try {
      if (request.request_kind === "generic_approval") {
        await rejectRequest(request, currentUser);
      } else {
        await setPaidRequestStatus(request, "rejected", currentUser);
        await AuditLog.log({
          action: "rejected",
          entityType: "paid_adjustment_request",
          entityId: request.notification_id,
          performedBy: currentUser?.full_name || currentUser?.email || "Superadmin",
          summary: `Rejected paid change for ${request.student_name}.`,
          details: { module: "approvals", request },
        });
      }

      toast({ title: "Rejected", description: "Request rejected successfully." });
      await loadData();
    } catch (error) {
      toast({
        title: "Reject failed",
        description: error?.message || "Could not reject this request.",
        variant: "destructive",
      });
    } finally {
      setBusyMap((prev) => ({ ...prev, [request.notification_id]: false }));
    }
  }, [currentUser, loadData, toast]);

  const handleApproveAll = useCallback(async () => {
    if (!pendingRequests.length) return;
    setApprovingAll(true);
    try {
      for (const request of pendingRequests) {
        if (request.request_kind === "generic_approval") {
          await approveRequest(request, currentUser);
        } else {
          await applyApprovedPaidAdjustment(request);
          await setPaidRequestStatus(request, "approved", currentUser);
        }
      }

      await AuditLog.log({
        action: "approved",
        entityType: "approval_batch",
        entityId: null,
        performedBy: currentUser?.full_name || currentUser?.email || "Superadmin",
        summary: `Approved ${pendingRequests.length} pending request(s).`,
        details: { module: "approvals", count: pendingRequests.length },
      });

      toast({ title: "Approvals completed", description: `${pendingRequests.length} request(s) approved.` });
      await loadData();
    } catch (error) {
      toast({
        title: "Bulk approval failed",
        description: error?.message || "Could not approve all pending requests.",
        variant: "destructive",
      });
    } finally {
      setApprovingAll(false);
    }
  }, [currentUser, loadData, pendingRequests, toast]);

  if (currentUser?.school_role !== "super_admin") {
    return (
      <PageShell title="Approvals & Audit Trail" description="Superadmin review center only.">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-8 text-center text-red-700">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10" />
            <p className="font-semibold">This section is only accessible to Super Admins.</p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Approvals & Audit Trail"
      description="Review pending approvals and monitor sensitive activity across the school app."
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleApproveAll}
            disabled={!pendingRequests.length || approvingAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {approvingAll ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Approving...</> : `Approve All (${pendingRequests.length})`}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">

        {/* ── Pending Account Approvals ──────────────────────────────────────── */}
        {(loading || pendingAccounts.length > 0) && (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-700" />
                <CardTitle className="text-base font-semibold text-amber-900">
                  New account requests {!loading && `(${pendingAccounts.length})`}
                </CardTitle>
              </div>
              <p className="text-xs text-amber-700 mt-0.5">
                These staff/admin accounts have completed sign-up and are waiting for your approval before they can access the app.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div>
              ) : pendingAccounts.length === 0 ? null : (
                <div className="space-y-3">
                  {pendingAccounts.map((profile) => {
                    const busy = accountBusyMap[profile.id];
                    const isRejectingThis = rejectingId === profile.id;
                    const roleLabel = { admin: "Admin", teacher: "Teacher", student: "Student" }[profile.school_role] || profile.school_role;
                    return (
                      <div key={profile.id} className="rounded-xl bg-white border border-amber-200 p-4 shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm">{profile.full_name || "—"}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{profile.email}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 capitalize">
                                {roleLabel}
                              </span>
                              <span className="text-xs text-slate-400">
                                Signed up {profile.created_date
                                  ? formatDateInLagos(new Date(profile.created_date), { day: "numeric", month: "short", year: "numeric" })
                                  : "—"}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              disabled={!!busy}
                              onClick={() => handleApproveAccount(profile)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            >
                              {busy === "approving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!busy}
                              onClick={() => { setRejectingId(profile.id); setRejectReason(""); }}
                              className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        </div>

                        {/* Reject reason input */}
                        {isRejectingThis && (
                          <div className="border-t border-amber-100 pt-3 space-y-2">
                            <p className="text-xs font-medium text-slate-600">Reason for rejection <span className="text-slate-400 font-normal">(optional — shown to the user)</span></p>
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="e.g. Not a registered staff member"
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={busy === "rejecting"}
                                onClick={() => handleRejectAccount(profile, rejectReason)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                {busy === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Reject"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-indigo-200 bg-indigo-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-indigo-900">Pending approvals</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : pendingRequests.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <CheckSquare className="mx-auto mb-3 h-10 w-10 opacity-30" />
                No pending approvals right now.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => {
                  const busy = !!busyMap[request.notification_id];
                  const isGeneric = request.request_kind === "generic_approval";
                  return (
                    <div key={request.notification_id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1 text-sm text-slate-700">
                          <p className="font-semibold text-slate-900">
                            {isGeneric ? request.entity_label : request.student_name}
                            {!isGeneric ? <span className="ml-2 font-normal text-slate-500">({request.student_grade || "-"})</span> : null}
                          </p>
                          <p>
                            {isGeneric
                              ? getApprovalSummary(request)
                              : `Paid: N${Number(request.current_total_paid || 0).toLocaleString()} -> N${Number(request.requested_total_paid || 0).toLocaleString()} for ${request.term} ${request.academic_year}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            Requested by {request.requested_by_name || "Unknown"} ({request.requested_by_role || "unknown"}) on{" "}
                            {request.created_at ? formatDateInLagos(new Date(request.created_at), { day: "numeric", month: "short", year: "numeric" }) : "-"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => handleApprove(request)} disabled={busy || approvingAll} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {busy ? "..." : "Approve"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReject(request)} disabled={busy || approvingAll} className="border-red-200 text-red-700 hover:bg-red-50">
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : auditLogs.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">No audit activity recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => {
                  const tone = getAuditTone(log);
                  return (
                    <div key={log.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${tone.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800">{log.summary}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{getAuditModuleLabel(log)}</span>
                          <span>|</span>
                          <span>{formatDateInLagos(new Date(log.created_at), { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span>|</span>
                          <span>{log.performed_by || "System"}</span>
                        </div>
                      </div>
                      <Badge className={`${tone.badge} border-0 capitalize`}>{String(log.action || "updated").replaceAll("_", " ")}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
