import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../lib/apiUrl';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True when a background revalidation is in progress (stale-while-revalidate) */
  isRevalidating: boolean;
}

interface UseApiOptions {
  /** Debounce delay in ms (default: 0) */
  debounce?: number;
  /** Auto-fetch on deps change (default: true) */
  autoFetch?: boolean;
}

/**
 * useApi — generic API fetch hook with loading, error, and abort support.
 * Usage: const { data, loading, error } = useApi<AirportResult[]>(`/api/airports/search?q=${query}`, [query]);
 */
export function useApi<T>(
  url: string | null,
  deps: React.DependencyList = [],
  options: UseApiOptions = {}
): ApiState<T> & { refetch: () => void } {
  const { autoFetch = true } = options;
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    isRevalidating: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!url) return;

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // If we already have data, treat this as a background revalidation
    // instead of a fresh load (stale-while-revalidate pattern)
    setState((prev) => {
      const hasData = prev.data !== null;
      return {
        ...prev,
        loading: !hasData,
        isRevalidating: hasData,
        error: null,
      };
    });

    try {
      const token = localStorage.getItem('flyby_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl(url), { signal: controller.signal, headers });

      if (!res.ok) {
        if (!mountedRef.current) return;
        setState((_prev) => ({
          data: null,
          loading: false,
          isRevalidating: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        }));
        return;
      }

      const json = await res.json();
      if (!mountedRef.current) return;
      setState({
        data: json.data !== undefined ? json.data : json,
        loading: false,
        isRevalidating: false,
        error: null,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return; // Ignore aborts
      }
      if (!mountedRef.current) return;
      setState((prev) => ({
        data: prev.data,
        loading: false,
        isRevalidating: false,
        error: (err as Error).message || 'Network error',
      }));
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    if (!autoFetch || !url) return;
    void fetchData();
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: fetchData };
}
