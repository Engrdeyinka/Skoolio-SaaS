import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CreditCard, Edit, Trash2, User, FileText } from "lucide-react";
import { format } from "date-fns";
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

function formatNaira(value) {
  return `N${Number(value || 0).toLocaleString()}`;
}

function asTitleCase(value = "") {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDisplayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : format(date, "MMM d, yyyy");
}

export default function ExpenseCard({
  expense,
  onEdit,
  onDelete,
  categoryColors = {},
  categoryLabels = {},
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const categoryValue = expense.expense_type || "other";
  const categoryLabel = categoryLabels[categoryValue] || asTitleCase(categoryValue);
  const categoryColor = categoryColors[categoryValue] || "#64748b";

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(expense);
    setIsDeleting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border border-slate-200 bg-white hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="font-semibold border"
                  style={{ borderColor: categoryColor, color: categoryColor }}
                >
                  {categoryLabel}
                </Badge>
                <span className="text-xs text-slate-500">{getDisplayDate(expense.expense_date)}</span>
              </div>

              <p className="font-semibold text-slate-900 line-clamp-1">
                {expense.description || "Untitled expense"}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  {asTitleCase(expense.payment_method || "unknown")}
                </span>
                {expense.vendor_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {expense.vendor_name}
                  </span>
                )}
                {expense.receipt_number && (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Receipt {expense.receipt_number}
                  </span>
                )}
                {expense.approved_by && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Approved by {expense.approved_by}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3">
              <span className="text-xl font-bold text-rose-600">{formatNaira(expense.amount)}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(expense)} className="h-8 gap-1.5">
                  <Edit className="w-3.5 h-3.5" />
                  Edit
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-red-700 hover:text-red-700 hover:bg-red-50"
                      disabled={isDeleting}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove the expense record.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
