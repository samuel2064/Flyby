import { Request, Response } from "express";
import { prisma } from "./prisma";
import { computeAccuracy, computeConsensus, VISIBLE_REPORT_WHERE } from "./waitTimeUtils";
import { errorTotal } from "./metrics";

// GET /api/dashboard — aggregated accuracy metrics
export const getDashboard = async (_req: Request, res: Response) => {
  try {
    const checkpoints = await prisma.checkpoint.findMany({
      include: {
        airport: { select: { code: true, name: true } },
        waitTimes: { where: VISIBLE_REPORT_WHERE, orderBy: { reportedAt: "desc" }, take: 50 },
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    const checkpointMetrics = checkpoints.map((cp) => {
      const latest = cp.waitTimes[0];
      const accuracy = computeAccuracy(cp.waitTimes);
      const estimatedWaitTimeMinutes = computeConsensus(cp.waitTimes);
      return {
        id: cp.id,
        name: cp.name,
        code: cp.code,
        terminal: cp.terminal,
        airportCode: cp.airport.code,
        airportName: cp.airport.name,
        accuracy,
        estimatedWaitTimeMinutes,
        latestWaitTimeMinutes: latest?.minutes ?? null,
        latestReportedAt: latest?.reportedAt?.toISOString() ?? null,
        source: latest?.source ?? null,
        totalReports: cp.waitTimes.length,
      };
    });

    const totalCheckpoints = checkpointMetrics.length;
    const totalReports = checkpointMetrics.reduce((s, c) => s + c.totalReports, 0);
    const avgAccuracy = totalCheckpoints > 0
      ? Math.round(checkpointMetrics.reduce((s, c) => s + c.accuracy, 0) / totalCheckpoints)
      : 0;
    const generationSuccessRate = totalCheckpoints > 0
      ? Math.round((checkpointMetrics.filter((c) => c.accuracy >= 50).length / totalCheckpoints) * 100)
      : 0;
    const avgProcessingTime = totalCheckpoints > 0
      ? Math.round(checkpointMetrics.reduce((s, c) => s + (c.estimatedWaitTimeMinutes ?? 0), 0) / totalCheckpoints)
      : 0;

    // Accuracy over time: bucket by hour
    const now = Date.now();
    const accuracyBuckets = new Map<string, { total: number; count: number }>();
    for (const cp of checkpointMetrics) {
      const reportedAt = cp.latestReportedAt;
      if (!reportedAt) continue;
      const date = new Date(reportedAt);
      const ageHours = (now - date.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) continue;
      const key = `${date.getHours()}:00`;
      const existing = accuracyBuckets.get(key);
      if (existing) {
        existing.total += cp.accuracy;
        existing.count += 1;
      } else {
        accuracyBuckets.set(key, { total: cp.accuracy, count: 1 });
      }
    }
    const accuracyHistory = Array.from(accuracyBuckets.entries())
      .map(([hour, { total, count }]) => ({
        hour,
        accuracy: Math.round(total / count),
      }))
      .sort((a, b) => {
        const aH = isNaN(parseInt(a.hour.split(":")[0], 10)) ? 0 : parseInt(a.hour.split(":")[0], 10);
        const bH = isNaN(parseInt(b.hour.split(":")[0], 10)) ? 0 : parseInt(b.hour.split(":")[0], 10);
        return aH - bH;
      });

    res.json({
      data: {
        summary: {
          totalCheckpoints,
          totalReports,
          avgAccuracy,
          generationSuccessRate,
          avgProcessingTime,
        },
        accuracyHistory,
        checkpoints: checkpointMetrics,
      },
    });
  } catch (err) {
    console.error("getDashboard error:", err);
    errorTotal.labels("getDashboard").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};