interface EmptyStateProps {
  illustration: string
  headline: string
  subhead: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  onPrimary: () => void
  onSecondary?: () => void
}

const ILLUSTRATIONS: Record<string, string> = {
  'no-data': '<svg aria-hidden="true" className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2Z" strokeLinecap="round" strokeLinejoin="round" /></svg>',
  'no-checkpoints': '<svg aria-hidden="true" className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 18.6a3 3 0 100-6M9 18.6a3 3 0 100-6M3 16.6v-2.5a3 3 0 116 0v2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>',
}

export default function EmptyState({
  illustration,
  headline,
  subhead,
  primaryAction,
  secondaryAction,
  onPrimary,
  onSecondary,
}: EmptyStateProps) {
  const illustrationSvg = ILLUSTRATIONS[illustration]

  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto">
      {illustrationSvg && (
        <div className="mb-8" aria-hidden="true">
          <div className="h-32 w-auto mx-auto" dangerouslySetInnerHTML={{ __html: illustrationSvg }} />
        </div>
      )}
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        {headline}
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        {subhead}
      </p>
      <button
        type="button"
        onClick={onPrimary}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label={primaryAction.label}
      >
        {primaryAction.label}
      </button>
      {secondaryAction && onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="mt-4 w-full text-sm text-sky-500 dark:text-sky-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          aria-label={secondaryAction.label}
        >
          {secondaryAction.label}
        </button>
      )}
    </section>
  )
}
