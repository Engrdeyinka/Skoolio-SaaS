import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, RotateCcw } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
];

export default function ExpenseFilters({ filters, categories = [], onFilterChange, onReset }) {
  const handleFilterChange = (type, value) => {
    onFilterChange({ ...filters, [type]: value });
  };

  const hasActive = filters.expense_type !== "all" || filters.payment_method !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <Select
          value={filters.expense_type}
          onValueChange={(value) => handleFilterChange("expense_type", value)}
        >
          <SelectTrigger className="w-44 bg-slate-50/70">
            <SelectValue placeholder="Expense Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={filters.payment_method}
          onValueChange={(value) => handleFilterChange("payment_method", value)}
        >
          <SelectTrigger className="w-40 bg-slate-50/70">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method.value} value={method.value}>
                {method.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActive && onReset && (
        <Button variant="outline" size="sm" onClick={onReset} className="h-9 gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
      )}
    </div>
  );
}
