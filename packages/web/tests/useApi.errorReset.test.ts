import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApi } from "../src/hooks/useApi";

// Helper to create a mock fetch that fails first then succeeds
function createMockFetchSequence(responses: Array<{ok?: boolean; status?: number; json?: unknown}>){
  const originalFetch = global.fetch as any;
  let callIndex = 0;
  global.fetch = vi.fn(async () => {
    const resp = responses[callIndex] ?? { ok: false, status: 500 };
    callIndex++;
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status ?? 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => resp.json ?? {},
    };
  });
  return () => { global.fetch = originalFetch; };
}

describe('useApi error reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('clears previous error on successful fetch after failure', async () => {
    // sequence: fail, succeed
    const restore = createMockFetchSequence([
      { ok: false, status: 500 },
      { ok: true, json: { data: 42 } },
    ]);

    // deps: [url] makes the effect re-run when the url prop changes
    const { result, rerender } = renderHook(
      ({ url }) => useApi<number>(url, [url]),
      { initialProps: { url: '/api/test1' } }
    );

    // after initial fail, loading should be false and error set
    await waitFor(() => {
      expect(result.current.error).toBe('HTTP 500: Internal Server Error');
    });
    expect(result.current.loading).toBe(false);

    // change url prop to trigger new fetch
    rerender({ url: '/api/test2' });
    await waitFor(() => {
      expect(result.current.data).toBe(42);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);

    restore();
  });
});
