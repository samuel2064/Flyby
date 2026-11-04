import { formatBestHour, type ForecastBestHour } from '../lib/forecastChip'

interface BestTimeChipProps {
  best: ForecastBestHour | undefined
  loading: boolean
}

// Per-checkpoint "best time today" chip. Enhances the card but must never
// break it: loading -> skeleton, no data / fetch error -> render nothing
// (same trust rules as the monorepo BestTimeChip, TIR-300).
export function BestTimeChip({ best, loading }: BestTimeChipProps) {
  if (loading) {
    return (
      <div
        aria-hidden="true"
        data-testid="best-time-skeleton"
        className="mt-1 h-4 w-24 animate-pulse rounded-full bg-slate-200"
      />
    )
  }
  if (!best) return null
  return (
    <span
      data-testid="best-time-chip"
      title="Quietest upcoming hour today, from crowd reports"
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
    >
      Best ~{formatBestHour(best.hour)} · {best.predictedMinutes} min
    </span>
  )
}
