/**
 * googleDriveService.js
 *
 * Thin wrapper around the Google Drive v3 API.
 * Uses Google Identity Services (GIS) for OAuth2 – no backend required.
 *
 * Token state lives in module scope so it survives React re-renders.
 * Tokens expire after ~1 hour; calling requestDriveToken() again shows a
 * silent popup (usually invisible if the user already authorised the app).
 *
 * Required setup (done once by super admin in School Vault):
 *  1. Create a project in Google Cloud Console
 *  2. Enable the Google Drive API
 *  3. Create OAuth 2.0 credentials → Web application
 *  4. Add your site origin to "Authorised JavaScript origins"
 *  5. Paste the Client ID into School Vault → Google Drive settings
 */
import { supabase } from "@/api/supabaseClient";

// drive.file only sees files the app created; drive scope sees ALL files in
// the folder — needed so files uploaded directly to Drive by other users
// are visible in the school app.
const DRIVE_SCOPE   = "https://www.googleapis.com/auth/drive";
// v2: bumped when scope changed so any token saved under the old key is
// not re-used (it lacks the new scope).
const STORAGE_KEY   = "school_vault_drive_token_v2";

// ── localStorage persistence ──────────────────────────────────────────────────
function _saveToken(token, expiry, clientId) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiry, clientId })); } catch {}
}
function _loadToken() {
  try {
    // Remove token saved under the old key (drive.file scope) if present.
    localStorage.removeItem("school_vault_drive_token");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || Date.now() >= parsed.expiry) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}
function _clearToken() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── module-level token state (restored from localStorage on load) ─────────────
const _restored    = _loadToken();
let _accessToken   = _restored?.token    || null;
let _tokenExpiry   = _restored?.expiry   || 0;
let _clientId      = _restored?.clientId || null;
let _connectedEmail = null;

// If we restored a token that is still valid, schedule a refresh before it expires.
// This handles page reloads — the user stays connected without clicking anything.
if (_accessToken && _tokenExpiry > Date.now()) {
  // _scheduleRefresh is defined later in the file; we defer via setTimeout(0)
  // so the function declaration is hoisted before we call it.
  setTimeout(() => _scheduleRefresh(), 0);
}

function isTokenValid() {
  return Boolean(_accessToken) && Date.now() < _tokenExpiry;
}

// ── GIS script loader ─────────────────────────────────────────────────────────
let _gisPromise = null;
function loadGIS() {
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return _gisPromise;
}

// ── Public auth helpers ───────────────────────────────────────────────────────

/**
 * Ask Google for a Drive access token.
 * Shows an account chooser popup only when needed.
 * @param {string} clientId   Your Google OAuth2 client ID
 * @param {boolean} forcePrompt  true = always show account chooser
 */
export async function requestDriveToken(clientId, forcePrompt = false) {
  if (!forcePrompt && isTokenValid() && clientId === _clientId) return _accessToken;
  _clientId = clientId || _clientId;

  if (!forcePrompt) {
    try {
      return await _loadTokenFromServer();
    } catch {
      // Fall back to the original browser popup flow for older/non-permanent links.
    }
  }

  await loadGIS();
  _clientId = clientId;

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        _accessToken  = response.access_token;
        _tokenExpiry  = Date.now() + (response.expires_in * 1000) - 60_000;
        _saveToken(_accessToken, _tokenExpiry, clientId);
        // Start the background auto-refresh cycle so the token never visibly
        // expires while the user has their Google account open in the browser.
        _scheduleRefresh();
        resolve(_accessToken);
      },
      error_callback: (err) => {
        const msg =
          err.type === "popup_closed"
            ? "Sign-in was cancelled"
            : err.type === "popup_failed_to_open"
            ? "Popup was blocked – allow popups for this site"
            : err.type || "Google sign-in failed";
        reject(new Error(msg));
      },
    });
    // When there is no cached token (fresh connect or after disconnect):
    //  - "select_account" forces Google to show the account picker popup even
    //    if only one account is signed in. This breaks Google's silent-token
    //    path so the full consent screen is always shown for the new scope.
    // When forcePrompt is true (Switch account button):
    //  - "consent" re-shows the full consent screen on the same account.
    let promptValue = "";
    if (forcePrompt) {
      promptValue = "consent";
    } else if (!isTokenValid()) {
      promptValue = "select_account";
    }
    client.requestAccessToken({ prompt: promptValue });
  });
}

