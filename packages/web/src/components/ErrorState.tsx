interface ErrorStateProps {
  title: string
  message: string
  retryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  showDetails?: boolean
  errorDetails?: string
}

export function ErrorState({
  title,
  message,
  retryAction,
  secondaryAction,
  showDetails = false,
  errorDetails,
}: ErrorStateProps) {
  return (
    <section className="text-center py-12">
      <svg
        aria-hidden="true"
        className="mb-6 h-12 w-12 text-red-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M18 12H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 18V14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">{title}</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-xl mx-auto">{message}</p>
      {retryAction && (
        <button
          type="button"
          onClick={retryAction.onClick}
          className="bg-gradient-to-r from-brand-600 to-brand-700 text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {retryAction.label}
        </button>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="mt-3 block text-gray-600 dark:text-gray-300 underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {secondaryAction.label}
        </button>
      )}
      {showDetails && errorDetails && (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-600 text-left">
          <h3 className="text-lg font-bold mb-2 text-gray-800 dark:text-gray-100">Details</h3>
          <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{errorDetails}</pre>
        </div>
      )}
    </section>
  )
}
