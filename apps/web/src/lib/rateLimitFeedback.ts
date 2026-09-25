import { ApiError } from '../api/client'

// Rate-limit feedback (429) helpers - kept pure so they carry unit tests
// like the other libs. The API signals two ways: a Retry-After header AND a
// body message "retry in Ns". Header wins; message parse is the fallback.

const RETRY_IN_RX = /retry\s+in\s+(\d+)\s*s/i

interface RateLimitShapedBody {
  errors?: Array<{ field?: string; message?: string }>
}

// Seconds until the user may report again, or null when this error is not a
// rate-limit rejection at all.
export function extractRateLimitSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null
  if (typeof err.retryAfterSeconds === 'number' && err.retryAfterSeconds >= 0) {
    return err.retryAfterSeconds
  }
  const body = err.body as RateLimitShapedBody | null
  const messages = body?.errors?.map((e) => e?.message ?? '') ?? []
  for (const message of messages) {
    const m = message.match(RETRY_IN_RX)
    if (m) return parseInt(m[1], 10)
  }
  return 30 // HTTP 429 with no parseable hint: assume the documented window
}

export function formatWaitMessage(secondsLeft: number): string {
  const s = Math.max(0, Math.round(secondsLeft))
  return `Please wait ${s} second${s === 1 ? '' : 's'} before reporting again`
}
