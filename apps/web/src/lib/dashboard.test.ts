import { describe, expect, it } from 'vitest'
import {
  confidenceFor,
  filterAirports,
  formatAge,
  formatAverage,
  formatMinutes,
  freshnessLabel,
  isStale,
  isTinySample,
  newestReportedAt,
  severityFor,
  sortBySeverity,
  STALE_AFTER_MS,
} from './dashboard'
import type { AirportSummary } from '../api/summary'

function summary(partial: Partial<AirportSummary>): AirportSummary {
  return {
    airport: 'XXX',
    airportName: 'Test Airport',
    timezone: 'America/New_York',
    latestWaitMinutes: null,
    latestReportedAt: null,
    sampleSize: 0,
    trend: null,
    ...partial,
  }
}

describe('severityFor', () => {
  it('buckets boundaries per the design contract', () => {
    expect(severityFor(null)).toBe('no-data')
    expect(severityFor(0)).toBe('short')
    expect(severityFor(14)).toBe('short')
    expect(severityFor(15)).toBe('moderate')
    expect(severityFor(29)).toBe('moderate')
    expect(severityFor(30)).toBe('long')
    expect(severityFor(44)).toBe('long')
    expect(severityFor(45)).toBe('very-long')
  })

  it('treats non-finite values as no-data', () => {
    expect(severityFor(Number.NaN)).toBe('no-data')
    expect(severityFor(Infinity)).toBe('no-data')
  })
})

describe('sortBySeverity', () => {
  it('orders worst-first, no-data last alphabetically', () => {
    const list = [
      summary({ airport: 'ZZZ', latestWaitMinutes: null }),
      summary({ airport: 'AAA', latestWaitMinutes: null }),
      summary({ airport: 'JFK', latestWaitMinutes: 42, sampleSize: 5 }),
      summary({ airport: 'SEA', latestWaitMinutes: 7, sampleSize: 3 }),
      summary({ airport: 'ORD', latestWaitMinutes: 90, sampleSize: 1 }),
    ]
    const sorted = sortBySeverity(list).map((a) => a.airport)
    expect(sorted).toEqual(['ORD', 'JFK', 'SEA', 'AAA', 'ZZZ'])
  })

  it('breaks ties inside a bucket by wait minutes then sample size', () => {
    const list = [
      summary({ airport: 'A1', latestWaitMinutes: 20, sampleSize: 1 }),
      summary({ airport: 'A2', latestWaitMinutes: 20, sampleSize: 9 }),
      summary({ airport: 'A3', latestWaitMinutes: 25, sampleSize: 2 }),
    ]
    expect(sortBySeverity(list).map((a) => a.airport)).toEqual(['A3', 'A2', 'A1'])
  })

  it('does not mutate the input array', () => {
    const list = [summary({ airport: 'B', latestWaitMinutes: 1 }), summary({ airport: 'A', latestWaitMinutes: 2 })]
    const copy = [...list]
    sortBySeverity(list)
    expect(list).toEqual(copy)
  })
})

describe('filterAirports', () => {
  const list = [
    summary({ airport: 'JFK', airportName: 'John F. Kennedy International' }),
    summary({ airport: 'LAX', airportName: 'Los Angeles International' }),
  ]

  it('matches by code or name, case-insensitive', () => {
    expect(filterAirports(list, 'jf').map((a) => a.airport)).toEqual(['JFK'])
    expect(filterAirports(list, 'angeles').map((a) => a.airport)).toEqual(['LAX'])
  })

  it('returns the whole list for an empty/blank query', () => {
    expect(filterAirports(list, '')).toHaveLength(2)
    expect(filterAirports(list, '   ')).toHaveLength(2)
  })
})

describe('formatters', () => {
  it('formatMinutes rounds and handles null', () => {
    expect(formatMinutes(null)).toBe('—')
    expect(formatMinutes(42.4)).toBe('42 min')
  })

  it('formatAverage keeps one decimal when needed', () => {
    expect(formatAverage(null)).toBe('—')
    expect(formatAverage(28.5)).toBe('28.5 min')
    expect(formatAverage(15)).toBe('15 min')
  })
})

