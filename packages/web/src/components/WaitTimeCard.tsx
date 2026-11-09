interface WaitTimeCardProps {
  airportTerminal: string
  waitTime: number
  status: 'excellent' | 'good' | 'fair' | 'poor'
  trend: 'improving' | 'worsening' | 'stable'
  lastUpdated: Date | string
  onReportTime?: () => void
  onViewDetails?: () => void
  isLoading?: boolean
}

const STATUS_CONFIG: Record<WaitTimeCardProps['status'], { color: string; label: string; bg: string; dot: string }> = {
  excellent: { color: 'text-green-600', label: 'Excellent', bg: 'bg-green-100 dark:bg-green-900/20', dot: 'bg-green-600 dark:bg-green-600' },
  good: { color: 'text-yellow-600', label: 'Good', bg: 'bg-yellow-100 dark:bg-yellow-900/20', dot: 'bg-yellow-600 dark:bg-yellow-600' },
  fair: { color: 'text-orange-600', label: 'Fair', bg: 'bg-orange-100 dark:bg-orange-900/20', dot: 'bg-orange-600 dark:bg-orange-600' },
  poor: { color: 'text-red-600', label: 'Poor', bg: 'bg-red-100 dark:bg-red-900/20', dot: 'bg-red-600 dark:bg-red-600' },
}

const TREND_CONFIG: Record<WaitTimeCardProps['trend'], { icon: string; color: string; label: string }> = {
  improving: { icon: '▼', color: 'text-green-500', label: 'Improving' },
  worsening: { icon: '▲', color: 'text-red-500', label: 'Worsening' },
  stable: { icon: '─', color: 'text-gray-500', label: 'Stable' },
}

export function WaitTimeCard({
  airportTerminal,
  waitTime,
  status,
  trend,
  lastUpdated,
  onReportTime,
  onViewDetails,
  isLoading = false,
}: WaitTimeCardProps) {
  const config = STATUS_CONFIG[status]
  const trendConfig = TREND_CONFIG[trend]
  const hasActions = Boolean(onReportTime || onViewDetails)

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700 mb-2" />
        <div className="h-20 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-2 flex items-center space-x-1">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    )
  }

  return (
    <article className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-medium text-slate-900 dark:text-slate-100">{airportTerminal}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-5xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{waitTime}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
          </div>
          <div className="flex items-center space-x-1 mt-2 text-sm">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-sm">
            <span aria-hidden="true" className={`h-3 w-3 ${trendConfig.color}`}>{trendConfig.icon}</span>
            <span className={`font-medium ${trendConfig.color}`}>{trendConfig.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {hasActions && (
          <div className="flex flex-col gap-2">
            {onReportTime && (
              <button
                type="button"
                onClick={onReportTime}
                className="bg-brand-50/50 text-brand-700 hover:bg-brand-100 px-3 py-1 rounded hover:shadow-md transition"
              >
                Report time
              </button>
            )}
            {onViewDetails && (
              <button
                type="button"
                onClick={onViewDetails}
                className="bg-brand-50/50 text-brand-700 hover:bg-brand-100 px-3 py-1 rounded hover:shadow-md transition"
              >
                View details
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
