import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update: when a new version deploys the SW updates immediately on
      // next page load — no white-screen stale-shell risk.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Skoolio — School Manager',
        short_name: 'Skoolio',
        description: 'Manage students, teachers, attendance, payments, results and timetables for your school.',
        theme_color: '#059669',
        background_color: '#059669',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Take over immediately on deploy so users always get the latest version.
        skipWaiting: true,
        clientsClaim: true,
        // Precache the app shell + ALL JS/CSS chunks so every page navigation
        // after the first load is instant (served from cache, not network).
        // Supabase API calls are never intercepted — only static assets.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Bypass the SPA navigation fallback for any URL that looks like an
        // API call — keeps the offline index.html out of the way.
        navigateFallbackDenylist: [
          /^\/api\//,
          /supabase/,
          /\/rest\/v1\//,
          /\/auth\/v1\//,
          /\/storage\/v1\//,
        ],
        runtimeCaching: [
          {
            // Google Fonts only — safe to cache aggressively.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // 4 MB cap per asset — generous for the timetable solver bundle.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        // Don't let the SW interfere with HMR during development.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
