import React, { useState, useEffect } from 'react';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Subject } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BookOpen, Plus, Edit, Trash2, Loader2, X, Search, Tag } from 'lucide-react';
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const GRADES = [
  "KG 1", "KG 2", "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"
];

const GRADE_COLORS = {
  "KG 1": "bg-pink-100 text-pink-700 border-pink-200",
  "KG 2": "bg-pink-100 text-pink-700 border-pink-200",
  "Nursery 1": "bg-rose-100 text-rose-700 border-rose-200",
  "Nursery 2": "bg-rose-100 text-rose-700 border-rose-200",
  "Primary 1": "bg-amber-100 text-amber-700 border-amber-200",
  "Primary 2": "bg-amber-100 text-amber-700 border-amber-200",
  "Primary 3": "bg-amber-100 text-amber-700 border-amber-200",
  "Primary 4": "bg-orange-100 text-orange-700 border-orange-200",
  "JSS 1": "bg-blue-100 text-blue-700 border-blue-200",
  "JSS 2": "bg-blue-100 text-blue-700 border-blue-200",
  "JSS 3": "bg-blue-100 text-blue-700 border-blue-200",
  "SSS 1": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "SSS 2": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "SSS 3": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const SUBJECT_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-emerald-500 to-emerald-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-emerald-600",
];

export default function SubjectsPage({ embedded = false }) {
  const [subjects, setSubjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [formData, setFormData] = useState({
    subject_name: '',
    subject_code: '',
    grade_levels: [],
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [filterGrade, setFilterGrade] = usePersistentState("subjects_filter_grade", "");

  const loadSubjects = async () => {
    setIsLoading(true);
    try {
      const data = await Subject.list();
      setSubjects(data);
    } catch (error) {
      console.error("Error loading subjects:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const handleOpenForm = (subject = null) => {
    if (subject) {
      setEditingSubject(subject);
      setFormData({
        subject_name: subject.subject_name,
        subject_code: subject.subject_code || '',
        grade_levels: subject.grade_levels || [],
        description: subject.description || ''
      });
    } else {
      setEditingSubject(null);
      setFormData({
        subject_name: '',
        subject_code: '',
        grade_levels: [],
        description: ''
      });
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSubject(null);
    setFormData({
      subject_name: '',
      subject_code: '',
      grade_levels: [],
      description: ''
    });
  };

  const handleSaveSubject = async () => {
    if (!formData.subject_name || formData.grade_levels.length === 0) {
      alert('Subject name and at least one grade level are required');
      return;
    }

    setIsSaving(true);
    try {
      if (editingSubject) {
        await Subject.update(editingSubject.id, formData);
      } else {
        await Subject.create(formData);
      }
      loadSubjects();
      handleCloseForm();
    } catch (error) {
      console.error("Error saving subject:", error);
    }
    setIsSaving(false);
  };

  const handleDeleteSubject = async (subject) => {
    try {
      await Subject.delete(subject.id);
      loadSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
    }
  };

  const filteredSubjects = filterGrade
    ? subjects.filter(s => s.grade_levels && s.grade_levels.includes(filterGrade))
    : subjects;

  const getSubjectColor = (index) => SUBJECT_COLORS[index % SUBJECT_COLORS.length];

  return (
    <div className={embedded ? "" : "p-6 md:p-8 min-h-screen"}>
      <div className={embedded ? "" : "max-w-6xl mx-auto"}>

        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-1">
              Subjects
            </h1>
            <p className="text-slate-500">
              {subjects.length} subject{subjects.length !== 1 ? 's' : ''} configured across all grade levels
            </p>
          </div>
          <Button
            onClick={() => handleOpenForm()}
            className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </Button>
        </div>

        {/* Add/Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2 }}
              className="mb-8"
            >
              <Card className="border border-blue-200 shadow-lg shadow-blue-50 bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-white" />
                      </div>
                      <CardTitle className="text-lg">
                        {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                      </CardTitle>
                    </div>
                    <button
                      onClick={handleCloseForm}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-700">Subject Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="e.g. Mathematics"
                        value={formData.subject_name}
                        onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
                        className="border-slate-200 focus:border-blue-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-700">Subject Code <span className="text-slate-400 font-normal">(optional)</span></Label>
                      <Input
                        placeholder="e.g. MTH"
                        value={formData.subject_code}
                        onChange={(e) => setFormData({ ...formData, subject_code: e.target.value })}
                        className="border-slate-200 focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      Grade Levels <span className="text-red-500">*</span>
                      {formData.grade_levels.length > 0 && (
                        <span className="ml-2 text-blue-600 font-normal text-xs">
                          {formData.grade_levels.length} selected
                        </span>
                      )}
                    </Label>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {GRADES.map(grade => {
                          const isChecked = formData.grade_levels.includes(grade);
                          return (
                            <button
                              key={grade}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setFormData({ ...formData, grade_levels: formData.grade_levels.filter(g => g !== grade) });
                                } else {
                                  setFormData({ ...formData, grade_levels: [...formData.grade_levels, grade] });
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                                isChecked
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                              }`}
                            >
                              {grade}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Textarea
                      placeholder="Brief description of this subject..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="min-h-20 border-slate-200 focus:border-blue-400 resize-none"
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={handleCloseForm} className="gap-2">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveSubject}
                      disabled={isSaving}
                      className="bg-blue-600 hover:bg-blue-700 gap-2 min-w-[120px]"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        editingSubject ? 'Save Changes' : 'Add Subject'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter + List */}
        <Card className="bg-white shadow-sm border border-slate-200/80">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="w-5 h-5 text-blue-600" />
                {filterGrade ? `${filterGrade} Subjects` : 'All Subjects'}
                <span className="ml-1 text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredSubjects.length}
                </span>
              </CardTitle>
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger className="w-full sm:w-44 border-slate-200 bg-slate-50 h-9 text-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                  <SelectValue placeholder="Filter by grade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All Grades</SelectItem>
                  {GRADES.map(grade => (
                    <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4 p-4 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 rounded w-1/3" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No subjects found</p>
                <p className="text-slate-400 text-sm mt-1">
                  {filterGrade ? `No subjects configured for ${filterGrade}` : 'Add your first subject to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredSubjects.map((subject, index) => (
                    <motion.div
                      key={subject.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: index * 0.04, duration: 0.2 }}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition-all duration-200"
                    >
                      {/* Color avatar */}
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getSubjectColor(index)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <span className="text-white font-bold text-sm">
                          {subject.subject_name?.charAt(0)?.toUpperCase() || 'S'}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{subject.subject_name}</h3>
                          {subject.subject_code && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Tag className="w-3 h-3" />
                              {subject.subject_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {subject.grade_levels && subject.grade_levels.map(grade => (
                            <span
                              key={grade}
                              className={`text-xs font-medium px-2 py-0.5 rounded-md border ${GRADE_COLORS[grade] || 'bg-slate-100 text-slate-600 border-slate-200'}`}
                            >
                              {grade}
                            </span>
                          ))}
                        </div>
                        {subject.description && (
                          <p className="text-xs text-slate-500 mt-1.5 line-clamp-1">{subject.description}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenForm(subject)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Subject?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{subject.subject_name}</strong>? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteSubject(subject)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
