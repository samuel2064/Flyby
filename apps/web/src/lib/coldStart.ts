import { ApiError, NetworkError } from '../api/client'

// 3 attempts over ~45s: attempt 1 at t=0, retry after 15s, retry after 30s.
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [15_000, 30_000]

// Is the device itself offline? If so, never treat a failure as a cold start -
// keep the existing offline/stale-card behaviour instead.
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

// Wraps an async API call with retry-with-backoff for network-level failures
// (fetch rejected / timeout / abort), which are the signal that the Render API
// instance may be sleeping after a cold start.
//
// Retries ONLY on NetworkError. 4xx/5xx responses (ApiError) surface immediately.
// If the device itself is offline, throws immediately - never shows "waking up"
// for a real network outage.
export async function fetchWithColdStartRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // 4xx/5xx application responses are not cold starts - surface immediately
      if (err instanceof ApiError) throw err
      // Only network-level failures (fetch rejected / timeout / abort) can be cold starts
      if (!(err instanceof NetworkError)) throw err
      // A real device outage is not a cold start - keep existing offline behaviour
      if (isOffline()) throw err
      // No more retries left
      if (attempt === MAX_ATTEMPTS - 1) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
  throw lastError
}
