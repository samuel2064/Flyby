const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'https://flyby-api.onrender.com'

export { API_BASE_URL }

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  // 429s carry Retry-After; the lib extracts a countdown from it.
  readonly retryAfterSeconds: number | null

  constructor(status: number, body: unknown, retryAfterSeconds: number | null = null) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Thrown when the fetch itself fails at the network level (rejected promise,
// timeout, abort) - as opposed to an HTTP 4xx/5xx application response which
// surfaces as ApiError. Network errors are the signal that the Render API
// instance may be sleeping (cold start).
export class NetworkError extends Error {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    throw new NetworkError('Network request failed', err)
  }
  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    const retryHeader = response.headers.get('Retry-After')
    const retryAfterSeconds =
      response.status === 429 && retryHeader !== null && /^\d+$/.test(retryHeader.trim())
        ? parseInt(retryHeader.trim(), 10)
        : null
    throw new ApiError(response.status, body, retryAfterSeconds)
  }
  return (await response.json()) as T
}
