// Range rules for the report sheet's custom wait-time input.
//
// The input is a free-typed number field, so the browser alone cannot be
// trusted to keep the submitted value inside the supported range: a traveler
// can type 999, or 0, and both would reach the API. These helpers keep the
// rule in one pure place so the component, the tests and the live smoke all
// agree on what "valid custom minutes" means.
export const MIN_CUSTOM_MINUTES = 1
export const MAX_CUSTOM_MINUTES = 120

export interface CustomMinutesResult {
  // The value the field should display after the change was applied.
  value: string
  // The minutes to submit, or null when the field is empty (preset wins).
  minutes: number | null
  // A user-facing message when the typed value is not usable.
  error: string | null
}

// Normalise a raw input value. Out-of-range numbers are clamped to the
// supported range (999 -> 120, 0 -> 1) so the submitted value is always
// inside it, and an unusable value is reported through `error` instead of
// silently falling back to a preset.
export function resolveCustomMinutes(raw: string): CustomMinutesResult {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { value: '', minutes: null, error: null }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { value: trimmed, minutes: null, error: 'Enter a number of minutes.' }
  }

  if (parsed < MIN_CUSTOM_MINUTES) {
    return {
      value: String(MIN_CUSTOM_MINUTES),
      minutes: MIN_CUSTOM_MINUTES,
      error: `Minimum is ${MIN_CUSTOM_MINUTES} minute.`,
    }
  }

  if (parsed > MAX_CUSTOM_MINUTES) {
    return {
      value: String(MAX_CUSTOM_MINUTES),
      minutes: MAX_CUSTOM_MINUTES,
      error: `Maximum is ${MAX_CUSTOM_MINUTES} minutes.`,
    }
  }

  return { value: String(parsed), minutes: parsed, error: null }
}

// The value that would actually be submitted for the sheet: the custom entry
// when it is usable, otherwise the selected preset.
export function submittedMinutes(customMinutes: string, presetMinutes: number): number {
  const resolved = resolveCustomMinutes(customMinutes)
  if (resolved.minutes !== null) return resolved.minutes
  return presetMinutes
}
