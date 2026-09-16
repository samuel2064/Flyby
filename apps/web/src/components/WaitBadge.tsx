import { waitLevel } from '../api/types'

interface WaitBadgeProps {
  waitMinutes: number
}

const LEVEL_STYLES = {
  low: {
    label: 'Low',
    badge: 'bg-emerald-100 text-emerald-900 ring-emerald-600/30',
    dot: 'bg-emerald-600',
  },
  moderate: {
    label: 'Moderate',
    badge: 'bg-amber-100 text-amber-900 ring-amber-600/30',
    dot: 'bg-amber-500',
  },
  high: {
    label: 'High',
    badge: 'bg-red-100 text-red-900 ring-red-600/30',
    dot: 'bg-red-600',
  },
} as const

export function WaitBadge({ waitMinutes }: WaitBadgeProps) {
  const level = waitLevel(waitMinutes)
  const style = LEVEL_STYLES[level]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.badge}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label} · {waitMinutes} min
    </span>
  )
}
