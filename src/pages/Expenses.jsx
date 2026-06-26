import React, { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Expense } from "@/entities/Expense";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
  Wallet,
  Filter,
  Receipt,
} from "lucide-react";
import { formatDateInLagos } from "@/lib/timezone";
import { AnimatePresence, motion } from "framer-motion";

import ExpenseCard from "../components/expenses/ExpenseCard";
import ExpenseForm from "../components/expenses/ExpenseForm";
import ExpenseFilters from "../components/expenses/ExpenseFilters";
import { useSchoolSettings, DEFAULT_EXPENSE_CATEGORIES } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/lib/AuthContext";
import { createApprovalRequest } from "@/lib/approvalRequests";
import { logChange } from "@/lib/changeHistory";
import { canManageExpenses, isSuperAdmin } from "@/lib/permissions";

const DEFAULT_EXPENSE_COLORS = {
  salary: "#3b82f6",
  utilities: "#10b981",
  maintenance: "#f59e0b",
  supplies: "#8b5cf6",
  transport: "#ec4899",
  marketing: "#06b6d4",
  other: "#64748b",
};

const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#64748b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

function formatNaira(value) {
  return `N${Number(value || 0).toLocaleString()}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shortDate(date) {
  return formatDateInLagos(date, { month: "short", day: "numeric" }, "en-US");
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const { expenseCategories, save: saveSettings } = useSchoolSettings();
  const { user: currentUser } = useAuth();

  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [searchTerm, setSearchTerm] = usePersistentState("expenses_search", "");
  const [filters, setFilters] = usePersistentState("expenses_filters", { expense_type: "all", payment_method: "all" });
  const [isLoading, setIsLoading] = useState(true);

  const [showCatManager, setShowCatManager] = useState(false);
  const [catDraft, setCatDraft] = useState([]);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [savingCats, setSavingCats] = useState(false);

  const activeCategories = expenseCategories?.length ? expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  const canEditExpenses = canManageExpenses(currentUser);
  const isSuperAdminUser = isSuperAdmin(currentUser);

  const categoryColors = Object.fromEntries(
    activeCategories.map((category, index) => [
      category.value,
      DEFAULT_EXPENSE_COLORS[category.value] || PALETTE[index % PALETTE.length],
    ])
  );

  const categoryLabels = Object.fromEntries(
    activeCategories.map((category) => [category.value, category.label])
  );

  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await Expense.list("-expense_date");
      setExpenses(data || []);
    } catch (error) {
      console.error("Error loading expenses:", error);
      toast({
        title: "Could not load expenses",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];

    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((expense) =>
        expense.description?.toLowerCase().includes(query) ||
        expense.vendor_name?.toLowerCase().includes(query) ||
        expense.expense_type?.toLowerCase().includes(query) ||
        expense.receipt_number?.toLowerCase().includes(query) ||
        expense.notes?.toLowerCase().includes(query)
      );
    }

    if (filters.expense_type !== "all") {
      filtered = filtered.filter((expense) => expense.expense_type === filters.expense_type);
    }

    if (filters.payment_method !== "all") {
      filtered = filtered.filter((expense) => expense.payment_method === filters.payment_method);
    }

    return filtered;
  }, [expenses, filters, searchTerm]);

  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      const aDate = new Date(a.expense_date || 0).getTime();
      const bDate = new Date(b.expense_date || 0).getTime();
      return bDate - aDate;
    });
  }, [filteredExpenses]);

  const analytics = useMemo(() => {
    const total = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const now = new Date();
    const monthTotal = filteredExpenses
      .filter((expense) => {
        const d = new Date(expense.expense_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const byCategory = {};
    filteredExpenses.forEach((expense) => {
      const key = expense.expense_type || "other";
      byCategory[key] = (byCategory[key] || 0) + Number(expense.amount || 0);
    });

    const categoryChart = Object.entries(byCategory)
      .map(([value, amount]) => ({
        value,
        label: categoryLabels[value] || value.replace(/_/g, " "),
        amount,
        fill: categoryColors[value] || "#64748b",
      }))
      .sort((a, b) => b.amount - a.amount);

    const topCategory = categoryChart[0] || null;
    const avgExpense = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0;

    const weeklyBuckets = Array.from({ length: 8 }).map((_, index) => {
      const end = new Date();
      end.setDate(end.getDate() - index * 7);
      const start = startOfWeek(end);
      const key = start.toISOString();
      return {
        key,
        start,
        label: shortDate(start),
        amount: 0,
      };
    }).reverse();

    filteredExpenses.forEach((expense) => {
      const start = startOfWeek(expense.expense_date || new Date());
      const key = start.toISOString();
      const bucket = weeklyBuckets.find((item) => item.key === key);
      if (bucket) bucket.amount += Number(expense.amount || 0);
    });

    return {
      total,
      monthTotal,
      avgExpense,
      topCategory,
      categoryChart,
      weeklyTrend: weeklyBuckets.map((item) => ({ label: item.label, amount: item.amount })),
    };
  }, [filteredExpenses, categoryColors, categoryLabels]);

  const hasActiveFilters = filters.expense_type !== "all" || filters.payment_method !== "all" || searchTerm.trim().length > 0;

  const handleSubmit = async (expenseData) => {
    try {
      if (editingExpense && !isSuperAdminUser) {
        await createApprovalRequest({
          entityType: "expense",
          entityLabel: expenseData.description || expenseData.expense_type || "expense record",
          operation: "update",
          currentData: editingExpense,
          proposedData: { ...editingExpense, ...expenseData },
          requestedBy: currentUser?.id,
          requestedByRole: currentUser?.school_role,
          requestedByName: currentUser?.full_name || currentUser?.email,
          recordId: editingExpense.id,
          summary: `Expense update requested for ${expenseData.description || expenseData.expense_type || "expense record"}.`,
        });
        toast({ title: "Pending superadmin approval", description: "Expense update was sent for approval before it takes effect." });
      } else if (editingExpense) {
        await Expense.update(editingExpense.id, expenseData);
        await logChange({
          action: "expense_updated",
          entityType: "expense",
          entityId: editingExpense.id,
          performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
          summary: "Expense record updated.",
          before: editingExpense,
          after: { ...editingExpense, ...expenseData },
        });
        toast({ title: "Expense updated", description: "The expense record has been updated." });
      } else {
        if (!isSuperAdminUser) {
          await createApprovalRequest({
            entityType: "expense",
            entityLabel: expenseData.description || expenseData.expense_type || "new expense",
            operation: "create",
            currentData: null,
            proposedData: expenseData,
            requestedBy: currentUser?.id,
            requestedByRole: currentUser?.school_role,
            requestedByName: currentUser?.full_name || currentUser?.email,
            summary: `New expense requested for ${expenseData.description || expenseData.expense_type || "expense"}.`,
          });
          toast({ title: "Pending superadmin approval", description: "Expense entry was sent for approval before it is saved." });
        } else {
          const createdExpense = await Expense.create(expenseData);
          await logChange({
            action: "expense_created",
            entityType: "expense",
            entityId: createdExpense?.id,
            performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
            summary: "Expense record created.",
            before: null,
            after: createdExpense || expenseData,
          });
          toast({ title: "Expense added", description: "New expense record saved." });
        }
      }
      setShowForm(false);
      setEditingExpense(null);
      await loadExpenses();
    } catch (error) {
      console.error("Error saving expense:", error);
      toast({
        title: "Save failed",
        description: error?.message || "Could not save expense.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleDelete = async (expense) => {
    try {
      if (!isSuperAdminUser) {
        await createApprovalRequest({
          entityType: "expense",
          entityLabel: expense.description || expense.expense_type || "expense record",
          operation: "delete",
          currentData: expense,
          proposedData: null,
          requestedBy: currentUser?.id,
          requestedByRole: currentUser?.school_role,
          requestedByName: currentUser?.full_name || currentUser?.email,
          recordId: expense.id,
          summary: `Expense deletion requested for ${expense.description || expense.expense_type || "expense record"}.`,
        });
        toast({ title: "Pending superadmin approval", description: "Expense deletion was sent for approval before it takes effect." });
      } else {
        await Expense.delete(expense.id);
        await logChange({
          action: "expense_deleted",
          entityType: "expense",
          entityId: expense.id,
          performedBy: currentUser?.school_role || currentUser?.full_name || "super_admin",
          summary: "Expense record deleted.",
          before: expense,
          after: null,
        });
        await loadExpenses();
        toast({ title: "Expense deleted", description: "The expense record has been removed." });
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast({
        title: "Delete failed",
        description: error?.message || "Could not delete expense.",
        variant: "destructive",
      });
    }
  };

  const openCatManager = () => {
    setCatDraft([...(activeCategories || DEFAULT_EXPENSE_CATEGORIES)]);
    setNewCatLabel("");
    setShowCatManager(true);
  };

  const addCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!value || catDraft.some((c) => c.value === value)) return;
    setCatDraft((prev) => [...prev, { value, label }]);
    setNewCatLabel("");
  };

  const removeCategory = (value) => {
    setCatDraft((prev) => prev.filter((c) => c.value !== value));
  };

  const saveCats = async () => {
    setSavingCats(true);
    try {
      await saveSettings({ expense_categories: catDraft });
      toast({ title: "Categories saved", description: `${catDraft.length} categories updated.` });
      setShowCatManager(false);
    } catch (error) {
      toast({
        title: "Save failed",
        description: error?.message || "Could not save categories.",
        variant: "destructive",
      });
    }
    setSavingCats(false);
  };

  const resetFilters = () => {
    setFilters({ expense_type: "all", payment_method: "all" });
    setSearchTerm("");
  };

  return (
    <div className="p-6 md:p-8">
      <Toaster />
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Finance</p>
                <h1 className="text-3xl font-bold text-slate-900">Expenses</h1>
                <p className="text-slate-600 mt-1">Track school spending with cleaner records and faster review.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={openCatManager} className="gap-1.5">
                  <Settings2 className="w-4 h-4" />
                  Categories
                </Button>
                {canEditExpenses && (
                  <Button
                    onClick={() => {
                      setEditingExpense(null);
                      setShowForm(true);
                    }}
                    className="bg-rose-600 hover:bg-rose-700"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Expense
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="border border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Visible Spend</p>
              <p className="text-2xl font-bold text-slate-900">{formatNaira(analytics.total)}</p>
              <p className="text-xs text-slate-500 mt-1">Based on current filters</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">This Month</p>
              <p className="text-2xl font-bold text-slate-900">{formatNaira(analytics.monthTotal)}</p>
              <p className="text-xs text-slate-500 mt-1">Current month only</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Average Expense</p>
              <p className="text-2xl font-bold text-slate-900">{formatNaira(analytics.avgExpense)}</p>
              <p className="text-xs text-slate-500 mt-1">Per expense record</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Top Category</p>
              <p className="text-lg font-bold text-slate-900 line-clamp-1">
                {analytics.topCategory ? analytics.topCategory.label : "No data"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {analytics.topCategory ? formatNaira(analytics.topCategory.amount) : "Add expenses to see this"}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Spend by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.categoryChart.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">
                  No category data for this view.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={analytics.categoryChart}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ label }) => label}
                      labelLine={false}
                    >
                      {analytics.categoryChart.map((entry) => (
                        <Cell key={entry.value} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatNaira(value)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">8-Week Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatNaira(value)} />
                  <Line type="monotone" dataKey="amount" stroke="#e11d48" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <AnimatePresence>
          {showForm && (
            <ExpenseForm
              expense={editingExpense}
              categories={activeCategories}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingExpense(null);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCatManager && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            >
              <motion.div
                initial={{ scale: 0.96, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 8 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              >
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-slate-600" />
                    <h2 className="font-semibold text-slate-800">Manage Expense Categories</h2>
                  </div>
                  <button
                    onClick={() => setShowCatManager(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-3 max-h-80 overflow-y-auto">
                  {catDraft.map((cat, index) => (
                    <div key={cat.value} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: DEFAULT_EXPENSE_COLORS[cat.value] || PALETTE[index % PALETTE.length] }}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-700">{cat.label}</span>
                      <span className="text-xs text-slate-400 font-mono">{cat.value}</span>
                      <button
                        onClick={() => removeCategory(cat.value)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-3 flex gap-2">
                  <Input
                    value={newCatLabel}
                    onChange={(event) => setNewCatLabel(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && addCategory()}
                    placeholder="New category name..."
                    className="flex-1 h-9 text-sm"
                  />
                  <Button size="sm" onClick={addCategory} variant="outline" className="h-9 gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </Button>
                </div>

                <div className="flex justify-end gap-2 px-6 pb-5">
                  <Button variant="outline" onClick={() => setShowCatManager(false)} disabled={savingCats}>
                    Cancel
                  </Button>
                  <Button onClick={saveCats} disabled={savingCats} className="bg-rose-600 hover:bg-rose-700">
                    {savingCats ? "Saving..." : "Save Categories"}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="border border-slate-200">
          <CardHeader className="pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <CardTitle className="text-base">Expense Records</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  {sortedExpenses.length} record{sortedExpenses.length !== 1 ? "s" : ""} in view
                </p>
              </div>
              <div className="flex gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-3 py-1">
                  <Filter className="w-3.5 h-3.5" />
                  Filtered view
                </span>
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-3 py-1">
                  <Receipt className="w-3.5 h-3.5" />
                  Most recent first
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col xl:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search description, vendor, category, receipt..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                />
              </div>
              <ExpenseFilters
                filters={filters}
                categories={activeCategories}
                onFilterChange={setFilters}
                onReset={resetFilters}
              />
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Active:</span>
                {filters.expense_type !== "all" && (
                  <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-1 text-rose-700">
                    Category: {categoryLabels[filters.expense_type] || filters.expense_type}
                  </span>
                )}
                {filters.payment_method !== "all" && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-blue-700">
                    Method: {filters.payment_method.replace(/_/g, " ")}
                  </span>
                )}
                {searchTerm.trim() && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-slate-700">
                    Search: "{searchTerm.trim()}"
                  </span>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : sortedExpenses.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Wallet className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No expenses found for this view</p>
                <p className="text-sm mt-1">Try adjusting your filters or add a new expense.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {sortedExpenses.map((expense) => (
                    <ExpenseCard
                      key={expense.id}
                      expense={expense}
                      onEdit={canEditExpenses ? handleEdit : null}
                      onDelete={canEditExpenses ? handleDelete : null}
                      categoryColors={categoryColors}
                      categoryLabels={categoryLabels}
                    />
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
