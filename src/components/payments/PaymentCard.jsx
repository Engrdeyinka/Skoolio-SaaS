import React from 'react';
import { BRAND } from "@/config/brand";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign,
  Calendar,
  CreditCard,
  Edit,
  User,
  AlertTriangle,
  Printer
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { printReceipt } from "@/utils/printReceipt";
import { getStudentFeeSnapshot } from "@/lib/classFeeUtils";

const statusColors = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  partial: "bg-blue-100 text-blue-800 border-blue-200"
};

const methodIcons = {
  cash: DollarSign,
  check: CreditCard,
  credit_card: CreditCard,
  bank_transfer: CreditCard,
  online: CreditCard
};

// Parse a date-only string ("2026-03-21") as local midnight using parseISO
// (new Date("2026-03-21") parses as UTC midnight, showing the wrong day in UTC+ zones)
const safeParseDate = (dateStr) => {
  if (!dateStr) return null;
  try { return parseISO(dateStr); } catch { return null; }
};

const MANUAL_OPENING_PAID_TAG = "[opening_paid_before_app]";

const getCardNote = (rawNote) => {
  if (!rawNote) return "";
  const note = String(rawNote).trim();
  if (!note) return "";
  if (note.includes(MANUAL_OPENING_PAID_TAG)) return "";
  if (note.toLowerCase().includes("paid before app setup")) return "";
  return note;
};

export default function PaymentCard({ payment, student, classFee, previouslyPaid = 0, onEdit, isSelected, onSelect }) {
  const MethodIcon = methodIcons[payment.payment_method] || DollarSign;
  const cardNote = getCardNote(payment.notes);
  // Use parseISO for due_date too so overdue detection isn't off by 1 day
  const isOverdue = payment.due_date && safeParseDate(payment.due_date) < new Date() && payment.payment_status !== 'paid';

  const handlePrintReceipt = () => {
    const feeSnapshot = getStudentFeeSnapshot({
      student,
      classFees: classFee ? [classFee] : [],
      term: payment.term,
      academicYear: payment.academic_year,
    });
    const otherFees = Array.isArray(feeSnapshot?.otherFees) ? feeSnapshot.otherFees : [];
    const tuition = Number(feeSnapshot?.tuition) || 0;
    const feeBreakdown = [
      { name: "Termly Tuition", amount: tuition },
      ...otherFees.map(f => ({ name: f.name, amount: Number(f.amount) || 0 }))
    ];
    const totalFees = feeBreakdown.reduce((sum, f) => sum + f.amount, 0) || payment.amount || 0;

    printReceipt({
      schoolName:     BRAND.schoolName.toUpperCase(),
      receiptNo:      `R-${(payment.id || "").slice(-6).toUpperCase()}`,
      student,
      amountPaid:     payment.amount || 0,
      totalFees,
      previouslyPaid, // passed from Payments.jsx — sum of prior paid/partial records this term
      feeBreakdown,
      term:           payment.term,
      academicYear:   payment.academic_year,
      paymentMethod:  payment.payment_method,
      paymentDate:    payment.payment_date,
      notes:          payment.notes,
      cashier:        payment.recorded_by_name || "Admin",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`bg-white/90 backdrop-blur-sm hover:shadow-lg transition-all duration-300 border ${isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200/60'}`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {onSelect && (
                <Checkbox
                  checked={!!isSelected}
                  onCheckedChange={(checked) => onSelect(payment.id, checked)}
                  className="mt-1"
                />
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                payment.payment_status === 'paid' ? 'bg-emerald-100' :
                payment.payment_status === 'overdue' ? 'bg-red-100' : 'bg-amber-100'
              }`}>
                <DollarSign className={`w-6 h-6 ${
                  payment.payment_status === 'paid' ? 'text-emerald-600' :
                  payment.payment_status === 'overdue' ? 'text-red-600' : 'text-amber-600'
                }`} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl">
                  ₦{payment.amount?.toLocaleString() || '0'}
                </h3>
                <p className="text-slate-600 font-medium">
                  {payment.term || 'N/A'} {payment.academic_year || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
              <Badge className={`${statusColors[payment.payment_status]} border font-medium`}>
                {payment.payment_status}
              </Badge>
            </div>
          </div>

          <div className="space-y-3">
            {student && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium">
                  {student.first_name} {student.last_name}
                </span>
                <span className="text-slate-400">•</span>
                <span>{student.grade}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MethodIcon className="w-4 h-4 text-slate-400" />
              <span className="capitalize">{payment.payment_method?.replace('_', ' ') || 'N/A'}</span>
            </div>

            {payment.payment_date && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Paid: {safeParseDate(payment.payment_date) ? format(safeParseDate(payment.payment_date), "MMM d, yyyy") : "—"}</span>
              </div>
            )}

            {payment.due_date && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Due: {safeParseDate(payment.due_date) ? format(safeParseDate(payment.due_date), "MMM d, yyyy") : "—"}</span>
              </div>
            )}

            {cardNote && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700">{cardNote}</p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200/60 mt-4 space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(payment)}
              className="w-full hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors duration-200"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Payment
            </Button>
            
            {(payment.payment_status === 'paid' || payment.payment_status === 'partial') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintReceipt}
                className="w-full hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors duration-200"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Receipt
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
