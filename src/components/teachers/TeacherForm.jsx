
import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, X, Save, Trash2, Camera, Loader2, User } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { getLagosDateString } from "@/lib/timezone";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" }
];

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

export default function TeacherForm({ teacher, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    first_name: teacher?.first_name || "",
    last_name: teacher?.last_name || "",
    email: teacher?.email || "",
    phone: teacher?.phone || "",
    subject_specialization: teacher?.subject_specialization || "",
    classes_assigned: teacher?.classes_assigned || [],
    employment_date: teacher?.employment_date || getLagosDateString(),
    employment_status: teacher?.employment_status || "active",
    address: teacher?.address || "",
    qualification: teacher?.qualification || "",
    salary: teacher?.salary || "",
    photo_url: teacher?.photo_url || "",
  });

  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext      = file.name.split(".").pop();
      const fileName = `teachers/photo_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);
      setFormData(prev => ({ ...prev, photo_url: urlData.publicUrl }));
    } catch (e) {
      console.error("Photo upload failed:", e);
    }
    setUploadingPhoto(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const submitData = {
      ...formData,
      salary:    parseFloat(formData.salary) || 0,
      photo_url: formData.photo_url || null,
    };
    
    await onSubmit(submitData);
    setIsSubmitting(false);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addClassAssignment = (className) => {
    if (className && !formData.classes_assigned.includes(className)) {
      setFormData(prev => ({
        ...prev,
        classes_assigned: [...prev.classes_assigned, className]
      }));
    }
  };

  const removeClassAssignment = (className) => {
    setFormData(prev => ({
      ...prev,
      classes_assigned: prev.classes_assigned.filter(c => c !== className)
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-8"
    >
      <Card className="bg-white/90 backdrop-blur-xl shadow-xl border border-slate-200/60">
        <CardHeader className="border-b border-slate-200/60">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              {teacher ? "Edit Teacher" : "Add New Teacher"}
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Photo upload ── */}
            <div className="flex items-center gap-5 pb-5 border-b border-slate-100">
              {/* Avatar circle */}
              <div className="relative flex-shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
                  {formData.photo_url
                    ? <img src={formData.photo_url} alt="Photo" className="w-full h-full object-cover" />
                    : <User className="w-10 h-10 text-slate-400" />
                  }
                </div>
                {/* Camera badge */}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-700 border-2 border-white flex items-center justify-center shadow transition-colors"
                >
                  {uploadingPhoto
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Camera className="w-3.5 h-3.5 text-white" />
                  }
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handlePhotoUpload(e.target.files[0])}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-0.5">Profile Photo</p>
                <p className="text-xs text-slate-400 mb-2">JPG, PNG, or WEBP. Appears on Staff ID card.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="text-xs gap-1.5"
                  >
                    {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {uploadingPhoto ? "Uploading…" : formData.photo_url ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {formData.photo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, photo_url: "" }))}
                      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  required
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  required
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  required
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subject_specialization">Subject Specialization *</Label>
                <Input
                  id="subject_specialization"
                  value={formData.subject_specialization}
                  onChange={(e) => handleChange('subject_specialization', e.target.value)}
                  required
                  className="bg-slate-50/50"
                  placeholder="e.g., Mathematics, English, Science"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="qualification">Qualification</Label>
                <Input
                  id="qualification"
                  value={formData.qualification}
                  onChange={(e) => handleChange('qualification', e.target.value)}
                  className="bg-slate-50/50"
                  placeholder="e.g., B.Ed, M.Ed, NCE"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Employment Status</Label>
                <Select
                  value={formData.employment_status}
                  onValueChange={(value) => handleChange('employment_status', value)}
                >
                  <SelectTrigger className="bg-slate-50/50">
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
                <Label htmlFor="employment_date">Employment Date</Label>
                <Input
                  id="employment_date"
                  type="date"
                  value={formData.employment_date}
                  onChange={(e) => handleChange('employment_date', e.target.value)}
                  className="bg-slate-50/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="salary">Monthly Salary (₦)</Label>
                <Input
                  id="salary"
                  type="number"
                  value={formData.salary}
                  onChange={(e) => handleChange('salary', e.target.value)}
                  className="bg-slate-50/50"
                  placeholder="e.g., 150000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address">Home Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="bg-slate-50/50"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <Label>Class Assignments</Label>
              <div className="flex gap-2 mb-3">
                <Select onValueChange={addClassAssignment}>
                  <SelectTrigger className="bg-slate-50/50 w-48">
                    <SelectValue placeholder="Add class assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.filter(grade => !formData.classes_assigned.includes(grade)).map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {formData.classes_assigned.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.classes_assigned.map((className) => (
                    <div key={className} className="flex items-center gap-2 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg">
                      <span className="text-sm font-medium">{className}</span>
                      <button
                        type="button"
                        onClick={() => removeClassAssignment(className)}
                        className="hover:bg-emerald-200 rounded-full p-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/60">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Saving..." : teacher ? "Update Teacher" : "Add Teacher"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
