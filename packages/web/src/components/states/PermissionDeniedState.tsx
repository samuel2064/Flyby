interface PermissionDeniedStateProps {
  type: 'location' | 'notification'
  onRetry: () => void
  onOpenSettings: () => void
  onDismiss: () => void
}

export default function PermissionDeniedState({
  type,
  onRetry,
  onOpenSettings,
  onDismiss,
}: PermissionDeniedStateProps) {
  const isLocation = type === 'location'
  const headline = isLocation ? 'Location access denied.' : 'Notifications disabled.'
  const subhead = isLocation
    ? "We can't suggest your nearest airport without location. Search for an airport manually instead."
    : "You won't get spike alerts. Enable notifications in Settings to get wait-time alerts."
  const primaryLabel = isLocation ? 'Search airports' : 'Open Settings'
  const secondaryLabel = isLocation ? 'Try again' : 'Continue without alerts'

  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto" role="alert" aria-live="polite">
      <div className="mb-8" aria-hidden="true">
        <svg className={`h-32 w-auto mx-auto ${isLocation ? 'text-slate-400' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isLocation ? (
            <>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 13a2 2 0 012-2h4a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        {headline}
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        {subhead}
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label={isLocation ? 'Search airports' : 'Open Settings'}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={isLocation ? onRetry : onDismiss}
        className="mt-4 w-full text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        aria-label={secondaryLabel}
      >
        {secondaryLabel}
      </button>
    </section>
  )
}
