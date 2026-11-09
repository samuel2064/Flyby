interface FilterBarProps {
  terminals: Array<string>
  selectedTerminals: Array<string>
  onTerminalChange: (selectedTerminals: Array<string>) => void
  timeRanges: Array<{ label: string; value: string }>
  selectedTimeRange: string
  onTimeRangeChange: (selectedTimeRange: string) => void
  showAlertsOnly: boolean
  onToggleAlerts: (checked: boolean) => void
  isLoading?: boolean
}

export function FilterBar({
  terminals,
  selectedTerminals,
  onTerminalChange,
  timeRanges,
  selectedTimeRange,
  onTimeRangeChange,
  showAlertsOnly,
  onToggleAlerts,
  isLoading = false,
}: FilterBarProps) {
  return (
    <div
      className={`space-x-3 overflow-x-auto pb-2 ${isLoading ? 'opacity-70' : ''}`}
    >
      <div className="flex gap-2">
        {terminals.map((terminal) => {
          const isActive = selectedTerminals.includes(terminal)
          return (
            <button
              key={terminal}
              type="button"
              role="checkbox"
              aria-checked={isActive}
              onClick={() => {
                if (isActive) {
                  onTerminalChange(selectedTerminals.filter((t) => t !== terminal))
                } else {
                  onTerminalChange([...selectedTerminals, terminal])
                }
              }}
              className={`px-3 py-1.5 text-sm rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                isActive
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-500'
              }`}
            >
              {terminal}
            </button>
          )
        })}
        <select
          value={selectedTimeRange}
          onChange={(e) => onTimeRangeChange(e.target.value)}
          disabled={isLoading}
          className="w-32 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          {timeRanges.map((tr) => (
            <option key={tr.value} value={tr.value}>
              {tr.label}
            </option>
          ))}
        </select>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showAlertsOnly}
            onChange={(e) => onToggleAlerts(e.target.checked)}
            className="w-4 h-4 text-brand-600 bg-gray-100 dark:bg-slate-600 border-gray-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:outline-none"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Alerts only</span>
        </label>
      </div>
    </div>
  )
}
