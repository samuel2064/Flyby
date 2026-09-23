import { describe, expect, it } from 'vitest'
import { chartGeometry, niceMax, CHART_HEIGHT, CHART_PAD, CHART_WIDTH } from './chartPoints'

function points(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(Date.now() - (count - 1 - i) * 30 * 60 * 1000).toISOString(),
    minutes: 10 + i * 5,
  }))
}

describe('niceMax (y-axis scale)', () => {
  it('never scales below 20 (tiny values still get a readable axis)', () => {
    expect(niceMax(0)).toBe(20)
    expect(niceMax(5)).toBe(20)
  })

  it('rounds up to the next multiple of 20', () => {
    expect(niceMax(21)).toBe(40)
    expect(niceMax(30)).toBe(40)
    expect(niceMax(40)).toBe(40)
  })

  it('keeps exact multiples unchanged', () => {
    expect(niceMax(100)).toBe(100)
  })
})

describe('chartGeometry (SVG point mapping)', () => {
  it('returns empty geometry (and no polyline) for an empty history', () => {
    const geo = chartGeometry([])
    expect(geo.points).toEqual([])
    expect(geo.polyline).toBeNull()
    expect(geo.gridlines).toEqual([0, 5, 10, 15, 20])
  })

  it('centers a single point and skips the polyline', () => {
    const geo = chartGeometry(points(1))
    expect(geo.points).toHaveLength(1)
    expect(geo.polyline).toBeNull()
    const plotMidX = CHART_PAD.left + (CHART_WIDTH - CHART_PAD.left - CHART_PAD.right) / 2
    expect(geo.points[0].x).toBeCloseTo(plotMidX)
  })

  it('spreads two points across the full plot width', () => {
    const geo = chartGeometry(points(2))
    expect(geo.points[0].x).toBeCloseTo(CHART_PAD.left)
    expect(geo.points[1].x).toBeCloseTo(CHART_WIDTH - CHART_PAD.right)
    expect(geo.polyline).not.toBeNull()
    expect(geo.polyline!.split(' ')).toHaveLength(2)
  })

  it('maps higher wait minutes to a smaller y (screen y is inverted)', () => {
    const geo = chartGeometry([
      { time: '2026-09-23T10:30:00.000Z', minutes: 10 },
      { time: '2026-09-23T11:00:00.000Z', minutes: 40 },
    ])
    expect(geo.points[1].y).toBeLessThan(geo.points[0].y)
  })

  it('places the highest value at the top of the plot area (y = pad.top)', () => {
    const geo = chartGeometry([{ time: '2026-09-23T11:00:00.000Z', minutes: 40 }])
    expect(geo.yMax).toBe(40)
    expect(geo.points[0].y).toBeCloseTo(CHART_PAD.top)
  })

  it('emits 5 gridlines spanning 0 to yMax in equal steps', () => {
    const geo = chartGeometry(points(4))
    expect(geo.gridlines).toEqual([0, geo.yMax / 4, geo.yMax / 2, (geo.yMax * 3) / 4, geo.yMax])
  })

  it('keeps every point inside the padded plot area', () => {
    const geo = chartGeometry(points(6))
    for (const p of geo.points) {
      expect(p.x).toBeGreaterThanOrEqual(CHART_PAD.left)
      expect(p.x).toBeLessThanOrEqual(CHART_WIDTH - CHART_PAD.right)
      expect(p.y).toBeGreaterThanOrEqual(CHART_PAD.top)
      expect(p.y).toBeLessThanOrEqual(CHART_HEIGHT - CHART_PAD.bottom)
    }
  })
})
