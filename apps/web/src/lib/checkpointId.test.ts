import { describe, expect, it } from 'vitest'
import { checkpointId } from './checkpointId'

describe('checkpointId (stable ids, mirrors the API)', () => {
  it('derives the pinned server ids exactly (server.test.js contract)', () => {
    expect(checkpointId('JFK', 'Main')).toBe('ck-jfk-main')
    expect(checkpointId('ORD', 'Terminal 2')).toBe('ck-ord-terminal-2')
    expect(checkpointId('ATL', 'Domestic North Checkpoint A')).toBe('ck-atl-domestic-north-checkpoint-a')
  })

  it('is case-insensitive: lowercase inputs give the same id', () => {
    expect(checkpointId('jfk', 'main')).toBe('ck-jfk-main')
    expect(checkpointId('atl', 'domestic north checkpoint a')).toBe('ck-atl-domestic-north-checkpoint-a')
  })

  it('collapses punctuation and whitespace runs into single hyphens', () => {
    expect(checkpointId('LAX', 'Tom Bradley Terminal Security')).toBe(
      'ck-lax-tom-bradley-terminal-security',
    )
    expect(checkpointId('SEA', "D Checkpoint (North)")).toBe('ck-sea-d-checkpoint-north')
  })

  it('trims leading and trailing separator runs from the slug', () => {
    expect(checkpointId('SEA', ' -- Main -- ')).toBe('ck-sea-main')
  })
})
