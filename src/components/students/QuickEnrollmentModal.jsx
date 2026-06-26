import React, { useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getEffectiveClassFee } from "@/lib/classFeeUtils";
import { submitNewStudentEnrollment } from "@/lib/studentEnrollment";
import { getLagosDateString } from "@/lib/timezone";
import { DEFAULT_STUDENT_START_TERM } from "@/lib/paymentBalances";
import { STUDENT_FEE_GROUPS, getStudentFeeAdjustments } from "@/lib/feeGroups";

const GRADE_OPTIONS = [
  "KG 1", "KG 2",
  "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3",
  "SSS 1", "SSS 2", "SSS 3",
];

const GENDER_OPTIONS = ["Male", "Female"];
const TERM_OPTIONS = ["First Term", "Second Term", "Third Term"];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger",
  "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT",
];

export default function QuickEnrollmentModal({
  currentUser,
  isSuperAdminUser,
  classFees = [],
  defaultTerm,
  defaultYear,
  onClose,
  onSuccess,
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    grade: "",
    gender: "",
    state_of_origin: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    enrollment_date: getLagosDateString(),
    start_term: DEFAULT_STUDENT_START_TERM,
    start_academic_year: defaultYear || "2025/2026",
    fee_group: "standard",
    enrollment_status: "active",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      start_term: !prev.start_term
        ? DEFAULT_STUDENT_START_TERM
        : prev.start_term,
      start_academic_year: !prev.start_academic_year || (defaultYear && prev.start_academic_year === "2025/2026")
        ? defaultYear || "2025/2026"
        : prev.start_academic_year,
    }));
  }, [defaultTerm, defaultYear]);

  const selectedFee = useMemo(() => {
    if (!formData.grade) return null;
    return getEffectiveClassFee(classFees, {
      grade: formData.grade,
      term: defaultTerm,
      academicYear: defaultYear,
    });
  }, [classFees, defaultTerm, defaultYear, formData.grade]);

  const baseFeeAmount = Number(selectedFee?.termly_tuition) || 0;
  const feeAdjustments = getStudentFeeAdjustments({
    grade: formData.grade,
    fee_group: formData.fee_group,
  }, {
    term: defaultTerm,
    academicYear: defaultYear,
  });
  const feeAmount = baseFeeAmount + feeAdjustments.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await submitNewStudentEnrollment({
        studentData: {
          ...formData,
          termly_tuition: baseFeeAmount,
        },
        currentUser,
        isSuperAdminUser,
        classFees,
        term: defaultTerm,
        academicYear: defaultYear,
      });

      if (result.status === "pending_approval") {
        toast({
          title: "Pending superadmin approval",
          description: `Enrollment for ${formData.first_name} ${formData.last_name} was sent for approval.`,
        });
      } else {
        toast({
          title: "Student added",
          description: `${formData.first_name} ${formData.last_name} enrolled. Reg: ${result.regNumber}`,
        });
      }

      await onSuccess?.();
      onClose?.();
    } catch (error) {
      console.error("Quick enrollment failed:", error);
      toast({
        title: "Save failed",
        description: error?.message || JSON.stringify(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center sm:p-4">
      <div className="my-2 flex w-full max-w-2xl max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-0 sm:max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Student Enrollment</h2>
              <p className="text-xs text-slate-500">Add a new student without leaving the dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            disabled={isSubmitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Surname</label>
              <input
                value={formData.first_name}
                onChange={(event) => handleChange("first_name", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter surname"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Other Names</label>
              <input
                value={formData.last_name}
                onChange={(event) => handleChange("last_name", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter other names"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Class</label>
              <select
                value={formData.grade}
                onChange={(event) => handleChange("grade", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              >
                <option value="">Select class</option>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Fee Group / Department</label>
              <select
                value={formData.fee_group}
                onChange={(event) => handleChange("fee_group", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {STUDENT_FEE_GROUPS.map((group) => (
                  <option key={group.value} value={group.value}>
                    {group.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">SSS Science adds N2,000 from Third Term 2025/2026 onward.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
              <input
                type="date"
                value={formData.date_of_birth}
                onChange={(event) => handleChange("date_of_birth", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Gender</label>
              <select
                value={formData.gender}
                onChange={(event) => handleChange("gender", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">State of Origin</label>
              <select
                value={formData.state_of_origin}
                onChange={(event) => handleChange("state_of_origin", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select state</option>
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Parent / Guardian</label>
              <input
                value={formData.parent_name}
                onChange={(event) => handleChange("parent_name", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Parent or guardian name"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Parent Phone</label>
              <input
                value={formData.parent_phone}
                onChange={(event) => handleChange("parent_phone", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="080..."
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Parent Email</label>
              <input
                type="email"
                value={formData.parent_email}
                onChange={(event) => handleChange("parent_email", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Optional email address"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Enrollment Date</label>
              <input
                type="date"
                value={formData.enrollment_date}
                onChange={(event) => handleChange("enrollment_date", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start Term Record</label>
              <select
                value={formData.start_term}
                onChange={(event) => handleChange("start_term", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {TERM_OPTIONS.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Payments and arrears start from this term.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start Academic Year</label>
              <input
                value={formData.start_academic_year}
                onChange={(event) => handleChange("start_academic_year", event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="2025/2026"
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Fee Cycle</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{defaultTerm || "Current term"}</p>
              <p className="text-xs text-slate-500">{defaultYear || "Academic year not set"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Class Fee</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {feeAmount > 0 ? `N${feeAmount.toLocaleString()}` : "Not set"}
              </p>
              <p className="text-xs text-slate-500">
                {feeAdjustments.length > 0
                  ? "Includes Science surcharge"
                  : feeAmount > 0 ? "Will be applied automatically" : "No fee found for this class yet"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Registration No.</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Auto-generated</p>
              <p className="text-xs text-slate-500">Created after save</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Save Student
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
