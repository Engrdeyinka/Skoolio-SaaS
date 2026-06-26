import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Teacher } from "@/entities/Teacher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, GraduationCap, Archive, RotateCcw } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import SaveToVaultButton from "@/components/ui/SaveToVaultButton";

import TeacherCard from "../components/teachers/TeacherCard";
import TeacherForm from "../components/teachers/TeacherForm";

function StatChip({ value, label, color }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {value} {label}
    </span>
  );
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = usePersistentState("teachers_search", "");
  const [statusFilter, setStatusFilter] = usePersistentState("teachers_status_filter", "all");
  const [activeTab, setActiveTab] = useState("active"); // "active" | "archive"
  const [isLoading, setIsLoading] = useState(true);
  const [reinstating, setReinstating] = useState(null);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.school_role === "super_admin";
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();

  const handlePreview = (teacher) => {
    sessionStorage.setItem('previewRole', 'teacher');
    sessionStorage.setItem('preview_teacher_id', teacher.id);
    window.location.href = createPageUrl('Dashboard');
  };

  const loadTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await Teacher.list("-created_date");
      setTeachers(data);
      setFilteredTeachers(data);
    } catch (error) {
      console.error("Error loading teachers:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  useEffect(() => {
    let filtered = teachers;
    if (activeTab === "active") {
      filtered = filtered.filter(t => (t.employment_status || "active") !== "inactive");
      if (statusFilter !== "all") {
        filtered = filtered.filter(t => (t.employment_status || "active") === statusFilter);
      }
    } else {
      filtered = filtered.filter(t => t.employment_status === "inactive");
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
        t.subject_specialization?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q)
      );
    }
    setFilteredTeachers(filtered);
  }, [teachers, searchTerm, statusFilter, activeTab]);

  const handleSubmit = async (teacherData) => {
    try {
      if (editingTeacher) {
        await Teacher.update(editingTeacher.id, teacherData);
        // Sync account access based on employment status
        const isNowInactive = teacherData.employment_status === "inactive";
        const wasInactive = (editingTeacher.employment_status || "active") === "inactive";
        if (isNowInactive !== wasInactive) {
          await syncTeacherBan(editingTeacher.id, isNowInactive);
        }
        toast({ title: "Teacher updated", description: `${teacherData.first_name} ${teacherData.last_name} has been updated.` });
      } else {
        await Teacher.create(teacherData);
        toast({ title: "Teacher added", description: `${teacherData.first_name} ${teacherData.last_name} has been added.` });
      }
      setShowForm(false);
      setEditingTeacher(null);
      loadTeachers();
    } catch (error) {
      console.error("Error saving teacher:", error);
      toast({ title: "Save failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher);
    setShowForm(true);
  };

  const handleDelete = async (teacher) => {
    try {
      await Teacher.delete(teacher.id);
      toast({ title: "Teacher deleted", description: `${teacher.first_name} ${teacher.last_name} has been removed.` });
      loadTeachers();
    } catch (error) {
      console.error("Error deleting teacher:", error);
      toast({ title: "Delete failed", description: error?.message || JSON.stringify(error), variant: "destructive" });
    }
  };

  // Ban/unban profile and, on deactivation, clear all assignments/timetable slots
  const syncTeacherBan = async (teacherId, banned) => {
    try {
      await supabase.from("profiles").update({ is_banned: banned }).eq("linked_teacher_id", teacherId);
    } catch {}

    if (banned) {
      // Remove from class assignments (class teacher role)
      try {
        await supabase.from("class_assignments").update({ teacher_id: null }).eq("teacher_id", teacherId);
      } catch {}
      // Remove from class assignments (subject teacher role)
      try {
        await supabase.from("class_assignments").update({ subject_teacher_id: null }).eq("subject_teacher_id", teacherId);
      } catch {}
      // Remove from timetable slots
      try {
        await supabase.from("timetable_slots").update({ teacher_id: null }).eq("teacher_id", teacherId);
      } catch {}
    }
  };

  const handleReinstate = async (teacher) => {
    setReinstating(teacher.id);
    try {
      await Teacher.update(teacher.id, { employment_status: "active" });
      await syncTeacherBan(teacher.id, false);
      toast({ title: "Teacher reinstated", description: `${teacher.first_name} ${teacher.last_name} is now active.` });
      loadTeachers();
    } catch (e) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
    setReinstating(null);
  };

  const activeCount   = teachers.filter(t => (t.employment_status || "active") === "active").length;
  const onLeaveCount  = teachers.filter(t => t.employment_status === "on_leave").length;
  const inactiveCount = teachers.filter(t => t.employment_status === "inactive").length;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <Toaster />
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Teachers</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <StatChip value={teachers.length} label="Total"    color="bg-slate-100 text-slate-700" />
              <StatChip value={activeCount}      label="Active"   color="bg-emerald-100 text-emerald-700" />
              {onLeaveCount  > 0 && <StatChip value={onLeaveCount}  label="On Leave" color="bg-amber-100 text-amber-700" />}
              {inactiveCount > 0 && <StatChip value={inactiveCount} label="Archived"  color="bg-slate-100 text-slate-500" />}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <SaveToVaultButton module="staff" term={schoolTerm} year={schoolYear} />
          {activeTab === "active" && (
            <Button
              size="sm"
              onClick={() => { setShowForm(!showForm); setEditingTeacher(null); }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Teacher
            </Button>
          )}
          </div>
        </div>

        {/* ── Tabs: Active / Archive ── */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button onClick={() => setActiveTab("active")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "active" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
            <GraduationCap className="w-4 h-4" /> Active
          </button>
          <button onClick={() => setActiveTab("archive")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "archive" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
            <Archive className="w-4 h-4" /> Archive {inactiveCount > 0 && <span className="ml-0.5 text-xs bg-slate-200 text-slate-600 rounded-full px-1.5">{inactiveCount}</span>}
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <TeacherForm
              teacher={editingTeacher}
              onSubmit={handleSubmit}
              onCancel={() => { setShowForm(false); setEditingTeacher(null); }}
            />
          )}
        </AnimatePresence>

        {/* ── Search + filter row (active tab only) ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by name, subject, or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          {activeTab === "active" && (
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 self-start">
              {[
                { value: "all",      label: "All" },
                { value: "active",   label: "Active" },
                { value: "on_leave", label: "On Leave" },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === opt.value ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-100 rounded-2xl h-52" />
            ))}
          </div>
        ) : activeTab === "archive" ? (
          filteredTeachers.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
              <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">Archive is empty</p>
              <p className="text-sm text-slate-400 mt-1">Inactive teachers will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeachers.map(teacher => {
                const fullName = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim();
                const initials = `${teacher.first_name?.[0] || ""}${teacher.last_name?.[0] || ""}`.toUpperCase();
                return (
                  <div key={teacher.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{fullName}</p>
                        <p className="text-xs text-slate-400 truncate">{teacher.subject_specialization || "No subject"}</p>
                      </div>
                      <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0">
                        Inactive
                      </span>
                    </div>
                    {teacher.email && <p className="text-xs text-slate-400 truncate">{teacher.email}</p>}
                    <Button size="sm" variant="outline"
                      disabled={reinstating === teacher.id}
                      onClick={() => handleReinstate(teacher)}
                      className="w-full text-xs gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                      <RotateCcw className="w-3.5 h-3.5" />
                      {reinstating === teacher.id ? "Reinstating…" : "Reinstate"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
            <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No teachers found</p>
            <p className="text-sm text-slate-400 mt-1">
              {teachers.length === 0 ? "Add your first teacher to get started" : "Try adjusting your search"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredTeachers.map((teacher) => (
                <TeacherCard key={teacher.id} teacher={teacher} onEdit={handleEdit} onDelete={handleDelete} onPreview={isSuperAdmin ? handlePreview : undefined} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
