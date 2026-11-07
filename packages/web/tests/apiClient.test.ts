import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiFetch, ApiError } from '../src/api/client'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('apiFetch', () => {
  it('returns parsed JSON on a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 1, name: 'x' }),
    } as Response)
    const data = await apiFetch<{ id: number; name: string }>('/api/test')
    expect(data).toEqual({ id: 1, name: 'x' })
  })

  it('throws ApiError with status and body on a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'nope' }),
    } as Response)
    await expect(apiFetch('/api/missing')).rejects.toMatchObject(
      new ApiError(404, { message: 'nope' }),
    )
  })

  it('parses Retry-After into retryAfterSeconds on a 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Retry-After': '45' }),
      json: () => Promise.resolve(null),
    } as Response)
    await expect(apiFetch('/api/report')).rejects.toMatchObject(
      new ApiError(429, null, 45),
    )
  })

  it('yields null retryAfterSeconds when Retry-After is missing or non-numeric', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers(),
      json: () => Promise.resolve(null),
    } as Response)
    await expect(apiFetch('/api/report')).rejects.toMatchObject(
      new ApiError(429, null, null),
    )
  })
})
