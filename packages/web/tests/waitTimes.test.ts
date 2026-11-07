import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitWaitTimeReport } from '../src/api/waitTimes'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('submitWaitTimeReport', () => {
  it('POSTs the report to /api/wait-times/report', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 'rep-1', airport: 'JFK', checkpoint: 'Main', waitMinutes: 10, receivedAt: '2026-09-23T12:00:00Z' }),
    } as Response)

    const result = await submitWaitTimeReport({ airport: 'JFK', checkpoint: 'Main', waitMinutes: 10 })

    expect(fetch).toHaveBeenCalledWith('/api/wait-times/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airport: 'JFK', checkpoint: 'Main', waitMinutes: 10 }),
    })
    expect(result).toEqual({ id: 'rep-1', airport: 'JFK', checkpoint: 'Main', waitMinutes: 10, receivedAt: '2026-09-23T12:00:00Z' })
  })

  it('throws when the response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Retry-After': '30' }),
      json: () => Promise.resolve(null),
    } as Response)

    await expect(submitWaitTimeReport({ airport: 'JFK', checkpoint: 'Main', waitMinutes: 10 })).rejects.toBeDefined()
  })
})
