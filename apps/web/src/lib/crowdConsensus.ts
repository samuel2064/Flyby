import type { AirportForecastEntry } from '../api/forecasts'

// Crowd consensus line on checkpoint cards. Sampled from the SAME batched
// forecast payload the chips use (currentConsensusMinutes, 6h recency-
// weighted per the TIR-300 core), so it costs no extra round trip.
// Trust rules (same as chips): show ONLY what the API actually computed -
// null/missing/zero-sample never render a line.
export interface CrowdConsensus {
  minutes: number
  sampleCount: number
}

export interface ConsensusLookup {
  consensusFor(checkpointName: string): CrowdConsensus | undefined
}

export function buildConsensusByCheckpoint(
  forecasts: AirportForecastEntry[] | null | undefined,
): ConsensusLookup {
  const map = new Map<string, CrowdConsensus>()
  if (Array.isArray(forecasts)) {
    for (const forecast of forecasts) {
      if (!forecast || typeof forecast.name !== 'string') continue
      const minutes = forecast.currentConsensusMinutes
      const samples = forecast.sampleCount
      if (
        typeof minutes !== 'number' ||
        !Number.isFinite(minutes) ||
        minutes < 0 ||
        typeof samples !== 'number' ||
        samples < 1
      ) {
        continue
      }
      map.set(forecast.name.toLowerCase(), { minutes: Math.round(minutes), sampleCount: Math.round(samples) })
    }
  }
  return {
    consensusFor: (name: string) => map.get(name.toLowerCase()),
  }
}

export function formatConsensus(c: CrowdConsensus): string {
  return `Crowd consensus ~${c.minutes} min (${c.sampleCount} ${c.sampleCount === 1 ? 'report' : 'reports'})`
}
