import { describe, it, expect } from 'vitest'
import { extractRateLimitSeconds, formatWaitMessage } from './rateLimitFeedback'
import { ApiError } from '../api/client'

describe('extractRateLimitSeconds', () => {
  it('returns null for non-429 / non-ApiError errors', () => {
    expect(extractRateLimitSeconds(null)).toBeNull()
    expect(extractRateLimitSeconds(new Error('x'))).toBeNull()
    expect(extractRateLimitSeconds(new ApiError(500, null))).toBeNull()
    expect(extractRateLimitSeconds(new ApiError(404, null))).toBeNull()
  })

  it('prefers the Retry-After header value when present', () => {
    const err = new ApiError(429, { errors: [{ message: 'retry in 7s' }] }, 21)
    expect(extractRateLimitSeconds(err)).toBe(21)
  })

  it('parses the body message "retry in Ns" when no header is attached', () => {
    const err = new ApiError(429, { errors: [{ field: 'rateLimit', message: 'Too many reports; retry in 30s' }] })
    expect(extractRateLimitSeconds(err)).toBe(30)
  })

  it('falls back to the documented 30s window for a bare 429', () => {
    expect(extractRateLimitSeconds(new ApiError(429, null))).toBe(30)
    expect(extractRateLimitSeconds(new ApiError(429, { errors: [{ message: 'slow down' }] }))).toBe(30)
  })
})

describe('formatWaitMessage', () => {
  it('formats seconds with correct pluralization', () => {
    expect(formatWaitMessage(25)).toBe('Please wait 25 seconds before reporting again')
    expect(formatWaitMessage(1)).toBe('Please wait 1 second before reporting again')
    expect(formatWaitMessage(0)).toBe('Please wait 0 seconds before reporting again')
  })
})
