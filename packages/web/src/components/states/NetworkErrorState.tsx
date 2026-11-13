interface NetworkErrorStateProps {
  onRetry: () => void
  onReportAnyway: () => void
}

export default function NetworkErrorState({
  onRetry,
  onReportAnyway,
}: NetworkErrorStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto" role="alert" aria-live="polite">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 12H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 18V14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Something went wrong.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        We couldn't load wait times. Please check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label="Retry loading wait times"
      >
        Retry
      </button>
      <button
        type="button"
        onClick={onReportAnyway}
        className="mt-4 w-full text-sm text-sky-500 dark:text-sky-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        aria-label="Report anyway"
      >
        Report anyway
      </button>
    </section>
  )
}
