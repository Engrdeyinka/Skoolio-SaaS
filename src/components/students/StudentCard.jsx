import React, { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone, Mail, Calendar, Edit, Trash2, Eye, User, GraduationCap, Archive,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { canViewFullParentPhone } from "@/lib/permissions";
import { getFeeGroupLabel, getStudentFeeAdjustments } from "@/lib/feeGroups";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_STYLE = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  graduated: "bg-blue-100 text-blue-700 border-blue-200",
  transferred: "bg-orange-100 text-orange-700 border-orange-200",
};

const AVATAR_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-emerald-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-blue-500",
];

function avatarColor(name = "") {
  const n = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function maskPhoneNumber(phone) {
  const normalized = String(phone || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 5) return "X".repeat(normalized.length);
  return `${normalized.slice(0, 5)}${"X".repeat(normalized.length - 5)}`;
}

export default function StudentCard({ student, teacher, classFee, showFees = true, onEdit, onDelete, onPreview, onArchive }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { user: currentUser } = useAuth();
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const initials = `${student.first_name?.[0] || ""}${student.last_name?.[0] || ""}`;
  const color = avatarColor(fullName);
  const statusStyle = STATUS_STYLE[student.enrollment_status] || STATUS_STYLE.inactive;
  const parentPhoneDisplay = canViewFullParentPhone(currentUser)
    ? student.parent_phone
    : maskPhoneNumber(student.parent_phone);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(student);
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
        <div className="px-5 pt-5 pb-4 flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <span className="text-white text-sm font-bold tracking-wide">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{fullName}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-slate-500 text-xs">{student.grade || "-"}</p>
              {student.gender && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  student.gender.toLowerCase() === "male"
                    ? "bg-blue-100 text-blue-700"
                    : student.gender.toLowerCase() === "female"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {student.gender}
                </span>
              )}
            </div>
            {student.reg_number && (
              <p className="text-xs mt-0.5 font-semibold text-emerald-600 tracking-wide">{student.reg_number}</p>
            )}
            {student.enrollment_date && (
              <p className="text-slate-400 text-xs mt-0.5">
                Enrolled {format(new Date(student.enrollment_date + "T12:00:00"), "MMM d, yyyy")}
              </p>
            )}
          </div>

          <Badge className={`${statusStyle} border text-xs font-medium capitalize flex-shrink-0`}>
            {student.enrollment_status}
          </Badge>
        </div>

        <div className="px-5 pb-4 space-y-2 flex-1">
          {student.parent_name && (
            <InfoRow icon={User} label="Parent" value={student.parent_name} />
          )}
          {parentPhoneDisplay && (
            <InfoRow icon={Phone} value={parentPhoneDisplay} />
          )}
          {student.parent_email && (
            <InfoRow icon={Mail} value={student.parent_email} truncate />
          )}
          {teacher && (
            <InfoRow icon={GraduationCap} label="Teacher" value={`${teacher.first_name} ${teacher.last_name}`} />
          )}
          {showFees && (student.termly_tuition > 0 || classFee?.other_fees?.length > 0 || student.fee_group) && (() => {
            const tuition = Number(student.termly_tuition) || 0;
            const otherFees = Array.isArray(classFee?.other_fees) ? classFee.other_fees : [];
            const feeAdjustments = getStudentFeeAdjustments(student, {
              term: schoolTerm,
              academicYear: schoolYear,
            });
            const feePreview = tuition + feeAdjustments.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
            return (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {feePreview > 0 && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                    N{feePreview.toLocaleString()} / term
                  </span>
                )}
                {student.fee_group && student.fee_group !== "standard" && (
                  <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">
                    {getFeeGroupLabel(student.fee_group)}
                  </span>
                )}
                {otherFees.map((f, i) => (
                  <span key={i} className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5">
                    {f.name}: N{Number(f.amount || 0).toLocaleString()}
                  </span>
                ))}
                {feeAdjustments.map((f, i) => (
                  <span key={`adjustment-${i}`} className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5">
                    {f.name}: N{Number(f.amount || 0).toLocaleString()}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
          {onPreview && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPreview(student)}
              className="flex-1 text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </Button>
          )}
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(student)}
              className="flex-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Edit className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
          {onArchive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onArchive(student)}
              className="text-xs text-slate-400 hover:text-amber-700 hover:bg-amber-50 px-2"
              title="Archive student"
            >
              <Archive className="w-3.5 h-3.5" />
            </Button>
          )}
          {onDelete && (
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
                  <AlertDialogTitle>Remove student?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{fullName}</strong>'s record and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
