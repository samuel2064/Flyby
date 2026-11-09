interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  isLoading?: boolean
  disabled?: boolean
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  isLoading = false,
  disabled = false,
}: FeatureCardProps) {
  return (
    <article
      className={`rounded-xl shadow-sm p-6 bg-white dark:bg-slate-800 ${isLoading ? 'opacity-70 pointer-events-none' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="w-8 h-8 mb-4 text-brand-600">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="text-gray-600 dark:text-gray-300 mb-4">{description}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={isLoading || disabled}
          className="flex-1 bg-gradient-to-r from-brand-600 to-brand-700 text-white px-6 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {primaryAction.label}
        </button>
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            disabled={isLoading || disabled}
            className="text-brand-600 underline hover:no-underline ml-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </article>
  )
}
