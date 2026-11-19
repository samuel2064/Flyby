import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESET_MINUTES,
  freshReportSheetFormState,
  shouldResetReportSheetForm,
} from './reportSheetForm'

describe('freshReportSheetFormState', () => {
  it('starts from the default preset with an empty custom field', () => {
    const state = freshReportSheetFormState()
    expect(state.minutes).toBe(DEFAULT_PRESET_MINUTES)
    expect(state.customMinutes).toBe('')
    expect(state.pickedCheckpoint).toBe('')
  })

  it('carries no leftover error, submission or rate-limit state', () => {
    const state = freshReportSheetFormState()
    expect(state.customError).toBeNull()
    expect(state.error).toBeNull()
    expect(state.submitted).toBe(false)
    expect(state.submitting).toBe(false)
    expect(state.rateLimitUntil).toBeNull()
  })

  it('returns a new object every time so callers cannot share state', () => {
    expect(freshReportSheetFormState()).not.toBe(freshReportSheetFormState())
  })
})

describe('shouldResetReportSheetForm', () => {
  it('resets when the sheet opens from closed', () => {
    expect(shouldResetReportSheetForm(true, false)).toBe(true)
  })

  it('does not reset while the sheet stays open across re-renders', () => {
    expect(shouldResetReportSheetForm(true, true)).toBe(false)
  })

  it('does not reset while the sheet stays closed', () => {
    expect(shouldResetReportSheetForm(false, false)).toBe(false)
    expect(shouldResetReportSheetForm(false, true)).toBe(false)
  })
})
