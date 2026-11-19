import { useCallback, useEffect, useRef, useState } from 'react'
import { submitWaitTimeReport } from '../api/waitTimes'
import { checkpointOptions } from '../data/airports'
import { canSubmitReport, effectiveCheckpointPick } from '../lib/reportCheckpoint'
import {
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  resolveCustomMinutes,
  submittedMinutes,
} from '../lib/reportMinutes'
import { extractRateLimitSeconds, formatWaitMessage } from '../lib/rateLimitFeedback'
import type { WaitLevel } from '../api/types'
import { waitLevel } from '../api/types'

interface ReportSheetProps {
  open: boolean
  airportCode: string
  checkpoint?: string
  onClose: () => void
  onReported: () => void
}

const WAIT_OPTIONS: number[] = [5, 10, 15, 20, 30, 45, 60, 90, 120]

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

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
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // The submitted value is always inside the supported range: a typed value
  // outside it is clamped, and an empty field falls back to the preset.
  const activeMinutes = submittedMinutes(customMinutes, minutes)

  // The sheet stays mounted while open/close toggles, so a pick from a
  // previous airport must never leak into this one: fall back to the first
  // option whenever the stored pick is not valid for the current airport.
  const effectivePick = effectiveCheckpointPick(pickedCheckpoint, options)
  const activeCheckpoint = checkpoint ?? effectivePick
  const canSubmit = canSubmitReport(activeCheckpoint)

  // Rate-limit feedback: a 429 gives the countdown window; the submit button
  // stays disabled while it ticks down (mirrors the monorepo design).
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    if (rateLimitUntil === null) return
    if (rateLimitUntil <= Date.now()) return
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [rateLimitUntil])

  // Focus management: trap focus inside the dialog, restore it on close.
  // Escape must work wherever focus currently sits, so the keydown handler
  // runs on the window and wraps Tab around the dialog's own focusables
  // instead of letting focus escape to the background controls.
  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    focusable?.focus?.()

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.tabIndex !== -1)
      if (focusables.length === 0) return

      const current = document.activeElement as HTMLElement | null
      const index = current ? focusables.indexOf(current) : -1
      if (index === -1) {
        e.preventDefault()
        focusables[0]?.focus()
        return
      }

      const nextIndex = e.shiftKey
        ? (index - 1 + focusables.length) % focusables.length
        : (index + 1) % focusables.length
      e.preventDefault()
      focusables[nextIndex]?.focus()
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      if (prevFocus.current) {
        prevFocus.current.focus()
        prevFocus.current = null
      }
    }
  }, [open, onClose])

  const secondsLeft =
    rateLimitUntil === null ? 0 : Math.max(0, Math.ceil((rateLimitUntil - nowTick) / 1000))
  const rateLimited = rateLimitUntil !== null && secondsLeft > 0

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const result = resolveCustomMinutes(e.target.value)
    setCustomMinutes(result.value)
    setCustomError(result.error)
    if (result.minutes !== null) setMinutes(result.minutes)
  }, [])

  if (!open) return null

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await submitWaitTimeReport({
        airport: airportCode,
        checkpoint: activeCheckpoint,
        waitMinutes: activeMinutes,
      })
      setSubmitted(true)
      onReported()
      window.setTimeout(() => {
        setSubmitted(false)
        onClose()
      }, 1200)
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
  }

  const level: WaitLevel = waitLevel(activeMinutes)

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sheet-title"
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
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
          <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
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
                  {options.length === 0 && <option value="">Loading checkpoints…</option>}
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
              <div className="mt-3 grid grid-cols-4 gap-2">
                {WAIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setMinutes(option)
                      setCustomMinutes('')
                      setCustomError(null)
                    }}
                    aria-pressed={minutes === option && customMinutes === ''}
                    className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      minutes === option && customMinutes === ''
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label htmlFor="custom-minutes" className="block text-sm font-semibold text-slate-700 mb-1">
                  Custom duration (minutes)
                </label>
                <input
                  id="custom-minutes"
                  type="number"
                  min={MIN_CUSTOM_MINUTES}
                  max={MAX_CUSTOM_MINUTES}
                  aria-invalid={customError !== null ? true : undefined}
                  aria-errormessage={customError ? 'custom-minutes-error' : undefined}
                  value={customMinutes}
                  onChange={handleCustomChange}
                  placeholder="e.g. 75"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                {customError && (
                  <p
                    id="custom-minutes-error"
                    role="alert"
                    className="mt-1 rounded-xl bg-red-50 p-2 text-xs text-red-900"
                  >
                    {customError}
                  </p>
                )}
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
