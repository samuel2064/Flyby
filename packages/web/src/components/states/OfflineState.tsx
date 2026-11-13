interface OfflineStateProps {
  onRetry: () => void
  queuedCount: number
}

export default function OfflineState({ onRetry, queuedCount }: OfflineStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto" role="alert" aria-live="polite">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.5 10c-.54 0-1.03-.22-1.41-.59l-2.58-2.58a3 3 0 00-4.24 4.24l2.58 2.58c.38.38.87.59 1.41.59h0a3 3 0 003-3v0c0-.54-.22-1.03-.59-1.41zM19 18H5a2 2 0 01-2-2V7a2 2 0 012-2h6.08a1 1 0 01.71.29l1.24 2.48a1 1 0 00.78.47h3a1 1 0 00.78-.47l1.24-2.48a1 1 0 01.71-.29h6.08a2 2 0 012 2v9a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        You're offline.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        Wait times and reports need a connection. Reports you submit will sync when you're back online.
      </p>
      {queuedCount > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mb-6">
          {queuedCount} report{queuedCount === 1 ? '' : 's'} queued for sync
        </p>
      )}
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
