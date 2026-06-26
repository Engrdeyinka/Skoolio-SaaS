import { useMemo, useState } from "react";
import { ClassFee } from "@/entities/ClassFee";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { createApprovalRequest } from "@/lib/approvalRequests";
import { logChange } from "@/lib/changeHistory";
import { isSuperAdmin } from "@/lib/permissions";
import { Edit, Plus, Trash2, Check, X, BookOpen } from "lucide-react";
import { getEffectiveClassFee, getExactClassFee } from "@/lib/classFeeUtils";

function isLegacyClassFeeScopeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes('class_fees_grade_key') || message.includes('duplicate key value violates unique constraint "class_fees_grade_key"');
}

function getClassFeeMigrationHelp(term, academicYear) {
  const scopeLabel = [term, academicYear].filter(Boolean).join(" ");
  return `Your database still allows only one fee row per grade, so ${scopeLabel || "this fee schedule"} cannot be saved as a separate term record yet. Run the class_fees section of migrate-columns.sql in Supabase to replace class_fees_grade_key with scoped uniqueness by grade + term + academic year.`;
}

function fmtAmount(n) {
  if (n >= 1_000_000) return `N${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `N${(n / 1_000).toFixed(1)}K`;
  return `N${Number(n || 0).toLocaleString()}`;
}

export default function FeeStructureManager({ classFees, onRefresh, term, academicYear }) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [editingGrade, setEditingGrade] = useState(null);
  const [editTuition, setEditTuition] = useState("");
  const [editOtherFees, setEditOtherFees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState("");

  const grades = useMemo(() => {
    const set = new Set((classFees || []).map((cf) => cf.grade).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classFees]);

  const resolvedByGrade = useMemo(() => {
    const map = {};
    for (const grade of grades) {
      map[grade] = getEffectiveClassFee(classFees || [], { grade, term, academicYear }) || {};
    }
    return map;
  }, [classFees, grades, term, academicYear]);

  const exactByGrade = useMemo(() => {
    const map = {};
    for (const grade of grades) {
      map[grade] = getExactClassFee(classFees || [], { grade, term, academicYear }) || null;
    }
    return map;
  }, [classFees, grades, term, academicYear]);

  const startEdit = (grade) => {
    const cf = resolvedByGrade[grade] || {};
    setMigrationNotice("");
    setEditingGrade(grade);
    setEditTuition(String(cf.termly_tuition || ""));
    setEditOtherFees(
      Array.isArray(cf.other_fees)
        ? cf.other_fees.map((fee) => ({ name: fee.name || "", amount: String(fee.amount || "") }))
        : []
    );
  };

  const cancelEdit = () => {
    setEditingGrade(null);
    setEditTuition("");
    setEditOtherFees([]);
  };

  const addOtherFee = () => {
    setEditOtherFees((prev) => [...prev, { name: "", amount: "" }]);
  };

  const removeOtherFee = (index) => {
    setEditOtherFees((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateOtherFee = (index, field, value) => {
    setEditOtherFees((prev) =>
      prev.map((fee, idx) => (idx === index ? { ...fee, [field]: value } : fee))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setMigrationNotice("");
      const tuition = Number(editTuition) || 0;
      const other_fees = editOtherFees
        .filter((fee) => fee.name.trim())
        .map((fee) => ({ name: fee.name.trim(), amount: Number(fee.amount) || 0 }));

      const payload = {
        grade: editingGrade,
        termly_tuition: tuition,
        other_fees,
        term: term || null,
        academic_year: academicYear || null,
      };

      const existing = exactByGrade[editingGrade];
      const isSuperAdminUser = isSuperAdmin(currentUser);
      const performedBy = currentUser?.school_role || currentUser?.full_name || "admin";
      const feeLabel = `${editingGrade} fee schedule for ${term || "selected term"} ${academicYear || ""}`.trim();

      if (isSuperAdminUser) {
        let savedRecord = null;
        if (existing?.id) {
          savedRecord = await ClassFee.update(existing.id, payload);
        } else {
          savedRecord = await ClassFee.create(payload);
        }

        await logChange({
          action: existing?.id ? "class_fee_updated" : "class_fee_created",
          entityType: "class_fee",
          entityId: savedRecord?.id || existing?.id || `${editingGrade}:${term}:${academicYear}`,
          performedBy,
          summary: `${feeLabel} was ${existing?.id ? "updated" : "created"}.`,
          before: existing || null,
          after: payload,
          details: {
            grade: editingGrade,
            term: term || null,
            academic_year: academicYear || null,
          },
        });

        toast({
          title: "Fee schedule saved",
          description: `${editingGrade} fees were updated for ${term || "the selected term"}.`,
        });
      } else {
        await createApprovalRequest({
          entityType: "class_fee",
          entityLabel: feeLabel,
          operation: existing?.id ? "update" : "create",
          recordId: existing?.id || `${editingGrade}:${term}:${academicYear}`,
          currentData: existing || null,
          proposedData: payload,
          requestedBy: currentUser?.id || null,
          requestedByRole: currentUser?.school_role || "admin",
          requestedByName: currentUser?.full_name || currentUser?.email || "Admin",
          summary: `Fee schedule approval requested for ${editingGrade} in ${term || "selected term"} ${academicYear || ""}.`,
          metadata: {
            grade: editingGrade,
            term: term || null,
            academic_year: academicYear || null,
          },
        });

        toast({
          title: "Approval requested",
          description: `${editingGrade} fee change is waiting for superadmin approval.`,
        });
      }

      cancelEdit();
      onRefresh?.();
    } catch (error) {
      console.error("Save fee structure error:", error);
      if (isLegacyClassFeeScopeError(error)) {
        const helpText = getClassFeeMigrationHelp(term, academicYear);
        setMigrationNotice(helpText);
        toast({
          title: "Database migration needed",
          description: helpText,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Save failed",
        description: error?.message || "Could not save this fee structure.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Fee Structure by Grade</h2>
          <p className="text-sm text-slate-500">
            Manage tuition and other fees for {term || "selected term"} {academicYear || ""}
          </p>
        </div>
      </div>

      {migrationNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Fee schedule migration needed</p>
          <p className="mt-1 leading-6">{migrationNotice}</p>
          <p className="mt-2 text-amber-800">
            SQL file: <span className="font-medium">migrate-columns.sql</span>
          </p>
        </div>
      ) : null}

      <div className="max-w-5xl overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Grade</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Tuition</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-600">Other Fees</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600">Total</th>
              <th className="text-center py-3 px-4 font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade) => {
              const cf = resolvedByGrade[grade] || {};
              const tuition = Number(cf.termly_tuition) || 0;
              const otherFees = Array.isArray(cf.other_fees) ? cf.other_fees : [];
              const otherTotal = otherFees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
              const total = tuition + otherTotal;

              if (editingGrade === grade) {
                return (
                  <tr key={grade} className="border-b border-slate-100 bg-blue-50/40">
                    <td className="py-3 px-4 font-semibold text-slate-900">{grade}</td>
                    <td className="py-3 px-4" colSpan={3}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-600 w-20">Tuition (N)</label>
                          <Input
                            type="number"
                            value={editTuition}
                            onChange={(event) => setEditTuition(event.target.value)}
                            className="w-40 h-8 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600">Other Fees</p>
                          {editOtherFees.map((fee, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Input
                                value={fee.name}
                                onChange={(event) => updateOtherFee(idx, "name", event.target.value)}
                                placeholder="Fee name"
                                className="flex-1 h-8 text-sm"
                              />
                              <Input
                                type="number"
                                value={fee.amount}
                                onChange={(event) => updateOtherFee(idx, "amount", event.target.value)}
                                placeholder="Amount"
                                className="w-32 h-8 text-sm"
                              />
                              <button
                                onClick={() => removeOtherFee(idx)}
                                className="text-red-400 hover:text-red-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={addOtherFee}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add fee
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={saving}
                          className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                          className="h-7 px-2 text-xs"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={grade} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">{grade}</td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {tuition > 0 ? fmtAmount(tuition) : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="py-3 px-4">
                    {otherFees.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {otherFees.map((fee, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs text-slate-600 border-slate-300">
                            {fee.name}: {fmtAmount(Number(fee.amount) || 0)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">None</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">
                    {total > 0 ? fmtAmount(total) : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => startEdit(grade)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium transition-colors"
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {grades.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No fee structures configured yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
