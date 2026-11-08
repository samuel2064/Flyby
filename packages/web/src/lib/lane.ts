// Lane discriminator display helpers (TIR-367).
//
// Stored vocabulary on reports is `reportType`: "standard" (default), "preclear"
// (a TSA PreCheck-style expedited lane), or "clear" (a CLEAR lane). The API and
// DB speak those values; the UI shows traveler-friendly labels and never renders
// the raw string.
export type LaneType = "standard" | "preclear" | "clear";

export const LANE_TYPES: LaneType[] = ["standard", "preclear", "clear"];

export function isLaneType(value: unknown): value is LaneType {
  return value === "standard" || value === "preclear" || value === "clear";
}

// Label for a report's lane, or null when the lane is standard/unspecified
// (standard lanes get no badge - the absence IS the standard signal).
export function laneLabel(reportType: string | null | undefined): string | null {
  if (reportType === "preclear") return "TSA PreCheck"
  if (reportType === "clear") return "CLEAR"
  return null
}

// Tailwind classes for the lane badge - distinct hue per program, both AA on
// their background, never color-only (the label text is the signal).
export function laneBadgeClass(reportType: string | null | undefined): string {
  if (reportType === "preclear") return "bg-sky-100 text-sky-900"
  if (reportType === "clear") return "bg-violet-100 text-violet-900"
  return "bg-slate-100 text-slate-600"
}
