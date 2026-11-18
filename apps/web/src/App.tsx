import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_AIRPORT, checkpointOptions, type Airport } from './data/airports'
import { API_BASE_URL } from './api/client'
import { useWaitTimes, formatRelativeTime } from './hooks/useWaitTimes'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useForecasts } from './hooks/useForecasts'
import { buildBestByCheckpoint } from './lib/forecastChip'
import { buildConsensusByCheckpoint } from './lib/crowdConsensus'
import { AirportSearch } from './components/AirportSearch'
import { CheckpointCard } from './components/CheckpointCard'
import { ReportSheet } from './components/ReportSheet'
import { InstallPrompt } from './components/InstallPrompt'
import { SkeletonCard } from './components/SkeletonCard'
import { Dashboard } from './components/Dashboard'
import { AirportDetail } from './components/AirportDetail'
import { getWaitTimesSummary } from './api/summary'
import type { AirportSummary } from './api/summary'

// Tabs (TIR-317): dashboard is the default landing view; the original
// search-and-report flow lives under its own tab, untouched.
type Tab = 'dashboard' | 'search'

// URL-based views (TIR-405 Task 7): / → dashboard, /search → search,
// /airport/:code → per-airport drill. Shareable + back/forward via history API.
type View = 'dashboard' | 'search' | 'airport'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [view, setView] = useState<View>('dashboard')
  const [summaries, setSummaries] = useState<AirportSummary[]>([])
  // Summary row once a dashboard card is drilled into; null = overview.
  const [detailAirport, setDetailAirport] = useState<AirportSummary | null>(null)
  // null = closed, {airportCode} = picker mode, {airportCode, checkpoint} = fixed checkpoint.
  const [reportTarget, setReportTarget] = useState<{ airportCode: string; checkpoint?: string } | null>(null)

  // Fetch all airport summaries once; used by both dashboard list and
  // URL-driven airport drill (TIR-405 Task 7).
  const loadSummaries = useCallback(async () => {
    try {
      const data = await getWaitTimesSummary()
      setSummaries(data.airports)
    } catch {
      // Dashboard shows its own loading/error UI.
    }
  }, [])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  // Warm the API on app boot so the first user-visible data request usually
  // hits a warm Render instance. Non-blocking: does not delay rendering.
  useEffect(() => {
    void fetch(`${API_BASE_URL}/api/health`).catch(() => {})
  }, [])

  // URL-based routing: sync view to pathname on load and on back/forward.
  useEffect(() => {
    const syncViewFromUrl = () => {
      const path = window.location.pathname
      if (path === '/search') {
        setView('search')
        setTab('search')
        setDetailAirport(null)
      } else if (path.startsWith('/airport/')) {
        const code = path.slice('/airport/'.length).toUpperCase()
        const summary = summaries.find((s) => s.airport === code)
        if (summary) {
          setView('airport')
          setDetailAirport(summary)
          setTab('dashboard')
        }
      } else {
        setView('dashboard')
        setTab('dashboard')
        setDetailAirport(null)
      }
    }

    syncViewFromUrl()

    const handlePopState = () => syncViewFromUrl()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [summaries])

  const navigateToAirport = useCallback((code: string) => {
    const url = `/airport/${code.toUpperCase()}`
    window.history.pushState({}, '', url)
    const summary = summaries.find((s) => s.airport === code.toUpperCase())
    if (summary) {
      setView('airport')
      setDetailAirport(summary)
      setTab('dashboard')
    }
  }, [summaries])

  const navigateToDashboard = useCallback(() => {
    window.history.pushState({}, '', '/')
    setView('dashboard')
    setTab('dashboard')
    setDetailAirport(null)
  }, [])

  const navigateToSearch = useCallback(() => {
    window.history.pushState({}, '', '/search')
    setView('search')
    setTab('search')
    setDetailAirport(null)
  }, [])

  const openReportSheet = useCallback((airportCode: string, checkpoint?: string) => {
    setReportTarget({ airportCode, checkpoint })
  }, [])

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
          <nav aria-label="Views" className="flex gap-1 rounded-full bg-white/10 p-1">
            {(
              [
                ['dashboard', 'Dashboard'],
                ['search', 'Search & Report'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value)
                  if (value === 'search') {
                    navigateToSearch()
                  } else {
                    navigateToDashboard()
                  }
                  setDetailAirport(null)
                }}
                className={`min-h-11 rounded-full px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/40 sm:min-h-0 sm:px-4 ${
                  tab === value ? 'bg-white text-brand-900' : 'text-white/80 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {view === 'airport' && detailAirport ? (
          <AirportDetail
            summary={detailAirport}
            onBack={navigateToDashboard}
            onReportWaitTime={() => openReportSheet(detailAirport.airport)}
          />
        ) : view === 'search' ? (
          <SearchReportView
            onSelectAirport={(code) => navigateToAirport(code)}
            onReportWaitTime={openReportSheet}
          />
        ) : (
          <Dashboard
            onSelectAirport={(summary) => navigateToAirport(summary.airport)}
            onReportWaitTime={openReportSheet}
          />
        )}

        <p className="mt-10 text-center text-xs text-slate-500">
          Flyby — crowdsourced airport security wait times
        </p>
      </main>

      <ReportSheet
        open={reportTarget !== null}
        airportCode={reportTarget?.airportCode ?? ''}
        checkpoint={reportTarget?.checkpoint}
        onClose={() => setReportTarget(null)}
        onReported={() => {
          setReportTarget(null)
          // Refresh dashboard data after a report
          void loadSummaries()
        }}
      />

      <InstallPrompt />
    </div>
  )
}

function SearchReportView({
  onSelectAirport,
  onReportWaitTime,
}: {
  onSelectAirport: (code: string) => void
  onReportWaitTime: (airportCode: string, checkpoint?: string) => void
}) {
  const [airport, setAirport] = useState<Airport>(DEFAULT_AIRPORT)
  const { waitTimes, state, waking, lastUpdated, live, refresh } = useWaitTimes(airport.code)
  const online = useOnlineStatus()
  const { forecasts, loading: forecastsLoading } = useForecasts(airport.code, lastUpdated)
  const bestByCheckpoint = useMemo(
    () => buildBestByCheckpoint(forecasts),
    [forecasts],
  )
  const consensusByCheckpoint = useMemo(
    () => buildConsensusByCheckpoint(forecasts),
    [forecasts],
  )

  const handleSelectAirport = useCallback(
    (a: Airport) => {
      setAirport(a)
      onSelectAirport(a.code)
    },
    [onSelectAirport],
  )

  return (
    <>
      <section className="pt-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Security wait times, live
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            Crowdsourced checkpoint waits at your airport, updated by travelers in real time.
          </p>
          <div className="mt-5">
            <AirportSearch
              selected={airport}
              onSelect={handleSelectAirport}
            />
          </div>
        </section>

        <section className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {airport.code} · {airport.city}
            </h2>
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-400'}`}
              />
              {live ? 'Live' : 'Polling'}
            </span>
            <p className="text-xs text-slate-500">
              Updated {formatRelativeTime(lastUpdated)}
              {lastUpdated && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={refresh}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center py-3 px-4 align-middle font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    Refresh
                  </button>
                  {' · '}
                </>
              )}
              <button
                type="button"
                data-testid="report-button"
                onClick={() => onReportWaitTime(airport.code)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center py-3 px-4 align-middle font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
            {waking && online && (
              <p className="text-xs text-slate-500">Waking up the service…</p>
            )}
            {state === 'offline' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">You are offline.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Wait for a connection, then try again.
                </p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  Try again
                </button>
              </div>
            )}
            {state === 'error' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  {online
                    ? `Could not load wait times for ${airport.code}.`
                    : 'You are offline.'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {online
                    ? 'The API may be waking up. Try again in a moment.'
                    : 'Wait for a connection, then try again.'}
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
                // Key stability: one row per checkpoint client-side
                // (latestPerCheckpoint). updatedAt used to live in the key,
                // which unmounted+remounted every card - and its history
                // chart animation - on every SSE tick.
                <CheckpointCard
                  key={waitTime.checkpoint.toLowerCase()}
                  waitTime={waitTime}
                  onReport={(checkpoint) => onReportWaitTime(airport.code, checkpoint)}
                  best={bestByCheckpoint.bestFor(waitTime.checkpoint)}
                  bestLoading={forecastsLoading}
                  consensus={consensusByCheckpoint.consensusFor(waitTime.checkpoint)}
                />
              ))}
            {state === 'ready' && waitTimes.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  No checkpoints reported at {airport.code} yet.
                </p>
                <CheckpointList airportCode={airport.code} />
                <p className="mt-1 text-xs text-slate-500">Be the first to report a wait time.</p>
                <button
                  type="button"
                  data-testid="empty-report-button"
                  onClick={() => onReportWaitTime(airport.code)}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  Report a wait time
                </button>
              </div>
            )}
          </div>
        </section>
    </>
  )
}

// Empty-state context: an airport with zero reports is the funnel start, not
// a dead end - show its real checkpoint list (shared data file, no API call)
// so a traveler can match what the sign over their queue says.
function CheckpointList({ airportCode }: { airportCode: string }) {
  const names = checkpointOptions(airportCode)
  if (names.length === 0) return null
  return (
    <ul
      data-testid="known-checkpoints"
      className="mt-3 flex flex-wrap justify-center gap-1.5"
      aria-label={`Checkpoints at ${airportCode}`}
    >
      {names.map((name) => (
        <li
          key={name}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
        >
          {name}
        </li>
      ))}
    </ul>
  )
}
