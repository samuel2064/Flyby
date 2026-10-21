import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";
import {
  computeWaitStats,
  computeWaitTimesSummary,
  percentileOf,
  TREND_WINDOW_MS,
} from "../src/waitStats";
import { invalidateWaitStatsCaches } from "../src/waitStatsRoutes";
import { prisma as appPrisma } from "../src/prisma";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// Dedicated airport codes so no other suite's reports pollute the math.
const WS_CODE = "WST"; // wait-stats target (has reports)
const WS_EMPTY = "WSQ"; // stats target with zero reports

let wsCpId = "";

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.reportFlag.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  // Stats target airport: fresh checkpoint, known timestamps.
  const airport = await prisma.airport.create({
    data: {
      code: WS_CODE,
      name: "Wait Stats Test",
      city: "Test City",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: { create: { code: "WS1", name: "Main", terminal: "T1" } },
    },
    include: { checkpoints: true },
  });
  wsCpId = airport.checkpoints[0].id;
  await prisma.airport.create({
    data: {
      code: WS_EMPTY,
      name: "Empty Stats Test",
      city: "Test City",
      state: "TS",
      country: "US",
      timezone: "UTC",
    },
  });
  // Deterministic reports at controlled ages (recent + one ~4h old so the
  // 3h trend window has both current-window and previous-window samples).
  const now = Date.now();
  const rows = [
    { minutes: 10, msAgo: 30 * 60 * 1000 }, // current window
    { minutes: 20, msAgo: 90 * 60 * 1000 }, // current window
    { minutes: 40, msAgo: 4 * 60 * 60 * 1000 }, // previous window (3-6h)
  ];
  for (const r of rows) {
    await prisma.waitTime.create({
      data: {
        checkpointId: wsCpId,
        minutes: r.minutes,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(now - r.msAgo),
      },
    });
  }
}, 30000);

