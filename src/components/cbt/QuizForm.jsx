import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, AlertCircle } from "lucide-react";
import { Subject } from "@/entities/Subject";

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

export default function QuizForm({ quiz, defaultTerm = "First Term", defaultYear = "2025/2026", onSubmit, onCancel, restrictedSubject = null, restrictedSubjects = null, restrictedGrades = null }) {
  const [subjects,  setSubjects]  = useState([]);
  const [errors,    setErrors]    = useState({});
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subject: "",
    grade: "",
    duration_minutes: "",
    term: defaultTerm,
    academic_year: defaultYear,
    test_type: "CA1"
  });

  useEffect(() => {
    Subject.list("subject_name").then(setSubjects).catch(() => {});
  }, []);

  // Available subjects — multi-subject teachers use restrictedSubjects array,
  // single-subject (legacy) uses restrictedSubject string, admins see all.
  const subjectNames = subjects.map(s => s.subject_name);
  const availableSubjects =
    restrictedSubjects?.length > 0 ? restrictedSubjects :
    restrictedSubject               ? [restrictedSubject] :
    subjectNames;
  // Lock the field only when there is exactly one subject available
  const isSubjectLocked = availableSubjects.length === 1;
  const availableGrades = restrictedGrades?.length > 0 ? restrictedGrades : GRADES;

  useEffect(() => {
    if (quiz) {
      setFormData({
        title: quiz.title || "",
        description: quiz.description || "",
        subject: quiz.subject || "",
        grade: quiz.grade || "",
        duration_minutes: quiz.duration_minutes || "",
        term: quiz.term || defaultTerm,
        academic_year: quiz.academic_year || defaultYear,
        test_type: quiz.test_type || "CA1"
      });
    } else {
      // Pre-fill subject/grade for teachers when creating a new quiz.
      // Only auto-select subject when there is exactly one option (locked).
      setFormData(prev => ({
        ...prev,
        term: defaultTerm,
        academic_year: defaultYear,
        subject: isSubjectLocked ? availableSubjects[0] : prev.subject,
        grade: (restrictedGrades?.length === 1 ? restrictedGrades[0] : prev.grade),
      }));
    }
  }, [quiz, defaultTerm, defaultYear, restrictedSubject, restrictedSubjects, restrictedGrades]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear the error for this field as soon as the user picks a value
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate required fields — Subject and Grade must be selected
    const newErrors = {
      subject: !formData.subject,
      grade:   !formData.grade,
    };
    if (newErrors.subject || newErrors.grade) {
      setErrors(newErrors);
      return; // stop submission
    }

    const testTypeLabel = {
      CA1: "CA1", CA2: "CA2", CA3: "CA3", Exam: "Exam"
    }[formData.test_type] || formData.test_type;
    const autoTitle = [formData.subject, testTypeLabel].filter(Boolean).join(" ");
    const dataToSubmit = {
      ...formData,
      title: autoTitle || formData.subject || "Quiz",
      duration_minutes: parseInt(formData.duration_minutes, 10)
    };
    onSubmit(dataToSubmit);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-8"
    >
      <Card className="bg-white/90 backdrop-blur-xl shadow-xl border border-slate-200/60">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between">
            <span>{quiz ? "Edit Quiz" : "Create New Quiz"}</span>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Subject and Grade in a 2-column grid — both required */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Subject <span className="text-red-500">*</span>
                </Label>
                {isSubjectLocked ? (
                  <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/50 text-sm text-slate-700">
                    {availableSubjects[0]}
                  </div>
                ) : (
                  <Select value={formData.subject} onValueChange={(value) => handleChange('subject', value)}>
                    <SelectTrigger className={errors.subject ? "border-red-500 ring-1 ring-red-400 focus:ring-red-400" : ""}>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>{availableSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {errors.subject && (
                  <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                    <AlertCircle className="w-3 h-3" /> Subject is required
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Grade <span className="text-red-500">*</span>
                </Label>
                <Select value={formData.grade} onValueChange={(value) => handleChange('grade', value)}>
                  <SelectTrigger className={errors.grade ? "border-red-500 ring-1 ring-red-400 focus:ring-red-400" : ""}>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>{availableGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
                {errors.grade && (
                  <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                    <AlertCircle className="w-3 h-3" /> Class is required
                  </p>
                )}
              </div>
            </div>
            
            {/* Test Type, Duration, Term, and Academic Year in a 4-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label>Test Type</Label>
                <Select value={formData.test_type} onValueChange={(value) => handleChange('test_type', value)} required>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CA1">CA 1 (10 marks)</SelectItem>
                    <SelectItem value="CA2">CA 2 (10 marks)</SelectItem>
                    <SelectItem value="CA3">CA 3 (10 marks)</SelectItem>
                    <SelectItem value="Exam">Final Exam (70 marks)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input id="duration" type="number" value={formData.duration_minutes} onChange={(e) => handleChange('duration_minutes', e.target.value)} required />
              </div>
              
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={formData.term} onValueChange={(value) => handleChange('term', value)} required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="First Term">First Term</SelectItem>
                    <SelectItem value="Second Term">Second Term</SelectItem>
                    <SelectItem value="Third Term">Third Term</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={formData.academic_year} onValueChange={(value) => handleChange('academic_year', value)} required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["2023/2024","2024/2025","2025/2026","2026/2027","2027/2028"].map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description / Instructions</Label>
              <Textarea id="description" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} />
            </div>
            
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" /> {quiz ? "Save Changes" : "Create & Add Questions"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}