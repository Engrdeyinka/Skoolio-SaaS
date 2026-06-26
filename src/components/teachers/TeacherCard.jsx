import React, { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Phone, Mail, Calendar, Edit, Trash2, BookOpen, Eye,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_STYLE = {
  active:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  on_leave: "bg-amber-100 text-amber-700 border-amber-200",
};

const STATUS_LABEL = {
  active:   "Active",
  inactive: "Inactive",
  on_leave: "On Leave",
};

const AVATAR_COLORS = [
  "from-emerald-500 to-emerald-600",
  "from-blue-500 to-indigo-600",
  "from-rose-500 to-pink-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-blue-500",
];

function avatarColor(name = "") {
  const n = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export default function TeacherCard({ teacher, onEdit, onDelete, onPreview }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const fullName    = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim();
  const initials    = `${teacher.first_name?.[0] || ""}${teacher.last_name?.[0] || ""}`;
  const color       = avatarColor(fullName);
  const status      = teacher.employment_status || "active";
  const statusStyle = STATUS_STYLE[status] || STATUS_STYLE.inactive;

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(teacher);
    setIsDeleting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="h-full"
    >
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <span className="text-white text-sm font-bold tracking-wide">{initials}</span>
          </div>

          {/* Name + specialisation */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{fullName}</h3>
            {teacher.subject_specialization && (
              <p className="text-slate-500 text-xs mt-0.5 truncate">{teacher.subject_specialization}</p>
            )}
            {teacher.qualification && (
              <p className="text-slate-400 text-xs mt-0.5">{teacher.qualification}</p>
            )}
          </div>

          {/* Status badge */}
          <Badge className={`${statusStyle} border text-xs font-medium flex-shrink-0`}>
            {STATUS_LABEL[status] || status}
          </Badge>
        </div>

        {/* ── Info rows ── */}
        <div className="px-5 pb-4 space-y-2 flex-1">
          {teacher.email && (
            <InfoRow icon={Mail} value={teacher.email} truncate />
          )}
          {teacher.phone && (
            <InfoRow icon={Phone} value={teacher.phone} />
          )}
          {teacher.employment_date && (
            <InfoRow
              icon={Calendar}
              value={`Joined ${format(new Date(teacher.employment_date + "T12:00:00"), "MMM d, yyyy")}`}
            />
          )}
          {teacher.classes_assigned?.length > 0 && (
            <div className="flex items-start gap-2 pt-1 flex-wrap">
              <BookOpen className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {teacher.classes_assigned.map(cls => (
                  <span key={cls} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-1.5 py-0.5 font-medium">
                    {cls}
                  </span>
                ))}
              </div>
            </div>
          )}
          {teacher.salary && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                ₦{Number(teacher.salary).toLocaleString()} / month
              </span>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
          {onPreview && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPreview(teacher)}
              className="flex-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(teacher)}
            className="flex-1 text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
          >
            <Edit className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={isDeleting}
                className="text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 px-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove teacher?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{fullName}</strong>'s record and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  {isDeleting ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </motion.div>
  );
}

function InfoRow({ icon: Icon, label, value, truncate }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      {label && <span className="text-slate-400 text-xs">{label}:</span>}
      <span className={`text-slate-700 text-xs ${truncate ? "truncate" : ""}`}>{value}</span>
    </div>
  );
}
