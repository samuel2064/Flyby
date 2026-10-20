import { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "../lib/apiUrl";

type SseStatus = "connecting" | "open" | "closed" | "error";

export interface SseState<T> {
  data: T | null;
  status: SseStatus;
  error: Error | null;
  isPolling: boolean;
}

interface UseSseOptions<T> {
  parser?: (raw: string) => T;
  pollParser?: (data: unknown) => T;
  maxRetries?: number;
  retryDelay?: number;
  onClose?: (reason: "clean" | "error") => void;
  pollInterval?: number;
  pollUrl?: string | null;
  throttleInterval?: number;
}

export function useSse<T = unknown>(
  url: string | null,
  options: UseSseOptions<T> = {}
): SseState<T> {
  const {
    parser = JSON.parse as (raw: string) => T,
    pollParser,
    maxRetries = 3,
    retryDelay = 1000,
    onClose,
    pollInterval = 0,
    pollUrl = null,
    throttleInterval = 1000,
  } = options;

  const [state, setState] = useState<SseState<T>>({
    data: null,
    status: "connecting",
    error: null,
    isPolling: false,
  });

  const lastUpdateMsRef = useRef(0);
  const pendingDataRef = useRef<T | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDataThrottled = useCallback(
    (newData: T) => {
      const now = Date.now();
      if (throttleInterval > 0) {
        const elapsed = now - lastUpdateMsRef.current;
        if (elapsed < throttleInterval) {
          pendingDataRef.current = newData;
          if (!throttleTimerRef.current) {
            const delay = throttleInterval - elapsed;
            throttleTimerRef.current = setTimeout(() => {
              throttleTimerRef.current = null;
              if (pendingDataRef.current !== null) {
                lastUpdateMsRef.current = Date.now();
                const d = pendingDataRef.current;
                pendingDataRef.current = null;
                setState((s) => ({ ...s, data: d }));
              }
            }, delay);
          }
          return;
        }
      }
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      lastUpdateMsRef.current = now;
      pendingDataRef.current = null;
      setState((s) => ({ ...s, data: newData }));
    },
    [throttleInterval]
  );

  useEffect(() => {
    if (!url) {
      setState({ data: null, status: "closed", error: null, isPolling: false });
      return;
    }

    let mounted = true;
    let es: EventSource | null = null;
    let retryCount = 0;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    let pollCleanup: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const doPoll = async () => {
      if (!mounted || !pollUrl) return;
      try {
        const res = await fetch(apiUrl(pollUrl));
        if (!res.ok) return;
        const body = await res.json();
        const extracted = body?.data !== undefined ? body.data : body;
        const parsed = pollParser
          ? pollParser(extracted)
          : (extracted as T);
        if (mounted) setDataThrottled(parsed);
      } catch {
        // ignore polling errors
      }
    };

    const stopPolling = () => {
      if (pollCleanup) {
        pollCleanup();
        pollCleanup = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (mounted) {
        setState((s) => ({ ...s, isPolling: false }));
      }
    };

    const startPollingFallback = () => {
      if (!pollUrl || pollInterval <= 0) return;
      if (mounted) {
        setState((s) => ({ ...s, isPolling: true, status: "closed" }));
      }
      void doPoll();
      const id = setInterval(() => { void doPoll(); }, pollInterval);
      pollCleanup = () => clearInterval(id);

      const tryReconnect = () => {
        if (!mounted) return;
        connect();
        reconnectTimer = setTimeout(
          tryReconnect,
          Math.max(pollInterval, 30000)
        );
      };
      if (typeof EventSource !== "undefined") {
        reconnectTimer = setTimeout(
          tryReconnect,
          Math.max(pollInterval, 30000)
        );
      }
    };

    const connect = () => {
      if (!mounted) return;

      if (typeof EventSource === "undefined") {
        if (pollUrl && pollInterval > 0) {
          setState({
            data: null,
            status: "closed",
            error: null,
            isPolling: true,
          });
          void doPoll();
          const id = setInterval(() => { void doPoll(); }, pollInterval);
          pollCleanup = () => clearInterval(id);
        } else {
          setState({
            data: null,
            status: "closed",
            error: null,
            isPolling: false,
          });
        }
        return;
      }

      setState((prev) =>
        prev.status === "open"
          ? prev
          : { data: prev.data, status: "connecting", error: null, isPolling: prev.isPolling }
      );

      try {
        es = new EventSource(apiUrl(url));

        es.onopen = () => {
          if (!mounted) return;
          retryCount = 0;
          stopPolling();
          setState((prev) => ({ ...prev, status: "open", error: null }));
        };

        es.onmessage = (event) => {
          if (!mounted) return;
          try {
            const parsed = parser(event.data);
            setDataThrottled(parsed);
          } catch {
            // ignore parse errors
          }
        };

        es.onerror = () => {
          if (!mounted) return;
          es?.close();
          es = null;

          if (retryCount < maxRetries) {
            retryCount++;
            const delay = retryDelay * 2 ** (retryCount - 1);
            backoffTimer = setTimeout(() => connect(), delay);
          } else {
            const error = new Error("SSE connection error");
            setState((prev) => ({ ...prev, status: "error", error }));
            onClose?.("error");
            startPollingFallback();
          }
        };
      } catch (err) {
        if (!mounted) return;
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to create EventSource");
        setState({ data: null, status: "error", error, isPolling: false });
        onClose?.("error");
        startPollingFallback();
      }
    };

    connect();

    return () => {
      mounted = false;
      if (backoffTimer) clearTimeout(backoffTimer);
      if (pollCleanup) pollCleanup();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      es?.close();
      es = null;
      onClose?.("clean");
    };
  }, [url, pollUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
