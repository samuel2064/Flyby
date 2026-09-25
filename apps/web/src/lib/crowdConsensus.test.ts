import { describe, it, expect } from 'vitest'
import { buildConsensusByCheckpoint, formatConsensus } from './crowdConsensus'
import type { AirportForecastEntry } from '../api/forecasts'

const entry = (over: Partial<AirportForecastEntry>): AirportForecastEntry => ({
  checkpointId: 'ck-x-main',
  code: null,
  name: 'Main',
  terminal: null,
  timezone: 'UTC',
  sampleCount: 3,
  overallAverageMinutes: 12,
  currentConsensusMinutes: 14.4,
  liveConsensusMinutes: null,
  predictions: [],
  bestHours: [],
  ...over,
})

describe('buildConsensusByCheckpoint', () => {
  it('exposes currentConsensusMinutes by checkpoint name (case-insensitive)', () => {
    const lookup = buildConsensusByCheckpoint([entry({ name: 'Main', currentConsensusMinutes: 14.4, sampleCount: 3 })])
    expect(lookup.consensusFor('Main')).toEqual({ minutes: 14, sampleCount: 3 })
    expect(lookup.consensusFor('main')).toEqual({ minutes: 14, sampleCount: 3 })
    expect(lookup.consensusFor( ' MAIN ' ) ?? lookup.consensusFor('MAIN')).toEqual({ minutes: 14, sampleCount: 3 })
    expect(lookup.consensusFor('North')).toBeUndefined()
  })

  it('rounds minutes to the nearest integer before display', () => {
    const up = buildConsensusByCheckpoint([entry({ currentConsensusMinutes: 14.5, sampleCount: 2 })])
    expect(up.consensusFor('Main')?.minutes).toBe(15)
  })

  it('never fabricates: null consensus, zero samples, missing/NaN values are all excluded', () => {
    const lookup = buildConsensusByCheckpoint([
      entry({ name: 'A', currentConsensusMinutes: null }),
      entry({ name: 'B', currentConsensusMinutes: 9, sampleCount: 0 }),
      entry({ name: 'C', currentConsensusMinutes: undefined as unknown as number }),
      entry({ name: 'D', currentConsensusMinutes: NaN }),
      entry({ name: 'E', currentConsensusMinutes: -4 }),
      null as unknown as AirportForecastEntry,
    ])
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      expect(lookup.consensusFor(name), name).toBeUndefined()
    }
  })

  it('handles null/undefined/empty payloads without throwing', () => {
    expect(buildConsensusByCheckpoint(null).consensusFor('Main')).toBeUndefined()
    expect(buildConsensusByCheckpoint(undefined).consensusFor('Main')).toBeUndefined()
    expect(buildConsensusByCheckpoint([]).consensusFor('Main')).toBeUndefined()
  })
})

describe('formatConsensus', () => {
  it('formats with plural/singular report count', () => {
    expect(formatConsensus({ minutes: 14, sampleCount: 3 })).toBe('Crowd consensus ~14 min (3 reports)')
    expect(formatConsensus({ minutes: 8, sampleCount: 1 })).toBe('Crowd consensus ~8 min (1 report)')
  })
})
