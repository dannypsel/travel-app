import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_BACKEND_URL lives in .env for local dev and is injected at build time
  // for deploys. Bake its origin into the SW's runtime cache matcher so
  // NetworkFirst only ever applies to *our* backend's JSON API.
  const env = loadEnv(mode, __dirname)
  const backendOrigin = env.VITE_BACKEND_URL
    ? new URL(env.VITE_BACKEND_URL).origin
    : null
  const backendApiPattern = backendOrigin
    ? new RegExp(
        `^${backendOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(trips|bookings|expenses|import-queue|refresh|health)(?:/|$)`,
      )
    : /(?!)/ // VITE_BACKEND_URL unset: match nothing

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: false },
        manifest: {
          name: 'Travel',
          short_name: 'Travel',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          theme_color: '#0284c7',
          background_color: '#ffffff',
          description: 'Travel — itinerary, booking, and trip-budget tracking.',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-192-maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          // SPA: offline navigations fall back to the app shell.
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Supabase Auth only (login to get the JWT). The app never reads
              // Supabase tables directly — all data goes through the backend.
              urlPattern: /\/auth\/v1(?:\/|$)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-auth',
                expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // FastAPI backend JSON API only. No catch-all cache anywhere.
              urlPattern: backendApiPattern,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'backend-api',
                expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
