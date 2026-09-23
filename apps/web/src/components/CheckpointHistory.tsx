import { useEffect, useRef, useState } from 'react'
import { getCheckpointHistory } from '../api/history'
import type { CheckpointHistoryPoint } from '../api/history'
import { checkpointId } from '../lib/checkpointId'
import { WaitHistoryChart } from './WaitHistoryChart'

interface CheckpointHistoryProps {
  airportCode: string
  checkpointName: string
}

type HistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; points: CheckpointHistoryPoint[]; reportCount: number }

// Collapsible per-checkpoint history (MVP feature #6). The 4-hour rolling
// average loads on first expand - an airport page with many cards never
// fires history calls until a traveler actually asks. The card list keys on
// `updatedAt`, so a fresh report remounts the card and the chart reloads
// with the new data on the next expand.
export function CheckpointHistory({ airportCode, checkpointName }: CheckpointHistoryProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<HistoryState>({ status: 'idle' })
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    setState({ status: 'loading' })
    getCheckpointHistory(checkpointId(airportCode, checkpointName))
      .then((response) => {
        const data = response?.data
        setState({
          status: 'ready',
          points: Array.isArray(data?.history) ? data.history : [],
          reportCount: data?.reportCount ?? 0,
        })
      })
      .catch(() => setState({ status: 'error' }))
  }, [open, airportCode, checkpointName])

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1 rounded-lg text-sm font-semibold text-brand-700 transition hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <svg
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? 'Hide history' : '4-hour history'}
      </button>

      {open && (
        <div className="mt-2" data-testid="checkpoint-history-panel">
          {state.status === 'loading' && (
            <p className="text-xs text-slate-500" data-testid="wait-history-loading">
              Loading history…
            </p>
          )}
          {state.status === 'error' && (
            <p className="text-xs text-slate-500" data-testid="wait-history-error">
              History is unavailable right now. Try again in a moment.
            </p>
          )}
          {state.status === 'ready' && (
            <>
              <WaitHistoryChart history={state.points} />
              <p className="mt-1 text-xs text-slate-400">
                {state.reportCount === 0
                  ? 'Averages per 30-minute bucket, from crowdsourced reports'
                  : `${state.reportCount} report${state.reportCount === 1 ? '' : 's'} in the last 4 hours · averages per 30-minute bucket`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
