import { describe, expect, it } from 'vitest'
import {
  filterAirports,
  formatAge,
  formatAverage,
  formatMinutes,
  isStale,
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
})
