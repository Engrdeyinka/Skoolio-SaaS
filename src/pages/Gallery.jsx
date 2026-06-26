import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/lib/AuthContext";
import { isAdmin, isSuperAdmin, isTeacher } from "@/lib/permissions";
import {
  isDriveConnected, restoreDriveConnection,
  uploadToDrive, createDriveFolder, findDriveFolder, listDriveFiles, deleteDriveFile, getDriveFile, downloadDriveFile,
} from "@/lib/googleDriveService";
import { getVaultDriveConfig } from "@/lib/vaultConfig";
import {
  Plus, ArrowLeft, Upload, Trash2, X,
  ChevronLeft, ChevronRight, Image, Loader2,
  Camera, Calendar, Pencil, HardDrive, CheckCircle2,
} from "lucide-react";

const GALLERY_ROOT_FOLDER_NAME = "School Gallery";

// ── Drive folder ID cache (localStorage so it persists across sessions) ────────
function loadFolderCache() {
  try { return JSON.parse(localStorage.getItem("__gallery_folders__") || "{}"); } catch { return {}; }
}
function saveFolderCache(cache) {
  try { localStorage.setItem("__gallery_folders__", JSON.stringify(cache)); } catch {}
}

function driveImageUrl(file) {
  return file?.thumbnailLink || file?.webContentLink || (file?.id ? `https://drive.google.com/uc?export=view&id=${file.id}` : "");
}

