import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const escapeHtml = (value) =>
  String(value || 'Unknown startup error').replace(/[<>&]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
  }[char]));

const showBootError = (detail) => {
  const root = document.getElementById('root');
  if (!root || root.childNodes.length) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:560px;width:100%;border:1px solid #fecaca;background:white;border-radius:18px;padding:28px;text-align:center;box-shadow:0 18px 40px rgba(15,23,42,.08);">
        <div style="width:52px;height:52px;border-radius:999px;background:#fef2f2;color:#dc2626;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-weight:800;font-size:24px;">!</div>
        <h1 style="margin:0;color:#020617;font-size:24px;">The app could not open</h1>
        <p style="margin:10px 0 0;color:#475569;line-height:1.5;">A startup error stopped the page from loading. Reload once; if it remains, send this message to support.</p>
        <pre style="margin:16px 0 0;text-align:left;white-space:pre-wrap;background:#f1f5f9;color:#334155;border-radius:12px;padding:12px;font-size:12px;">${escapeHtml(detail)}</pre>
        <button onclick="window.location.reload()" style="margin-top:18px;border:0;border-radius:10px;background:#2563eb;color:white;padding:10px 16px;font-weight:700;cursor:pointer;">Reload app</button>
      </div>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  showBootError(event.message || event.error?.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showBootError(event.reason?.message || event.reason);
});

// Reliability first: remove old PWA caches immediately so a stale broken app
// shell cannot keep serving after a production fix is deployed.
if ('serviceWorker' in navigator) {
  const clearOldServiceWorkers = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignore cleanup failures. The app should still boot normally.
    }
  };

  clearOldServiceWorkers();
  window.addEventListener('load', clearOldServiceWorkers, { once: true });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
