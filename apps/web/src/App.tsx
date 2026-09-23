import { useMemo, useState } from 'react'
import { DEFAULT_AIRPORT, type Airport } from './data/airports'
import { useWaitTimes, formatRelativeTime } from './hooks/useWaitTimes'
import { useForecasts } from './hooks/useForecasts'
import { buildBestByCheckpoint } from './lib/forecastChip'
import { AirportSearch } from './components/AirportSearch'
import { CheckpointCard } from './components/CheckpointCard'
import { ReportSheet } from './components/ReportSheet'
import { SkeletonCard } from './components/SkeletonCard'

export default function App() {
  const [airport, setAirport] = useState<Airport>(DEFAULT_AIRPORT)
  // undefined = closed, null = picker mode (traveler picks the checkpoint),
  // string = fixed checkpoint from a card.
  const [reportTarget, setReportTarget] = useState<string | null | undefined>(undefined)
  const { waitTimes, state, lastUpdated, live, refresh } = useWaitTimes(airport.code)
  const { forecasts, loading: forecastsLoading } = useForecasts(airport.code, lastUpdated)
  const bestByCheckpoint = useMemo(
    () => buildBestByCheckpoint(forecasts),
    [forecasts],
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-2.5V6.5a1.5 1.5 0 0 0-3 0v5L2 14v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />
            </svg>
            <span className="text-lg font-bold tracking-tight">Flyby</span>
          </div>
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-400'}`}
            />
            {live ? 'Live' : 'Polling'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <section className="pt-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Security wait times, live
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            Crowdsourced checkpoint waits at your airport, updated by travelers in real time.
          </p>
          <div className="mt-5">
            <AirportSearch selected={airport} onSelect={setAirport} />
          </div>
        </section>

        <section className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {airport.code} · {airport.city}
            </h2>
            <p className="text-xs text-slate-500">
              Updated {formatRelativeTime(lastUpdated)}
              {lastUpdated && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={refresh}
                    className="font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    Refresh
                  </button>
                  {' · '}
                </>
              )}
              <button
                type="button"
                data-testid="report-button"
                onClick={() => setReportTarget(null)}
                className="font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                Report a wait time
              </button>
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {state === 'loading' && (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
            {state === 'error' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  Could not load wait times for {airport.code}.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  The API may be waking up. Try again in a moment.
                </p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  Retry
                </button>
              </div>
            )}
            {state === 'ready' &&
              waitTimes.map((waitTime) => (
                <CheckpointCard
                  key={`${waitTime.checkpoint}-${waitTime.updatedAt}`}
                  waitTime={waitTime}
                  onReport={setReportTarget}
                  best={bestByCheckpoint.bestFor(waitTime.checkpoint)}
                  bestLoading={forecastsLoading}
                />
              ))}
            {state === 'ready' && waitTimes.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  No checkpoints reported at {airport.code} yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">Be the first to report a wait time.</p>
                <button
                  type="button"
                  data-testid="empty-report-button"
                  onClick={() => setReportTarget(null)}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  Report a wait time
                </button>
              </div>
            )}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-slate-400">
          Flyby · crowdsourced airport security wait times
        </p>
      </main>

      <ReportSheet
        open={reportTarget !== undefined}
        airportCode={airport.code}
        checkpoint={reportTarget ?? undefined}
        onClose={() => setReportTarget(undefined)}
        onReported={refresh}
      />
    </div>
  )
}
