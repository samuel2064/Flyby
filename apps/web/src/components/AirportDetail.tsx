import { useEffect, useState } from 'react'
import { getAirportWaitStats } from '../api/summary'
import type { AirportStats, StatsBucket } from '../api/summary'
import { formatAverage } from '../lib/dashboard'
import { useLiveRefresh } from '../hooks/useLiveRefresh'

interface AirportDetailProps {
  code: string
  onBack: () => void
}

// Per-airport drill (TIR-317): Avg / Median / P90 strip plus busiest-hours and
// day-of-week CSS bar charts. Bars are divs, not a chart lib, per the
// WaitHistoryChart no-dependency convention; color is never the sole signal
// (values are printed next to every bar).
export function AirportDetail({ code, onBack }: AirportDetailProps) {
  const [stats, setStats] = useState<AirportStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(false)
    setStats(null)
    getAirportWaitStats(code)
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  // Pick up new crowd data every 60s, in step with the dashboard refresh.
  useLiveRefresh(() => {
    getAirportWaitStats(code)
      .then(setStats)
      .catch(() => {})
  })

  return (
    <section className="pt-8" aria-labelledby="detail-heading">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        ← All airports
      </button>

      {error && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load stats for {code}.</p>
          <p className="mt-1 text-xs text-slate-500">The API may be waking up. Try again in a moment.</p>
        </div>
      )}

      {!error && !stats && <p className="mt-6 text-sm text-slate-500">Loading {code} stats…</p>}

      {stats && (
        <>
          <h1 id="detail-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {stats.airport} · {stats.airportName}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Based on {stats.sampleSize} crowd report{stats.sampleSize === 1 ? '' : 's'}.
          </p>

          <dl className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Average" value={formatAverage(stats.overall.averageMinutes)} />
            <Stat label="Median (P50)" value={formatAverage(stats.overall.p50Minutes)} />
            <Stat label="Worst case (P90)" value={formatAverage(stats.overall.p90Minutes)} />
          </dl>

          <BarChart
            title="Busiest hours"
            buckets={stats.byHourOfDay.map((h) => ({
              key: String(h.hour),
              label: `${h.hour}`,
              bucket: h,
            }))}
          />
          <BarChart
            title="By day of week"
            buckets={stats.byDayOfWeek.map((d) => ({
              key: String(d.day),
              label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.day] ?? String(d.day),
              bucket: d,
            }))}
          />
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-slate-900">{value}</dd>
    </div>
  )
}

interface BarDatum {
  key: string
  label: string
  bucket: StatsBucket
}

function BarChart({ title, buckets }: { title: string; buckets: BarDatum[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.bucket.averageMinutes ?? 0))
  const summaryText = buckets
    .filter((b) => b.bucket.averageMinutes !== null)
    .map((b) => `${b.label}: ${formatAverage(b.bucket.averageMinutes)}`)
    .join(', ')
  return (
    <figure className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="text-sm font-semibold text-slate-900">{title}</figcaption>
      <p className="sr-only">
        {title}. {summaryText === '' ? 'No data yet.' : summaryText}
      </p>
      <div aria-hidden="true" className="mt-3 flex h-32 items-end gap-1">
        {buckets.map((b) => {
          const v = b.bucket.averageMinutes
          const heightPct = v === null ? 0 : Math.max(4, (v / max) * 100)
          return (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{v === null ? '' : formatAverage(v).replace(' min', '')}</span>
              <div
                className={`w-full rounded-t ${v === null ? 'bg-slate-100' : 'bg-brand-500/80'}`}
                style={{ height: `${v === null ? 4 : heightPct}%` }}
              />
              <span className="text-[10px] text-slate-400">{b.label}</span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}
