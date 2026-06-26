import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, X, Save } from "lucide-react";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";
import { getLagosDateString, getLagosYear } from "@/lib/timezone";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online Payment" },
];

const PAYMENT_STATUSES = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "partial", label: "Partial" },
];

const TERMS = [
  { value: "First Term", label: "First Term" },
  { value: "Second Term", label: "Second Term" },
  { value: "Third Term", label: "Third Term" },
];

const CUR_YEAR = getLagosYear();
const DEFAULT_ACADEMIC_YEAR = `${CUR_YEAR - 1}/${CUR_YEAR}`;

export default function PaymentForm({
  payment,
  students,
  classFees = [],
  defaultTerm,
  defaultYear,
  onSubmit,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    student_id: payment?.student_id || "",
    amount: payment?.amount || "",
    payment_date: payment?.payment_date || getLagosDateString(),
    payment_method: payment?.payment_method || "cash",
    payment_status: payment?.payment_status || "paid",
    term: payment?.term || defaultTerm || "First Term",
    academic_year: payment?.academic_year || defaultYear || DEFAULT_ACADEMIC_YEAR,
    notes: payment?.notes || "",
    due_date: payment?.due_date || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      payment_date: formData.payment_date || null,
      due_date: formData.due_date || null,
    };

    await onSubmit(submitData);
    setIsSubmitting(false);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const selectedStudent = students.find((student) => student.id === formData.student_id);
  const feeSnapshot = getStudentFeeSnapshot({
    student: selectedStudent,
    classFees,
    term: formData.term,
    academicYear: formData.academic_year,
  });
  const suggestedTuition = Number(feeSnapshot.tuition) || 0;

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
              <DollarSign className="w-5 h-5 text-emerald-600" />
              {payment ? "Edit Payment" : "Record New Payment"}
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Student *</Label>
                <Select
                  value={formData.student_id}
                  onValueChange={(value) => handleChange("student_id", value)}
                  required
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students
                      .filter((student) => student.enrollment_status === "active")
                      .map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.first_name} {student.last_name} - {student.grade}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (N) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(event) => handleChange("amount", event.target.value)}
                  placeholder={suggestedTuition ? `${suggestedTuition}` : "0.00"}
                  required
                  className="bg-slate-50/50"
                />
                {suggestedTuition > 0 && (
                  <p className="text-xs text-slate-500">
                    Termly school fees: N{suggestedTuition.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Term *</Label>
                <Select
                  value={formData.term}
                  onValueChange={(value) => handleChange("term", value)}
                  required
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                  <SelectContent>
                    {TERMS.map((term) => (
                      <SelectItem key={term.value} value={term.value}>
                        {term.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="academic_year">Academic Year *</Label>
                <Input
                  id="academic_year"
                  value={formData.academic_year}
                  onChange={(event) => handleChange("academic_year", event.target.value)}
                  placeholder="e.g., 2024/2025"
                  required
                  className="bg-slate-50/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select
                  value={formData.payment_status}
                  onValueChange={(value) => handleChange("payment_status", value)}
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_date">Payment Date</Label>
                <Input
                  id="payment_date"
                  type="date"
                  value={formData.payment_date}
                  onChange={(event) => handleChange("payment_date", event.target.value)}
                  className="bg-slate-50/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(value) => handleChange("payment_method", value)}
                >
                  <SelectTrigger className="bg-slate-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(event) => handleChange("due_date", event.target.value)}
                  className="bg-slate-50/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(event) => handleChange("notes", event.target.value)}
                placeholder="Additional notes about this payment..."
                className="bg-slate-50/50 h-24"
              />
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
                {isSubmitting ? "Saving..." : payment ? "Update Payment" : "Record Payment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
