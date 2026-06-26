import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = {
  paid: '#10b981',
  pending: '#f59e0b',
  overdue: '#ef4444',
  partial: '#8b5cf6'
};

export default function PaymentOverview({ payments, isLoading }) {
  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
        <CardHeader>
          <CardTitle>Payment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Skeleton className="w-full h-full rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusData = payments.reduce((acc, payment) => {
    acc[payment.payment_status] = (acc[payment.payment_status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusData).map(([status, count]) => ({
    name: status,
    value: count,
    color: COLORS[status] || '#64748b'
  }));

  const monthlyData = payments.reduce((acc, payment) => {
    if (payment.payment_status === 'paid') {
      const month = payment.month_year || 'Unknown';
      acc[month] = (acc[month] || 0) + (payment.amount || 0);
    }
    return acc;
  }, {});

  const barData = Object.entries(monthlyData)
    .sort()
    .slice(-6)
    .map(([month, amount]) => ({
      month: month.split(' ')[0]?.substring(0, 3) || month,
      amount
    }));

  return (
    <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/60">
      <CardHeader>
        <CardTitle className="text-slate-900">Payment Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-800 mb-4">Payment Status Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div>
            <h3 className="font-semibold text-slate-800 mb-4">Monthly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${value.toFixed(2)}`, 'Amount']} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}