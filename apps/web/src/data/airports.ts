// Airport reference data. Single source of truth: the repo-root
// data/airports.json, shared with apps/api/server.js (required at runtime) so
// the API and the web app can never describe different airports.
import sharedData from '../../../../data/airports.json'

export interface Airport {
  id: string
  code: string
  name: string
  city: string
  timezone: string
}

export const AIRPORTS: Airport[] = sharedData.airports

// Explicit code lookup - never a positional index, which broke silently the
// moment the list grew beyond the launch set.
export const DEFAULT_AIRPORT: Airport =
  AIRPORTS.find((a) => a.code === 'SEA') ?? AIRPORTS[0]

export function searchAirports(query: string): Airport[] {
  const q = query.trim().toLowerCase()
  if (!q) return AIRPORTS
  return AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q),
  )
}

export function airportById(id: string): Airport | undefined {
  return AIRPORTS.find((a) => a.id === id || a.code === id.toUpperCase())
}

// Checkpoint names per airport, from the same shared file the API serves -
// lets travelers report even when no card exists yet for a checkpoint.
export const CHECKPOINTS_BY_AIRPORT: Record<string, string[]> = sharedData.checkpointsByAirport

export function checkpointOptions(airportCode: string): string[] {
  return CHECKPOINTS_BY_AIRPORT[(airportCode || '').trim().toUpperCase()] ?? []
}
