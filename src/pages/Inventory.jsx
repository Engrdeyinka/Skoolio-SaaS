import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  Plus, Search, Trash2, X, Loader2, Package,
  Edit2, Check, Filter, ChevronDown,
} from "lucide-react";

const CATEGORIES = [
  "Furniture", "Electronics", "Books & Stationery", "Sports Equipment",
  "Laboratory", "Kitchen & Feeding", "Cleaning Supplies", "Office Equipment", "Other"
];

const CONDITIONS = ["excellent", "good", "fair", "poor", "damaged"];

const CONDITION_STYLES = {
  excellent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  good:      "bg-blue-100 text-blue-800 border-blue-200",
  fair:      "bg-amber-100 text-amber-800 border-amber-200",
  poor:      "bg-orange-100 text-orange-800 border-orange-200",
  damaged:   "bg-red-100 text-red-800 border-red-200",
};

const EMPTY_FORM = {
  name: "", category: "Furniture", quantity: 1, unit: "unit",
  condition: "good", location: "", purchase_date: "", purchase_price: "", notes: ""
};

function ConditionBadge({ condition }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${CONDITION_STYLES[condition] || CONDITION_STYLES.good}`}>
      {condition}
    </span>
  );
}

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [condFilter, setCondFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_items").select("*").order("category").order("name");
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      toast({ title: "Failed to load inventory", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditItem(null); setShowForm(true); };
  const openEdit = (item) => {
    setForm({
      name: item.name, category: item.category, quantity: item.quantity,
      unit: item.unit || "unit", condition: item.condition,
      location: item.location || "", purchase_date: item.purchase_date || "",
      purchase_price: item.purchase_price || "", notes: item.notes || ""
    });
    setEditItem(item);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        quantity: parseInt(form.quantity) || 1,
        unit: form.unit.trim() || "unit",
        condition: form.condition,
        location: form.location.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_price: parseFloat(form.purchase_price) || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editItem) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "Item updated" });
      } else {
        const { error } = await supabase.from("inventory_items").insert(payload);
        if (error) throw error;
        toast({ title: "Item added" });
      }
      closeForm();
      load();
    } catch (e) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
      if (error) throw error;
      toast({ title: "Item deleted" });
      setItems(p => p.filter(i => i.id !== item.id));
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.name.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q) || i.notes?.toLowerCase().includes(q);
    const matchCat = catFilter === "All" || i.category === catFilter;
    const matchCond = condFilter === "All" || i.condition === condFilter;
    return matchSearch && matchCat && matchCond;
  });

  // Stats
  const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const needsAttention = items.filter(i => i.condition === "poor" || i.condition === "damaged").length;
  const totalValue = items.reduce((s, i) => s + ((i.purchase_price || 0) * (i.quantity || 1)), 0);
  const categories = [...new Set(items.map(i => i.category))];

  // Group filtered items by category
  const grouped = filtered.reduce((g, i) => {
    (g[i.category] = g[i.category] || []).push(i);
    return g;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track school equipment, furniture, and supplies</p>
          </div>
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Items", value: totalItems, sub: `${items.length} entries`, color: "bg-emerald-50 text-emerald-700" },
            { label: "Categories", value: categories.length, sub: "in use", color: "bg-blue-50 text-blue-700" },
            { label: "Needs Attention", value: needsAttention, sub: "poor/damaged", color: needsAttention > 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600" },
            { label: "Total Value", value: `₦${totalValue.toLocaleString()}`, sub: "purchase cost", color: "bg-amber-50 text-amber-700", small: true },
          ].map(s => (
            <div key={s.label} className={`rounded-xl px-4 py-3.5 ${s.color} border border-current/10`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
              <p className={`font-bold mt-1 ${s.small ? 'text-xl' : 'text-3xl'}`}>{s.value}</p>
              <p className="text-xs opacity-60 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search items..." className="pl-9 h-9 text-sm" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={condFilter} onChange={e => setCondFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 capitalize">
            <option value="All">All Conditions</option>
            {CONDITIONS.map(c => <option key={c} className="capitalize">{c}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200">
            <CardContent className="flex flex-col items-center py-20 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Package className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700 text-lg">No inventory yet</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">Start tracking school assets — furniture, electronics, books, and more.</p>
              </div>
              <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 gap-2 mt-1">
                <Plus className="w-4 h-4" /> Add First Item
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 font-medium">No items match your filters</p>
            <button onClick={() => { setSearch(""); setCatFilter("All"); setCondFilter("All"); }}
              className="text-emerald-600 text-sm mt-1 hover:underline">Clear filters</button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide">{cat}</h2>
                  <span className="text-xs text-slate-400 font-medium">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Item</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Qty</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden sm:table-cell">Location</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Condition</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden md:table-cell">Value</th>
                        <th className="px-2 py-2.5 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {catItems.map(item => (
                        <tr key={item.id} className="hover:bg-emerald-50/30 transition-colors group">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 text-sm">{item.name}</p>
                            {item.notes && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.notes}</p>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-semibold text-slate-700">{item.quantity}</span>
                            <span className="text-slate-400 text-xs ml-0.5">{item.unit}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-500 text-sm hidden sm:table-cell">
                            {item.location || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <ConditionBadge condition={item.condition} />
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 hidden md:table-cell">
                            {item.purchase_price
                              ? <span className="font-medium">₦{(item.purchase_price * item.quantity).toLocaleString()}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(item)}
                                className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteItem(item)}
                                className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
            <Card className="w-full max-w-lg shadow-2xl border-0 my-4">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-base font-bold text-slate-900">{editItem ? "Edit Item" : "Add Inventory Item"}</h2>
                <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-sm">Item Name *</Label>
                    <Input value={form.name} onChange={e => set("name", e.target.value)}
                      placeholder="e.g. Plastic Chair" className="mt-1.5" autoFocus />
                  </div>
                  <div>
                    <Label className="text-sm">Category</Label>
                    <select value={form.category} onChange={e => set("category", e.target.value)}
                      className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">Condition</Label>
                    <select value={form.condition} onChange={e => set("condition", e.target.value)}
                      className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring">
                      {CONDITIONS.map(c => <option key={c} className="capitalize">{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">Quantity</Label>
                    <Input type="number" min={1} value={form.quantity}
                      onChange={e => set("quantity", e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm">Unit</Label>
                    <Input value={form.unit} onChange={e => set("unit", e.target.value)}
                      placeholder="unit / set / box" className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Location</Label>
                    <Input value={form.location} onChange={e => set("location", e.target.value)}
                      placeholder="e.g. Block A, Room 3 / Library / Store" className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm">Purchase Date</Label>
                    <Input type="date" value={form.purchase_date} onChange={e => set("purchase_date", e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm">Purchase Price (₦)</Label>
                    <Input type="number" min={0} value={form.purchase_price}
                      onChange={e => set("purchase_price", e.target.value)}
                      placeholder="per unit" className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Notes</Label>
                    <Input value={form.notes} onChange={e => set("notes", e.target.value)}
                      placeholder="Optional notes or description" className="mt-1.5" />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button variant="outline" className="flex-1" onClick={closeForm}>Cancel</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                    disabled={!form.name.trim() || saving} onClick={save}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editItem ? "Save Changes" : "Add Item"}
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