afterAll(async () => {
  await prisma.waitTime.deleteMany({ where: { checkpointId: wsCpId } });
  await prisma.checkpoint.deleteMany({ where: { airport: { code: { in: [WS_CODE, WS_EMPTY] } } } });
  await prisma.airport.deleteMany({ where: { code: { in: [WS_CODE, WS_EMPTY] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  invalidateWaitStatsCaches();
});

describe("percentileOf", () => {
  it("returns null for empty input", () => {
    expect(percentileOf([], 50)).toBeNull();
    expect(percentileOf([], 90)).toBeNull();
  });

  it("picks the nearest-rank element", () => {
    expect(percentileOf([10, 20, 30, 40], 50)).toBe(20);
    expect(percentileOf([10, 20, 30, 40], 90)).toBe(40);
    expect(percentileOf([10], 90)).toBe(10);
  });
});

describe("computeWaitStats", () => {
  it("aggregates overall stats and per-bucket values in the airport timezone", () => {
    const now = Date.now();
    const stats = computeWaitStats("UTC", [
      { minutes: 10, reportedAt: new Date(now - 30 * 60 * 1000) },
      { minutes: 20, reportedAt: new Date(now - 90 * 60 * 1000) },
      { minutes: 40, reportedAt: new Date(now - 4 * 60 * 60 * 1000) },
    ]);
    expect(stats.sampleSize).toBe(3);
    expect(stats.overall.averageMinutes).toBe(23.3);
    expect(stats.overall.p50Minutes).toBe(20);
    expect(stats.overall.p90Minutes).toBe(40);
    expect(stats.byHourOfDay).toHaveLength(24);
    expect(stats.byDayOfWeek).toHaveLength(7);
    // Bucketing invariant (stable across UTC-hour rollovers mid-test): every
    // sample must land in exactly one hour bucket + one day bucket.
    const hourCount = stats.byHourOfDay.reduce((sum, b) => sum + b.sampleSize, 0);
    const dayCount = stats.byDayOfWeek.reduce((sum, b) => sum + b.sampleSize, 0);
    expect(hourCount).toBe(3);
    expect(dayCount).toBe(3);
  });

  it("returns nulls (not fabricated zeros) where buckets have no samples", () => {
    const stats = computeWaitStats("UTC", []);
    expect(stats.sampleSize).toBe(0);
    expect(stats.overall.averageMinutes).toBeNull();
    expect(stats.byHourOfDay[3].sampleSize).toBe(0);
    expect(stats.byDayOfWeek[5].averageMinutes).toBeNull();
  });

  it("skips reports with unparsable timestamps rather than crashing", () => {
    const stats = computeWaitStats("UTC", [
      { minutes: 15, reportedAt: "not-a-date" },
      { minutes: 25, reportedAt: new Date() },
    ]);
    expect(stats.sampleSize).toBe(1);
  });
});

describe("computeWaitTimesSummary", () => {
  const airports = [
    { code: "AAA", name: "Airstrip A", timezone: "UTC" },
    { code: "BBB", name: "Airstrip B", timezone: "UTC" },
  ];

  it("classifies trend direction with the 3h-vs-3h windows", () => {
    const now = Date.now();
    const trend = computeWaitTimesSummary(
      now,
      airports,
      new Map([
        [
          "AAA",
          [
            { minutes: 40, reportedAt: new Date(now - 30 * 60 * 1000) },
            { minutes: 10, reportedAt: new Date(now - TREND_WINDOW_MS - 30 * 60 * 1000) },
          ],
        ],
        ["BBB", []],
      ]),
    );
    const a = trend.airports.find((x) => x.airport === "AAA")!;
    expect(a.sampleSize).toBe(2);
    expect(a.latestWaitMinutes).toBe(40);
    expect(a.latestReportedAt).not.toBeNull();
    expect(a.trend.direction).toBe("up"); // 40 now vs 10 before; +30 >= threshold
    expect(a.trend.currentSampleSize).toBe(1);
    expect(a.trend.previousSampleSize).toBe(1);
    expect(a.trend.windowHours).toBe(3);

    const b = trend.airports.find((x) => x.airport === "BBB")!;
    expect(b.latestWaitMinutes).toBeNull();
    expect(b.trend.direction).toBeNull();
    expect(trend.airportCount).toBe(2);
    expect(trend.airportsWithData).toBe(1);
  });

  it("returns null trend when either window has no reports", () => {
    const now = Date.now();
    const only = computeWaitTimesSummary(
      now,
      airports,
      new Map([["AAA", [{ minutes: 7, reportedAt: new Date(now - 10 * 60 * 1000) }]]]),
    );
    expect(only.airports[0].trend.direction).toBeNull();
  });
});

describe("GET /api/airports/:code/wait-stats (route)", () => {
  it("404s unknown airports (no fabricated stats)", async () => {
    const res = await request(app).get("/api/airports/QQQ/wait-stats");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Airport not found" });
  });

  it("400s malformed airport codes", async () => {
    const res = await request(app).get("/api/airports/QQ/wait-stats");
    expect(res.status).toBe(400);
  });

  it("returns deterministic aggregates for a seeded airport", async () => {
    const res = await request(app).get(`/api/airports/${WS_CODE}/wait-stats`);
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.airport).toBe(WS_CODE);
    expect(body.sampleSize).toBe(3);
    expect(body.overall.averageMinutes).toBe(23.3);
    expect(body.overall.p50Minutes).toBe(20);
    expect(body.overall.p90Minutes).toBe(40);
    expect(body.byHourOfDay).toHaveLength(24);
    expect(body.byDayOfWeek).toHaveLength(7);
    expect(typeof body.generatedAt).toBe("string");
    expect(body.cacheTtlSeconds).toBe(300);
  });

  it("returns an empty bucketed shape (never fabricated) for a no-report airport", async () => {
    const res = await request(app).get(`/api/airports/${WS_EMPTY}/wait-stats`);
    expect(res.status).toBe(200);
    expect(res.body.sampleSize).toBe(0);
    expect(res.body.overall.averageMinutes).toBeNull();
  });

  it("excludes reports hidden by the flag threshold from stats", async () => {
    const res1 = await request(app).get(`/api/airports/${WS_CODE}/wait-stats`);
    expect(res1.body.sampleSize).toBe(3);

    // Flag the oldest (4h/40min) report three times with three sessions to cross the threshold.
    const target = await prisma.waitTime.findFirst({
      where: { checkpointId: wsCpId, minutes: 40 },
    });
    for (const session of ["ws-s-1", "ws-s-2", "ws-s-3"]) {
      const flag = await request(app)
        .post(`/api/reports/${target!.id}/flag`)
        .set("X-Session-Id", session)
        .send({ reason: "inaccurate" });
      expect(flag.status).toBe(201);
    }

    const res2 = await request(app).get(`/api/airports/${WS_CODE}/wait-stats`);
    expect(res2.body.sampleSize).toBe(2, "flag-hidden report must leave the math immediately");
    expect(res2.body.overall.averageMinutes).toBe(15); // (10+20)/2 after cache invalidation
  });
});

describe("GET /api/wait-times/summary (route)", () => {
  it("returns per-airport summaries incl. airports with no data", async () => {
    const res = await request(app).get("/api/wait-times/summary");
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.airportCount).toBeGreaterThanOrEqual(52); // seed airports + our two
    expect(body.airportsWithData).toBeGreaterThanOrEqual(1);
    expect(typeof body.generatedAt).toBe("string");
    const wst = body.airports.find((a: { airport: string }) => a.airport === WS_CODE);
    expect(wst).toBeDefined();
    expect(wst.sampleSize).toBeGreaterThanOrEqual(1);
    expect(wst.latestWaitMinutes).not.toBeNull();
    expect(wst.trend.windowHours).toBe(3);

    const qEmpty = body.airports.find((a: { airport: string }) => a.airport === WS_EMPTY);
    expect(qEmpty).toBeDefined();
    expect(qEmpty.sampleSize).toBe(0);
    expect(qEmpty.latestWaitMinutes).toBeNull();
    expect(qEmpty.trend.direction).toBeNull();
  });

  it("serves repeat calls from cache with the same generatedAt", async () => {
    const first = await request(app).get("/api/wait-times/summary");
    const second = await request(app).get("/api/wait-times/summary");
    expect(second.status).toBe(200);
    expect(second.body.generatedAt).toBe(first.body.generatedAt);
  });
});

describe("wait-stats routes - DB failure arms (coverage closeout)", () => {
  beforeEach(() => {
    invalidateWaitStatsCaches();
  });

  it("per-airport wait-stats returns 500 when the airport lookup fails", async () => {
    const spy = vi.spyOn(appPrisma.airport, "findUnique").mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app).get("/api/airports/WST/wait-stats");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Database unavailable" });
      expect(spy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("summary returns 500 when the airports query fails", async () => {
    const spy = vi.spyOn(appPrisma.airport, "findMany").mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app).get("/api/wait-times/summary");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Database unavailable" });
      expect(spy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
