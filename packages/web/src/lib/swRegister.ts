// Service Worker registration helper
// Handles registration, update notifications, and offline/online event propagation

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return
  }

  let refreshing = false

  // Listen for controller changes (new service worker activated)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  // Register the service worker
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New update available — dispatch custom event for UI to handle
              window.dispatchEvent(new CustomEvent('sw-update-available'))
            }
          })
        })

        // Check for updates every 60 minutes
        setInterval(() => {
          registration.update().catch((err: Error) => {
            console.warn('Service worker update check failed:', err)
          })
        }, 60 * 60 * 1000)
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error)
      })
  })
}

/** Skip the waiting service worker and reload to apply update */
export async function applyServiceWorkerUpdate(): Promise<void> {
  if (!navigator.serviceWorker?.controller) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (registration?.waiting) {
    // Tell the waiting service worker to skip waiting
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
}
