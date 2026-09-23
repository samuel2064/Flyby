// Pure geometry for the checkpoint wait-time history chart. Kept free of
// React so the scaling math is unit-testable like the other lib modules.

export interface ChartPointInput {
  time: string
  minutes: number
  count?: number
}

export interface ChartPoint {
  x: number
  y: number
  minutes: number
  time: string
}

export interface ChartGeometry {
  points: ChartPoint[]
  yMax: number
  gridlines: number[]
  polyline: string | null
}

export const CHART_WIDTH = 600
export const CHART_HEIGHT = 220
export const CHART_PAD = { top: 16, right: 16, bottom: 28, left: 40 }

// Always a multiple of 20 so the 4 gridline steps land on multiples of 5 -
// the y-axis never renders fractional labels like 2.5.
export function niceMax(maxMinutes: number): number {
  return Math.max(20, Math.ceil(maxMinutes / 20) * 20)
}

// Map bucketed history to chart coordinates. A single point renders centered;
// two or more spread evenly across the plot area. Output order matches input.
export function chartGeometry(history: ChartPointInput[]): ChartGeometry {
  const n = history.length
  if (n === 0) return { points: [], yMax: niceMax(0), gridlines: [0, 5, 10, 15, 20], polyline: null }

  const plotW = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right
  const plotH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom
  const yMax = niceMax(Math.max(...history.map((p) => p.minutes)))

  const xAt = (i: number) => (n === 1 ? CHART_PAD.left + plotW / 2 : CHART_PAD.left + (i / (n - 1)) * plotW)
  const yAt = (m: number) => CHART_PAD.top + plotH - (m / yMax) * plotH

  const points = history.map((p, i) => ({ x: xAt(i), y: yAt(p.minutes), minutes: p.minutes, time: p.time }))
  const gridlines = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i)
  const polyline =
    n > 1 ? points.map((p) => `${p.x},${p.y}`).join(' ') : null

  return { points, yMax, gridlines, polyline }
}
