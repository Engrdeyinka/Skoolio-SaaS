/**
 * SchoolVault.jsx
 * Ultra-simple document vault + Google Drive integration.
 *
 * • School Information   – editable registration numbers, centre codes
 * • Document Folders     – system + custom folders; files stored locally
 * • Drive linking        – paste a Drive folder URL to link each folder
 * • File management      – upload, download, delete
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Cloud, CloudOff, FolderOpen, Plus, Upload, Trash2, ExternalLink, RefreshCw,
  Save, X, Edit2, Check, AlertCircle, Loader2, Info, Download,
} from "lucide-react";
import {
  isDriveConnected, uploadToDrive, listDriveFiles, deleteDriveFile,
  createDriveFolder,
  restoreDriveConnection,
} from "@/lib/googleDriveService";
import { getVaultDriveConfig } from "@/lib/vaultConfig";
import { formatDateInLagos } from "@/lib/timezone";

function fmt(bytes) {
  if (!bytes) return "";
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
function fmtDate(iso) {
  if (!iso) return "";
  return formatDateInLagos(iso, { day: "2-digit", month: "short", year: "numeric" }, "en-GB");
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, toast: add };
}

function Toaster({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-[200] space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto
            ${t.type === "success" ? "bg-emerald-600 text-white" :
              t.type === "error" ? "bg-red-600 text-white" : "bg-slate-800 text-white"}`}>
          {t.type === "success" ? <Check className="w-4 h-4" /> :
           t.type === "error" ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export default function SchoolVault() {
  const { schoolName } = useSchoolSettings();
  const { toasts, toast } = useToast();

  // ── State ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("info"); // info | folders
  // infoFields: rows from vault_school_info — each is { id, key, label, value, is_custom, sort_order }
  const [infoFields, setInfoFields] = useState([]);
  // draftFields: local edit copy (may include unsaved rows with no id)
  const [draftFields, setDraftFields] = useState([]);
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [addingField, setAddingField] = useState(false);

  const [folders, setFolders] = useState([]);
  const [folderFileCounts, setFolderFileCounts] = useState({}); // { [folderId]: number }
  const [openFolder, setOpenFolder] = useState(null);
  const [folderFiles, setFolderFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConfig, setDriveConfig] = useState({});
  const [syncing, setSyncing] = useState({});

  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);

  const fileInputRef = useRef(null);
  const [clientId, setClientId] = useState("");

  // ── Load data ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      // Each row in vault_school_info is one field: { id, key, label, value, is_custom, sort_order }
      const { data: rows } = await supabase
        .from("vault_school_info")
        .select("*")
        .order("sort_order", { ascending: true });
      setInfoFields(rows || []);

      // Load folders
      const { data: folderData } = await supabase.from("vault_folders").select("*").order("created_at");
      setFolders(folderData || []);

      // Load Drive config
      const cfg = await getVaultDriveConfig();
      setDriveConfig(cfg || {});

      // Load client ID — pre-fill both the saved value AND the edit input
      const { data: clientData } = await supabase.from("vault_drive_config").select("google_client_id").limit(1);
      if (clientData?.length) {
        const savedClientId = clientData[0].google_client_id || "";
        setClientId(savedClientId);
        if (savedClientId) {
          const restored = await restoreDriveConnection(savedClientId);
          setDriveConnected(restored || isDriveConnected());
        }
      }

      // Check Drive connection
      if (!clientData?.length) setDriveConnected(isDriveConnected());
    } catch (e) {
      console.error("Load error:", e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Fetch file counts whenever Drive is connected and folders are loaded ──
  useEffect(() => {
    if (!driveConnected || folders.length === 0) return;
    const fetchCounts = async () => {
      const linked = folders.filter(f => f.drive_folder_id);
      if (!linked.length) return;
      const counts = {};
      await Promise.all(
        linked.map(async f => {
          try {
            const res = await listDriveFiles(f.drive_folder_id);
            counts[f.id] = (res?.files || []).length;
          } catch {
            counts[f.id] = null;
          }
        })
      );
      setFolderFileCounts(counts);
    };
    fetchCounts();
  }, [driveConnected, folders]);

  // ── Drive helpers ────────────────────────────────────────────────────────
  // ── Link a Drive folder to an app folder ─────────────────────────────────
  // ── Unlink a folder ───────────────────────────────────────────────────────
  // ── Load folder files ────────────────────────────────────────────────────
  // If Drive is connected and folder is linked → fetch directly from Drive (no DB sync).
  // Otherwise → fetch from local DB.
  const loadFolderFiles = async (folder) => {
    setLoadingFiles(true);
    try {
      if (driveConnected && folder.drive_folder_id) {
        const res = await listDriveFiles(folder.drive_folder_id);
        setFolderFiles(
          (res?.files || []).map(f => ({
            id: f.id,
            name: f.name,
            drive_file_id: f.id,
            drive_url: f.webViewLink || null,
            size_bytes: f.size ? parseInt(f.size, 10) : null,
            created_at: f.createdTime || null,
          }))
        );
      } else {
        const { data } = await supabase
          .from("vault_files")
          .select("*")
          .eq("folder_id", folder.id)
          .order("created_at", { ascending: false });
        setFolderFiles(data || []);
      }
    } catch (e) {
      console.error("Load files error:", e);
      toast(e.message || "Failed to load files", "error");
    }
    setLoadingFiles(false);
  };

  // ── Handle file upload ───────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !openFolder) return;
    setUploading(true);
    let uploadedCount = 0;
    let skippedCount = 0;
    try {
      for (const file of files) {
        // ── Duplicate check ──────────────────────────────────────────────
        const existing = folderFiles.find(
          f => f.name.toLowerCase() === file.name.toLowerCase()
        );
        if (existing) {
          const replace = confirm(
            `"${file.name}" already exists in this folder.\n\nReplace it with the new file?`
          );
          if (!replace) {
            skippedCount++;
            continue;
          }
          // Delete the old file from Drive before uploading the new one
          if (existing.drive_file_id) {
            await deleteDriveFile(existing.drive_file_id).catch(() => {});
          }
        }

        // ── Upload ───────────────────────────────────────────────────────
        const uploadRes = await uploadToDrive({
          name: file.name,
          blob: file,
          mimeType: file.type,
          parentId: openFolder.drive_folder_id || null,
        });
        if (uploadRes?.id) uploadedCount++;
      }

      if (uploadedCount > 0) {
        toast(
          skippedCount > 0
            ? `${uploadedCount} uploaded, ${skippedCount} skipped`
            : `${uploadedCount} file(s) uploaded`,
          "success"
        );
        await loadFolderFiles(openFolder);
        refreshFolderCount(openFolder);
      } else if (skippedCount > 0) {
        toast(`${skippedCount} file(s) skipped (already exist)`, "info");
      }
    } catch (err) {
      toast(err.message || "Upload failed", "error");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Refresh count for a single folder ───────────────────────────────────
  const refreshFolderCount = async (folder) => {
    if (!driveConnected || !folder?.drive_folder_id) return;
    try {
      const res = await listDriveFiles(folder.drive_folder_id);
      setFolderFileCounts(prev => ({ ...prev, [folder.id]: (res?.files || []).length }));
    } catch {}
  };

  // ── Delete a file ────────────────────────────────────────────────────────
  const deleteFile = async (file) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      if (file.drive_file_id) {
        await deleteDriveFile(file.drive_file_id);
      }
      // Best-effort DB cleanup (may not exist if file came from Drive directly)
      await supabase.from("vault_files").delete().eq("drive_file_id", file.drive_file_id).catch(() => {});
      toast("File deleted", "success");
      await loadFolderFiles(openFolder);
      refreshFolderCount(openFolder);
    } catch (e) {
      toast(e.message || "Delete failed", "error");
    }
  };

  // ── Enter edit mode ──────────────────────────────────────────────────────
  const startEditInfo = () => {
    setDraftFields(infoFields.map(f => ({ ...f }))); // deep copy
    setEditingInfo(true);
  };

  // ── Add a field to the draft (not saved yet) ─────────────────────────────
  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    const label = newFieldLabel.trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setDraftFields(prev => [
      ...prev,
      { _tempId: Date.now(), key, label, value: "", is_custom: true, sort_order: prev.length },
    ]);
    setNewFieldLabel("");
    setAddingField(false);
  };

  // ── Delete a field ────────────────────────────────────────────────────────
  // If it has a real DB id, delete immediately; if it's a new unsaved row, just remove from draft.
  const deleteField = async (field) => {
    if (!confirm("Delete this field and its value?")) return;
    if (field.id) {
      try {
        const { error } = await supabase.from("vault_school_info").delete().eq("id", field.id);
        if (error) throw error;
        setInfoFields(prev => prev.filter(f => f.id !== field.id));
        setDraftFields(prev => prev.filter(f => f.id !== field.id));
      } catch (e) {
        toast(e.message || "Delete failed", "error");
      }
    } else {
      setDraftFields(prev => prev.filter(f => f._tempId !== field._tempId));
    }
  };

  // ── Save school info ──────────────────────────────────────────────────────
  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      for (const field of draftFields) {
        if (field.id) {
          // Existing row — update value only
          const { error } = await supabase
            .from("vault_school_info")
            .update({ value: field.value || "", updated_at: new Date().toISOString() })
            .eq("id", field.id);
          if (error) throw error;
        } else {
          // New row — insert
          const { error } = await supabase.from("vault_school_info").insert({
            key: field.key,
            label: field.label,
            value: field.value || "",
            is_custom: true,
            sort_order: field.sort_order ?? 99,
          });
          if (error) throw error;
        }
      }
      setEditingInfo(false);
      setAddingField(false);
      toast("Saved", "success");
      load();
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
    setSavingInfo(false);
  };

  // ── Delete a folder ─────────────────────────────────────────────────────
  const deleteFolder = async (folder, e) => {
    e.stopPropagation(); // prevent opening the folder
    const hasDrive = folder.drive_folder_id && driveConnected;
    const msg = hasDrive
      ? `Delete folder "${folder.name}" and all its files from the app AND Google Drive? This cannot be undone.`
      : `Delete folder "${folder.name}" and all its files? This cannot be undone.`;
    if (!confirm(msg)) return;
    try {
      // Delete each file from Drive if linked
      const { data: files } = await supabase.from("vault_files").select("drive_file_id").eq("folder_id", folder.id);
      if (hasDrive && files?.length) {
        for (const f of files) {
          if (f.drive_file_id) {
            await deleteDriveFile(f.drive_file_id).catch(() => {}); // best-effort
          }
        }
      }
      // Delete the Drive folder itself
      if (hasDrive) {
        await deleteDriveFile(folder.drive_folder_id).catch(() => {});
      }
      // Delete all files in this folder from DB
      await supabase.from("vault_files").delete().eq("folder_id", folder.id);
      // Delete the folder itself from DB
      const { error } = await supabase.from("vault_folders").delete().eq("id", folder.id);
      if (error) throw error;
      toast(`"${folder.name}" deleted`, "success");
      load();
    } catch (err) {
      toast(err.message || "Delete failed", "error");
    }
  };

  // ── Add custom folder ────────────────────────────────────────────────────
  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    setAddingFolder(true);
    try {
      let driveFolderId = null;

      // If Drive is connected, create the folder inside the root School Vault folder on Drive
      if (driveConnected) {
        try {
          const parentId = driveConfig?.root_folder_id || null;
          const driveFolder = await createDriveFolder(newFolderName.trim(), parentId);
          driveFolderId = driveFolder?.id || null;
        } catch (driveErr) {
          toast(`Folder created locally (Drive error: ${driveErr.message})`, "info");
        }
      }

      const { error } = await supabase.from("vault_folders").insert({
        name: newFolderName.trim(),
        is_system: false,
        drive_folder_id: driveFolderId,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;

      setNewFolderName("");
      setShowAddFolder(false);
      toast(driveFolderId ? "Folder created and linked to Drive ✓" : "Folder created", "success");
      load();
    } catch (e) {
      toast(e.message || "Create failed", "error");
    }
    setAddingFolder(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <Toaster toasts={toasts} />

      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">📚 School Vault</h1>
        <p className="text-slate-600 mb-3">Manage school documents and settings</p>
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-6 bg-white rounded-xl p-1 w-fit">
          {[
            ["info", "📋 School Info"],
            ["folders", "📁 Documents"],
          ].map(([t, label]) => (
            <button key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                tab === t ? "bg-emerald-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}>
              {label}
            </button>
          ))}
          <span
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              driveConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : clientId
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
            title="Manage connection in Settings > School Info"
          >
            {driveConnected ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            {driveConnected
              ? "Drive mounted"
              : clientId
                ? "Drive not mounted"
                : "Drive not configured"}
          </span>
        </div>

        {/* ── INFO TAB ────────────────────────────────────────────────────────────── */}
        {tab === "info" && (
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Registration &amp; Centre Numbers</h2>
                <p className="text-sm text-slate-400 mt-0.5">Stored securely — only visible to admins</p>
              </div>
              {!editingInfo && (
                <Button onClick={startEditInfo} variant="outline" size="sm" className="gap-2">
                  <Edit2 className="w-4 h-4" /> Edit
                </Button>
              )}
            </div>

            {editingInfo ? (
              <div className="mt-6 space-y-4">
                {/* Existing + new draft fields */}
                {draftFields.length > 0 && (
                  <div className="space-y-3 pb-4 border-b border-slate-100">
                    {draftFields.map(field => (
                      <div key={field.id ?? field._tempId} className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-slate-700 block mb-1">{field.label}</label>
                          <Input
                            value={field.value || ""}
                            onChange={e => setDraftFields(prev =>
                              prev.map(f =>
                                (f.id ?? f._tempId) === (field.id ?? field._tempId)
                                  ? { ...f, value: e.target.value }
                                  : f
                              )
                            )}
                            placeholder={`Enter ${field.label}`}
                          />
                        </div>
                        <button
                          onClick={() => deleteField(field)}
                          className="p-2 mb-0.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition"
                          title="Delete field">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new field */}
                <div className="pt-1">
                  {addingField ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        value={newFieldLabel}
                        onChange={e => setNewFieldLabel(e.target.value)}
                        placeholder="Field name, e.g. WAEC Centre Number…"
                        onKeyDown={e => {
                          if (e.key === "Enter") addCustomField();
                          if (e.key === "Escape") setAddingField(false);
                        }}
                      />
                      <Button onClick={addCustomField} disabled={!newFieldLabel.trim()} size="sm">Add</Button>
                      <Button onClick={() => { setAddingField(false); setNewFieldLabel(""); }} variant="outline" size="sm">Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingField(true)}
                      className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-medium transition">
                      <Plus className="w-4 h-4" /> Add field
                    </button>
                  )}
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-2">
                  <Button onClick={saveInfo} disabled={savingInfo} className="gap-1">
                    {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                  <Button onClick={() => { setEditingInfo(false); setAddingField(false); setDraftFields([]); }} variant="outline">Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                {infoFields.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-400 text-sm">No fields yet — click <span className="font-medium text-slate-600">Edit</span> to add your first field</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {infoFields.map(field => (
                      <div key={field.id} className="py-4 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium text-slate-800">{field.label}</p>
                        {field.value ? (
                          <p className="text-sm text-slate-900 mt-0.5">{field.value}</p>
                        ) : (
                          <p className="text-sm italic text-slate-400 mt-0.5">Not set</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FOLDERS TAB ─────────────────────────────────────────────────────────── */}
        {tab === "folders" && (
          <div className="space-y-6">
            {openFolder ? (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setOpenFolder(null)} className="text-emerald-600 hover:text-emerald-800 font-medium text-sm flex items-center gap-1">
                    ← Back to folders
                  </button>
                  <div className="flex gap-2">
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1" size="sm">
                      <Upload className="w-4 h-4" /> Upload
                    </Button>
                    <Button onClick={() => loadFolderFiles(openFolder)} disabled={loadingFiles} variant="outline" size="sm" className="gap-1">
                      <RefreshCw className={`w-4 h-4 ${loadingFiles ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  </div>
                </div>
                <input type="file" ref={fileInputRef} multiple onChange={handleUpload} className="hidden" />

                <h3 className="text-xl font-bold text-slate-900 mb-4">{openFolder.icon} {openFolder.name}</h3>

                {loadingFiles ? (
                  <p className="text-slate-500 text-center py-8">Loading files...</p>
                ) : folderFiles.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No files yet</p>
                ) : (
                  <div className="space-y-2">
                    {folderFiles.map(f => (
                      <div key={f.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{f.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{fmt(f.size_bytes)} • {fmtDate(f.created_at)}</p>
                        </div>
                        <div className="flex gap-2">
                          {f.drive_url && (
                            <a href={f.drive_url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <button onClick={() => deleteFile(f)} className="p-1.5 hover:bg-red-100 rounded-lg text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-900">Document Folders</h2>
                  {!showAddFolder && (
                    <Button onClick={() => setShowAddFolder(true)} className="gap-1" size="sm">
                      <Plus className="w-4 h-4" /> Add Folder
                    </Button>
                  )}
                </div>

                {showAddFolder && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-2">
                    <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="New folder name..." />
                    <Button onClick={addFolder} disabled={addingFolder} size="sm">Add</Button>
                    <Button onClick={() => setShowAddFolder(false)} variant="outline" size="sm">Cancel</Button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {folders.map(f => (
                    <div key={f.id}
                      onClick={() => { setOpenFolder(f); loadFolderFiles(f); }}
                      className="relative text-left p-5 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition cursor-pointer group">
                      {/* Delete button */}
                      <button
                        onClick={(e) => deleteFolder(f, e)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-400 hover:text-red-600 transition"
                        title="Delete folder">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="text-3xl mb-2">{f.icon}</div>
                      <h3 className="font-semibold text-slate-900">{f.name}</h3>
                      {f.drive_folder_id ? (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs text-slate-500">
                            {folderFileCounts[f.id] != null
                              ? `${folderFileCounts[f.id]} file${folderFileCounts[f.id] !== 1 ? "s" : ""}`
                              : "—"}
                          </p>
                          <p className="text-xs text-blue-600 flex items-center gap-1"><Cloud className="w-3 h-3" /> Linked to Drive</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1">Not linked</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
