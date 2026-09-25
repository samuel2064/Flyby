import { formatRelativeTime } from '../hooks/useWaitTimes'
import type { WaitTime } from '../api/types'
import type { ForecastBestHour } from '../lib/forecastChip'
import type { CrowdConsensus } from '../lib/crowdConsensus'
import { formatConsensus } from '../lib/crowdConsensus'
import { WaitBadge } from './WaitBadge'
import { BestTimeChip } from './BestTimeChip'
import { CheckpointHistory } from './CheckpointHistory'

interface CheckpointCardProps {
  waitTime: WaitTime
  onReport: (checkpoint: string) => void
  best?: ForecastBestHour
  bestLoading: boolean
  // Fresh crowd signal from the batched forecast payload; shown only when the
  // API computed one - never fabricated defaults.
  consensus?: CrowdConsensus
}

export function CheckpointCard({ waitTime, onReport, best, bestLoading, consensus }: CheckpointCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{waitTime.checkpoint}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Updated {formatRelativeTime(waitTime.updatedAt)}
          </p>
          {consensus && (
            <p
              className="mt-0.5 text-xs text-slate-500"
              data-testid="crowd-consensus-line"
            >
              {formatConsensus(consensus)}
            </p>
          )}
          <BestTimeChip best={best} loading={bestLoading} />
        </div>
        <WaitBadge waitMinutes={waitTime.waitMinutes} />
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => onReport(waitTime.checkpoint)}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          Report wait time
        </button>
      </div>
      <CheckpointHistory airportCode={waitTime.airport} checkpointName={waitTime.checkpoint} />
    </article>
  )
}
