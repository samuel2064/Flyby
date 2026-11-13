interface RateLimitedStateProps {
  minutesRemaining: number
  onDismiss: () => void
}

export default function RateLimitedState({
  minutesRemaining,
  onDismiss,
}: RateLimitedStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto" role="alert" aria-live="polite">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Slow down — one report at a time.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        You can report once per checkpoint every 5 minutes. Try again in{' '}
        <span className="font-semibold text-amber-600 dark:text-amber-400">{minutesRemaining}</span>{' '}
        minute{minutesRemaining !== 1 ? 's' : ''}.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label={`Rate limited. Wait ${minutesRemaining} minutes before reporting again.`}
      >
        OK
      </button>
    </section>
  )
}
