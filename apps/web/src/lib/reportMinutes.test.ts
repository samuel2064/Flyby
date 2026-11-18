import { describe, expect, it } from 'vitest'
import {
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  resolveCustomMinutes,
  submittedMinutes,
} from './reportMinutes'

describe('resolveCustomMinutes', () => {
  it('accepts a value inside the supported range unchanged', () => {
    expect(resolveCustomMinutes('75')).toEqual({ value: '75', minutes: 75, error: null })
    expect(resolveCustomMinutes('1')).toEqual({ value: '1', minutes: 1, error: null })
    expect(resolveCustomMinutes('120')).toEqual({ value: '120', minutes: 120, error: null })
  })

  it('treats an empty field as "use the preset"', () => {
    expect(resolveCustomMinutes('')).toEqual({ value: '', minutes: null, error: null })
    expect(resolveCustomMinutes('   ')).toEqual({ value: '', minutes: null, error: null })
  })

  it('clamps a value above the maximum instead of letting it through', () => {
    const result = resolveCustomMinutes('999')
    expect(result.minutes).toBe(MAX_CUSTOM_MINUTES)
    expect(result.value).toBe(String(MAX_CUSTOM_MINUTES))
    expect(result.error).toBe(`Maximum is ${MAX_CUSTOM_MINUTES} minutes.`)
  })

  it('clamps a value below the minimum instead of silently using a preset', () => {
    const result = resolveCustomMinutes('0')
    expect(result.minutes).toBe(MIN_CUSTOM_MINUTES)
    expect(result.value).toBe(String(MIN_CUSTOM_MINUTES))
    expect(result.error).toBe(`Minimum is ${MIN_CUSTOM_MINUTES} minute.`)
  })

  it('rejects a non-numeric value without inventing minutes', () => {
    const result = resolveCustomMinutes('abc')
    expect(result.minutes).toBeNull()
    expect(result.error).toBe('Enter a number of minutes.')
  })
})

describe('submittedMinutes', () => {
  it('submits the custom value when one was typed', () => {
    expect(submittedMinutes('75', 15)).toBe(75)
  })

  it('submits the preset when the custom field is empty', () => {
    expect(submittedMinutes('', 15)).toBe(15)
  })

  it('never submits an out-of-range value', () => {
    expect(submittedMinutes('999', 15)).toBe(MAX_CUSTOM_MINUTES)
    expect(submittedMinutes('0', 15)).toBe(MIN_CUSTOM_MINUTES)
  })
})
