import { apiUrl } from '../lib/apiUrl'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly retryAfterSeconds: number | null

  constructor(status: number, body: unknown, retryAfterSeconds: number | null = null) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    let body: unknown
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
