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

// GET /api/checkpoints/airport/:code — per-checkpoint list with latest wait
// data (native contract: {data: CheckpointView[]}). Feeds the checkpoint
// drill-in links on the airport stats page so /checkpoint/:id (the report
// surface) is reachable through normal navigation.
export interface AirportCheckpointView {
  id: string
  airportCode: string
  airportName: string
  code: string
  name: string
  terminal: string | null
  latestWaitTimeMinutes: number | null
  latestReportedAt: string | null
  source: string | null
  reportType: string | null
  accuracy: number
  estimatedWaitTimeMinutes: number | null
}

export function getAirportCheckpoints(code: string): Promise<AirportCheckpointView[]> {
  return apiFetch<{ data: AirportCheckpointView[] }>(
    `/api/checkpoints/airport/${encodeURIComponent(code)}`
  ).then((r) => r.data)
}
