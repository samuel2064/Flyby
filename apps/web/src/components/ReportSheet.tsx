import { useState } from 'react'
import { submitWaitTimeReport } from '../api/waitTimes'
import type { WaitLevel } from '../api/types'
import { waitLevel } from '../api/types'

interface ReportSheetProps {
  open: boolean
  airportCode: string
  checkpoint: string
  onClose: () => void
  onReported: () => void
}

const WAIT_OPTIONS: number[] = [5, 10, 15, 20, 30, 45, 60]

export function ReportSheet({
  open,
  airportCode,
  checkpoint,
  onClose,
  onReported,
}: ReportSheetProps) {
  const [minutes, setMinutes] = useState<number>(15)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await submitWaitTimeReport({
        airport: airportCode,
        checkpoint,
        waitMinutes: minutes,
      })
      setSubmitted(true)
      onReported()
      window.setTimeout(() => {
        setSubmitted(false)
        onClose()
      }, 1200)
    } catch {
      setError('Could not submit your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const level: WaitLevel = waitLevel(minutes)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sheet-title"
      className="fixed inset-0 z-30 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div className="relative w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between">
          <div>
            <h2 id="report-sheet-title" className="text-lg font-semibold text-slate-900">
              Report wait time
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {airportCode} · {checkpoint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-12 w-12 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            Thanks! Your report is live.
          </p>
        ) : (
          <>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-700">
                How long is the line right now?
              </legend>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {WAIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMinutes(option)}
                    aria-pressed={minutes === option}
                    className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      minutes === option
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {option === 60 ? '60+' : option}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="mt-3 text-xs text-slate-500">
              Estimated: <span className="font-semibold text-slate-700">{level} traffic</span>
            </p>
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 text-base font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
