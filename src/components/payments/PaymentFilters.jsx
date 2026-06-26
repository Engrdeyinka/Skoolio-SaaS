import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Filter } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "partial", label: "Partial" }
];

const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online Payment" }
];

const GRADES = [
  "KG 1", "KG 2",
  "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3",
  "SSS 1", "SSS 2", "SSS 3"
];

export default function PaymentFilters({ filters, onFilterChange, viewMode = "cards" }) {
  const handleFilterChange = (type, value) => {
    onFilterChange({ ...filters, [type]: value });
  };

  return (
    <div className="flex flex-wrap gap-4">
      {viewMode === "cards" ? (
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <Input
            type="date"
            value={filters.paymentDate || ""}
            onChange={(e) => handleFilterChange("paymentDate", e.target.value)}
            className="w-44 bg-slate-50/50"
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select
              value={filters.status}
              onValueChange={(value) => handleFilterChange("status", value)}
            >
              <SelectTrigger className="w-36 bg-slate-50/50">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={filters.method}
              onValueChange={(value) => handleFilterChange("method", value)}
            >
              <SelectTrigger className="w-40 bg-slate-50/50">
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <Select
          value={filters.grade || "all"}
          onValueChange={(value) => handleFilterChange("grade", value)}
        >
          <SelectTrigger className="w-36 bg-slate-50/50">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {GRADES.map((grade) => (
              <SelectItem key={grade} value={grade}>
                {grade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
