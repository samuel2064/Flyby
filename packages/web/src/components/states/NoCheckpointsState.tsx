interface NoCheckpointsStateProps {
  onSearchAgain: () => void
  onBrowsePopular: () => void
}

export default function NoCheckpointsState({
  onSearchAgain,
  onBrowsePopular,
}: NoCheckpointsStateProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-xl mx-auto">
      <div className="mb-8" aria-hidden="true">
        <svg className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 18.6a3 3 0 100-6M9 18.6a3 3 0 100-6M3 16.6v-2.5a3 3 0 116 0v2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        No checkpoints found.
      </h2>
      <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        We couldn't find any security checkpoints at this airport. Try searching a different airport or city.
      </p>
      <button
        type="button"
        onClick={onSearchAgain}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
        aria-label="No checkpoints found for this airport. Try searching a different airport."
      >
        Search again
      </button>
      <button
        type="button"
        onClick={onBrowsePopular}
        className="mt-4 w-full text-sm text-sky-500 dark:text-sky-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        aria-label="Browse popular airports"
      >
        Browse popular airports
      </button>
    </section>
  )
}
