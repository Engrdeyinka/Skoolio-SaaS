import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, GraduationCap } from "lucide-react";

const CLASS_OPTIONS = [
  "KG", "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
  "JSS 1", "JSS 2", "JSS 3",
  "SSS 1", "SSS 2", "SSS 3",
];

const HEARD_OPTIONS = [
  "Friend / Family referral", "Social media", "School signboard",
  "Walk-in / Neighbourhood", "Online search", "Other",
];

const EMPTY = {
  student_name: "", date_of_birth: "", gender: "", class_applied: "",
  parent_name: "", parent_phone: "", parent_email: "", address: "",
  previous_school: "", how_heard: "",
};

export default function AdmissionsForm() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(p => { const n = { ...p }; delete n[k]; return n; });
  };

  const validate = () => {
    const e = {};
    if (!form.student_name.trim()) e.student_name = "Required";
    if (!form.class_applied) e.class_applied = "Required";
    if (!form.parent_name.trim()) e.parent_name = "Required";
    if (!form.parent_phone.trim()) e.parent_phone = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("admissions").insert({
        student_name: form.student_name.trim(),
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        class_applied: form.class_applied,
        parent_name: form.parent_name.trim(),
        parent_phone: form.parent_phone.trim(),
        parent_email: form.parent_email.trim() || null,
        address: form.address.trim() || null,
        previous_school: form.previous_school.trim() || null,
        how_heard: form.how_heard || null,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      alert("Submission failed: " + err.message);
    } finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardContent className="flex flex-col items-center text-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Application Submitted!</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Thank you for applying. Our admissions team will review your application and contact you within a few days.
            </p>
            <Button variant="outline" onClick={() => { setForm(EMPTY); setSubmitted(false); }} className="mt-2">
              Submit another application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Field = ({ id, label, required, children, error }) => (
    <div>
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* School header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Student Admission Application</h1>
          <p className="text-slate-500 text-sm mt-1">Please fill in all required fields (*) accurately</p>
        </div>

        <form onSubmit={submit}>
          {/* Student Details */}
          <Card className="shadow-sm border-slate-200 mb-4">
            <CardContent className="pt-5">
              <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Student Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="student_name" label="Full Name" required error={errors.student_name}>
                    <Input id="student_name" value={form.student_name}
                      onChange={e => set("student_name", e.target.value)}
                      placeholder="Student's full name"
                      className={errors.student_name ? "border-red-400" : ""} />
                  </Field>
                </div>
                <Field id="date_of_birth" label="Date of Birth">
                  <Input id="date_of_birth" type="date" value={form.date_of_birth}
                    onChange={e => set("date_of_birth", e.target.value)} />
                </Field>
                <Field id="gender" label="Gender">
                  <select id="gender" value={form.gender} onChange={e => set("gender", e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
                <Field id="class_applied" label="Class Applying For" required error={errors.class_applied}>
                  <select id="class_applied" value={form.class_applied} onChange={e => set("class_applied", e.target.value)}
                    className={`w-full h-10 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background ${errors.class_applied ? 'border-red-400' : 'border-input'}`}>
                    <option value="">Select class</option>
                    {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field id="previous_school" label="Previous School">
                  <Input id="previous_school" value={form.previous_school}
                    onChange={e => set("previous_school", e.target.value)}
                    placeholder="Name of previous school (if any)" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Parent / Guardian Details */}
          <Card className="shadow-sm border-slate-200 mb-4">
            <CardContent className="pt-5">
              <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Parent / Guardian Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="parent_name" label="Full Name" required error={errors.parent_name}>
                    <Input id="parent_name" value={form.parent_name}
                      onChange={e => set("parent_name", e.target.value)}
                      placeholder="Parent or guardian's full name"
                      className={errors.parent_name ? "border-red-400" : ""} />
                  </Field>
                </div>
                <Field id="parent_phone" label="Phone Number" required error={errors.parent_phone}>
                  <Input id="parent_phone" type="tel" value={form.parent_phone}
                    onChange={e => set("parent_phone", e.target.value)}
                    placeholder="e.g. 08012345678"
                    className={errors.parent_phone ? "border-red-400" : ""} />
                </Field>
                <Field id="parent_email" label="Email Address">
                  <Input id="parent_email" type="email" value={form.parent_email}
                    onChange={e => set("parent_email", e.target.value)}
                    placeholder="Optional email address" />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="address" label="Home Address">
                    <Input id="address" value={form.address}
                      onChange={e => set("address", e.target.value)}
                      placeholder="Residential address" />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How did you hear */}
          <Card className="shadow-sm border-slate-200 mb-6">
            <CardContent className="pt-5">
              <Field id="how_heard" label="How did you hear about us?">
                <select id="how_heard" value={form.how_heard} onChange={e => set("how_heard", e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Select an option</option>
                  {HEARD_OPTIONS.map(h => <option key={h}>{h}</option>)}
                </select>
              </Field>
            </CardContent>
          </Card>

          <Button type="submit" disabled={submitting} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 gap-2">
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</> : "Submit Application"}
          </Button>
          <p className="text-center text-xs text-slate-400 mt-3">
            Your information is kept confidential and will only be used for admission purposes.
          </p>
        </form>
      </div>
    </div>
  );
}
