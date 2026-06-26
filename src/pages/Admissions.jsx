import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  Search, ClipboardList, Loader2, Check, X, Clock,
  User, Phone, Mail, MapPin, School, ChevronRight, Copy, ExternalLink,
  Users, CheckCircle2, XCircle, Filter
} from "lucide-react";
import { formatDateInLagos } from "@/lib/timezone";

const STATUSES = ["all", "pending", "approved", "rejected"];

const STATUS_STYLES = {
  pending:  { badge: "bg-amber-100 text-amber-800 border-amber-200",  icon: Clock,       label: "Pending" },
  approved: { badge: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2, label: "Approved" },
  rejected: { badge: "bg-red-100 text-red-800 border-red-200",        icon: XCircle,     label: "Rejected" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.badge}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function Admissions() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admissions")
        .select("*")
        .order("applied_at", { ascending: false });
      if (error) throw error;
      setApplications(data || []);
    } catch (e) {
      toast({ title: "Failed to load applications", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = applications.filter(a => {
    const matchStatus = filter === "all" || a.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || a.student_name?.toLowerCase().includes(q) ||
      a.parent_name?.toLowerCase().includes(q) || a.class_applied?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts = { all: applications.length };
  applications.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });

  const updateStatus = async (id, status) => {
    setUpdating(true);
    try {
      await supabase.from("admissions").update({
        status,
        admin_notes: adminNotes || selected?.admin_notes,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      toast({ title: `Application ${status}`, description: `Status updated to ${status}.` });
      setSelected(prev => prev ? { ...prev, status, admin_notes: adminNotes } : null);
      load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setUpdating(false); }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      await supabase.from("admissions").update({ admin_notes: adminNotes }).eq("id", selected.id);
      toast({ title: "Notes saved" });
      setSelected(prev => prev ? { ...prev, admin_notes: adminNotes } : null);
      load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setUpdating(false); }
  };

  const copyFormLink = () => {
    const url = `${window.location.origin}/AdmissionsForm`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      toast({ title: "Link copied!", description: "Share this link with applicants." });
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admissions</h1>
            <p className="text-sm text-slate-500 mt-0.5">Review and manage student applications</p>
          </div>
          <Button onClick={copyFormLink} variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {linkCopied ? "Copied!" : "Copy Application Form Link"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: "all",      label: "Total",    color: "bg-slate-100 text-slate-800" },
            { key: "pending",  label: "Pending",  color: "bg-amber-100 text-amber-800" },
            { key: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-800" },
            { key: "rejected", label: "Rejected", color: "bg-red-100 text-red-800" },
          ].map(s => (
            <button key={s.key} onClick={() => setFilter(s.key)}
              className={`rounded-xl p-4 text-left transition-all border-2 ${filter === s.key ? 'border-emerald-500 shadow-md' : 'border-transparent shadow-sm'} ${s.color}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
              <p className="text-3xl font-bold mt-1">{counts[s.key] || 0}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          {/* List panel */}
          <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Search + filter bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or class..." className="pl-9 h-9 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === s ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3">
                  <ClipboardList className="w-10 h-10 text-slate-300" />
                  <p className="text-slate-500 font-medium">No applications found</p>
                  <p className="text-xs text-slate-400">Share the application form link with prospective parents</p>
                  <Button onClick={copyFormLink} size="sm" variant="outline" className="gap-1.5 mt-1">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Form Link
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(a => (
                    <button key={a.id} onClick={() => { setSelected(a); setAdminNotes(a.admin_notes || ""); }}
                      className={`w-full text-left px-4 py-3 hover:bg-emerald-50/50 transition-colors flex items-center gap-3 ${selected?.id === a.id ? 'bg-emerald-50 border-l-2 border-emerald-500' : ''}`}>
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-700 font-bold text-sm">
                        {a.student_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm truncate">{a.student_name}</p>
                          <StatusBadge status={a.status} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">{a.class_applied}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{a.parent_name}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${selected ? 'w-full lg:w-[420px] flex-shrink-0' : 'hidden'}`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-800">Application Detail</p>
                <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Student info */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg">
                      {selected.student_name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{selected.student_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">{selected.class_applied}</Badge>
                        <StatusBadge status={selected.status} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selected.date_of_birth && (
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-xs text-slate-400">Date of Birth</p>
                        <p className="font-medium text-slate-700">{selected.date_of_birth}</p>
                      </div>
                    )}
                    {selected.gender && (
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-xs text-slate-400">Gender</p>
                        <p className="font-medium text-slate-700 capitalize">{selected.gender}</p>
                      </div>
                    )}
                    {selected.previous_school && (
                      <div className="bg-slate-50 rounded-lg p-2.5 col-span-2">
                        <p className="text-xs text-slate-400">Previous School</p>
                        <p className="font-medium text-slate-700">{selected.previous_school}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Parent info */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Parent / Guardian</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <User className="w-4 h-4 text-slate-400" /> {selected.parent_name}
                    </div>
                    {selected.parent_phone && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <Phone className="w-4 h-4 text-slate-400" /> {selected.parent_phone}
                      </div>
                    )}
                    {selected.parent_email && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <Mail className="w-4 h-4 text-slate-400" /> {selected.parent_email}
                      </div>
                    )}
                    {selected.address && (
                      <div className="flex items-start gap-2 text-slate-700">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" /> {selected.address}
                      </div>
                    )}
                  </div>
                </div>

                {/* Applied date */}
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Applied {formatDateInLagos ? formatDateInLagos(new Date(selected.applied_at), "d MMM yyyy") : new Date(selected.applied_at).toLocaleDateString()}
                </div>

                {/* Admin notes */}
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin Notes</Label>
                  <textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    placeholder="Add internal notes..."
                    rows={3}
                    className="mt-1.5 w-full text-sm rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none bg-slate-50"
                  />
                  <Button size="sm" variant="outline" onClick={saveNotes} disabled={updating} className="mt-1.5 h-7 text-xs">
                    Save Notes
                  </Button>
                </div>
              </div>

              {/* Action buttons */}
              {selected.status === "pending" && (
                <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1.5" disabled={updating}
                    onClick={() => updateStatus(selected.id, "approved")}>
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-1.5" disabled={updating}
                    onClick={() => updateStatus(selected.id, "rejected")}>
                    <X className="w-4 h-4" /> Reject
                  </Button>
                </div>
              )}
              {selected.status !== "pending" && (
                <div className="px-4 py-3 border-t border-slate-100">
                  <Button variant="outline" className="w-full text-sm" disabled={updating}
                    onClick={() => updateStatus(selected.id, "pending")}>
                    Reset to Pending
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
