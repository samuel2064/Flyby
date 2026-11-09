interface FeatureHighlightProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  variant?: 'default' | 'highlight'
}

export function FeatureHighlight({
  icon: Icon,
  label,
  variant = 'default',
}: FeatureHighlightProps) {
  return (
    <div className="flex items-center space-x-3">
      <div className={`w-5 h-5 shrink-0 ${
        variant === 'highlight' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-500'
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className={`text-sm ${
        variant === 'highlight'
          ? 'text-brand-600 font-medium dark:text-brand-400'
          : 'text-gray-600 dark:text-gray-300'
      }`}>
        {label}
      </span>
    </div>
  )
}
