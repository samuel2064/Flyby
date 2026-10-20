// Wait-time aggregation for the dashboard surface (TIR-336).
//
// Pure core, DB-free: reports are { minutes, reportedAt } rows; everything
// else (hour/day of-week bucketing in the airport's local timezone, overall
// stats, percentiles, 3h trend windows, cross-airport summary) is derived
// here so it can be unit-tested without a database. Buckets with no reports
// return null stats instead of fabricated zeros - same no-fabrication rule
// as the forecast surface.

const MS_PER_HOUR = 60 * 60 * 1000;

export const TREND_WINDOW_MS = 3 * MS_PER_HOUR;
export const TREND_THRESHOLD_MINUTES = 5;

export interface WaitReportInput {
  minutes: number;
  reportedAt: Date | string;
}

export interface BucketStats {
  averageMinutes: number | null;
  p50Minutes: number | null;
  p90Minutes: number | null;
  sampleSize: number;
}

export interface WaitStatsResult {
  timezone: string;
  sampleSize: number;
  overall: BucketStats;
  byHourOfDay: Array<{ hour: number } & BucketStats>;
  byDayOfWeek: Array<{ day: number } & BucketStats>;
}

export interface TrendSummary {
  direction: "up" | "down" | "flat" | null;
  currentAverageMinutes: number | null;
  previousAverageMinutes: number | null;
  currentSampleSize: number;
  previousSampleSize: number;
  windowHours: number;
}

export interface AirportSummary {
  airport: string;
  airportName: string;
  timezone: string;
  latestWaitMinutes: number | null;
  latestReportedAt: string | null;
  sampleSize: number;
  trend: TrendSummary;
}

export interface WaitTimesSummary {
  airportCount: number;
  airportsWithData: number;
  airports: AirportSummary[];
}

// Nearest-rank percentile over a sorted array; null for empty input.
export function percentileOf(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((q / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))];
}

export function bucketStats(minutes: number[]): BucketStats {
  if (minutes.length === 0) {
    return { averageMinutes: null, p50Minutes: null, p90Minutes: null, sampleSize: 0 };
  }
  const sorted = [...minutes].sort((a, b) => a - b);
  const average = Math.round((sorted.reduce((sum, m) => sum + m, 0) / sorted.length) * 10) / 10;
  return {
    averageMinutes: average,
    p50Minutes: percentileOf(sorted, 50),
    p90Minutes: percentileOf(sorted, 90),
    sampleSize: minutes.length,
  };
}

function hourFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hour: "numeric", hour12: false });
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false });
  }
}

function weekdayFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", weekday: "short" });
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" });
  }
}

function localHourOf(date: Date, fmt: Intl.DateTimeFormat): number {
  const parts = fmt.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  let hour = hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();
  if (hour === 24) hour = 0;
  if (isNaN(hour) || hour < 0 || hour > 23) hour = date.getUTCHours();
  return hour;
}

const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Per-airport aggregation. Every bucket is present in the output (24 hours,
// 7 days) with null stats where no samples landed, so dashboards can render
// the full grid without special-casing gaps.
export function computeWaitStats(timezone: string, reports: WaitReportInput[]): WaitStatsResult {
  const tz = timezone || "UTC";
  const hourFmt = hourFormatter(tz);
  const dayFmt = weekdayFormatter(tz);
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  const byDay: number[][] = Array.from({ length: 7 }, () => []);
  const all: number[] = [];
  for (const report of reports ?? []) {
    const at = report.reportedAt instanceof Date ? report.reportedAt : new Date(report.reportedAt);
    if (!Number.isFinite(at.getTime())) continue;
    if (!Number.isFinite(report.minutes)) continue;
    all.push(report.minutes);
    byHour[localHourOf(at, hourFmt)].push(report.minutes);
    const dayIndex = DOW_INDEX[dayFmt.format(at)];
    byDay[dayIndex === undefined ? at.getUTCDay() : dayIndex].push(report.minutes);
  }
  return {
    timezone: tz,
    sampleSize: all.length,
    overall: bucketStats(all),
    byHourOfDay: byHour.map((minutes, hour) => ({ hour, ...bucketStats(minutes) })),
    byDayOfWeek: byDay.map((minutes, day) => ({ day, ...bucketStats(minutes) })),
  };
}

function windowAverage(minutes: number[]): number | null {
  if (minutes.length === 0) return null;
  return Math.round((minutes.reduce((sum, m) => sum + m, 0) / minutes.length) * 10) / 10;
}

// Cross-airport summary. `airports` is code/name/timezone per airport (all
// supported airports are included, even with zero reports - dashboards need
// the full grid). `reports` is a Map of airport code -> report rows; now is
// the reference instant.
export function computeWaitTimesSummary(
  now: Date | number,
  airports: Array<{ code: string; name: string; timezone: string | null }>,
  reports: Map<string, WaitReportInput[]>,
): WaitTimesSummary {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const rows = airports.map((airport) => {
    const samples = (reports.get(airport.code) ?? [])
      .map((r) => ({ minutes: r.minutes, at: r.reportedAt instanceof Date ? r.reportedAt : new Date(r.reportedAt) }))
      .filter((r) => Number.isFinite(r.at.getTime()) && Number.isFinite(r.minutes));
    let latest: { minutes: number; at: Date } | null = null;
    for (const r of samples) {
      if (!latest || r.at > latest.at) latest = r;
    }
    const current: number[] = [];
    const previous: number[] = [];
    for (const r of samples) {
      const age = nowMs - r.at.getTime();
      if (age >= 0 && age < TREND_WINDOW_MS) current.push(r.minutes);
      else if (age >= TREND_WINDOW_MS && age < 2 * TREND_WINDOW_MS) previous.push(r.minutes);
    }
    const currentAverageMinutes = windowAverage(current);
    const previousAverageMinutes = windowAverage(previous);
    let direction: TrendSummary["direction"] = null;
    if (currentAverageMinutes !== null && previousAverageMinutes !== null) {
      const delta = currentAverageMinutes - previousAverageMinutes;
      direction = delta >= TREND_THRESHOLD_MINUTES ? "up" : delta <= -TREND_THRESHOLD_MINUTES ? "down" : "flat";
    }
    return {
      airport: airport.code,
      airportName: airport.name,
      timezone: airport.timezone || "UTC",
      latestWaitMinutes: latest ? latest.minutes : null,
      latestReportedAt: latest ? latest.at.toISOString() : null,
      sampleSize: samples.length,
      trend: {
        direction,
        currentAverageMinutes,
        previousAverageMinutes,
        currentSampleSize: current.length,
        previousSampleSize: previous.length,
        windowHours: TREND_WINDOW_MS / MS_PER_HOUR,
      },
    };
  });
  const withData = rows.filter((a) => a.sampleSize > 0).length;
  return { airportCount: rows.length, airportsWithData: withData, airports: rows };
}
