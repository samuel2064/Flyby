import { useCallback, useEffect, useMemo, useState } from 'react'
import { getWaitTimesSummary } from '../api/summary'
import type { AirportSummary } from '../api/summary'
import {
  filterAirports,
  formatMinutes,
  severityFor,
  sortBySeverity,
  SEVERITY_SPECS,
} from '../lib/dashboard'

const AUTO_REFRESH_MS = 60_000

type FetchState = 'loading' | 'ready' | 'error'

interface DashboardProps {
  onSelectAirport: (code: string) => void
}

// Landing dashboard (TIR-317): severity-bucketed overview of every tracked
// airport, longest waits first, 60s auto-refresh. Data comes from the live
// aggregate endpoint; no row ever exposes a reporter identity (TIR-309).
export function Dashboard({ onSelectAirport }: DashboardProps) {
  const [airports, setAirports] = useState<AirportSummary[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const [query, setQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getWaitTimesSummary()
      setAirports(data.airports)
      setLastUpdated(new Date())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  const visible = useMemo(
    () => filterAirports(sortBySeverity(airports), query),
    [airports, query],
  )

  return (
    <section className="pt-8" aria-labelledby="dashboard-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1
            id="dashboard-heading"
            className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            Wait-time dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            Latest crowdsourced security wait at every tracked airport, longest lines first.
          </p>
        </div>
        <p aria-live="polite" className="text-xs text-slate-500">
          {state === 'ready' && lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · refreshes every 60s`
            : state === 'loading'
              ? 'Loading…'
              : ''}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="dashboard-filter" className="sr-only">
          Filter airports by code or name
        </label>
        <input
          id="dashboard-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter airports (e.g. JFK or Denver)…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {state === 'loading' && (
        <p className="mt-6 text-sm text-slate-500">Loading airport wait times…</p>
      )}
      {state === 'error' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load the dashboard.</p>
          <p className="mt-1 text-xs text-slate-500">The API may be waking up. Try again in a moment.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="dashboard-list">
          {visible.map((a) => {
            const severity = severityFor(a.latestWaitMinutes)
            const spec = SEVERITY_SPECS[severity]
            return (
              <li key={a.airport}>
                <button
                  type="button"
                  onClick={() => onSelectAirport(a.airport)}
                  aria-label={`${a.airportName}: ${spec.label}, latest wait ${formatMinutes(a.latestWaitMinutes)}, ${a.sampleSize} reports. View details.`}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-500/50 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{a.airport}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${spec.chipClass}`}
                      >
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${spec.badgeClass}`} />
                        {spec.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{a.airportName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-slate-900">{formatMinutes(a.latestWaitMinutes)}</p>
                    <p className="text-xs text-slate-500">
                      {a.sampleSize} report{a.sampleSize === 1 ? '' : 's'}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
          {visible.length === 0 && (
            <li className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 sm:col-span-2">
              No airports match “{query.trim()}”.
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