describe('staleness (TIR-343)', () => {
  const now = Date.parse('2026-09-26T12:00:00Z')

  it('marks reports older than 3h as stale, fresh ones not', () => {
    expect(isStale('2026-09-26T10:00:00Z', now)).toBe(false) // 2h old
    expect(isStale('2026-09-26T08:59:59Z', now)).toBe(true) // just over 3h
    expect(isStale('2026-09-25T02:18:38Z', now)).toBe(true) // ~34h old (QA repro)
  })

  it('treats null/garbage timestamps as stale (no fake freshness)', () => {
    expect(isStale(null, now)).toBe(true)
    expect(isStale('not-a-date', now)).toBe(true)
  })

  it('STALE_AFTER_MS is 3 hours, matching the trend window', () => {
    expect(STALE_AFTER_MS).toBe(3 * 60 * 60 * 1000)
  })

  it('formatAge renders minutes, hours, and days', () => {
    expect(formatAge('2026-09-26T11:59:40Z', now)).toBe('just now')
    expect(formatAge('2026-09-26T11:15:00Z', now)).toBe('45m ago')
    expect(formatAge('2026-09-26T10:55:00Z', now)).toBe('1h ago')
    expect(formatAge('2026-09-26T02:00:00Z', now)).toBe('10h ago')
    expect(formatAge('2026-09-24T00:00:00Z', now)).toBe('2d ago')
    expect(formatAge(null, now)).toBe('no recent report')
  })

  it('newestReportedAt returns the max report time across rows (TIR-390)', () => {
    expect(
      newestReportedAt([
        summary({ latestReportedAt: '2026-09-26T10:00:00Z' }),
        summary({ latestReportedAt: '2026-09-26T11:30:00Z' }),
        summary({ latestReportedAt: '2026-09-26T09:15:00Z' }),
      ]),
    ).toBe('2026-09-26T11:30:00.000Z')
  })

  it('newestReportedAt ignores null/invalid and returns null when none', () => {
    expect(newestReportedAt([])).toBe(null)
    expect(
      newestReportedAt([
        summary({ latestReportedAt: null }),
        summary({ latestReportedAt: 'not-a-date' }),
      ]),
    ).toBe(null)
  })
})

describe('confidenceFor', () => {
  it('returns none for zero samples', () => {
    expect(confidenceFor(0)).toBe('none')
  })
  it('returns low for 1-2 samples', () => {
    expect(confidenceFor(1)).toBe('low')
    expect(confidenceFor(2)).toBe('low')
  })
  it('returns medium for 3-9 samples', () => {
    expect(confidenceFor(3)).toBe('medium')
    expect(confidenceFor(9)).toBe('medium')
  })
  it('returns high for 10+ samples', () => {
    expect(confidenceFor(10)).toBe('high')
    expect(confidenceFor(100)).toBe('high')
  })
})

describe('isTinySample', () => {
  it('returns false for zero samples', () => {
    expect(isTinySample(0)).toBe(false)
  })
  it('returns true for 1-2 samples', () => {
    expect(isTinySample(1)).toBe(true)
    expect(isTinySample(2)).toBe(true)
  })
  it('returns false for 3+ samples', () => {
    expect(isTinySample(3)).toBe(false)
    expect(isTinySample(10)).toBe(false)
  })
})

describe('freshnessLabel', () => {
  const now = Date.now()

  it('returns unavailable when no samples', () => {
    expect(freshnessLabel(null, null, 0, null)).toBe('unavailable')
  })

  it('returns historical when stale', () => {
    const staleDate = new Date(now - 4 * 60 * 60 * 1000).toISOString() // 4h ago
    expect(freshnessLabel(12, staleDate, 5, null)).toBe('historical')
  })

  it('returns recent when fresh with minutes', () => {
    const recentDate = new Date(now - 60 * 60 * 1000).toISOString() // 1h ago
    expect(freshnessLabel(12, recentDate, 5, null)).toBe('recent')
  })

  it('returns estimate when trend data exists but no minutes', () => {
    const recentDate = new Date(now - 60 * 60 * 1000).toISOString() // 1h ago
    expect(
      freshnessLabel(null, recentDate, 5, { currentSampleSize: 5, previousSampleSize: 3 }),
    ).toBe('estimate')
  })
})
