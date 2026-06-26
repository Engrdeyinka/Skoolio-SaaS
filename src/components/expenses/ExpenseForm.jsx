import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, X, Save } from "lucide-react";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/hooks/useSchoolSettings";
import { getLagosDateString } from "@/lib/timezone";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
];

export default function ExpenseForm({ expense, onSubmit, onCancel, categories }) {
  const expenseTypes = categories?.length ? categories : DEFAULT_EXPENSE_CATEGORIES;
  const [formData, setFormData] = useState({
    expense_type: expense?.expense_type || "other",
    description: expense?.description || "",
    amount: expense?.amount || "",
    expense_date: expense?.expense_date || getLagosDateString(),
    payment_method: expense?.payment_method || "cash",
    vendor_name: expense?.vendor_name || "",
    receipt_number: expense?.receipt_number || "",
    approved_by: expense?.approved_by || "",
    notes: expense?.notes || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const validate = () => {
    const errs = {};
    if (!formData.expense_type) errs.expense_type = "Please select an expense type.";
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = "Enter a valid amount greater than 0.";
    if (!formData.expense_date) errs.expense_date = "Date is required.";
    if (!formData.description.trim()) errs.description = "Description is required.";
    return errs;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
    };

    await onSubmit(submitData);
    setIsSubmitting(false);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const FieldError = ({ field }) =>
    errors[field] ? <p className="text-xs text-red-500 mt-1">! {errors[field]}</p> : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/45 p-3 md:p-6 overflow-y-auto"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 16 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-5xl mx-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <Card className="bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-200/80 py-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-600" />
                {expense ? "Edit Expense" : "Add New Expense"}
              </div>
              <Button variant="ghost" size="icon" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Expense Type *</Label>
                  <Select
                    value={formData.expense_type}
                    onValueChange={(value) => handleChange("expense_type", value)}
                  >
                    <SelectTrigger className={`bg-slate-50/50 ${errors.expense_type ? "border-red-400 ring-1 ring-red-300" : ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      {expenseTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError field="expense_type" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (N) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(event) => handleChange("amount", event.target.value)}
                    className={`bg-slate-50/50 ${errors.amount ? "border-red-400 ring-1 ring-red-300" : ""}`}
                    placeholder="0.00"
                  />
                  <FieldError field="amount" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense_date">Expense Date *</Label>
                  <Input
                    id="expense_date"
                    type="date"
                    value={formData.expense_date}
                    onChange={(event) => handleChange("expense_date", event.target.value)}
                    className={`bg-slate-50/50 ${errors.expense_date ? "border-red-400 ring-1 ring-red-300" : ""}`}
                  />
                  <FieldError field="expense_date" />
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
                    <SelectContent className="z-[120]">
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor_name">Vendor/Supplier Name</Label>
                  <Input
                    id="vendor_name"
                    value={formData.vendor_name}
                    onChange={(event) => handleChange("vendor_name", event.target.value)}
                    className="bg-slate-50/50"
                    placeholder="Name of vendor or supplier"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="receipt_number">Receipt/Invoice Number</Label>
                  <Input
                    id="receipt_number"
                    value={formData.receipt_number}
                    onChange={(event) => handleChange("receipt_number", event.target.value)}
                    className="bg-slate-50/50"
                    placeholder="Receipt or invoice reference"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approved_by">Approved By</Label>
                  <Input
                    id="approved_by"
                    value={formData.approved_by}
                    onChange={(event) => handleChange("approved_by", event.target.value)}
                    className="bg-slate-50/50"
                    placeholder="Who approved this expense"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  placeholder="Describe the expense in detail..."
                  className={`bg-slate-50/50 h-24 ${errors.description ? "border-red-400 ring-1 ring-red-300" : ""}`}
                />
                <FieldError field="description" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(event) => handleChange("notes", event.target.value)}
                  placeholder="Any additional notes or comments..."
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
                  className="bg-rose-600 hover:bg-rose-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting ? "Saving..." : expense ? "Update Expense" : "Add Expense"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
