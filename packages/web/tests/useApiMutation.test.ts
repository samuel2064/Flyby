import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiMutation } from '../src/hooks/useApiMutation';

// Mock fetch
global.fetch = vi.fn();

describe('useApiMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useApiMutation());

    expect(result.current.data).toBe(null);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('sets loading to true during mutation', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    act(() => {
      result.current.mutate({ test: 'data' }, { url: '/api/test' });
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('returns data on successful POST request', async () => {
    const mockResponse = { id: 1, message: 'Created' };
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockResponse })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({ name: 'Test' }, { url: '/api/items' });
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBe(null);
    expect(result.current.loading).toBe(false);
  });

  it('handles response without data wrapper', async () => {
    const mockResponse = [1, 2, 3];
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(result.current.data).toEqual(mockResponse);
  });

  it('returns error on failed request', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid input')
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({ invalid: 'data' }, { url: '/api/items' });
    });

    expect(result.current.error).toBe('HTTP 400: Invalid input');
    expect(result.current.data).toBe(null);
  });

  it('returns error on network failure', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBe(null);
  });

  it('uses POST as default method', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('uses custom method when specified', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items/1', method: 'PUT' });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({
        method: 'PUT'
      })
    );
  });

  it('sends payload as JSON body', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());
    const payload = { name: 'Test', value: 123 };

    await act(async () => {
      await result.current.mutate(payload, { url: '/api/items' });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        body: JSON.stringify(payload)
      })
    );
  });

  it('includes Content-Type header by default', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('includes auth token when available', async () => {
    localStorage.setItem('flyby_token', 'test-token-456');
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token-456'
        })
      })
    );
  });

  it('merges custom headers with defaults', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, {
        url: '/api/items',
        headers: { 'X-Custom-Header': 'custom-value' }
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value'
        })
      })
    );
  });

  it('calls onSuccess callback on success', async () => {
    const mockData = { id: 1 };
    const onSuccess = vi.fn();
    
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockData })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, {
        url: '/api/items',
        onSuccess
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(mockData);
  });

  it('calls onError callback on failure', async () => {
    const onError = vi.fn();
    
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('Internal error')
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, {
        url: '/api/items',
        onError
      });
    });

    expect(onError).toHaveBeenCalledWith('HTTP 500: Internal error');
  });

  it('clears previous data before new mutation', async () => {
    // First mutation succeeds
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'first' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(result.current.data).toEqual('first');

    // Second mutation starts - should clear data
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'second' })
      } as Response)
    );

    act(() => {
      result.current.mutate({}, { url: '/api/items' });
    });

    // During loading, data should be null
    expect(result.current.data).toBe(null);
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual('second');
  });

  it('clears error before new mutation', async () => {
    // First mutation fails
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Error')
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    expect(result.current.error).toBeTruthy();

    // Second mutation succeeds
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      } as Response)
    );

    await act(async () => {
      await result.current.mutate({}, { url: '/api/items' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(null);
    expect(result.current.data).toEqual('success');
  });

  it('supports DELETE method', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'deleted' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate(null, {
        url: '/api/items/1',
        method: 'DELETE'
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
    expect(result.current.data).toEqual('deleted');
  });

  it('supports PATCH method', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'patched' })
      } as Response)
    );

    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.mutate({ updated: 'field' }, {
        url: '/api/items/1',
        method: 'PATCH'
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({
        method: 'PATCH'
      })
    );
    expect(result.current.data).toEqual('patched');
  });
});