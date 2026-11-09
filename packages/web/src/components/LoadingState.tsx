type LoadingType = 'skeleton' | 'spinner' | 'banner'

interface LoadingStateProps {
  type?: LoadingType
  label?: string
  title?: string
  message?: string
}

export function LoadingState({
  type = 'skeleton',
  label,
  title,
  message,
}: LoadingStateProps) {
  if (type === 'spinner') {
    return (
      <div className="flex items-center justify-center py-8" aria-hidden="true">
        <svg
          aria-hidden="true"
          className="h-5 w-5 border-2 border-brand-600/50 border-t-brand-600 animate-spin rounded-full"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" strokeLinecap="round" />
        </svg>
      </div>
    )
  }

  if (type === 'banner') {
    return (
      <div
        role="status"
        aria-label={title ?? 'Loading'}
        className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 flex items-center space-x-3"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 text-blue-500 dark:text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" strokeLinecap="round" />
        </svg>
        <div>
          <div className="font-medium text-blue-800 dark:text-blue-200">{title ?? 'Loading…'}</div>
          {message && <div className="text-sm text-blue-700 dark:text-blue-300">{message}</div>}
        </div>
      </div>
    )
  }

  // skeleton (default)
  return (
    <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded" aria-label={label ?? 'Loading'}>
      <div className="space-y-2">
        <div className="h-4 w-full rounded mb-2" />
        <div className="h-6 w-3/4 rounded mb-2" />
        <div className="h-4 w-1/2 rounded mb-4" />
        <div className="h-8 w-24 rounded mb-4" />
      </div>
    </div>
  )
}
