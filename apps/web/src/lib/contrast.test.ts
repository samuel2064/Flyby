import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, relativeLuminance } from './contrast'

describe('hexToRgb', () => {
  it('parses 6-digit hex with or without the # prefix', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
    expect(hexToRgb('000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#64748B')).toEqual([100, 116, 139])
  })

  it('rejects malformed colors', () => {
    expect(() => hexToRgb('nope')).toThrow(/Invalid hex color/)
    expect(() => hexToRgb('#12345')).toThrow(/Invalid hex color/)
    expect(() => hexToRgb('#1234567')).toThrow(/Invalid hex color/)
  })
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1)
  })
})

describe('contrastRatio', () => {
  it('black on white is the 21:1 maximum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#64748b', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#64748b'),
    )
  })

  it('slate-500 on white clears WCAG AA for normal text (~4.76:1, TIR-308 fix)', () => {
    const ratio = contrastRatio('#64748b', '#ffffff')
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeCloseTo(4.76, 1)
  })

  it('slate-400 on white fails AA for normal text (the original TIR-308 defect)', () => {
    expect(contrastRatio('#94a3b8', '#ffffff')).toBeLessThan(4.5)
  })

  it('slate-500 on the slate-50 page background still clears AA', () => {
    expect(contrastRatio('#64748b', '#f8fafc')).toBeGreaterThanOrEqual(4.5)
  })
})
