import { useEffect, useState } from 'react'
import { shouldShowInstall, DISMISS_COOLDOWN_MS } from '../lib/installGate'

// The browser fires beforeinstallprompt only when the manifest + service
// worker + engagement criteria all pass; stashing the event defers Chrome's
// mini-infobar so the app controls WHEN. Dismissal silences the chip for the
// cooldown (persisted in localStorage so the traveler is not re-nagged on
// every visit).

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'flyby.install.dismissedUntil'

function readDismissedUntil(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeDismissedUntil(until: number): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(until))
  } catch {
    // private mode etc. - dismiss becomes session-only, acceptable.
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  )
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(() => readDismissedUntil())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    // The display-mode can flip on install completion in some browsers.
    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayMode = (e: MediaQueryListEvent) => setInstalled(e.matches)
    media.addEventListener('change', onDisplayMode)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onDisplayMode)
    }
  }, [])

  if (!shouldShowInstall({
    promptCaptured: deferredPrompt !== null,
    installed,
    dismissedUntil,
    now: Date.now(),
  })) {
    return null
  }

  const dismiss = () => {
    const until = Date.now() + DISMISS_COOLDOWN_MS
    setDismissedUntil(until)
    writeDismissedUntil(until)
  }

  const install = async () => {
    if (!deferredPrompt || busy) return
    setBusy(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed bottom-4 left-4 z-30 flex max-w-xs items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg"
      data-testid="install-prompt"
    >
      <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 16v-2l-8-2.5V6.5a1.5 1.5 0 0 0-3 0v5L2 14v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />
      </svg>
      <div className="min-w-0 flex-1">
        <p id="install-prompt-title" className="text-sm font-semibold text-slate-900">
          Install Flyby
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Home-screen app angle: open instantly, works through flaky airport WiFi.
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={install}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
          >
            {busy ? 'Opening…' : 'Install'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
