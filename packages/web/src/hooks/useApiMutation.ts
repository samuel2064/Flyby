import { useState, useCallback } from "react";
import { apiUrl } from "../lib/apiUrl";

interface MutationState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface MutateOptions<T> {
  url: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseApiMutationResult<T, P> {
  mutate: (payload: P, options: MutateOptions<T>) => Promise<void>;
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * useApiMutation — generic API mutation hook for POST/PUT/PATCH/DELETE.
 * Usage:
 *   const { mutate, data, loading, error } = useApiMutation<Report, { minutes: number }>();
 *   await mutate({ minutes: 15 }, { url: "/api/reports", method: "POST" });
 */
export function useApiMutation<T, P = unknown>(): UseApiMutationResult<T, P> {
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const mutate = useCallback(async (payload: P, options: MutateOptions<T>) => {
    const { url, method = "POST", headers = {} } = options;

    setState({ data: null, loading: true, error: null });

    try {
      const token = localStorage.getItem('flyby_token');
      const res = await fetch(apiUrl(url), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      const json = await res.json();
      const responseData = json.data !== undefined ? json.data : json;

      setState({
        data: responseData,
        loading: false,
        error: null,
      });

      if (options.onSuccess) {
        options.onSuccess(responseData);
      }
    } catch (err) {
      const errorMessage =
        (err as Error).message || "Network error";
      setState({
        data: null,
        loading: false,
        error: errorMessage,
      });

      if (options.onError) {
        options.onError(errorMessage);
      }
    }
  }, []);

  return { mutate, ...state };
}
