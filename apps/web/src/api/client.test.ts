import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, ApiError, NetworkError } from './client'

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn() as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  it('throws NetworkError when fetch rejects (network failure / cold start)', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )

    await expect(apiFetch('/api/wait-times/summary')).rejects.toBeInstanceOf(NetworkError)
  })

  it('throws ApiError when the response is not ok (4xx/5xx)', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(apiFetch('/api/wait-times/summary')).rejects.toBeInstanceOf(ApiError)
  })

  it('parses JSON on successful response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const result = await apiFetch<{ ok: boolean }>('/api/health')
    expect(result).toEqual({ ok: true })
  })
})
