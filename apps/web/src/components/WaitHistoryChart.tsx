import { CHART_HEIGHT, CHART_PAD, CHART_WIDTH, chartGeometry } from '../lib/chartPoints'
import type { ChartPointInput } from '../lib/chartPoints'

interface WaitHistoryChartProps {
  history: ChartPointInput[]
  title?: string
}

const STROKE = '#0f766e' // Tailwind teal-700 (brand accent)
const GRID = '#e2e8f0' // Tailwind slate-200
const LABEL = '#64748b' // Tailwind slate-500

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Lightweight SVG line chart for a checkpoint's rolling wait-time history.
// No chart library on purpose: the MVP load-time target (< 2s on 4G) does not
// have room for one. All geometry comes from lib/chartPoints (unit-tested).
export function WaitHistoryChart({ history, title = 'Wait time history' }: WaitHistoryChartProps) {
  if (!history || history.length === 0) {
    return (
      <p className="text-xs text-slate-500" data-testid="wait-history-empty">
        No reports in this window yet. History builds as travelers report.
      </p>
    )
  }

  const { points, gridlines, polyline, yMax } = chartGeometry(history)
  const n = points.length
  const labelEvery = Math.max(1, Math.ceil(n / 4))
  const maxMinutes = Math.max(...history.map((p) => p.minutes))
  const minMinutes = Math.min(...history.map((p) => p.minutes))
  const yAt = (m: number) =>
    CHART_PAD.top + (CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom) - (m / yMax) * (CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom)

  return (
    <figure>
      <figcaption className="sr-only">
        {title}: {n} data point{n === 1 ? '' : 's'}, between {minMinutes} and {maxMinutes} minutes.
      </figcaption>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}: ${n} data point${n === 1 ? '' : 's'}, between ${minMinutes} and ${maxMinutes} minutes`}
        data-testid="wait-history-chart"
      >
        {gridlines.map((v) => (
          <g key={v}>
            <line
              x1={CHART_PAD.left}
              x2={CHART_WIDTH - CHART_PAD.right}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text x={CHART_PAD.left - 6} y={yAt(v) + 4} textAnchor="end" fontSize={11} fill={LABEL}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={`x-${p.time}`}
              x={p.x}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              fontSize={11}
              fill={LABEL}
            >
              {formatTime(p.time)}
            </text>
          ) : null,
        )}
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke={STROKE}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((p) => (
          <circle key={`p-${p.time}`} cx={p.x} cy={p.y} r={4} fill={STROKE}>
            <title>{`${p.minutes} min at ${formatTime(p.time)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}
