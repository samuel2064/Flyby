import { describe, expect, it } from 'vitest'
import { latestPerCheckpoint } from './latestPerCheckpoint'
import type { WaitTime } from '../api/types'

function row(overrides: Partial<WaitTime> = {}): WaitTime {
  return {
    airport: 'JFK',
    checkpoint: 'Main',
    waitMinutes: 10,
    updatedAt: '2026-09-23T12:00:00.000Z',
    ...overrides,
  }
}

describe('latestPerCheckpoint (one card per checkpoint, freshest report)', () => {
  it('returns an empty list for an empty fetch (airport with no reports)', () => {
    expect(latestPerCheckpoint([])).toEqual([])
  })

  it('passes a single row through unchanged', () => {
    const only = row()
    expect(latestPerCheckpoint([only])).toEqual([only])
  })

  it('keeps only the newest report when rows arrive newest-first (API order)', () => {
    const result = latestPerCheckpoint([
      row({ waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
      row({ waitMinutes: 15, updatedAt: '2026-09-23T10:00:00.000Z' }),
      row({ waitMinutes: 20, updatedAt: '2026-09-23T08:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 7 })])
  })

  it('keeps only the newest report when rows arrive oldest-first', () => {
    const result = latestPerCheckpoint([
      row({ waitMinutes: 20, updatedAt: '2026-09-23T08:00:00.000Z' }),
      row({ waitMinutes: 15, updatedAt: '2026-09-23T10:00:00.000Z' }),
      row({ waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 7 })])
  })

  it('keeps only the newest report when rows arrive shuffled', () => {
    const result = latestPerCheckpoint([
      row({ waitMinutes: 15, updatedAt: '2026-09-23T10:00:00.000Z' }),
      row({ waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
      row({ waitMinutes: 20, updatedAt: '2026-09-23T08:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 7 })])
  })

  it('groups checkpoint names case-insensitively (Main / MAIN / main are one checkpoint)', () => {
    const result = latestPerCheckpoint([
      row({ checkpoint: 'Main', waitMinutes: 20, updatedAt: '2026-09-23T08:00:00.000Z' }),
      row({ checkpoint: 'MAIN', waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
      row({ checkpoint: 'main', waitMinutes: 15, updatedAt: '2026-09-23T10:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ checkpoint: 'MAIN', waitMinutes: 7 })])
  })

  it('groups airport codes case-insensitively (jfk and JFK are the same airport)', () => {
    const result = latestPerCheckpoint([
      row({ airport: 'jfk', waitMinutes: 20, updatedAt: '2026-09-23T08:00:00.000Z' }),
      row({ airport: 'JFK', waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 7 })])
  })

  it('does not collapse the same checkpoint name across different airports', () => {
    const result = latestPerCheckpoint([
      row({ airport: 'JFK', waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
      row({ airport: 'SEA', waitMinutes: 12, updatedAt: '2026-09-23T14:00:00.000Z' }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.airport).sort()).toEqual(['JFK', 'SEA'])
  })

  it('breaks updatedAt ties by keeping the first occurrence (deterministic)', () => {
    const result = latestPerCheckpoint([
      row({ waitMinutes: 15, updatedAt: '2026-09-23T12:00:00.000Z' }),
      row({ waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 15 })])
  })

  it('orders the result by updatedAt desc regardless of arrival order', () => {
    const result = latestPerCheckpoint([
      row({ checkpoint: 'North', waitMinutes: 25, updatedAt: '2026-09-23T09:00:00.000Z' }),
      row({ checkpoint: 'Main', waitMinutes: 10, updatedAt: '2026-09-23T13:00:00.000Z' }),
      row({ checkpoint: 'South', waitMinutes: 30, updatedAt: '2026-09-23T11:00:00.000Z' }),
    ])
    expect(result.map((r) => r.checkpoint)).toEqual(['Main', 'South', 'North'])
  })

  it('skips rows without a checkpoint name instead of throwing', () => {
    const good = row({ waitMinutes: 7 })
    const bad = { airport: 'JFK', waitMinutes: 5, updatedAt: '2026-09-23T12:00:00.000Z' }
    expect(latestPerCheckpoint([bad as unknown as WaitTime, null as unknown as WaitTime, good])).toEqual([good])
  })

  it('treats an unparsable updatedAt as the oldest (never wins over a real timestamp)', () => {
    const result = latestPerCheckpoint([
      row({ waitMinutes: 5, updatedAt: 'not-a-date' }),
      row({ waitMinutes: 7, updatedAt: '2026-09-23T12:00:00.000Z' }),
    ])
    expect(result).toEqual([row({ waitMinutes: 7 })])
  })
})
