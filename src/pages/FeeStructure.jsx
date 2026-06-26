import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Plus, Trash2, Save, Receipt, Loader2 } from "lucide-react";

const CLASS_GROUPS = {
  "Early Years": ["KG", "Nursery 1", "Nursery 2"],
  "Primary": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"],
  "Junior Secondary": ["JSS 1", "JSS 2", "JSS 3"],
  "Senior Secondary": ["SSS 1", "SSS 2", "SSS 3"],
};
const ALL_LEVELS = Object.values(CLASS_GROUPS).flat();
const TERMS = ["All Terms", "First Term", "Second Term", "Third Term"];
const DEFAULT_FEES = [
  { name: "School Fees (Tuition)", description: "Core academic tuition", term: "All Terms", display_order: 0 },
  { name: "Feeding Fee", description: "Daily school meals", term: "All Terms", display_order: 1 },
  { name: "Bus/Transport Fee", description: "School bus service", term: "All Terms", display_order: 2 },
];

function parseNum(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function FeeStructure() {
  const [fees, setFees] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTerm, setNewTerm] = useState("All Terms");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fee_structures").select("*").order("display_order");
      if (error) throw error;
      setFees(data || []);
      const d = {};
      (data || []).forEach(f => { d[f.id] = { ...(f.amounts || {}) }; });
      setDraft(d);
    } catch (e) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const setAmount = (feeId, level, val) =>
    setDraft(p => ({ ...p, [feeId]: { ...(p[feeId] || {}), [level]: val } }));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const f of fees) {
        const amounts = {};
        ALL_LEVELS.forEach(l => { amounts[l] = parseNum(draft[f.id]?.[l]); });
        await supabase.from("fee_structures").update({ amounts }).eq("id", f.id);
      }
      toast({ title: "Saved", description: "All fee amounts updated." });
      load();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const addFee = async () => {
    if (!newName.trim()) return;
    try {
      const amounts = {};
      ALL_LEVELS.forEach(l => { amounts[l] = 0; });
      await supabase.from("fee_structures").insert({
        name: newName.trim(), description: newDesc.trim(), term: newTerm,
        amounts, display_order: fees.length,
      });
      setShowAdd(false); setNewName(""); setNewDesc("");
      toast({ title: "Fee type added" }); load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const seedDefaults = async () => {
    try {
      for (const f of DEFAULT_FEES) {
        const amounts = {};
        ALL_LEVELS.forEach(l => { amounts[l] = 0; });
        await supabase.from("fee_structures").insert({ ...f, amounts });
      }
      toast({ title: "Default fee types added" }); load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteFee = async (id) => {
    try {
      await supabase.from("fee_structures").delete().eq("id", id);
      toast({ title: "Deleted" }); load();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fee Structure</h1>
            <p className="text-sm text-slate-500 mt-0.5">Set fee amounts for each class level</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowAdd(true)} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <Plus className="w-4 h-4" /> Add Fee Type
            </Button>
            <Button onClick={saveAll} disabled={saving || fees.length === 0} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </Button>
          </div>
        </div>

        {/* Level group chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(CLASS_GROUPS).map(([g, lvls]) => (
            <div key={g} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-600">{g}</span>
              <span className="text-slate-400">({lvls.length} classes)</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : fees.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200">
            <CardContent className="flex flex-col items-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Receipt className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700 text-lg">No fee types yet</p>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">Define your school's fee categories, then set amounts per class level.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={seedDefaults}>Use defaults (Tuition, Feeding, Bus)</Button>
                <Button onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  <Plus className="w-4 h-4" /> Add Fee Type
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 bg-slate-700 text-white font-semibold min-w-[200px] sticky left-0 z-20 border-r border-slate-600">
                      Fee Type
                    </th>
                    {Object.entries(CLASS_GROUPS).map(([group, levels]) =>
                      levels.map((cl, i) => (
                        <th key={cl} className={`px-2 py-2 bg-slate-700 text-white font-medium min-w-[88px] text-center ${i === 0 ? 'border-l-2 border-slate-500' : ''}`}>
                          {i === 0 && (
                            <div className="text-[9px] text-slate-400 font-normal uppercase tracking-wide mb-0.5">{group}</div>
                          )}
                          <div className="text-xs">{cl}</div>
                        </th>
                      ))
                    )}
                    <th className="px-2 py-3 bg-slate-700 w-10 sticky right-0 z-20" />
                  </tr>
                </thead>
                <tbody>
                  {fees.map((f, idx) => (
                    <tr key={f.id} className={`border-b border-slate-100 hover:bg-emerald-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10 border-r border-slate-200">
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{f.name}</p>
                        {f.description && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{f.description}</p>}
                        {f.term !== "All Terms" && (
                          <Badge variant="outline" className="mt-1 text-[10px] py-0 px-1.5 h-4">{f.term}</Badge>
                        )}
                      </td>
                      {Object.values(CLASS_GROUPS).flat().map((cl, i, arr) => {
                        const isGroupStart = Object.values(CLASS_GROUPS).some(g => g[0] === cl);
                        return (
                          <td key={cl} className={`px-1.5 py-2 ${isGroupStart ? 'border-l-2 border-slate-200' : ''}`}>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">₦</span>
                              <Input
                                className="pl-5 pr-1 h-8 text-xs text-right border-slate-200 focus:border-emerald-400 bg-white w-full"
                                value={draft[f.id]?.[cl] ?? (f.amounts?.[cl] || "")}
                                onChange={e => setAmount(f.id, cl, e.target.value)}
                                placeholder="0"
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-1.5 py-2 sticky right-0 bg-inherit z-10">
                        <button
                          onClick={() => deleteFee(f.id)}
                          title="Delete fee type"
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-500">{fees.length} fee type{fees.length !== 1 ? 's' : ''} · Enter amounts in Naira (₦) · Click Save All when done</p>
              <Button onClick={saveAll} disabled={saving} size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-8">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save All
              </Button>
            </div>
          </Card>
        )}

        {/* Add fee type modal */}
        {showAdd && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <Card className="w-full max-w-sm shadow-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Fee Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">Fee Name *</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Development Levy" className="mt-1" autoFocus />
                </div>
                <div>
                  <Label className="text-sm">Description</Label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    placeholder="Optional short description" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Applicable Term</Label>
                  <select
                    value={newTerm} onChange={e => setNewTerm(e.target.value)}
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={addFee} disabled={!newName.trim()}>
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
