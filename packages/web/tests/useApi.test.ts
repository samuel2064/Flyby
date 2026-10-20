import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useApi } from '../src/hooks/useApi';

// Mock fetch
global.fetch = vi.fn();

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns loading state while fetching', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: 'result' }) 
      } as Response)
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe('result');
  });

  it('returns data on successful response', async () => {
    const mockData = { id: 1, name: 'Test' };
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: mockData }) 
      } as Response)
    );

    const { result } = renderHook(() => useApi<typeof mockData>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
  });

  it('handles response without data wrapper', async () => {
    const mockData = [1, 2, 3];
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve(mockData) 
      } as Response)
    );

    const { result } = renderHook(() => useApi<number[]>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
  });

  it('returns error on failed response', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: false, 
        status: 404, 
        statusText: 'Not Found' 
      } as Response)
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('HTTP 404: Not Found');
    expect(result.current.data).toBe(null);
  });

  it('returns error on network failure', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBe(null);
  });

  it('handles network errors correctly', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.reject(new Error('Connection failed'))
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Connection failed');
    expect(result.current.data).toBe(null);
  });

  it('aborts previous request when url changes', async () => {
    const mockData = 'result';
    fetch.mockImplementation(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: mockData }) 
      } as Response)
    );

    const { rerender } = renderHook(
      ({ url }) => useApi<string>(url, [url]),
      { initialProps: { url: '/api/first' } }
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    rerender({ url: '/api/second' });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    // AbortController should have been used
    expect(fetch).toHaveBeenCalledWith(
      '/api/second',
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('includes auth token in request headers when available', async () => {
    localStorage.setItem('flyby_token', 'test-token-123');
    
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: 'result' }) 
      } as Response)
    );

    renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer test-token-123'
        }
      })
    );
  });

  it('does not include auth header when token is missing', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: 'result' }) 
      } as Response)
    );

    renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const options = callArgs[1] as RequestInit;
    expect(options?.headers).toEqual({});
  });

  it('does not auto-fetch when autoFetch is false', () => {
    const { result } = renderHook(() => 
      useApi<string>('/api/test', [], { autoFetch: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when url is null', () => {
    const { result } = renderHook(() => useApi<string>(null, []));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('provides refetch function that triggers new request', async () => {
    fetch.mockImplementation(() => 
      Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({ data: 'result' }) 
      } as Response)
    );

    const { result } = renderHook(() => useApi<string>('/api/test', [], { autoFetch: false }));

    expect(fetch).not.toHaveBeenCalled();

    act(() => { result.current.refetch(); });

    // Wait for the async fetch to complete
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.data).toBe('result');
    });
  });

  it('clears error on successful refetch', async () => {
    // First request fails, second succeeds
    fetch
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error'
        } as Response)
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        } as Response)
      );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    // Wait for first request to fail
    await waitFor(() => {
      expect(result.current.error).toBe('HTTP 500: Server Error');
    });

    expect(result.current.error).toBe('HTTP 500: Server Error');

    // Refetch should use the second mock
    act(() => { result.current.refetch(); });

    // Wait for second request to succeed
    await waitFor(() => {
      expect(result.current.data).toBe('success');
    });

    expect(result.current.error).toBe(null);
    expect(result.current.data).toBe('success');
  });

  it('sets loading to false after error', async () => {
    fetch.mockImplementationOnce(() => 
      Promise.reject(new Error('Connection failed'))
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Connection failed');
  });

  it('prefixes fetch with VITE_API_BASE_URL when configured', async () => {
    const previousBase = import.meta.env.VITE_API_BASE_URL;
    import.meta.env.VITE_API_BASE_URL = 'https://api.example.com';
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'remote' })
      } as Response)
    );

    const { result } = renderHook(() => useApi<string>('/api/test', []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/api/test', expect.anything());
    expect(result.current.data).toBe('remote');
    import.meta.env.VITE_API_BASE_URL = previousBase;
  });
});