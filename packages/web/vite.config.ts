import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// In E2E mode the Playwright webServer sets E2E_WEB_PORT/E2E_API_PORT so the dev
// server and its API proxy follow the (possibly overridden) E2E ports.
const apiProxyTarget = `http://localhost:${process.env.E2E_API_PORT || '3001'}`
const webPort = Number(process.env.E2E_WEB_PORT || 3000)

// When the app is built against a remote API (VITE_API_BASE_URL, e.g. the
// production static deploy), the service worker's runtime-cache patterns must
// match the absolute API origin instead of relative /api paths.
const apiBase = (process.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const escapedBase = apiBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const apiReportsPattern = apiBase
  ? new RegExp(`^${escapedBase}/api/(?:reports|checkpoints/.*/wait-times)`)
  : /\/api\/(?:reports|checkpoints\/.*\/wait-times)/
const apiAnyPattern = apiBase
  ? new RegExp(`^${escapedBase}/api/`)
  : /\/api\/.*/

export default defineConfig({
  css: {
    transformer: 'esbuild',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'Flyby',
        short_name: 'Flyby',
        description: 'Live security wait times at every airport checkpoint',
        theme_color: '#0ea5e9',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      runtimeCaching: [
          {
            urlPattern: apiReportsPattern,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'wait-time-reports',
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
          {
            urlPattern: apiAnyPattern,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache' },
          },
          {
            urlPattern: /\.(?:png|jpg|svg|css|js)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'static-assets' },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    cssMinify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    port: webPort,
    strictPort: !!process.env.E2E_WEB_PORT,
    proxy: {
      '/api': apiProxyTarget,
      '/v1': apiProxyTarget,
      '/health': apiProxyTarget,
    },
  },
})
