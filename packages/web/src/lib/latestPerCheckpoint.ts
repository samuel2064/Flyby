import type { WaitTime } from '../api/types'

// One row per checkpoint: /api/wait-times returns one row per raw report
// (documented contract), so a checkpoint with N reports arrives N times.
// The traveler-facing list keeps only the freshest report per
// (airport, checkpoint) - case-insensitive, so different airports never
// collapse into one card and name casing can never duplicate a checkpoint.
export function latestPerCheckpoint(rows: WaitTime[]): WaitTime[] {
  const latestByKey = new Map<string, WaitTime>()

  for (const row of rows) {
    if (!row || typeof row.checkpoint !== 'string' || row.checkpoint === '') continue
    const key = `${airportKey(row)}::${row.checkpoint.toLowerCase()}`
    const existing = latestByKey.get(key)
    if (!existing || timeOf(row) > timeOf(existing)) {
      latestByKey.set(key, row)
    }
  }

  return [...latestByKey.values()].sort((a, b) => timeOf(b) - timeOf(a))
}

function airportKey(row: WaitTime): string {
  return typeof row.airport === 'string' ? row.airport.toLowerCase() : ''
}

function timeOf(row: WaitTime): number {
  const parsed = Date.parse(row.updatedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}