/** Returns true if there is a valid in-memory token. */
export function isDriveConnected() {
  return isTokenValid();
}

/** Forget the current token (disconnect). */
export function clearDriveToken() {
  _accessToken    = null;
  _tokenExpiry    = 0;
  _connectedEmail = null;
  _clearToken();
  _stopAutoRefresh();
}

export function getDriveToken() { return _accessToken; }

export async function restoreDriveConnection(clientId) {
  _clientId = clientId || _clientId;
  if (isTokenValid()) return true;
  try {
    await _loadTokenFromServer();
    return true;
  } catch {
    return false;
  }
}

export async function startPermanentDriveConnection(clientId) {
  const cleanClientId = String(clientId || "").trim();
  if (!cleanClientId) throw new Error("Google Client ID is required.");
  _clientId = cleanClientId;
  const { data, error } = await supabase.functions.invoke("googleDriveOAuthStart", {
    body: { clientId: cleanClientId },
  });
  if (error) throw error;
  if (!data?.authUrl) throw new Error(data?.error || "Could not start Google Drive connection.");
  window.location.assign(data.authUrl);
}

export async function disconnectPermanentDrive() {
  clearDriveToken();
  await supabase.functions.invoke("googleDriveDisconnect").catch(() => {});
}

// ── Silent auto-refresh ───────────────────────────────────────────────────────
// Tries to renew the token in the background without any popup.
// Works as long as the user's Google account is still signed in to the browser.
// If silent refresh fails the token just stays expired and the UI shows the
// "Reconnect" banner as before.

let _refreshTimer = null;

function _stopAutoRefresh() {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
}

function _scheduleRefresh() {
  _stopAutoRefresh();
  if (!_clientId || !_tokenExpiry) return;

  // Refresh 3 minutes before expiry so there is always a valid token on hand
  const delay = _tokenExpiry - Date.now() - 3 * 60 * 1000;
  if (delay <= 0) {
    // Already expired or expiring imminently — try immediately
    _silentRefresh();
    return;
  }
  _refreshTimer = setTimeout(_silentRefresh, delay);
}

async function _loadTokenFromServer() {
  const { data, error } = await supabase.functions.invoke("googleDriveAccessToken");
  if (error) throw error;
  if (!data?.access_token) {
    throw new Error(data?.error || "Google Drive is not permanently connected yet.");
  }

  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000) - 60_000;
  _connectedEmail = data.connected_email || null;
  _saveToken(_accessToken, _tokenExpiry, _clientId);
  _scheduleRefresh();
  return _accessToken;
}

async function _silentRefresh() {
  _refreshTimer = null;
  if (!_clientId) return;
  try {
    await _loadTokenFromServer();
    return;
  } catch {
    // Fall back to Google's browser token flow for older, non-permanent links.
  }

  try {
    await loadGIS();
    await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: _clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            // Silent refresh failed — user will see the "Reconnect" banner
            console.warn("[Drive] Silent token refresh failed:", response.error);
            reject(new Error(response.error));
            return;
          }
          _accessToken = response.access_token;
          _tokenExpiry = Date.now() + (response.expires_in * 1000) - 60_000;
          _saveToken(_accessToken, _tokenExpiry, _clientId);
          // Schedule the next refresh
          _scheduleRefresh();
          resolve();
        },
        error_callback: (err) => {
          console.warn("[Drive] Silent token refresh error:", err.type);
          reject(new Error(err.type));
        },
      });
      // Empty prompt string = silent refresh (no popup shown if session is live)
      client.requestAccessToken({ prompt: "" });
    });
  } catch {
    // Silent refresh failed — that's OK, the UI will show the reconnect banner
  }
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

async function driveRequest(method, path, { body = null, params = {} } = {}) {
  if (!_accessToken) throw new Error("Not connected to Google Drive");

  const url = new URL(`https://www.googleapis.com/drive/v3${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization:  `Bearer ${_accessToken}`,
      ...(body !== null ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== null ? JSON.stringify(body) : null,
  });

  if (res.status === 401) {
    _accessToken = null;
    _tokenExpiry  = 0;
    _clearToken();
    throw new Error("Google Drive session expired – please reconnect");
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive API error ${res.status}`);
  }
  return res.json();
}

/**
 * Create a folder in Google Drive.
 * @returns {{ id: string, name: string }}
 */
