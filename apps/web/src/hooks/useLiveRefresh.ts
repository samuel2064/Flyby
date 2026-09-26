import { useEffect } from 'react'

const REFRESH_MS = 60_000

// Shared 60s soft-refresh (TIR-317): re-runs `fn` on an interval without
// setting loading states - the caller decides what to do with failures.
export function useLiveRefresh(fn: () => void, intervalMs: number = REFRESH_MS) {
  useEffect(() => {
    const timer = setInterval(fn, intervalMs)
    return () => clearInterval(timer)
  }, [fn, intervalMs])
}
