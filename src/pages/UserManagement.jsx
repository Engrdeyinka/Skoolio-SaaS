import React, { useState, useEffect } from "react";
import { User } from "@/entities/all";
import { inviteUser } from "@/api/auth";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, UserPlus, Mail, Users, Trash2, AlertTriangle } from "lucide-react";

const ROLE_COLORS = {
  super_admin: "bg-emerald-100 text-emerald-800",
  admin: "bg-blue-100 text-blue-800",
  teacher: "bg-emerald-100 text-emerald-800",
  student: "bg-slate-100 text-slate-800",
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("teacher");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const allUsers = await User.list();
    // Hide banned users and student accounts — only staff are managed here
    setUsers(allUsers.filter(u => u.is_banned !== true && u.school_role !== "student"));
    setIsLoading(false);
  };

  const isSuperAdmin = currentUser?.school_role === "super_admin";

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg("");
    try {
      await inviteUser(inviteEmail.trim(), inviteRole === "super_admin" ? "admin" : "user");
      // After invite, update the user's school_role via entity update once they register
      setInviteMsg(`Invitation sent to ${inviteEmail}. They will be assigned the ${inviteRole} role upon first login.`);
      setInviteEmail("");
    } catch (e) {
      setInviteMsg("Failed to send invite. Please try again.");
    }
    setInviting(false);
  };

  const handleRoleChange = async (userId, newRole) => {
    await User.update(userId, { school_role: newRole });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, school_role: newRole } : u));
  };

  const handleDeleteUser = async (userId) => {
    setDeleting(true);
    setDeleteError("");
    try {
      const { supabase } = await import("@/api/supabaseClient");

      // Try the Edge Function first — it fully deletes the auth account
      // so the user cannot re-register with the same email.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      const fnRes = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });

      if (fnRes.ok) {
        // Edge Function succeeded — auth account fully deleted
        setUsers(prev => prev.filter(u => u.id !== userId));
        setConfirmDeleteId(null);
      } else {
        // Edge Function not deployed yet — fall back to banning the profile
        const { error } = await supabase
          .from('profiles')
          .update({ is_banned: true })
          .eq('id', userId);
        if (error) throw error;
        setUsers(prev => prev.filter(u => u.id !== userId));
        setConfirmDeleteId(null);
      }
    } catch (e) {
      console.error("Failed to delete user:", e);
      setDeleteError(e.message || "Failed to delete user. Check Supabase RLS policies.");
    }
    setDeleting(false);
  };

  const roleOptions = isSuperAdmin
    ? ["super_admin", "admin", "teacher"]
    : ["teacher"];

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!["super_admin", "admin"].includes(currentUser?.school_role)) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-1">User Management</h1>
        <p className="text-slate-500">Invite users and manage their roles.</p>
      </div>

      {/* Invite Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Invite New User
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Email address"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="bg-blue-600 hover:bg-blue-700">
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </div>
          {inviteMsg && (
            <p className={`text-sm ${inviteMsg.includes("Failed") ? "text-red-600" : "text-emerald-600"}`}>
              {inviteMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-blue-600" />
            All Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map(user => {
              const isCurrentUser = currentUser?.id === user.id;
              const isConfirming = confirmDeleteId === user.id;

              return (
                <div key={user.id} className={`rounded-xl border p-3 transition-colors ${
                  isConfirming ? "border-red-300 bg-red-50" : "border-slate-100 bg-slate-50/50"
                }`}>
                  {isConfirming ? (
                    /* ── Confirm delete row ── */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-red-700">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium">
                            Delete <strong>{user.full_name || user.email}</strong>? This cannot be undone.
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setConfirmDeleteId(null); setDeleteError(""); }}
                            disabled={deleting}
                            className="h-8"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={deleting}
                            className="h-8 bg-red-600 hover:bg-red-700 text-white"
                          >
                            {deleting ? "Deleting..." : "Yes, Delete"}
                          </Button>
                        </div>
                      </div>
                      {deleteError && (
                        <p className="text-xs text-red-600 font-mono bg-red-50 px-2 py-1 rounded">
                          {deleteError}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{user.full_name || "—"}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={ROLE_COLORS[user.school_role] || "bg-slate-100 text-slate-700"}>
                          {user.school_role || "unassigned"}
                        </Badge>

                        {/* Role selector — super admin can change anyone; admin can only assign teacher */}
                        {!isCurrentUser && (
                          isSuperAdmin || (!["super_admin", "admin"].includes(user.school_role))
                        ) && (
                          <Select
                            value={user.school_role || "student"}
                            onValueChange={val => handleRoleChange(user.id, val)}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map(r => (
                                <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {/* Delete — super_admin only, cannot delete yourself */}
                        {isSuperAdmin && !isCurrentUser && (
                          <button
                            onClick={() => setConfirmDeleteId(user.id)}
                            title="Delete user"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {isCurrentUser && (
                          <span className="text-xs text-slate-400 italic">You</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}