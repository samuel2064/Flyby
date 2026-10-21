// WCAG 2.1 contrast math, used to verify the TIR-308 footer fix and any
// future text/background pairing. Slate palette values live in
// tailwind.config; this module only does pure color math so tests stay
// independent of the build.
export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Invalid hex color: ${hex}`)
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function contrastRatio(colorA: string, colorB: string): number {
  const la = relativeLuminance(hexToRgb(colorA))
  const lb = relativeLuminance(hexToRgb(colorB))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
