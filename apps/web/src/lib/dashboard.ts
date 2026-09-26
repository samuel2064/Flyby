import type { AirportSummary } from '../api/summary'

// Dashboard presentation logic (TIR-317). Kept pure + unit-tested, mirroring
// the lib/ convention used by chartPoints / crowdConsensus / forecastChip.

export type Severity = 'short' | 'moderate' | 'long' | 'very-long' | 'no-data'

export interface SeveritySpec {
  label: string
  // Tailwind classes: color is never the sole indicator - the label text is
  // always rendered next to the chip (a11y requirement from the design brief).
  chipClass: string
  badgeClass: string
}

export const SEVERITY_SPECS: Record<Severity, SeveritySpec> = {
  short: {
    label: 'Short',
    chipClass: 'bg-emerald-100 text-emerald-800',
    badgeClass: 'bg-emerald-500',
  },
  moderate: {
    label: 'Moderate',
    chipClass: 'bg-amber-100 text-amber-800',
    badgeClass: 'bg-amber-500',
  },
  long: {
    label: 'Long',
    chipClass: 'bg-orange-100 text-orange-800',
    badgeClass: 'bg-orange-500',
  },
  'very-long': {
    label: 'Very long',
    chipClass: 'bg-red-100 text-red-800',
    badgeClass: 'bg-red-500',
  },
  'no-data': {
    label: 'No data',
    chipClass: 'bg-slate-100 text-slate-500',
    badgeClass: 'bg-slate-300',
  },
}

export function severityFor(minutes: number | null): Severity {
  if (minutes === null || !Number.isFinite(minutes)) return 'no-data'
  if (minutes < 15) return 'short'
  if (minutes < 30) return 'moderate'
  if (minutes < 45) return 'long'
  return 'very-long'
}

const SEVERITY_RANK: Record<Severity, number> = {
  'very-long': 0,
  long: 1,
  moderate: 2,
  short: 3,
  'no-data': 4,
}

// Longest waits first; within a bucket, larger samples first; airports with
// no data sink to the bottom alphabetically.
export function sortBySeverity(list: AirportSummary[]): AirportSummary[] {
  return [...list].sort((a, b) => {
    const ra = SEVERITY_RANK[severityFor(a.latestWaitMinutes)]
    const rb = SEVERITY_RANK[severityFor(b.latestWaitMinutes)]
    if (ra !== rb) return ra - rb
    if (ra === 4) return a.airport.localeCompare(b.airport)
    if (b.latestWaitMinutes !== a.latestWaitMinutes) {
      return (b.latestWaitMinutes ?? 0) - (a.latestWaitMinutes ?? 0)
    }
    return b.sampleSize - a.sampleSize
  })
}

export function filterAirports(list: AirportSummary[], query: string): AirportSummary[] {
  const q = query.trim().toLowerCase()
  if (q === '') return list
  return list.filter(
    (a) =>
      a.airport.toLowerCase().includes(q) ||
      a.airportName.toLowerCase().includes(q),
  )
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—'
  return `${Math.round(minutes)} min`
}

export function formatAverage(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—'
  return `${Number(minutes.toFixed(1))} min`
}

// Staleness (TIR-343): crowd reports decay fast - a wait-time reading older
// than STALE_AFTER_MS must be visibly de-emphasized, not presented as fresh.
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000 // 3h, matches the trend window

export function ageMs(reportedAt: string | null, now: number = Date.now()): number | null {
  if (!reportedAt) return null
  const t = Date.parse(reportedAt)
  if (!Number.isFinite(t)) return null
  return Math.max(0, now - t)
}

export function isStale(reportedAt: string | null, now: number = Date.now()): boolean {
  const age = ageMs(reportedAt, now)
  return age === null || age > STALE_AFTER_MS
}

export function formatAge(reportedAt: string | null, now: number = Date.now()): string {
  const age = ageMs(reportedAt, now)
  if (age === null) return 'no recent report'
  const minutes = Math.floor(age / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
