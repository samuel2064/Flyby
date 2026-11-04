import { useEffect, useRef, useState } from 'react'
import { getAirportForecasts } from '../api/forecasts'
import type { AirportForecastEntry } from '../api/forecasts'

export interface UseForecastsResult {
  forecasts: AirportForecastEntry[] | null
  loading: boolean
}

// Batched forecast for the selected airport. Refetches silently whenever
// `refreshKey` changes (the wait-times `lastUpdated` stamp: SSE update, poll
// refresh, or a freshly submitted report). The skeleton shows only while the
// first load for an airport is in flight - silent refreshes keep the old
// chips until new data lands. A fetch error clears forecasts so cards render
// with no chips instead of breaking.
export function useForecasts(
  airportCode: string,
  refreshKey: string | null,
): UseForecastsResult {
  const [forecasts, setForecasts] = useState<AirportForecastEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const loadedForRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const firstLoadForAirport = loadedForRef.current !== airportCode
    if (firstLoadForAirport) setLoading(true)

    getAirportForecasts(airportCode)
      .then((response) => {
        if (cancelled) return
        loadedForRef.current = airportCode
        const entries = response?.data?.forecasts
        setForecasts(Array.isArray(entries) ? entries : null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        loadedForRef.current = airportCode
        setForecasts(null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [airportCode, refreshKey])

  return { forecasts, loading }
}
