import { describe, expect, it } from 'vitest'
import { canSubmitReport, effectiveCheckpointPick } from './reportCheckpoint'

describe('effectiveCheckpointPick (picker mode, stale picks never leak)', () => {
  it('keeps a pick that exists in the current airport options', () => {
    expect(effectiveCheckpointPick('South Checkpoint', ['Main', 'North Checkpoint', 'South Checkpoint'])).toBe(
      'South Checkpoint',
    )
  })

  it('falls back to the first option when the pick is not configured for this airport', () => {
    expect(effectiveCheckpointPick('Terminal 8 Security', ['Main', 'North Checkpoint'])).toBe('Main')
  })

  it('falls back to the first option for an empty initial pick', () => {
    expect(effectiveCheckpointPick('', ['Main', 'North Checkpoint'])).toBe('Main')
  })

  it('returns an empty string when the airport has no configured checkpoints', () => {
    expect(effectiveCheckpointPick('Main', [])).toBe('')
  })

  it('matches option names exactly (case and whitespace sensitive)', () => {
    expect(effectiveCheckpointPick('main', ['Main'])).toBe('Main')
    expect(effectiveCheckpointPick(' Main ', ['Main'])).toBe('Main')
  })
})

describe('canSubmitReport (submit gate)', () => {
  it('allows a configured checkpoint name', () => {
    expect(canSubmitReport('Main')).toBe(true)
  })

  it('rejects an empty checkpoint', () => {
    expect(canSubmitReport('')).toBe(false)
  })

  it('rejects a whitespace-only checkpoint', () => {
    expect(canSubmitReport('   ')).toBe(false)
  })

  it('allows a name with surrounding meaning-bearing whitespace', () => {
    expect(canSubmitReport('South Checkpoint')).toBe(true)
  })
})