export async function createDriveFolder(name, parentId = null) {
  return driveRequest("POST", "/files", {
    body: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    params: {
      fields: "id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,trashed",
    },
  });
}

export async function findDriveFolder(name, parentId = null) {
  const safeName = String(name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const parentClause = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const result = await driveRequest("GET", "/files", {
    params: {
      q: `${parentClause} and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`,
      fields: "files(id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,trashed)",
      orderBy: "modifiedTime desc",
      pageSize: "1",
    },
  });
  return result?.files?.[0] || null;
}

export async function getDriveFile(fileId) {
  if (!fileId) return null;
  return driveRequest("GET", `/files/${fileId}`, {
    params: {
      fields: "id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,trashed",
    },
  });
}

/**
 * Upload a Blob (or File) to Google Drive.
 * @returns {{ id, name, webViewLink }}
 */
export async function uploadToDrive({ name, blob, mimeType = "application/octet-stream", parentId = null }) {
  if (!_accessToken) throw new Error("Not connected to Google Drive");

  const metadata = {
    name,
    ...(parentId ? { parents: [parentId] } : {}),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", blob instanceof Blob ? blob : new Blob([blob], { type: mimeType }), name);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size,createdTime,modifiedTime",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${_accessToken}` },
      body: form,
    }
  );

  if (res.status === 401) {
    _accessToken = null;
    _tokenExpiry  = 0;
    _clearToken();
    throw new Error("Google Drive session expired – please reconnect");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed ${res.status}`);
  }

  return res.json();
}

/**
 * List files inside a folder.
 * @returns {{ files: Array }}
 */
export async function listDriveFiles(folderId) {
  return driveRequest("GET", "/files", {
    params: {
      q:       `'${folderId}' in parents and trashed = false`,
      fields:  "files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size,createdTime,modifiedTime)",
      orderBy: "createdTime desc",
      pageSize: "200",
    },
  });
}

/**
 * Move a file to Trash.
 */
export async function deleteDriveFile(fileId) {
  return driveRequest("DELETE", `/files/${fileId}`);
}

/**
 * Download a Drive file's raw bytes as a Blob (uses alt=media with the
 * authenticated token). Needed to mirror Drive images into app storage so
 * they render reliably (Drive share URLs do not work in <img>).
 */
export async function downloadDriveFile(fileId) {
  if (!_accessToken) throw new Error("Not connected to Google Drive");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (res.status === 401) {
    _accessToken = null;
    _tokenExpiry = 0;
    _clearToken();
    throw new Error("Google Drive session expired - please reconnect");
  }
  if (!res.ok) throw new Error(`Drive download failed ${res.status}`);
  return res.blob();
}

/**
 * Helper: convert a rendered DOM element to a PDF Blob for upload.
 * Uses html2canvas + jsPDF (both already in package.json).
 * Handles multi-page documents automatically.
 */
export async function elementToPdfBlob(elementId, title = "Document") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Element #${elementId} not found`);

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    allowTaint: true,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight();  // 297 mm

  // mm per pixel
  const mmPerPx  = pageW / canvas.width;
  const totalImgH = canvas.height * mmPerPx;

  if (totalImgH <= pageH) {
    // Fits on a single page
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageW, totalImgH);
  } else {
    // Slice canvas into page-height chunks
    const pxPerPage = Math.floor(pageH / mmPerPx);
    let yPx = 0;
    while (yPx < canvas.height) {
      const sliceH = Math.min(pxPerPage, canvas.height - yPx);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width  = canvas.width;
      sliceCanvas.height = sliceH;
      sliceCanvas.getContext("2d").drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (yPx > 0) pdf.addPage();
      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pageW, sliceH * mmPerPx);
      yPx += pxPerPage;
    }
  }

  return pdf.output("blob");
}

/**
 * Helper: convert a rendered DOM element to an HTML Blob for upload.
 * Kept for backwards compatibility.
 */
export function elementToHtmlBlob(elementId, title = "Document") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Element #${elementId} not found`);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 20px; background: white; font-family: sans-serif; display: flex; justify-content: center; }
    @media print { body { padding: 0; } @page { size: A4 portrait; margin: 10mm; } }
  </style>
</head>
<body>${el.outerHTML}</body>
</html>`;

  return new Blob([html], { type: "text/html" });
}
