interface NoReportsStateProps {
  onReport: () => void
}

export default function NoReportsState({ onReport }: NoReportsStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        No wait times reported yet.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        Be the first to report how long the line is at this checkpoint.
      </p>
      <button
        type="button"
        onClick={onReport}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label="No wait times reported. Tap Report Wait Time to submit the first report."
      >
        Report Wait Time
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('browse-airports'))}
        className="mt-4 w-full text-sm text-sky-500 dark:text-sky-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        aria-label="Check another airport"
      >
        Check another airport
      </button>
    </section>
  )
}
