export interface WaitTime {
  airport: string
  checkpoint: string
  waitMinutes: number
  reportType?: string | null
  updatedAt: string
}

export interface WaitTimeUpdateEvent {
  type: 'connected' | 'wait-time-update'
  airport?: string
  checkpoint?: string
  waitMinutes?: number
  timestamp: string
}

export interface ReportSubmission {
  airport: string
  checkpoint: string
  waitMinutes: number
  reportType?: string
  reporter?: string
}

export interface ReportConfirmation {
  id: string
  airport: string
  checkpoint: string
  waitMinutes: number
  reportType?: string
  receivedAt: string
}

export type WaitLevel = 'low' | 'moderate' | 'high'

export function waitLevel(minutes: number): WaitLevel {
  if (minutes <= 15) return 'low'
  if (minutes <= 30) return 'moderate'
  return 'high'
}
