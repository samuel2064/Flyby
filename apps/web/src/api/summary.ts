import { apiFetch } from './client'

// Dashboard data contracts (TIR-317): verified live shapes from
// GET /api/wait-times/summary and GET /api/airports/:code/wait-stats.

export interface AirportSummary {
  airport: string
  airportName: string
  timezone: string
  latestWaitMinutes: number | null
  latestReportedAt: string | null
  sampleSize: number
  trend: {
    direction: 'up' | 'down' | 'flat' | null
    currentAverageMinutes: number | null
    previousAverageMinutes: number | null
    currentSampleSize: number
    previousSampleSize: number
    windowHours: number
  } | null
}

export interface WaitTimesSummary {
  airports: AirportSummary[]
  airportCount: number
}

export interface StatsBucket {
  averageMinutes: number | null
  p50Minutes: number | null
  p90Minutes: number | null
  sampleSize: number
}

export interface HourBucket extends StatsBucket {
  hour: number
}

export interface DayBucket extends StatsBucket {
  day: number // 0 = Sunday
}

export interface AirportStats {
  airport: string
  airportName: string
  timezone: string
  sampleSize: number
  overall: StatsBucket
  byHourOfDay: HourBucket[]
  byDayOfWeek: DayBucket[]
  generatedAt: string
}

export function getWaitTimesSummary(): Promise<WaitTimesSummary> {
  return apiFetch<WaitTimesSummary>('/api/wait-times/summary')
}

export function getAirportWaitStats(code: string): Promise<AirportStats> {
  return apiFetch<AirportStats>(`/api/airports/${encodeURIComponent(code)}/wait-stats`)
}
