import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

let checkpointId = "";
let airportCode = "";

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const cp = await prisma.checkpoint.findFirst({
    include: { airport: { select: { code: true } } },
  });
  expect(cp).not.toBeNull();
  checkpointId = cp!.id;
  airportCode = cp!.airport.code;
}, 30000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/checkpoints/:id/stats", () => {
  it("returns 400 for an invalid id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id/stats");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for a non-existent checkpoint (valid UUID format)", async () => {
    const res = await request(app).get(
      "/api/checkpoints/00000000-0000-0000-0000-000000000000/stats"
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Checkpoint not found");
  });

  it("returns aggregated stats for a valid checkpoint (default 24h)", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.data.checkpointId).toBe(checkpointId);
    expect(res.body.data.airportCode).toBe(airportCode);
    expect(res.body.data.windowHours).toBe(24);
    expect(typeof res.body.data.count).toBe("number");
    expect(Array.isArray(res.body.data.byReportType)).toBe(true);
    expect(Array.isArray(res.body.data.byHourOfDay)).toBe(true);
    expect(["object", "null"]).toContain(typeof res.body.data.trend);
  });

  it("returns stats with numeric fields when reports exist", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats`);
    expect(res.status).toBe(200);

    // Seed data may or may not have reports within 24h; if it does, validate shapes.
    if (res.body.data.count > 0) {
      const d = res.body.data;
      expect(typeof d.min).toBe("number");
      expect(typeof d.max).toBe("number");
      expect(typeof d.avg).toBe("number");
      expect(typeof d.median).toBe("number");
      expect(typeof d.p90).toBe("number");
      expect(d.min).toBeLessThanOrEqual(d.max);
      expect(d.avg).toBeGreaterThanOrEqual(d.min);
      expect(d.avg).toBeLessThanOrEqual(d.max);
      expect(d.median).toBeGreaterThanOrEqual(d.min);
      expect(d.median).toBeLessThanOrEqual(d.max);
      expect(d.p90).toBeGreaterThanOrEqual(d.min);
      expect(d.p90).toBeLessThanOrEqual(d.max);
    }
  });

  it("respects the hours query parameter", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(2);
  });

  it("accepts hours at the upper boundary (168)", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=168`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(168);
  });

  it("accepts hours at the lower boundary (1)", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=1`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(1);
  });

  it("rejects hours > 168 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=169`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer between 1 and 168");
  });

  it("rejects hours < 1 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer between 1 and 168");
  });

  it("rejects non-numeric hours with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer between 1 and 168");
  });

  it("rejects empty string hours with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer between 1 and 168");
  });

  it("rejects non-integer hours with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=1.5`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer between 1 and 168");
  });
});

