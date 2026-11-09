type ChartType = 'line' | 'bar' | 'pie' | 'stat'

interface DataVisualizationProps {
  type?: ChartType
  data: Array<Record<string, string | number | boolean>>
  _options?: Record<string, unknown>
  width?: string | number
  height?: string | number
  showLabels?: boolean
  _showLegend?: boolean
}

export function DataVisualization({
  type = 'line',
  data,
  _options,
  width = '100%',
  height = 200,
  showLabels = true,
  _showLegend,
}: DataVisualizationProps) {
  void _options
  void _showLegend
  if (!data || data.length === 0) {
    return (
      <div
        className={`w-full h-full animate-pulse bg-gray-200 dark:bg-slate-600 rounded`}
        style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height }}
      />
    )
  }

  switch (type) {
    case 'stat': {
      const latest = data[data.length - 1]
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-2"
          style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height }}
        >
          <div className="text-3xl font-bold tabular-nums text-brand-600">
            {latest.value ?? latest.minutes ?? latest.label ?? latest}
          </div>
          {showLabels && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{latest.label ?? 'Value'}</p>
          )}
        </div>
      )
    }
    case 'bar':
    case 'line':
    case 'pie':
    default:
      return (
        <div
          className="w-full h-full relative"
          style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse bg-gray-200 dark:bg-slate-600 rounded h-16 w-3/4" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            {type} chart visualization
          </p>
        </div>
      )
  }
}
