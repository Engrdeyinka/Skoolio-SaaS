import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const statusColors = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  partial: "bg-blue-100 text-blue-800 border-blue-200"
};

export default function RecentPayments({ payments, isLoading }) {
  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Recent Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <DollarSign className="w-5 h-5" />
          Recent Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.map((payment, index) => (
          <motion.div
            key={payment.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50/50 transition-colors duration-200"
          >
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900">${payment.amount?.toFixed(2)}</p>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>{payment.month_year}</span>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  <span className="capitalize">{payment.payment_method}</span>
                </div>
              </div>
            </div>
            <Badge className={`${statusColors[payment.payment_status]} border text-xs font-medium`}>
              {payment.payment_status}
            </Badge>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}