// Install-prompt gating. Pure: no DOM, no events - all decisions come from
// the signal snapshot. Rule set (same trust style as the chip libs): show
// only when the browser actually offered one and the traveler is not already
// installed and did not dismiss us recently.
export const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

export interface InstallSignals {
  // beforeinstallprompt fired and the event is stored (browser agrees we are installable)
  promptCaptured: boolean
  // already running standalone / display-mode: standalone (don't nag the installed)
  installed: boolean
  // epoch ms when a dismissal stops nagging; null = never dismissed
  dismissedUntil: number | null
  now: number
}

export function shouldShowInstall(signals: InstallSignals): boolean {
  if (signals.installed) return false
  if (!signals.promptCaptured) return false
  if (signals.dismissedUntil !== null && signals.now < signals.dismissedUntil) return false
  return true
}
