interface ApiUnavailableStateProps {
  onRetry: () => void
}

export default function ApiUnavailableState({ onRetry }: ApiUnavailableStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto" role="alert" aria-live="polite">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Wait times temporarily unavailable.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        Our wait-time service is down. Check back shortly, or report a wait once service is restored.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label="Retry loading wait times"
      >
        Retry
      </button>
    </section>
  )
}
