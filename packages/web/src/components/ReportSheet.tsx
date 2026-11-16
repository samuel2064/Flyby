import { useEffect, useState, useRef, useCallback } from 'react'
import { submitWaitTimeReport } from '../api/waitTimes'
import { checkpointOptions } from '../data/airports'
import { canSubmitReport, effectiveCheckpointPick } from '../lib/reportCheckpoint'
import { extractRateLimitSeconds, formatWaitMessage } from '../lib/rateLimitFeedback'
import { LANE_TYPES, type LaneType } from '../lib/lane'
import type { WaitLevel } from '../api/types'
import { waitLevel } from '../api/types'

interface ReportSheetProps {
  open: boolean
  airportCode: string
  checkpoint?: string
  onClose: () => void
  onReported: () => void
}

const WAIT_OPTIONS: number[] = [5, 10, 15, 20, 30, 45, 60]

const LANE_BUTTON_LABELS: Record<LaneType, string> = {
  standard: 'Standard',
  preclear: 'TSA PreCheck',
  clear: 'CLEAR',
}

const CUSTOM_MAX_MINUTES = 180

export function ReportSheet({
  open,
  airportCode,
  checkpoint,
  onClose,
  onReported,
}: ReportSheetProps) {
  const options = checkpointOptions(airportCode)
  const [pickedCheckpoint, setPickedCheckpoint] = useState<string>('')
  const [minutes, setMinutes] = useState<number>(15)
  const [customMinutes, setCustomMinutes] = useState<string>('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [isCustom, setIsCustom] = useState(false)
  const [lane, setLane] = useState<LaneType>('standard')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const effectivePick = effectiveCheckpointPick(pickedCheckpoint, options)
  const activeCheckpoint = checkpoint ?? effectivePick
  const canSubmit = canSubmitReport(activeCheckpoint)

  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    if (rateLimitUntil === null) return
    if (rateLimitUntil <= Date.now()) return
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [rateLimitUntil])

  const secondsLeft =
    rateLimitUntil === null ? 0 : Math.max(0, Math.ceil((rateLimitUntil - nowTick) / 1000))
  const rateLimited = rateLimitUntil !== null && secondsLeft > 0

  useEffect(() => {
    if (!open) return
    setReturnFocus(document.activeElement as HTMLElement | null)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        e.preventDefault()
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        )
        const current = document.activeElement as HTMLElement | null
        const idx = focusables.indexOf(current ?? focusables[0])
        const next = focusables[(idx + 1) % focusables.length]
        next?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (returnFocus) returnFocus.focus()
    }
  }, [open, onClose, returnFocus])

  useEffect(() => {
    if (!open || !dialogRef.current) return
    dialogRef.current.focus()
  }, [open])

  const handleCustomChange = useCallback((value: string) => {
    setCustomMinutes(value)
    setCustomError(null)
    const v = parseInt(value, 10)
    if (value === '') return
    if (isNaN(v) || v < 1 || v > CUSTOM_MAX_MINUTES) {
      setCustomError(`Enter 1–${CUSTOM_MAX_MINUTES} minutes`)
      return
    }
    setMinutes(v)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setCustomError(null)
    try {
      await submitWaitTimeReport({
        airport: airportCode,
        checkpoint: activeCheckpoint,
        waitMinutes: minutes,
        ...(lane !== 'standard' ? { reportType: lane } : {}),
      })
      setSubmitted(true)
      onReported()
      window.setTimeout(() => {
        setSubmitted(false)
        onClose()
      }, 2000)
    } catch (err) {
      const seconds = extractRateLimitSeconds(err)
      if (seconds !== null) {
        setRateLimitUntil(Date.now() + seconds * 1000)
        setError(null)
      } else {
        setError('Could not submit your report. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, airportCode, activeCheckpoint, minutes, lane, onReported, onClose])

  const level: WaitLevel = waitLevel(minutes)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sheet-title"
      ref={dialogRef}
      className="fixed inset-0 z-30 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div
        tabIndex={-1}
        className="relative w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between">
          <div>
            <h2 id="report-sheet-title" className="text-lg font-semibold text-slate-900">
              Report wait time
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {airportCode} · {activeCheckpoint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-12 w-12 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
          <p
            id="report-sheet-confirmation"
            role="status"
            aria-live="polite"
            className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"
          >
            Thanks! Your report is live.
          </p>
        ) : (
          <>
            {!checkpoint && (
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">Checkpoint</span>
                <select
                  data-testid="checkpoint-picker"
                  value={effectivePick}
                  onChange={(e) => setPickedCheckpoint(e.target.value)}
                  disabled={options.length === 0}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:bg-slate-100"
                >
                  {options.length === 0 && <option value="">No checkpoints configured</option>}
                  {options.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-700">
                How long is the line right now?
              </legend>
              <div
                role="radiogroup"
                aria-label="Wait time"
                className="mt-3 grid grid-cols-4 gap-2"
              >
                {WAIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={minutes === option && !isCustom}
                    onClick={() => {
                      setMinutes(option)
                      setIsCustom(false)
                      setCustomError(null)
                    }}
                    className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      minutes === option && !isCustom
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {option === 60 ? '60' : option}
                  </button>
                ))}
                <button
                  key="custom"
                  type="button"
                  role="radio"
                  aria-checked={isCustom}
                  onClick={() => setIsCustom(true)}
                  className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                    isCustom ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Custom
                </button>
              </div>
              {isCustom && (
                <div className="mt-3">
                  <label htmlFor="custom-minutes" className="sr-only">
                    Custom wait time in minutes
                  </label>
                  <input
                    id="custom-minutes"
                    type="number"
                    min="1"
                    max={CUSTOM_MAX_MINUTES}
                    aria-label="Custom wait time in minutes"
                    aria-invalid={customError !== null ? true : undefined}
                    aria-errormessage={customError ? 'custom-minutes-error' : undefined}
                    value={customMinutes}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                  {customError && (
                    <p id="custom-minutes-error" role="alert" className="mt-1 rounded-xl bg-red-50 p-2 text-xs text-red-900">
                      {customError}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-slate-700">Which lane are you in?</legend>
              <div
                role="radiogroup"
                aria-label="Security lane"
                className="mt-3 grid grid-cols-3 gap-2"
                data-testid="lane-type-picker"
              >
                {LANE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={lane === type}
                    onClick={() => setLane(type)}
                    data-testid={`lane-${type}`}
                    className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      lane === type
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {LANE_BUTTON_LABELS[type]}
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
            {rateLimited && (
              <p
                role="status"
                data-testid="rate-limit-countdown"
                className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900"
              >
                {formatWaitMessage(secondsLeft)}
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit || rateLimited}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 text-base font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              {submitting
                ? 'Submitting…'
                : rateLimited
                  ? formatWaitMessage(secondsLeft)
                  : canSubmit
                    ? 'Submit report'
                    : 'Pick a checkpoint first'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
