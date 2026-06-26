
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

const GRADES = [
  "KG 1", "KG 2",
  "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4",
  "JSS 1", "JSS 2", "JSS 3", 
  "SSS 1", "SSS 2", "SSS 3"
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "transferred", label: "Transferred" }
];

export default function StudentFilters({ filters, onFilterChange, gradeOnly = false }) {
  const handleFilterChange = (type, value) => {
    onFilterChange({ ...filters, [type]: value });
  };

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <Select
          value={filters.grade}
          onValueChange={(value) => handleFilterChange("grade", value)}
        >
          <SelectTrigger className="w-40 bg-slate-50/50">
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

      {!gradeOnly && (
        <div className="flex items-center gap-2">
          <Select
            value={filters.status || "all"}
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
      )}
    </div>
  );
}