// ── Supabase bucket ────────────────────────────────────────────────────────────
async function ensureGalleryBucket() {
  const { error } = await supabase.storage.createBucket("gallery", { public: true, fileSizeLimit: 52428800 });
  if (error && !error.message?.includes("already exists")) console.warn("Bucket:", error.message);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Gallery() {
  const [view, setView] = useState("albums");
  const [albums, setAlbums] = useState([]);
  const [currentAlbum, setCurrentAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aDesc, setADesc] = useState("");
  const [aDate, setADate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editAlbum, setEditAlbum] = useState(null);
  const [eTitle, setETitle] = useState("");
  const [eDate, setEDate] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [confirm, setConfirm] = useState(null); // { message, onConfirm }

  // Drive state
  const [driveConnected, setDriveConnected] = useState(() => isDriveConnected());
  const [driveClientId, setDriveClientId] = useState(null);
  const [galleryRootDriveId, setGalleryRootDriveId] = useState(null);
  const folderCache = useRef(loadFolderCache());
  const driveConnectedRef = useRef(driveConnected);

  const fileRef = useRef();
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user && (isSuperAdmin(user) || isAdmin(user));
  const canUploadPhotos = canEdit || (user && isTeacher(user));
  const canUploadRef = useRef(canUploadPhotos);

  // Load client ID from vault config
  useEffect(() => {
    getVaultDriveConfig()
      .then(async cfg => {
        if (cfg?.google_client_id) {
          setDriveClientId(cfg.google_client_id);
          const restored = await restoreDriveConnection(cfg.google_client_id);
          setDriveConnected(restored || isDriveConnected());
          const cachedRoot = folderCache.current.__root__;
          if (cachedRoot) setGalleryRootDriveId(cachedRoot);
        }
      })
      .catch(() => {});
  }, []);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("photo_albums").select("*")
        .order("event_date", { ascending: false });
      if (error) throw error;
      const synced = await syncAlbumsWithDrive(data || []);
      setAlbums(synced);
    } catch (e) {
      toast({ title: "Failed to load albums", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { ensureGalleryBucket(); loadAlbums(); }, [loadAlbums]);

  // Keep a live ref to the Drive connection so memoized loaders never read a stale value
  useEffect(() => { driveConnectedRef.current = driveConnected; }, [driveConnected]);
  useEffect(() => { canUploadRef.current = canUploadPhotos; }, [canUploadPhotos]);

  // Re-sync albums once the Drive connection is restored after mount
  useEffect(() => { if (driveConnected) loadAlbums(); }, [driveConnected, loadAlbums]);

  const loadPhotos = useCallback(async (albumId, album = null) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("gallery_photos").select("*")
        .eq("album_id", albumId).order("created_at");
      if (error) throw error;
      const synced = await syncAlbumWithDrive(album || currentAlbum, data || []);
      setPhotos(synced || []);
    } catch (e) {
      toast({ title: "Failed to load photos", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  const openAlbum = (album) => { setCurrentAlbum(album); setView("album"); loadPhotos(album.id, album); };
  const back = () => { setView("albums"); setCurrentAlbum(null); setPhotos([]); loadAlbums(); };

  // ── Get or create Drive folder (cached) ──────────────────────────────────────
  const getDriveFolder = async (name, parentId, cacheKey) => {
    const cachedId = folderCache.current[cacheKey];
    if (cachedId) {
      try {
        const cached = await getDriveFile(cachedId);
        const parentOk = !parentId || !cached?.parents || cached.parents.includes(parentId);
        if (cached?.id && !cached.trashed && parentOk) {
          if (cacheKey === "__root__") setGalleryRootDriveId(cached.id);
          return cached.id;
        }
      } catch {
        delete folderCache.current[cacheKey];
        saveFolderCache(folderCache.current);
      }
    }
    const folder = await findDriveFolder(name, parentId || null) || await createDriveFolder(name, parentId || null);
    folderCache.current[cacheKey] = folder.id;
    saveFolderCache(folderCache.current);
    if (cacheKey === "__root__") setGalleryRootDriveId(folder.id);
    return folder.id;
  };

  const getAlbumDriveFolderId = async (album) => {
    if (!album?.id) return null;
    if (album.drive_folder_id) return album.drive_folder_id;

    const rootId = await getDriveFolder(GALLERY_ROOT_FOLDER_NAME, null, "__root__");
    const folderId = await getDriveFolder(album.title, rootId, `album_${album.id}`);
    await supabase.from("photo_albums").update({ drive_folder_id: folderId }).eq("id", album.id);
    setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, drive_folder_id: folderId } : a));
    setCurrentAlbum(prev => prev?.id === album.id ? { ...prev, drive_folder_id: folderId } : prev);
    return folderId;
  };

  const refreshAlbumStats = async (albumId, fallbackCover = null) => {
    const { data } = await supabase
      .from("gallery_photos")
      .select("url")
      .eq("album_id", albumId)
      .order("created_at");

    const count = data?.length || 0;
    const cover = data?.[0]?.url || fallbackCover || null;
    await supabase.from("photo_albums").update({ photo_count: count, cover_url: cover }).eq("id", albumId);
    setAlbums(prev => prev.map(a => a.id === albumId ? { ...a, photo_count: count, cover_url: cover } : a));
    setCurrentAlbum(prev => prev?.id === albumId ? { ...prev, photo_count: count, cover_url: cover } : prev);
  };

  // Two-way folder sync: create albums for new Drive folders, remove albums whose
  // Drive folder was deleted. Runs from loadAlbums.
  const syncAlbumsWithDrive = async (dbAlbums = []) => {
    if (!driveConnectedRef.current || !canUploadRef.current) return dbAlbums;
    try {
      const rootId = await getDriveFolder(GALLERY_ROOT_FOLDER_NAME, null, "__root__");
      if (!rootId) return dbAlbums;

      const res = await listDriveFiles(rootId);
      const driveFolders = (res?.files || []).filter(f => f.mimeType === "application/vnd.google-apps.folder");
      const driveFolderIds = new Set(driveFolders.map(f => f.id));
      const linkedIds = new Set(dbAlbums.map(a => a.drive_folder_id).filter(Boolean));

      // Folders created directly in Drive -> create matching albums in the app
      const newFolders = driveFolders.filter(f => !linkedIds.has(f.id));
      if (newFolders.length) {
        await supabase.from("photo_albums").insert(
          newFolders.map(f => ({ title: f.name || "Untitled", drive_folder_id: f.id, photo_count: 0 }))
        );
      }

      // Folders deleted in Drive -> remove the albums (and photos) linked to them
      const orphans = dbAlbums.filter(a => a.drive_folder_id && !driveFolderIds.has(a.drive_folder_id));
      if (orphans.length) {
        const ids = orphans.map(a => a.id);
        const { data: ps } = await supabase.from("gallery_photos").select("url").in("album_id", ids);
        const paths = (ps || []).map(p => p.url?.split("/storage/v1/object/public/gallery/")[1]).filter(Boolean);
        if (paths.length) await supabase.storage.from("gallery").remove(paths);
        await supabase.from("gallery_photos").delete().in("album_id", ids);
        await supabase.from("photo_albums").delete().in("id", ids);
      }

      if (newFolders.length || orphans.length) {
        const { data } = await supabase
          .from("photo_albums").select("*")
          .order("event_date", { ascending: false });
        return data || [];
      }
      return dbAlbums;
    } catch (e) {
      console.error("[Drive] Albums sync failed:", e);
      return dbAlbums;
    }
  };

  const syncAlbumWithDrive = async (album, dbPhotos = []) => {
    if (!driveConnectedRef.current || !canUploadRef.current || !album?.id) return dbPhotos;

    try {
      const folderId = await getAlbumDriveFolderId(album);
      if (!folderId) return dbPhotos;

      const res = await listDriveFiles(folderId);
      const driveFiles = (res?.files || []).filter(f => String(f.mimeType || "").startsWith("image/"));
      const driveIds = new Set(driveFiles.map(f => f.id));
      const dbDriveIds = new Set(dbPhotos.map(p => p.drive_file_id).filter(Boolean));

      // Photos deleted in Drive -> remove from app (db rows + mirrored storage objects)
      const removedRows = dbPhotos.filter(p => p.drive_file_id && !driveIds.has(p.drive_file_id));
      if (removedRows.length) {
        const paths = removedRows.map(p => p.url?.split("/storage/v1/object/public/gallery/")[1]).filter(Boolean);
        if (paths.length) await supabase.storage.from("gallery").remove(paths);
        await supabase
          .from("gallery_photos")
          .delete()
          .in("drive_file_id", removedRows.map(p => p.drive_file_id));
      }

      // Photos added in Drive -> mirror bytes into app storage so they render,
      // then record the row. Drive share URLs do not work in <img>.
      const newFiles = driveFiles.filter(f => !dbDriveIds.has(f.id));
      for (const f of newFiles) {
        try {
          const blob = await downloadDriveFile(f.id);
          const ext  = (f.name?.split(".").pop() || "jpg").toLowerCase();
          const path = `albums/${album.id}/drive_${f.id}.${ext}`;
          await supabase.storage.from("gallery").upload(path, blob, {
            cacheControl: "3600", upsert: true, contentType: f.mimeType || "image/jpeg",
          });
          const { data: { publicUrl } } = supabase.storage.from("gallery").getPublicUrl(path);
          await supabase.from("gallery_photos").insert({
            album_id: album.id,
            url: publicUrl,
            drive_file_id: f.id,
            drive_url: f.webViewLink || null,
            drive_name: f.name || null,
            source: "drive",
          });
        } catch (err) {
          console.error("[Drive] Mirror image failed:", err);
        }
      }

      if (removedRows.length || newFiles.length) {
        await refreshAlbumStats(album.id, album.cover_url);
      }

      const { data: fresh, error } = await supabase
        .from("gallery_photos")
        .select("*")
        .eq("album_id", album.id)
        .order("created_at");
      if (error) throw error;
      return fresh || [];
    } catch (e) {
      console.error("[Drive] Album sync failed:", e);
      return dbPhotos;
    }
  };

  // ── Upload photos ─────────────────────────────────────────────────────────────
  const uploadPhotos = async (files) => {
    if (!currentAlbum || !files.length) return;
    setUploading(true);
    let count = 0;
    let driveFailures = 0;
    try {
      // Pre-fetch Drive folder if connected
      let albumFolderId = null;
      if (driveConnected) {
        try {
          const rootId = await getDriveFolder(GALLERY_ROOT_FOLDER_NAME, null, "__root__");
          albumFolderId = await getDriveFolder(currentAlbum.title, rootId, `album_${currentAlbum.id}`);
        } catch (e) {
          console.error("[Drive] Folder setup failed:", e);
          driveFailures = -1; // signal setup failure
        }
      }

      for (const file of files) {
        const ext = file.name.split(".").pop().toLowerCase();
        const path = `albums/${currentAlbum.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("gallery").upload(path, file, { cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from("gallery").getPublicUrl(path);

        let driveFile = null;
        if (driveConnected && albumFolderId) {
          try {
            driveFile = await uploadToDrive({ name: file.name, blob: file, mimeType: file.type, parentId: albumFolderId });
          } catch (e) {
            console.error("[Drive] Upload failed:", e);
            driveFailures++;
          }
        }

        const { error: dbErr } = await supabase.from("gallery_photos").insert({
          album_id: currentAlbum.id,
          url: publicUrl,
          drive_file_id: driveFile?.id || null,
          drive_url: driveFile?.webViewLink || null,
          drive_name: driveFile?.name || file.name,
          source: driveFile?.id ? "app_drive" : "app",
        });
        if (dbErr) throw dbErr;
        count++;
      }

      const { data: first } = await supabase.from("gallery_photos").select("url").eq("album_id", currentAlbum.id).order("created_at").limit(1);
      const newCount = (currentAlbum.photo_count || 0) + count;
      await supabase.from("photo_albums").update({ photo_count: newCount, cover_url: first?.[0]?.url || currentAlbum.cover_url }).eq("id", currentAlbum.id);
      setCurrentAlbum(p => ({ ...p, photo_count: newCount }));

      if (driveConnected && driveFailures === 0) {
        toast({ title: `${count} photo${count !== 1 ? "s" : ""} uploaded`, description: "Also saved to Google Drive." });
      } else if (driveConnected && driveFailures !== 0) {
        toast({ title: `${count} photo${count !== 1 ? "s" : ""} uploaded`, description: "Drive sync failed — check your Drive connection.", variant: "destructive" });
        setDriveConnected(isDriveConnected());
      } else {
        toast({ title: `${count} photo${count !== 1 ? "s" : ""} uploaded` });
      }
      loadPhotos(currentAlbum.id, currentAlbum);
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // ── Album / photo actions ─────────────────────────────────────────────────────
  const createAlbum = async () => {
    if (!aTitle.trim()) return;
    setSaving(true);
    const title = aTitle.trim();
    try {
      const { data, error } = await supabase.from("photo_albums").insert({
        title, description: aDesc.trim() || null,
        event_date: aDate || null, photo_count: 0,
      }).select("id,title").single();
      if (error) throw error;

      let driveSynced = false;
      let driveFolderId = null;
      if (driveConnected && data?.id) {
        try {
          const rootId = await getDriveFolder(GALLERY_ROOT_FOLDER_NAME, null, "__root__");
          driveFolderId = await getDriveFolder(title, rootId, `album_${data.id}`);
          await supabase.from("photo_albums").update({ drive_folder_id: driveFolderId }).eq("id", data.id);
          driveSynced = true;
        } catch (driveError) {
          console.error("[Drive] Album folder setup failed:", driveError);
        }
      }

      toast({
        title: "Album created",
        description: driveSynced ? `Folder also created inside ${GALLERY_ROOT_FOLDER_NAME} on Drive.` : undefined,
      });
      setShowNew(false); setATitle(""); setADesc(""); setADate("");
      loadAlbums();
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deletePhoto = (photo) => {
    setConfirm({
      message: "Delete this photo? This cannot be undone.",
      onConfirm: async () => {
        try {
          if (photo.drive_file_id && driveConnected) {
            await deleteDriveFile(photo.drive_file_id).catch(err => console.warn("[Drive] Delete photo failed:", err));
          }
          const pathPart = photo.url.split("/storage/v1/object/public/gallery/")[1];
          if (pathPart) await supabase.storage.from("gallery").remove([pathPart]);
          await supabase.from("gallery_photos").delete().eq("id", photo.id);
          const remaining = photos.filter(p => p.id !== photo.id);
          setPhotos(remaining);
          const newCount = Math.max(0, (currentAlbum.photo_count || 1) - 1);
          await supabase.from("photo_albums").update({ photo_count: newCount, cover_url: remaining[0]?.url || null }).eq("id", currentAlbum.id);
          setCurrentAlbum(p => ({ ...p, photo_count: newCount }));
          if (lightbox !== null) {
            if (remaining.length === 0) setLightbox(null);
            else setLightbox(i => Math.min(i, remaining.length - 1));
          }
          toast({ title: "Photo deleted" });
        } catch (e) {
          toast({ title: "Delete failed", description: e.message, variant: "destructive" });
        }
      },
    });
  };

  const openEditAlbum = (album, e) => {
    e.stopPropagation();
    setEditAlbum(album);
    setETitle(album.title);
    setEDate(album.event_date || "");
    setEDesc(album.description || "");
  };

  const saveEditAlbum = async () => {
    if (!eTitle.trim() || !editAlbum) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("photo_albums").update({
        title: eTitle.trim(),
        event_date: eDate || null,
        description: eDesc.trim() || null,
      }).eq("id", editAlbum.id);
      if (error) throw error;
      toast({ title: "Album updated" });
      setEditAlbum(null);
      if (currentAlbum?.id === editAlbum.id) {
        setCurrentAlbum(p => ({ ...p, title: eTitle.trim(), event_date: eDate || null, description: eDesc.trim() || null }));
      }
      loadAlbums();
    } catch (e) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deleteAlbum = (album, e) => {
    e.stopPropagation();
    setConfirm({
      message: `Delete "${album.title}" and all its photos? This cannot be undone.`,
      onConfirm: async () => {
        try {
          const { data: ps } = await supabase.from("gallery_photos").select("url,drive_file_id").eq("album_id", album.id);
          if (driveConnected && ps?.length) {
            await Promise.all(ps.map(p => p.drive_file_id ? deleteDriveFile(p.drive_file_id).catch(() => {}) : Promise.resolve()));
          }
          if (driveConnected && album.drive_folder_id) {
            await deleteDriveFile(album.drive_folder_id).catch(() => {});
          }
          const paths = (ps || []).map(p => p.url.split("/storage/v1/object/public/gallery/")[1]).filter(Boolean);
          if (paths.length) await supabase.storage.from("gallery").remove(paths);
          await supabase.from("photo_albums").delete().eq("id", album.id);
          toast({ title: "Album deleted" });
          loadAlbums();
        } catch (e) {
          toast({ title: "Delete failed", description: e.message, variant: "destructive" });
        }
      },
    });
  };

  const navLightbox = (dir) => {
    if (lightbox === null) return;
    const n = lightbox + dir;
    if (n >= 0 && n < photos.length) setLightbox(n);
  };

  useEffect(() => {
    if (lightbox === null) return;
    const h = (e) => {
      if (e.key === "ArrowLeft") navLightbox(-1);
      else if (e.key === "ArrowRight") navLightbox(1);
      else if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lightbox, photos.length]);

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {view === "album" && (
              <button onClick={back}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {view === "albums" ? "Photo Gallery" : currentAlbum?.title}
              </h1>
              {view === "album" && (currentAlbum?.event_date || currentAlbum?.photo_count > 0) && (
                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                  {currentAlbum?.event_date && (
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(currentAlbum.event_date)}</span>
                  )}
                  {currentAlbum?.photo_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Image className="w-3.5 h-3.5" />
                      {currentAlbum.photo_count} photo{currentAlbum.photo_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              )}
              {view === "albums" && albums.length > 0 && (
                <p className="text-sm text-slate-500 mt-0.5">{albums.length} album{albums.length !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                driveConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
              title="Manage Google Drive in Settings > General > School Info"
            >
              {driveConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
              {driveConnected ? "Drive mounted" : "Drive unmounted"}
            </span>
            {canEdit && view === "albums" && (
              <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <Plus className="w-4 h-4" /> New Album
              </Button>
            )}
            {canUploadPhotos && view === "album" && (
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading…" : "Upload Photos"}
              </Button>
            )}
          </div>
        </div>

        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.length) uploadPhotos(Array.from(e.target.files)); e.target.value = ""; }} />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>

        ) : view === "albums" ? (
          albums.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Camera className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700 text-lg">No albums yet</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">Create albums for Sports Day, Graduation, Cultural events, and more.</p>
              </div>
              {canUploadPhotos && (
                <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2 mt-2">
                  <Plus className="w-4 h-4" /> Create First Album
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {albums.map(album => (
                <div key={album.id} onClick={() => openAlbum(album)}
                  className="group relative bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer">
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                    {album.cover_url ? (
                      <img src={album.cover_url} alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-10 h-10 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs font-semibold">
                      {album.photo_count || 0} {album.photo_count === 1 ? "photo" : "photos"}
                    </div>
                    {canEdit && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={e => openEditAlbum(album, e)}
                          className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-blue-500/90">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => deleteAlbum(album, e)}
                          className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500/90">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="font-semibold text-slate-800 text-sm truncate">{album.title}</p>
                    {album.event_date && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />{fmtDate(album.event_date)}
                      </p>
                    )}
                    {album.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{album.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )

        ) : (
          photos.length === 0 && !uploading ? (
            <div className="flex flex-col items-center py-24 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Image className="w-7 h-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">No photos in this album</p>
                <p className="text-xs text-slate-400 mt-1">Upload photos to get started</p>
              </div>
              {canUploadPhotos && (
                <Button onClick={() => fileRef.current?.click()} className="bg-emerald-600 hover:bg-emerald-700 gap-2 mt-1">
                  <Upload className="w-4 h-4" /> Upload Photos
                </Button>
              )}
            </div>
          ) : (
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
              {uploading && (
                <div className="break-inside-avoid mb-3 aspect-square rounded-xl bg-emerald-50 border-2 border-dashed border-emerald-200 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <p className="text-xs text-emerald-600 font-medium">Uploading…</p>
                </div>
              )}
              {photos.map((photo, idx) => (
                <div key={photo.id}
                  className="break-inside-avoid mb-3 group relative rounded-xl overflow-hidden cursor-pointer bg-slate-200"
                  onClick={() => setLightbox(idx)}>
                  <img src={photo.url} alt=""
                    className="w-full h-auto object-cover group-hover:brightness-90 transition-all duration-200"
                    loading="lazy" />
                  {canEdit && (
                    <button onClick={e => { e.stopPropagation(); deletePhoto(photo); }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/90">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Lightbox ── */}
        {lightbox !== null && photos[lightbox] && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center select-none"
            onClick={() => setLightbox(null)}>
            <button onClick={e => { e.stopPropagation(); setLightbox(null); }}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
              <X className="w-5 h-5" />
            </button>
            <button onClick={e => { e.stopPropagation(); navLightbox(-1); }} disabled={lightbox === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-20 z-10">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <img src={photos[lightbox].url} alt=""
              className="max-w-[88vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()} />
            <button onClick={e => { e.stopPropagation(); navLightbox(1); }} disabled={lightbox === photos.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-20 z-10">
              <ChevronRight className="w-6 h-6" />
            </button>
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 text-sm tabular-nums">
              {lightbox + 1} / {photos.length}
            </p>
          </div>
        )}

        {/* ── Confirm dialog ── */}
        {confirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-sm shadow-2xl border-0">
              <CardContent className="pt-6 pb-5 px-5 space-y-4">
                <p className="text-slate-800 text-sm font-medium leading-relaxed">{confirm.message}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => { setConfirm(null); confirm.onConfirm(); }}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Edit Album modal ── */}
        {editAlbum && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setEditAlbum(null); }}>
            <Card className="w-full max-w-sm shadow-2xl border-0">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-base font-bold text-slate-900">Edit Album</h2>
                <button onClick={() => setEditAlbum(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <CardContent className="pt-4 space-y-3.5">
                <div>
                  <Label className="text-sm">Album Title *</Label>
                  <Input value={eTitle} onChange={e => setETitle(e.target.value)}
                    placeholder="e.g. Sports Day 2026" className="mt-1.5" autoFocus
                    onKeyDown={e => e.key === "Enter" && saveEditAlbum()} />
                </div>
                <div>
                  <Label className="text-sm">Event Date</Label>
                  <Input type="date" value={eDate} onChange={e => setEDate(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-sm">Description</Label>
                  <Input value={eDesc} onChange={e => setEDesc(e.target.value)}
                    placeholder="Optional short description" className="mt-1.5" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setEditAlbum(null)}>Cancel</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                    disabled={!eTitle.trim() || saving} onClick={saveEditAlbum}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── New Album modal ── */}
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
            <Card className="w-full max-w-sm shadow-2xl border-0">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-base font-bold text-slate-900">New Album</h2>
                <button onClick={() => setShowNew(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <CardContent className="pt-4 space-y-3.5">
                <div>
                  <Label className="text-sm">Album Title *</Label>
                  <Input value={aTitle} onChange={e => setATitle(e.target.value)}
                    placeholder="e.g. Sports Day 2026" className="mt-1.5" autoFocus
                    onKeyDown={e => e.key === "Enter" && createAlbum()} />
                </div>
                <div>
                  <Label className="text-sm">Event Date</Label>
                  <Input type="date" value={aDate} onChange={e => setADate(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-sm">Description</Label>
                  <Input value={aDesc} onChange={e => setADesc(e.target.value)}
                    placeholder="Optional short description" className="mt-1.5" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setShowNew(false)}>Cancel</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                    disabled={!aTitle.trim() || saving} onClick={createAlbum}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create
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
