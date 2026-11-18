export type LoadPhase = 'loading' | 'waking' | 'offline' | 'ready' | 'error'

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

// A failed request is only a cold start when the device still has a
// connection. Without a connection it is an offline device, and the UI must
// say so instead of promising that the service is waking up.
export function phaseAfterNetworkFailure(online: boolean): 'offline' | 'error' {
  return online ? 'error' : 'offline'
}
