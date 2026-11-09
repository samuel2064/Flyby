interface EmptyStateProps {
  _type: string
  title: string
  message: string
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  illustration?: string
  showIllustration?: boolean
}

const DEFAULT_ILLUSTRATIONS: Record<string, string> = {
  'no-data': '<svg aria-hidden="true" className="h-48 w-auto mx-auto text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2Z" strokeLinecap="round" strokeLinejoin="round" /></svg>',
  'no-results': '<svg aria-hidden="true" className="h-48 w-auto mx-auto text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 18.6a3 3 0 100-6M9 18.6a3 3 0 100-6M3 16.6v-2.5a3 3 0 116 0v2.5M18 18.6a3 3 0 100-6M9 18.6a3 3 0 100-6M3 16.6v-2.5a3 3 0 116 0v2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>',
  'permissions': '<svg aria-hidden="true" className="h-48 w-auto mx-auto text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" strokeLinecap="round" strokeLinejoin="round" /></svg>',
}

export function EmptyState({
  _type,
  title,
  message,
  primaryAction,
  secondaryAction,
  illustration,
  showIllustration = true,
}: EmptyStateProps) {
  void _type
  const illustrationSvg = illustration && DEFAULT_ILLUSTRATIONS[illustration]

  return (
    <section className={`text-center py-12 ${showIllustration && illustration ? 'lg:grid lg:grid-cols-2 lg:gap-8 lg:text-left' : ''}`}>
      {showIllustration && illustrationSvg && (
        <div className="mb-8" aria-hidden="true">
          <div
            className="h-48 w-auto mx-auto"
            dangerouslySetInnerHTML={{ __html: illustrationSvg }}
          />
        </div>
      )}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-600 dark:text-gray-300">{title}</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-xl mx-auto">{message}</p>
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="bg-gradient-to-r from-brand-600 to-brand-700 text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="mt-4 block text-gray-600 dark:text-gray-300 underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </section>
  )
}
