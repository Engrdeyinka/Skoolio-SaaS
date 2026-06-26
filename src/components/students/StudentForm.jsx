
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, X, Save, Sparkles, Camera, Loader2 } from "lucide-react";
import { ClassFee } from "@/entities/ClassFee";
import { supabase } from "@/api/supabaseClient";
import { getLagosDateString } from "@/lib/timezone";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { DEFAULT_STUDENT_START_TERM } from "@/lib/paymentBalances";
import { STUDENT_FEE_GROUPS, getStudentFeeAdjustments } from "@/lib/feeGroups";
import { getEffectiveClassFee } from "@/lib/classFeeUtils";

const GRADES = [
  "KG 1", "KG 2", 
  "Nursery 1", "Nursery 2", 
  "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", 
  "SSS 1", "SSS 2", "SSS 3"
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "transferred", label: "Transferred" }
];

const TERM_OPTIONS = ["First Term", "Second Term", "Third Term"];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", 
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", 
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", 
  "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT"
];

// The parent may pass classFees as grade → full ClassFee record OR grade → number.
// This helper always returns a plain number.
function extractTuition(feeEntry) {
  if (feeEntry === null || feeEntry === undefined) return 0;
  if (typeof feeEntry === "object") return Number(feeEntry.termly_tuition ?? 0);
  return Number(feeEntry) || 0;
}

// Normalise whatever the parent passes into a plain grade → number lookup.
function normalizeFeesProp(prop) {
  const out = {};
  for (const [grade, val] of Object.entries(prop || {})) {
    out[grade] = extractTuition(val);
  }
  return out;
}

