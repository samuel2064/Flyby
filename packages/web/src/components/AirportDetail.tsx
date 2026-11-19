import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAirportWaitStats, getAirportCheckpoints } from '../api/summary'
import type {
  AirportStats,
  AirportSummary,
  StatsBucket,
  AirportCheckpointView,
} from '../api/summary'
import {
  formatAge,
  formatAverage,
  formatMinutes,
  isStale,
  severityFor,
  SEVERITY_SPECS,
} from '../lib/dashboard'
import { useRefreshInterval } from '../hooks/useRefreshInterval'
import { useReportSheet } from '../contexts/ReportSheetContext'

interface AirportDetailProps {
  // Airport code (from the URL param). When arriving via the dashboard drill,
  // pass the full summary row so the staleness badge uses latestReportedAt.
  code: string
  summary?: AirportSummary
  onBack: () => void
}

// Per-airport drill (TIR-317): Avg / Median / P90 strip plus busiest-hours and
// day-of-week CSS bar charts. Bars are divs, not a chart lib; color is never
// the sole signal (values are printed next to every bar).
export function AirportDetail({ code, summary, onBack }: AirportDetailProps) {
  const { openReportSheet } = useReportSheet()
  const [stats, setStats] = useState<AirportStats | null>(null)
  const [checkpoints, setCheckpoints] = useState<AirportCheckpointView[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    setStats(null)
    setCheckpoints(null)
    getAirportWaitStats(code)
      .then((s) => setStats(s))
      .catch(() => setError(true))
    // Checkpoint list is auxiliary navigation (links into /checkpoint/:id,
    // the per-checkpoint drill/report surface). Failure hides the section
    // instead of blocking the stats drill - same no-fabrication rule as the
    // forecast chips.
    getAirportCheckpoints(code)
      .then((c) => setCheckpoints(c))
      .catch(() => setCheckpoints(null))
  }, [code])

  useEffect(() => {
    void load()
  }, [load])

  // Pick up new crowd data every 60s, in step with the dashboard refresh.
  useRefreshInterval(() => {
    getAirportWaitStats(code)
      .then(setStats)
      .catch(() => {})
  }, 60_000)

  const airportName = summary?.airportName ?? stats?.airportName ?? code
  const latestReportedAt = summary?.latestReportedAt ?? null

  return (
    <section className="pt-8" aria-labelledby="detail-heading">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        ← All airports
      </button>
      <button
        type="button"
        onClick={() => openReportSheet(code)}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40 ml-2"
      >
        Report wait time
      </button>

      {error && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load stats for {code}.</p>
          <p className="mt-1 text-xs text-slate-500">The API may be waking up. Try again in a moment.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            Retry
          </button>
        </div>
      )}

      {!error && !stats && <p className="mt-6 text-sm text-slate-500">Loading {code} stats…</p>}

      {stats && (
        <>
          <h1 id="detail-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {code} · {airportName}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Based on {stats.sampleSize} crowd report{stats.sampleSize === 1 ? '' : 's'}{latestReportedAt ? `; latest reported ${formatAge(latestReportedAt)}` : ''}.
            {isStale(latestReportedAt) && latestReportedAt && (
              <span
                data-testid="stale-badge"
                className="ml-2 inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              >
                Stale - treat as historical
              </span>
            )}
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

      {checkpoints && checkpoints.length > 0 && (
        <section aria-labelledby="checkpoints-heading" className="mt-8">
          <h2 id="checkpoints-heading" className="text-lg font-semibold text-slate-900">
            Checkpoints
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="checkpoint-links">
            {checkpoints.map((cp) => {
              // TIR-465 display conventions (mirrors the PublicDashboard cards):
              // latest waits are crowd REPORTS, so they render as whole minutes
              // (formatMinutes, not formatAverage); the severity chip carries the
              // shared wait-color thresholds (color + text label, never color
              // alone); stale readings are de-emphasized with an age line.
              const hasData = cp.latestWaitTimeMinutes !== null
              const severity = severityFor(cp.latestWaitTimeMinutes)
              const spec = SEVERITY_SPECS[severity]
              const stale = isStale(cp.latestReportedAt)
              const age = formatAge(cp.latestReportedAt)
              return (
                <li key={cp.id}>
                  <Link
                    to={`/checkpoint/${cp.id}`}
                    aria-label={`${cp.name}: ${
                      hasData
                        ? `${spec.label}, latest wait ${formatMinutes(cp.latestWaitTimeMinutes)} reported ${age}${stale ? ' (stale)' : ''}`
                        : 'no reports yet'
                    }. Open checkpoint.`}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{cp.name}</span>
                      {hasData && (
                        <span
                          data-testid={`checkpoint-severity-${severity}`}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${spec.chipClass}`}
                        >
                          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${spec.badgeClass}`} />
                          {spec.label}
                        </span>
                      )}
                      {hasData && stale && (
                        <span
                          data-testid="checkpoint-stale-badge"
                          className="inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          Stale
                        </span>
                      )}
                    </span>
                    {cp.terminal && (
                      <span className="mt-0.5 block text-xs text-slate-500">Terminal {cp.terminal}</span>
                    )}
                    {hasData ? (
                      <span
                        data-testid={`checkpoint-latest-${cp.id}`}
                        className="mt-1 block text-xs text-slate-500"
                      >
                        Latest:{' '}
                        <span
                          className={`${
                            stale ? 'font-medium text-slate-500' : 'font-semibold text-slate-900'
                          }`}
                        >
                          {formatMinutes(cp.latestWaitTimeMinutes)}
                        </span>
                        {cp.latestReportedAt ? ` · reported ${age}` : ''}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-slate-500">No reports yet</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
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
  const AREA_PX = 128 // matches h-32
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
      <div aria-hidden="true" className="mt-3">
        <div className="flex items-end gap-1" style={{ height: `${AREA_PX}px` }}>
          {buckets.map((b) => {
            const v = b.bucket.averageMinutes
            const heightPx = v === null ? 3 : Math.max(4, Math.round((v / max) * AREA_PX))
            return (
              <div
                key={b.key}
                title={`${b.label}: ${formatAverage(v)}`}
                className={`min-w-0 flex-1 rounded-t ${v === null ? 'bg-slate-100' : 'bg-brand-500/80'}`}
                style={{ height: `${heightPx}px` }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex gap-1">
          {buckets.map((b) => {
            const v = b.bucket.averageMinutes
            return (
              <div key={b.key} className="min-w-0 flex-1 text-center">
                <p className="truncate text-[10px] text-slate-500">
                  {v === null ? '' : formatAverage(v).replace(' min', '')}
                </p>
                <p className="truncate text-[10px] text-slate-500">{b.label}</p>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}
