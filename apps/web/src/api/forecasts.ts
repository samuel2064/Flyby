import { apiFetch } from './client'

// Contract: GET /api/airports/:code/forecasts (docs/API.md, TIR-300).
// One round trip forecasts every checkpoint at the airport - the chips never
// fan out into N /predict calls.

export type ForecastSource = 'pattern' | 'blended' | 'fallback'

export interface ForecastPrediction {
  hour: number
  forecastFor: string
  predictedMinutes: number
  confidence: number
  sampleCount: number
  source: ForecastSource
}

export interface AirportForecastEntry {
  checkpointId: string
  code: string | null
  name: string
  terminal: string | null
  timezone: string
  sampleCount: number
  overallAverageMinutes: number | null
  currentConsensusMinutes: number | null
  liveConsensusMinutes: number | null
  predictions: ForecastPrediction[]
  bestHours: { hour: number; forecastFor: string; predictedMinutes: number }[]
}

export interface AirportForecastsResponse {
  data: {
    airportCode: string
    airportName: string
    timezone: string
    historyDays: number
    horizon: number
    forecasts: AirportForecastEntry[]
  }
}

export function getAirportForecasts(airport: string): Promise<AirportForecastsResponse> {
  return apiFetch<AirportForecastsResponse>(
    `/api/airports/${encodeURIComponent(airport)}/forecasts`,
  )
}
