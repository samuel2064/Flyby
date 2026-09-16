import { apiFetch, API_BASE_URL } from './client'
import type { ReportConfirmation, ReportSubmission, WaitTime, WaitTimeUpdateEvent } from './types'

const POLL_FALLBACK_MS = 30_000

export function getWaitTimes(airport: string): Promise<WaitTime[]> {
  const query = airport ? `?airport=${encodeURIComponent(airport)}` : ''
  return apiFetch<WaitTime[]>(`/api/wait-times${query}`)
}

export function submitWaitTimeReport(report: ReportSubmission): Promise<ReportConfirmation> {
  return apiFetch<ReportConfirmation>('/api/wait-times/report', {
    method: 'POST',
    body: JSON.stringify(report),
  })
}

export interface LiveSubscription {
  close: () => void
}

export function subscribeToLiveUpdates(
  airport: string,
  onEvent: (event: WaitTimeUpdateEvent) => void,
  onError: () => void,
): LiveSubscription {
  const source = new EventSource(
    `${API_BASE_URL}/api/events?airport=${encodeURIComponent(airport)}`,
  )
  source.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data) as WaitTimeUpdateEvent
      onEvent(parsed)
    } catch {
      onError()
    }
  }
  source.onerror = () => {
    onError()
  }
  return {
    close: () => source.close(),
  }
}

export { POLL_FALLBACK_MS }
