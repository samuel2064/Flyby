import { describe, it, expect } from 'vitest'
import APP_SRC from '../App.tsx?raw'

// Static-source guard for the card key contract. One row per checkpoint
// holds client-side (latestPerCheckpoint), so the key can and must be
// updated at will - if `updatedAt` ever re-enters the key expression, every
// SSE tick re-mounts each card (chart + chip re-animate) and the regression
// is invisible until a human notices flicker. Repo tests are node-env only,
// so this assertion is a source-level contract test (vite ?raw import).
describe('checkpoint card key contract', () => {
  it('keys cards by checkpoint alone (stable across SSE/wait updates)', () => {
    expect(APP_SRC).toMatch(/key=\{waitTime\.checkpoint\.toLowerCase\(\)\}/)
    expect(APP_SRC).not.toMatch(/waitTime\.checkpoint[^\n]*updatedAt/)
    expect(APP_SRC).not.toMatch(/waitTime\.updatedAt[^\n]*checkpoint/)
  })
})
