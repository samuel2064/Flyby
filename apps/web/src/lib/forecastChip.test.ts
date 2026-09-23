import { describe, expect, it } from 'vitest'
import { buildBestByCheckpoint, formatBestHour } from './forecastChip'
import type { AirportForecastEntry } from '../api/forecasts'

function forecastEntry(overrides: Partial<AirportForecastEntry> = {}): AirportForecastEntry {
  return {
    checkpointId: 'ck-jfk-main',
    code: null,
    name: 'Main',
    terminal: null,
    timezone: 'America/New_York',
    sampleCount: 3,
    overallAverageMinutes: 12,
    currentConsensusMinutes: 10,
    liveConsensusMinutes: null,
    predictions: [
      {
        hour: 14,
        forecastFor: '2026-09-23T14:00:00.000Z',
        predictedMinutes: 12,
        confidence: 0.3,
        sampleCount: 3,
        source: 'pattern',
      },
    ],
    bestHours: [{ hour: 14, forecastFor: '2026-09-23T14:00:00.000Z', predictedMinutes: 12 }],
    ...overrides,
  } as AirportForecastEntry
}

describe('formatBestHour (airport-local hour -> 12h clock)', () => {
  it('formats midnight as 12 AM', () => {
    expect(formatBestHour(0)).toBe('12 AM')
  })

  it('formats hour 11 as 11 AM', () => {
    expect(formatBestHour(11)).toBe('11 AM')
  })

  it('formats noon as 12 PM', () => {
    expect(formatBestHour(12)).toBe('12 PM')
  })

  it('formats hour 13 as 1 PM', () => {
    expect(formatBestHour(13)).toBe('1 PM')
  })

  it('formats hour 14 as 2 PM', () => {
    expect(formatBestHour(14)).toBe('2 PM')
  })

  it('formats hour 23 as 11 PM', () => {
    expect(formatBestHour(23)).toBe('11 PM')
  })
})

describe('buildBestByCheckpoint (chips lookup from batch forecasts)', () => {
  it('matches checkpoint names case-insensitively (caller never normalizes)', () => {
    const lookup = buildBestByCheckpoint([forecastEntry({ name: 'Main Checkpoint' })])
    expect(lookup.bestFor('Main Checkpoint')).toBeDefined()
    expect(lookup.bestFor('main checkpoint')).toBeDefined()
    expect(lookup.bestFor('MAIN CHECKPOINT')).toBeDefined()
  })

  it('returns the API-sorted bestHours[0] (quietest upcoming hour)', () => {
    const lookup = buildBestByCheckpoint([
      forecastEntry({
        bestHours: [
          { hour: 14, forecastFor: 'a', predictedMinutes: 9 },
          { hour: 20, forecastFor: 'b', predictedMinutes: 15 },
        ],
      }),
    ])
    expect(lookup.bestFor('Main')?.hour).toBe(14)
    expect(lookup.bestFor('Main')?.predictedMinutes).toBe(9)
  })

  it('adds no entry for checkpoints with empty bestHours (no fabrication)', () => {
    const lookup = buildBestByCheckpoint([forecastEntry({ name: 'Quiet', bestHours: [] })])
    expect(lookup.bestFor('Quiet')).toBeUndefined()
  })

  it('adds no entry for checkpoints with no predictions at all', () => {
    const lookup = buildBestByCheckpoint([
      forecastEntry({ name: 'Empty', predictions: [], bestHours: [] }),
    ])
    expect(lookup.bestFor('Empty')).toBeUndefined()
  })

  it('skips malformed entries instead of throwing', () => {
    const missingBestHours = forecastEntry({ name: 'NoBest' })
    ;(missingBestHours as Partial<AirportForecastEntry>).bestHours = undefined
    const missingHour = {
      forecastFor: 'x',
      predictedMinutes: 5,
    } as unknown as AirportForecastEntry['bestHours']
    const lookup = buildBestByCheckpoint([
      missingBestHours,
      forecastEntry({ name: 'BadHour', bestHours: missingHour }),
      forecastEntry({
        name: 'Good',
        bestHours: [{ hour: 3, forecastFor: 'y', predictedMinutes: 7 }],
      }),
    ])
    expect(lookup.bestFor('NoBest')).toBeUndefined()
    expect(lookup.bestFor('BadHour')).toBeUndefined()
    expect(lookup.bestFor('Good')?.hour).toBe(3)
  })

  it('returns an empty lookup for null/undefined forecasts (fetch error -> no chips)', () => {
    expect(buildBestByCheckpoint(null).bestFor('Main')).toBeUndefined()
    expect(buildBestByCheckpoint(undefined).bestFor('Main')).toBeUndefined()
  })

  it('maps several checkpoints independently', () => {
    const lookup = buildBestByCheckpoint([
      forecastEntry({
        checkpointId: 'ck-sea-main',
        name: 'Main',
        bestHours: [{ hour: 9, forecastFor: 'a', predictedMinutes: 4 }],
      }),
      forecastEntry({
        checkpointId: 'ck-jfk-north',
        name: 'North',
        bestHours: [{ hour: 18, forecastFor: 'b', predictedMinutes: 22 }],
      }),
    ])
    expect(lookup.bestFor('Main')?.predictedMinutes).toBe(4)
    expect(lookup.bestFor('North')?.predictedMinutes).toBe(22)
    expect(lookup.bestFor('South')).toBeUndefined()
  })
})
