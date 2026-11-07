import { describe, expect, it } from 'vitest'
import { canSubmitReport, effectiveCheckpointPick } from '../src/lib/reportCheckpoint'

describe('effectiveCheckpointPick', () => {
  it('returns the picked checkpoint when it is a valid option', () => {
    expect(effectiveCheckpointPick('Main', ['Main', 'North', 'South'])).toBe('Main')
  })

  it('falls back to the first option when the pick is not valid', () => {
    expect(effectiveCheckpointPick('Closed', ['Main', 'North', 'South'])).toBe('Main')
  })

  it('falls back to empty string when there are no options', () => {
    expect(effectiveCheckpointPick('Main', [])).toBe('')
  })

  it('is case-sensitive (Main !== main)', () => {
    expect(effectiveCheckpointPick('main', ['Main', 'North'])).toBe('Main')
  })
})

describe('canSubmitReport', () => {
  it('returns true for a non-blank checkpoint', () => {
    expect(canSubmitReport('Main')).toBe(true)
    expect(canSubmitReport(' Terminal 4 ')).toBe(true)
  })

  it('returns false for an empty string', () => {
    expect(canSubmitReport('')).toBe(false)
  })

  it('returns false for whitespace-only', () => {
    expect(canSubmitReport('   ')).toBe(false)
  })
})
