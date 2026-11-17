import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithColdStartRetry, isOffline } from './coldStart'
import { ApiError, NetworkError } from '../api/client'

const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')

function setOnLine(value: boolean) {
  if (typeof navigator === 'undefined') {
    ;(globalThis as unknown as { navigator: { onLine: boolean } }).navigator = {
      onLine: true,
    }
  }
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  setOnLine(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalOnLine) {
    Object.defineProperty(navigator, 'onLine', originalOnLine)
  }
})

describe('isOffline', () => {
  it('returns false when navigator.onLine is true', () => {
    expect(isOffline()).toBe(false)
  })

  it('returns true when navigator.onLine is false', () => {
    setOnLine(false)
    expect(isOffline()).toBe(true)
  })
})

describe('fetchWithColdStartRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('data')
    const result = await fetchWithColdStartRetry(fn)
    expect(result).toBe('data')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on NetworkError and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError('fail', new TypeError('fetch failed')))
      .mockResolvedValue('data')

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    setTimeoutSpy.mockImplementation((cb: unknown) => {
      ;(cb as () => void)()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const result = await fetchWithColdStartRetry(fn)
    expect(result).toBe('data')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)

    setTimeoutSpy.mockRestore()
  })

  it('throws ApiError immediately without retry', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(500, 'server error'))
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await expect(fetchWithColdStartRetry(fn)).rejects.toBeInstanceOf(ApiError)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(setTimeoutSpy).not.toHaveBeenCalled()

    setTimeoutSpy.mockRestore()
  })

  it('does not retry when device is offline', async () => {
    setOnLine(false)
    const fn = vi.fn().mockRejectedValue(new NetworkError('fail', new TypeError('fetch failed')))
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await expect(fetchWithColdStartRetry(fn)).rejects.toBeInstanceOf(NetworkError)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(setTimeoutSpy).not.toHaveBeenCalled()

    setTimeoutSpy.mockRestore()
  })

  it('retries up to 3 times then throws the last error', async () => {
    const error = new NetworkError('fail', new TypeError('fetch failed'))
    const fn = vi.fn().mockRejectedValue(error)

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    setTimeoutSpy.mockImplementation((cb: unknown) => {
      ;(cb as () => void)()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    await expect(fetchWithColdStartRetry(fn)).rejects.toBe(error)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2)

    setTimeoutSpy.mockRestore()
  })
})