export default function StudentForm({ student, onSubmit, onCancel, classFees: classFeesProp = {} }) {
  const { term: schoolTerm, year: schoolYear } = useSchoolSettings();
  // Always store as grade → plain number (tuition amount)
  const [classFees, setClassFees] = useState(() => normalizeFeesProp(classFeesProp));

  useEffect(() => {
    // If prop already has data, normalise and use it; otherwise fetch fresh from DB
    if (Object.keys(classFeesProp).length > 0) {
      setClassFees(normalizeFeesProp(classFeesProp));
      return;
    }
    ClassFee.list().then(records => {
      // Use getEffectiveClassFee so the tuition matches the current term/year
      // instead of just picking whichever record happens to come last.
      const grades = [...new Set(records.map(r => r.grade).filter(Boolean))];
      const lookup = {};
      for (const grade of grades) {
        const effective = getEffectiveClassFee(records, {
          grade,
          term: schoolTerm,
          academicYear: schoolYear,
        });
        if (effective) lookup[grade] = Number(effective.termly_tuition ?? 0);
      }
      setClassFees(lookup);
    }).catch(() => {});
  }, []);

  // Also sync when prop updates (e.g. parent finishes loading)
  useEffect(() => {
    if (Object.keys(classFeesProp).length > 0) {
      setClassFees(normalizeFeesProp(classFeesProp));
    }
  }, [classFeesProp]);

  // When editing a student who has no fee set, auto-fill from class schedule once fees load
  useEffect(() => {
    if (!student) return;                                          // only for edit mode
    const currentFee = parseFloat(formData.termly_tuition);
    if (currentFee > 0) return;                                   // already has a fee — don't overwrite
    if (!formData.grade) return;                                   // no grade yet
    const scheduledFee = classFees[formData.grade];               // always a number now
    if (scheduledFee > 0) {
      setFormData(prev => ({ ...prev, termly_tuition: String(scheduledFee) }));
      setTuitionAutoFilled(true);
    }
  }, [classFees]); // fires when classFees data arrives

  const [formData, setFormData] = useState({
    first_name: student?.first_name || "",
    last_name: student?.last_name || "",
    date_of_birth: student?.date_of_birth || "",
    grade: student?.grade || "",
    enrollment_status: student?.enrollment_status || "active",
    enrollment_date: student?.enrollment_date || getLagosDateString(),
    start_term: student?.start_term || DEFAULT_STUDENT_START_TERM,
    start_academic_year: student?.start_academic_year || schoolYear || "2025/2026",
    fee_group: student?.fee_group || "standard",
    parent_name: student?.parent_name || "",
    parent_phone: student?.parent_phone || "",
    parent_email: student?.parent_email || "",
    address: student?.address || "",
    termly_tuition: student?.termly_tuition || "",
    state_of_origin: student?.state_of_origin || "",
    gender: student?.gender || "",
    photo_url: student?.photo_url || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tuitionAutoFilled, setTuitionAutoFilled] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (student) return;
    setFormData((prev) => ({
      ...prev,
      start_term: prev.start_term || DEFAULT_STUDENT_START_TERM,
      start_academic_year: schoolYear || prev.start_academic_year || "2025/2026",
    }));
  }, [student, schoolYear]);

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `students/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage.from("uploads").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);
      const url = urlData.publicUrl;
      setFormData(prev => ({ ...prev, photo_url: url }));
      // If editing an existing student, persist photo immediately bypassing entity schema cache
      if (student?.id) {
        await supabase.from("students").update({ photo_url: url }).eq("id", student.id);
      }
    } catch (e) { /* ignore */ }
    setUploadingPhoto(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const submitData = {
      ...formData,
      termly_tuition: parseFloat(formData.termly_tuition) || 0,
      date_of_birth: formData.date_of_birth || null,
      enrollment_date: formData.enrollment_date || null,
      start_term: formData.start_term || null,
      start_academic_year: formData.start_academic_year || null,
      fee_group: formData.fee_group || "standard",
    };
    
    await onSubmit(submitData);
    setIsSubmitting(false);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'termly_tuition') setTuitionAutoFilled(false);
  };

  const handleGradeChange = (value) => {
    const feeAmount = classFees[value] || 0;   // always a plain number now
    const hasFee = feeAmount > 0;
    if (hasFee) setTuitionAutoFilled(true);
    setFormData(prev => ({
      ...prev,
      grade: value,
      termly_tuition: hasFee ? String(feeAmount) : prev.termly_tuition,
    }));
  };

  const feeAdjustments = getStudentFeeAdjustments({
    grade: formData.grade,
    fee_group: formData.fee_group,
  }, {
    term: schoolTerm,
    academicYear: schoolYear,
  });
  const adjustedFeePreview = (Number(formData.termly_tuition) || 0) +
    feeAdjustments.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-8 max-w-6xl mx-auto"
    >
      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <CardHeader className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5">
          <CardTitle className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-2.5">
                <UserPlus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {student ? "Student Update" : "Student Enrollment"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {student ? "Edit Student" : "Add New Student"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {student
                    ? "Update student details in a cleaner, easier layout."
                    : "Use the same simple enrollment style as the dashboard, with the full school details still available."}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-xl">
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="px-6 py-6">
          <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[1.25fr,0.75fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Student Details</h3>
                  <p className="mt-1 text-xs text-slate-500">Basic profile information for the student.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">Surname *</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => handleChange('first_name', e.target.value)}
                      required
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Other Names *</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => handleChange('last_name', e.target.value)}
                      required
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => handleChange('date_of_birth', e.target.value)}
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={formData.gender} onValueChange={(value) => handleChange('gender', value)}>
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Enrollment Setup</h3>
                  <p className="mt-1 text-xs text-slate-500">Class placement, fee setup, and school record details.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Class *</Label>
                    <Select value={formData.grade} onValueChange={handleGradeChange} required>
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADES.map((grade) => (
                          <SelectItem key={grade} value={grade}>
                            {grade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Enrollment Status</Label>
                    <Select
                      value={formData.enrollment_status}
                      onValueChange={(value) => handleChange('enrollment_status', value)}
                    >
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enrollment_date">Enrollment Date</Label>
                    <Input
                      id="enrollment_date"
                      type="date"
                      value={formData.enrollment_date}
                      onChange={(e) => handleChange('enrollment_date', e.target.value)}
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Start Term Record</Label>
                    <Select
                      value={formData.start_term}
                      onValueChange={(value) => handleChange('start_term', value)}
                    >
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select first term for this student" />
                      </SelectTrigger>
                      <SelectContent>
                        {TERM_OPTIONS.map((term) => (
                          <SelectItem key={term} value={term}>
                            {term}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">Payments and arrears start from this term.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start_academic_year">Start Academic Year</Label>
                    <Input
                      id="start_academic_year"
                      value={formData.start_academic_year}
                      onChange={(e) => handleChange('start_academic_year', e.target.value)}
                      className="bg-slate-50 border-slate-200"
                      placeholder="2025/2026"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Fee Group / Department</Label>
                    <Select
                      value={formData.fee_group}
                      onValueChange={(value) => handleChange('fee_group', value)}
                    >
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select fee group" />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDENT_FEE_GROUPS.map((group) => (
                          <SelectItem key={group.value} value={group.value}>
                            {group.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">SSS Science adds N2,000 from Third Term 2025/2026 onward.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="termly_tuition">Termly School Fees (₦) *</Label>
                    <Input
                      id="termly_tuition"
                      type="number"
                      step="0.01"
                      value={formData.termly_tuition}
                      onChange={(e) => handleChange('termly_tuition', e.target.value)}
                      required
                      className={`bg-slate-50 border-slate-200 ${tuitionAutoFilled ? "border-emerald-400 ring-1 ring-emerald-300" : ""}`}
                      placeholder="e.g. 150000"
                    />
                    {tuitionAutoFilled && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                        <Sparkles className="w-3 h-3" />
                        Auto-filled from class fee schedule. You can still change it.
                      </p>
                    )}
                    {feeAdjustments.length > 0 && (
                      <p className="text-xs text-blue-600">
                        Fee group adds {feeAdjustments.map((fee) => `${fee.name}: N${Number(fee.amount).toLocaleString()}`).join(", ")}.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>State of Origin</Label>
                    <Select value={formData.state_of_origin} onValueChange={(value) => handleChange('state_of_origin', value)}>
                      <SelectTrigger className="bg-slate-50 border-slate-200">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {NIGERIAN_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Parent / Guardian Information</h3>
                  <p className="mt-1 text-xs text-slate-500">Contact details used for communication and billing.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="parent_name">Parent / Guardian Name *</Label>
                    <Input
                      id="parent_name"
                      value={formData.parent_name}
                      onChange={(e) => handleChange('parent_name', e.target.value)}
                      required
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parent_phone">Phone Number *</Label>
                    <Input
                      id="parent_phone"
                      value={formData.parent_phone}
                      onChange={(e) => handleChange('parent_phone', e.target.value)}
                      required
                      className="bg-slate-50 border-slate-200"
                      placeholder="e.g. +2348012345678"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parent_email">Email Address</Label>
                    <Input
                      id="parent_email"
                      type="email"
                      value={formData.parent_email}
                      onChange={(e) => handleChange('parent_email', e.target.value)}
                      className="bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Home Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      className="bg-slate-50 border-slate-200"
                      placeholder="e.g. No. 15 Victoria Island, Lagos"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Student Photo</p>
                <div className="mt-4 flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-white">
                      {formData.photo_url
                        ? <img src={formData.photo_url} alt="Student" className="h-full w-full object-cover" />
                        : <Camera className="w-9 h-9 text-slate-300" />
                      }
                    </div>
                    <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition-colors hover:bg-blue-700">
                      <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e.target.files[0])} />
                      {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </label>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-800">Used on ID cards and official documents</p>
                  <p className="mt-1 text-xs text-slate-500">Upload now or leave blank and add later.</p>
                  {formData.photo_url && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, photo_url: "" }))}
                      className="mt-3 text-xs font-medium text-red-500 hover:text-red-700"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Enrollment Summary</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Selected Class</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formData.grade || "Choose a class"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Fee Preview</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {adjustedFeePreview > 0 ? `N${adjustedFeePreview.toLocaleString()}` : "Not set yet"}
                    </p>
                    {feeAdjustments.length > 0 && (
                      <p className="mt-1 text-xs text-blue-600">Includes Science surcharge.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Registration Number</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Auto-generated on save</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-blue-50/60 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Before You Save</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li>Confirm the class is correct before creating the student.</li>
                  <li>Parent phone is the main contact used across the app.</li>
                  <li>Fees can still be adjusted later if needed.</li>
                </ul>
              </div>
            </div>

            <div className="xl:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Saving..." : student ? "Update Student" : "Add Student"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
