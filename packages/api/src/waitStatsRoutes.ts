import { Request, Response } from "express";
import { prisma } from "./prisma";
import { VISIBLE_REPORT_WHERE } from "./waitTimeUtils";
import { errorTotal } from "./metrics";
import { computeWaitStats, computeWaitTimesSummary } from "./waitStats";

// Dashboard data endpoints (TIR-336):
//   GET /api/airports/:code/wait-stats - per-airport aggregate (overall avg +
//     p50/p90, hour-of-day and day-of-week buckets in airport-local time)
//   GET /api/wait-times/summary - cross-airport overview (latest report per
//     airport + 3h-vs-previous-3h trend direction)
// Both are read-only aggregates, compute-on-read with a 5-minute in-memory
// cache. Aggregate data only - no userIds, no raw report rows. Hidden/flagged
// reports are excluded via VISIBLE_REPORT_WHERE; flag-driven exclusions call
// invalidateWaitStatsCaches() so moderation shows up immediately instead of
// after TTL.

export const WAIT_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
export const WAIT_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

const waitStatsCache = new Map<string, { expiresAt: number; payload: unknown }>();
let waitSummaryCache: { expiresAt: number; payload: unknown } | null = null;

export function invalidateWaitStatsCaches(): void {
  waitStatsCache.clear();
  waitSummaryCache = null;
}

export const getAirportWaitStats = async (req: Request, res: Response) => {
  const code = String((req.params.code as string) || (req.params.iataCode as string) || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    res.status(400).json({ error: "Invalid airport code. Must be a 3-letter IATA code." });
    return;
  }
  try {
    const airport = await prisma.airport.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, timezone: true },
    });
    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }

    const now = Date.now();
    const cached = waitStatsCache.get(airport.id);
    if (cached && cached.expiresAt > now) {
      res.json(cached.payload);
      return;
    }

    let reports: Array<{ minutes: number; reportedAt: Date }> = [];
    const rows = await prisma.waitTime.findMany({
      where: { checkpoint: { airportId: airport.id }, ...VISIBLE_REPORT_WHERE },
      select: { minutes: true, reportedAt: true },
    });
    reports = rows.map((r) => ({ minutes: r.minutes, reportedAt: r.reportedAt }));

    const payload = {
      airport: airport.code,
      airportName: airport.name,
      ...computeWaitStats(airport.timezone, reports),
      generatedAt: new Date(now).toISOString(),
      cacheTtlSeconds: Math.round(WAIT_STATS_CACHE_TTL_MS / 1000),
    };
    waitStatsCache.set(airport.id, { expiresAt: now + WAIT_STATS_CACHE_TTL_MS, payload });
    res.json(payload);
  } catch (err) {
    console.error("getAirportWaitStats error:", err);
    errorTotal.labels("getAirportWaitStats").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const getWaitTimesSummary = async (_req: Request, res: Response) => {
  const now = Date.now();
  if (waitSummaryCache && waitSummaryCache.expiresAt > now) {
    res.json(waitSummaryCache.payload);
    return;
  }
  try {
    const airports = await prisma.airport.findMany({
      select: { id: true, code: true, name: true, timezone: true },
      orderBy: { code: "asc" },
    });
    const rows = await prisma.waitTime.findMany({
      where: VISIBLE_REPORT_WHERE,
      select: {
        minutes: true,
        reportedAt: true,
        checkpoint: { select: { airport: { select: { code: true } } } },
      },
    });
    const reports = new Map<string, Array<{ minutes: number; reportedAt: Date }>>();
    for (const r of rows) {
      const list = reports.get(r.checkpoint.airport.code) ?? [];
      list.push({ minutes: r.minutes, reportedAt: r.reportedAt });
      reports.set(r.checkpoint.airport.code, list);
    }

    const payload = {
      ...computeWaitTimesSummary(now, airports, reports),
      generatedAt: new Date(now).toISOString(),
      cacheTtlSeconds: Math.round(WAIT_SUMMARY_CACHE_TTL_MS / 1000),
    };
    waitSummaryCache = { expiresAt: now + WAIT_SUMMARY_CACHE_TTL_MS, payload };
    res.json(payload);
  } catch (err) {
    console.error("getWaitTimesSummary error:", err);
    errorTotal.labels("getWaitTimesSummary").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};
