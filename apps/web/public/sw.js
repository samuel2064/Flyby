/* Flyby PWA service worker - deliberately small and conservative.
 *
 * This worker exists to make the shell load offline and to keep the install
 * criteria credible. It must NEVER serve stale HTML over fresh HTML, and it
 * must NEVER cache the API (live wait-times must not be served stale). Bump
 * SW_VERSION whenever the caching rules change.
 */
const SW_VERSION = 'flyby-sw-v1'
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  // Pre-cache the shell so a revisit can open offline.
  event.waitUntil(
    caches
      .open(SW_VERSION)
      .then((cache) => cache.add(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Drop caches from any older rule set, then take control immediately.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Only same-origin. The live API (different origin) is never intercepted.
  if (url.origin !== self.location.origin) return

  // Navigations: network first, cache fallback on offline. A fresh deploy
  // always wins; an offline traveler still opens the shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SW_VERSION).then((cache) => cache.put(SHELL, copy))
          }
          return response
        })
        .catch(() => caches.match(SHELL)),
    )
    return
  }

  // Hashed assets are immutable per build: cache-first, network fill.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(SW_VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