describe("GET /api/checkpoints/:id/stats — determinstic aggregation with seeded reports", () => {
  let seededCheckpointId = "";

  beforeAll(async () => {
    // Create a fresh checkpoint owned by a dedicated airport so aggregation is deterministic.
    const airport = await prisma.airport.create({
      data: {
        code: "ZZZ",
        name: "Stats Test Airport",
        city: "Test City",
        state: "TS",
        country: "US",
        timezone: "UTC",
        latitude: 0,
        longitude: 0,
        checkpoints: {
          create: { code: "CKPT_Z1", name: "Stats Checkpoint", terminal: "T1" },
        },
      },
      include: { checkpoints: true },
    });
    seededCheckpointId = airport.checkpoints[0].id;

    const now = Date.now();
    // 6 reports across the last 2 hours at known minutes+hour-of-day for deterministic checks.
    // Reports span two distinct UTC hours to exercise byHourOfDay bucketing.
    const baseReports = [
      { minutes: 10, msAgo: 1 * 60 * 1000, reportType: "standard" },
      { minutes: 20, msAgo: 30 * 60 * 1000, reportType: "standard" },
      { minutes: 30, msAgo: 60 * 60 * 1000, reportType: "precheck" },
      { minutes: 40, msAgo: 70 * 60 * 1000, reportType: "precheck" },
      { minutes: 50, msAgo: 90 * 60 * 1000, reportType: "clear" },
      { minutes: 60, msAgo: 110 * 60 * 1000, reportType: "standard" },
    ];
    for (const r of baseReports) {
      await prisma.waitTime.create({
        data: {
          checkpointId: seededCheckpointId,
          minutes: r.minutes,
          source: "crowd",
          reportType: r.reportType,
          reportedAt: new Date(now - r.msAgo),
        },
      });
    }
  }, 30000);

  afterAll(async () => {
    await prisma.waitTime.deleteMany({ where: { checkpointId: seededCheckpointId } });
    await prisma.checkpoint.deleteMany({ where: { airport: { code: "ZZZ" } } });
    await prisma.airport.deleteMany({ where: { code: "ZZZ" } });
  });

  it("aggregates count, min, max, avg, median and p90 correctly", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/stats?hours=3`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.count).toBe(6);
    expect(d.min).toBe(10);
    expect(d.max).toBe(60);
    expect(d.avg).toBe(35); // (10+20+30+40+50+60)/6 = 35
    expect(d.median).toBe(35); // median of [10,20,30,40,50,60] = 35
    expect(d.p90).toBe(55); // quantile(0.9): pos=(6-1)*0.9=4.5; sorted[4]=50, sorted[5]=60 -> 50 + 0.5*(60-50) = 55
  });

  it("groups distribution by report type with counts and averages", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/stats?hours=3`);
    expect(res.status).toBe(200);
    const byType = res.body.data.byReportType;
    expect(Array.isArray(byType)).toBe(true);
    expect(byType.length).toBe(3);

    const map = new Map<string, { count: number; avg: number }>(
      byType.map((b: { reportType: string; count: number; avg: number }) => [b.reportType, { count: b.count, avg: b.avg }])
    );
    expect(map.get("standard")!.count).toBe(3); // 10,20,60
    expect(map.get("standard")!.avg).toBe(30); // (10+20+60)/3 = 30
    expect(map.get("precheck")!.count).toBe(2); // 30,40
    expect(map.get("precheck")!.avg).toBe(35); // (30+40)/2 = 35
    expect(map.get("clear")!.count).toBe(1); // 50
    expect(map.get("clear")!.avg).toBe(50);
  });

  it("sorts byReportType by count descending", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/stats?hours=3`);
    expect(res.status).toBe(200);
    const byType = res.body.data.byReportType as Array<{ count: number }>;
    for (let i = 1; i < byType.length; i++) {
      expect(byType[i - 1].count).toBeGreaterThanOrEqual(byType[i].count);
    }
  });

  it("produces byHourOfDay entries with hours between 0 and 23 sorted ascending", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/stats?hours=3`);
    expect(res.status).toBe(200);
    const byHour = res.body.data.byHourOfDay as Array<{ hour: number; count: number; avg: number }>;
    expect(byHour.length).toBeGreaterThan(0);
    for (const b of byHour) {
      expect(b.hour).toBeGreaterThanOrEqual(0);
      expect(b.hour).toBeLessThanOrEqual(23);
      expect(b.count).toBeGreaterThanOrEqual(1);
      expect(typeof b.avg).toBe("number");
    }
    for (let i = 1; i < byHour.length; i++) {
      expect(byHour[i - 1].hour).toBeLessThan(byHour[i].hour);
    }
    // Total counts across hours should equal total reports.
    const totalByHour = byHour.reduce((s, b) => s + b.count, 0);
    expect(totalByHour).toBe(6);
  });

  it("computes a trend with first half, second half, and delta", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/stats?hours=3`);
    expect(res.status).toBe(200);
    const trend = res.body.data.trend;
    expect(trend).not.toBeNull();
    // Reports ordered oldest->newest (reportedAt asc). Oldest minutes: [60,50,40] (110,90,70 min ago),
    // newest minutes: [30,20,10] (60,30,1 min ago). mid=3.
    expect(trend.firstHalfAvg).toBe(50); // (60+50+40)/3
    expect(trend.secondHalfAvg).toBe(20); // (30+20+10)/3
    expect(trend.delta).toBe(-30); // 20 - 50
  });

  it("returns trend null when fewer than 2 reports are in the window", async () => {
    // Create a dedicated airport/checkpoint with exactly one report so the trend contract is deterministic.
    const airport = await prisma.airport.create({
      data: {
        code: "ONE1",
        name: "One Report Airport",
        city: "One City",
        state: "OS",
        country: "US",
        timezone: "UTC",
        checkpoints: {
          create: { code: "CKPT_O1", name: "One Report Checkpoint", terminal: "T0" },
        },
      },
      include: { checkpoints: true },
    });
    const oneId = airport.checkpoints[0].id;
    await prisma.waitTime.create({
      data: {
        checkpointId: oneId,
        minutes: 12,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 2 * 60 * 1000),
      },
    });

    try {
      const res = await request(app).get(`/api/checkpoints/${oneId}/stats?hours=24`);
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(1);
      expect(res.body.data.trend).toBeNull();
      // Single report: min === max === avg === median === p90 === that report's minutes.
      expect(res.body.data.min).toBe(12);
      expect(res.body.data.max).toBe(12);
      expect(res.body.data.avg).toBe(12);
      expect(res.body.data.median).toBe(12);
      expect(res.body.data.p90).toBe(12);
    } finally {
      await prisma.waitTime.deleteMany({ where: { checkpointId: oneId } });
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "ONE1" } } });
      await prisma.airport.deleteMany({ where: { code: "ONE1" } });
    }
  });
});

describe("GET /api/checkpoints/:id/stats — empty window", () => {
  it("returns count 0 with null stat fields when no reports exist in the window", async () => {
    // Use the dedicated stats checkpoint but ask for a 1h window with no fresh reports.
    // Reuse a brand-new checkpoint without any wait times to guarantee a stable empty case.
    const airport = await prisma.airport.create({
      data: {
        code: "EMPTY",
        name: "Empty Airport",
        city: "Empty City",
        state: "ES",
        country: "US",
        timezone: "UTC",
        checkpoints: {
          create: { code: "CKPT_E1", name: "Empty Checkpoint", terminal: "T0" },
        },
      },
      include: { checkpoints: true },
    });
    const emptyId = airport.checkpoints[0].id;

    try {
      const res = await request(app).get(`/api/checkpoints/${emptyId}/stats?hours=24`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.count).toBe(0);
      expect(d.min).toBeNull();
      expect(d.max).toBeNull();
      expect(d.avg).toBeNull();
      expect(d.median).toBeNull();
      expect(d.p90).toBeNull();
      expect(d.trend).toBeNull();
      expect(Array.isArray(d.byReportType)).toBe(true);
      expect(d.byReportType.length).toBe(0);
      expect(Array.isArray(d.byHourOfDay)).toBe(true);
      expect(d.byHourOfDay.length).toBe(0);
    } finally {
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "EMPTY" } } });
      await prisma.airport.deleteMany({ where: { code: "EMPTY" } });
    }
  });
});
