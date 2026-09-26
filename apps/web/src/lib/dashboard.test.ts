import { describe, expect, it } from 'vitest'
import {
  filterAirports,
  formatAverage,
  formatMinutes,
  severityFor,
  sortBySeverity,
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
