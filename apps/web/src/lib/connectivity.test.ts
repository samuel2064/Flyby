import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isOffline, phaseAfterNetworkFailure } from './connectivity'

const globalRef = globalThis as unknown as { navigator?: { onLine: boolean } }
const hadNavigator = Boolean(globalRef.navigator)
const originalOnLine = globalRef.navigator
  ? Object.getOwnPropertyDescriptor(globalRef.navigator, 'onLine')
  : undefined

function setOnLine(value: boolean) {
  if (!globalRef.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    })
  }
  Object.defineProperty(globalRef.navigator as { onLine: boolean }, 'onLine', {
    value,
    configurable: true,
  })
}

beforeEach(() => setOnLine(true))

afterEach(() => {
  if (originalOnLine && globalRef.navigator) {
    Object.defineProperty(globalRef.navigator, 'onLine', originalOnLine)
  } else if (!hadNavigator && globalRef.navigator) {
    delete globalRef.navigator
  }
})

describe('isOffline', () => {
  it('is false while the device reports a connection', () => {
    expect(isOffline()).toBe(false)
  })

  it('is true when the device reports no connection', () => {
    setOnLine(false)
    expect(isOffline()).toBe(true)
  })
})

describe('phaseAfterNetworkFailure', () => {
  it('reports an error when the device still has a connection', () => {
    expect(phaseAfterNetworkFailure(true)).toBe('error')
  })

  it('reports offline when the device has no connection', () => {
    expect(phaseAfterNetworkFailure(false)).toBe('offline')
  })
})
