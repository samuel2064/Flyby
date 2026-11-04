import { describe, it, expect } from 'vitest'
import { shouldShowInstall, DISMISS_COOLDOWN_MS } from './installGate'

const base = { promptCaptured: true, installed: false, dismissedUntil: null, now: 1_000_000 }

describe('shouldShowInstall', () => {
  it('shows only when the browser offered a prompt and the app is not yet installed', () => {
    expect(shouldShowInstall(base)).toBe(true)
    expect(shouldShowInstall({ ...base, promptCaptured: false })).toBe(false)
    expect(shouldShowInstall({ ...base, installed: true })).toBe(false)
    expect(shouldShowInstall({ ...base, promptCaptured: false, installed: true })).toBe(false)
  })

  it('respects the dismissal cooldown window', () => {
    expect(shouldShowInstall({ ...base, dismissedUntil: base.now - 1 })).toBe(true)
    // Boundary: cooldown has expired at the exact timestamp (cache TTL convention).
    expect(shouldShowInstall({ ...base, dismissedUntil: base.now })).toBe(true)
    expect(shouldShowInstall({ ...base, dismissedUntil: base.now + DISMISS_COOLDOWN_MS })).toBe(false)
  })

  it('installed wins over everything', () => {
    expect(shouldShowInstall({ promptCaptured: true, installed: true, dismissedUntil: null, now: 0 })).toBe(false)
  })
})
