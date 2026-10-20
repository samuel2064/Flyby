import { useEffect, useCallback, useRef } from "react";

/**
 * useRefreshInterval – triggers a callback at a fixed interval,
 * pausing when the page is backgrounded (hidden via Page Visibility API).
 *
 * This conserves battery and bandwidth on mobile by skipping refreshes
 * when the user is not actively viewing the app.
 *
 * Usage:
 *   useRefreshInterval(() => refetch(), 30000); // refetch every 30s
 */
export function useRefreshInterval(
  callback: () => void,
  /** Interval in milliseconds (default: 30_000) */
  delay: number = 30_000
): void {
  const savedCallback = useRef<() => void>(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest callback in a ref so the interval always calls the current one
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const tick = useCallback(() => {
    if (document.hidden) {
      // Page is hidden; skip this tick and re-check later
      timeoutRef.current = setTimeout(tick, delay);
      return;
    }
    savedCallback.current();
    timeoutRef.current = setTimeout(tick, delay);
  }, [delay]);

  useEffect(() => {
    timeoutRef.current = setTimeout(tick, delay);

    const handleVisibility = () => {
      if (!document.hidden && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(tick, delay);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [tick, delay]);
}