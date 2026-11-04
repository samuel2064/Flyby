import type { AirportForecastEntry } from '../api/forecasts'

// Quietest upcoming local hour at a checkpoint, from the batch forecast
// endpoint (GET /api/airports/:code/forecasts, bestHours[0] is the API's
// already-sorted pick - never a fabricated value).
export interface ForecastBestHour {
  hour: number
  forecastFor: string
  predictedMinutes: number
}

// Airport-local hour number -> "12 AM", "1 PM", "2 PM"...
export function formatBestHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

// Map of lowercase checkpoint name -> best upcoming hour. Checkpoints with no
// forecast evidence get NO entry (no fabrication); malformed entries are
// skipped so a bad payload can never break the cards.
export interface BestHourLookup {
  // Case-insensitive: the caller never has to normalize checkpoint names.
  bestFor(checkpointName: string): ForecastBestHour | undefined
}

export function buildBestByCheckpoint(
  forecasts: AirportForecastEntry[] | null | undefined,
): BestHourLookup {
  const map = new Map<string, ForecastBestHour>()
  if (Array.isArray(forecasts)) {
    for (const forecast of forecasts) {
      if (!forecast || typeof forecast.name !== 'string') continue
      const best = Array.isArray(forecast.bestHours) ? forecast.bestHours[0] : undefined
      if (
        !best ||
        typeof best.hour !== 'number' ||
        typeof best.predictedMinutes !== 'number'
      ) {
        continue
      }
      map.set(forecast.name.toLowerCase(), best)
    }
  }
  return {
    bestFor: (checkpointName: string) => map.get(checkpointName.toLowerCase()),
  }
}
