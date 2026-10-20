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

// Dedicated airport with three checkpoints:
// - CKPT_F1 "A Pattern Checkpoint": deterministic hour-of-day history (no live reports)
// - CKPT_F2 "B Empty Checkpoint": no reports at all
// - CKPT_F3 "C Live Only Checkpoint": only fresh live-window reports
let patternId = "";
let emptyId = "";
let liveId = "";

// Deterministic upcoming hours (same trick as the predict suite): reports at
// (now+20)%24 and (now+21)%24 two days ago always fall inside a horizon=24
// forecast regardless of wall-clock.
let hourA = 0; // 2 reports {10, 20} -> pattern avg 15
let hourB = 0; // 4 reports {40, 44, 46, 50} -> pattern avg 45
const liveMinutes = 100;

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const airport = await prisma.airport.create({
    data: {
      code: "FBA",
      name: "Forecast Batch Airport",
      city: "Batch City",
      state: "BS",
      country: "US",
      timezone: "UTC",
      checkpoints: {
        create: [
          { code: "CKPT_F1", name: "A Pattern Checkpoint", terminal: "T1" },
          { code: "CKPT_F2", name: "B Empty Checkpoint", terminal: "T2" },
          { code: "CKPT_F3", name: "C Live Only Checkpoint", terminal: "T3" },
        ],
      },
    },
    include: { checkpoints: true },
  });

  patternId = airport.checkpoints.find((cp) => cp.code === "CKPT_F1")!.id;
  emptyId = airport.checkpoints.find((cp) => cp.code === "CKPT_F2")!.id;
  liveId = airport.checkpoints.find((cp) => cp.code === "CKPT_F3")!.id;

  const now = new Date();
  hourA = (now.getUTCHours() + 20) % 24;
  hourB = (now.getUTCHours() + 21) % 24;

  const reports: Array<{ hour: number; minutes: number }> = [
    { hour: hourA, minutes: 10 },
    { hour: hourA, minutes: 20 },
    { hour: hourB, minutes: 40 },
    { hour: hourB, minutes: 44 },
    { hour: hourB, minutes: 46 },
    { hour: hourB, minutes: 50 },
  ];
  for (const r of reports) {
    // 2 days ago at the target UTC hour: inside the 30-day window, outside the
    // 1-day window and both consensus windows.
    const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    at.setUTCHours(r.hour, 0, 0, 0);
    await prisma.waitTime.create({
      data: {
        checkpointId: patternId,
        minutes: r.minutes,
        source: "crowd",
        reportType: "standard",
        reportedAt: at,
      },
    });
  }

  // Live-only checkpoint: two identical fresh reports -> exact live consensus.
  for (let i = 0; i < 2; i++) {
    await prisma.waitTime.create({
      data: {
        checkpointId: liveId,
        minutes: liveMinutes,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - i * 5 * 60 * 1000),
      },
    });
  }
}, 60000);

afterAll(async () => {
  await prisma.waitTime.deleteMany({
    where: { checkpointId: { in: [patternId, emptyId, liveId] } },
  });
  await prisma.checkpoint.deleteMany({ where: { airport: { code: "FBA" } } });
  await prisma.airport.deleteMany({ where: { code: "FBA" } });
  await prisma.$disconnect();
});

describe("GET /api/airports/:code/forecasts — validation", () => {
  it("returns 400 for an invalid airport code format", async () => {
    const res = await request(app).get("/api/airports/1A/forecasts");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid airport code");
  });

  it("returns 400 for a too-short airport code", async () => {
    const res = await request(app).get("/api/airports/AB/forecasts");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid airport code");
  });

  it("returns 404 for an unknown airport code", async () => {
    const res = await request(app).get("/api/airports/QQQ/forecasts");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Airport not found");
  });

  it("accepts lowercase airport codes (case-insensitive)", async () => {
    const res = await request(app).get("/api/airports/fba/forecasts");
    expect(res.status).toBe(200);
    expect(res.body.data.airportCode).toBe("FBA");
  });

  it("rejects a non-numeric horizon with 400", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?horizon=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects an out-of-range horizon with 400", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?horizon=25");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects an out-of-range days with 400", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?days=0");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });

  it("rejects a non-numeric days with 400", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?days=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });
});

describe("GET /api/airports/:code/forecasts — shape", () => {
  it("returns one forecast entry per checkpoint with defaults", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.airportCode).toBe("FBA");
    expect(d.airportName).toBe("Forecast Batch Airport");
    expect(d.timezone).toBe("UTC");
    expect(d.historyDays).toBe(30);
    expect(d.horizon).toBe(12);
    expect(Array.isArray(d.forecasts)).toBe(true);
    expect(d.forecasts.length).toBe(3);
    // Ordered by checkpoint name asc.
    expect(d.forecasts.map((f: { code: string }) => f.code)).toEqual([
      "CKPT_F1",
      "CKPT_F2",
      "CKPT_F3",
    ]);
    for (const f of d.forecasts) {
      expect(typeof f.checkpointId).toBe("string");
      expect(typeof f.name).toBe("string");
      expect(typeof f.terminal).toBe("string");
      expect(typeof f.timezone).toBe("string");
      expect(typeof f.sampleCount).toBe("number");
      expect(Array.isArray(f.predictions)).toBe(true);
      expect(Array.isArray(f.bestHours)).toBe(true);
      // Checkpoints with reports get a full horizon of predictions; the
      // report-less checkpoint correctly returns an empty array.
      expect(f.predictions.length).toBe(f.sampleCount > 0 ? 12 : 0);
    }
  });

  it("honors the horizon parameter for every checkpoint", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?horizon=2");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.horizon).toBe(2);
    for (const f of d.forecasts) {
      expect(f.predictions.length).toBe(f.sampleCount > 0 ? 2 : 0);
    }
  });

  it("applies the days window to every checkpoint in the batch", async () => {
    // Pattern reports are 2 days old: a 1-day window drops them entirely.
    const res = await request(app).get("/api/airports/FBA/forecasts?days=1");
    expect(res.status).toBe(200);
    const d = res.body.data;
    const f1 = d.forecasts.find((f: { code: string }) => f.code === "CKPT_F1");
    expect(f1.sampleCount).toBe(0);
    expect(f1.predictions).toEqual([]);
    expect(f1.bestHours).toEqual([]);
    // Live reports are minutes old: still inside a 1-day window.
    const f3 = d.forecasts.find((f: { code: string }) => f.code === "CKPT_F3");
    expect(f3.sampleCount).toBe(2);
  });

  it("returns an empty forecasts array for an airport with no checkpoints", async () => {
    const airport = await prisma.airport.create({
      data: {
        code: "FBZ",
        name: "No Checkpoint Airport",
        city: "Empty City",
        state: "ES",
        country: "US",
        timezone: "UTC",
      },
    });
    try {
      const res = await request(app).get("/api/airports/FBZ/forecasts");
      expect(res.status).toBe(200);
      expect(res.body.data.forecasts).toEqual([]);
    } finally {
      await prisma.airport.deleteMany({ where: { code: "FBZ" } });
    }
  });
});

describe("GET /api/airports/:code/forecasts — deterministic pattern matching", () => {
  it("returns the seeded hour-of-day averages and best hours for the pattern checkpoint", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?horizon=24");
    expect(res.status).toBe(200);
    const f1 = res.body.data.forecasts.find((f: { code: string }) => f.code === "CKPT_F1");

    expect(f1.sampleCount).toBe(6);
    expect(f1.overallAverageMinutes).toBe(35); // (10+20+40+44+46+50)/6
    expect(f1.currentConsensusMinutes).toBeNull(); // all reports > 6h old
    expect(f1.liveConsensusMinutes).toBeNull();
    expect(f1.timezone).toBe("UTC");

    const predA = f1.predictions.find((p: { hour: number }) => p.hour === hourA);
    expect(predA).toBeDefined();
    expect(predA.predictedMinutes).toBe(15); // (10+20)/2
    expect(predA.source).toBe("pattern");
    expect(predA.sampleCount).toBe(2);
    expect(predA.confidence).toBe(0.2); // 2/10

    const predB = f1.predictions.find((p: { hour: number }) => p.hour === hourB);
    expect(predB).toBeDefined();
    expect(predB.predictedMinutes).toBe(45); // (40+44+46+50)/4
    expect(predB.source).toBe("pattern");
    expect(predB.sampleCount).toBe(4);
    expect(predB.confidence).toBe(0.4); // 4/10

    // Only the two seeded hours are pattern-backed -> both are best hours.
    expect(f1.bestHours.length).toBe(2);
    expect(f1.bestHours[0].hour).toBe(hourA);
    expect(f1.bestHours[0].predictedMinutes).toBe(15);
    expect(f1.bestHours[1].hour).toBe(hourB);
    expect(f1.bestHours[1].predictedMinutes).toBe(45);
  });

  it("returns an empty forecast for the checkpoint with no reports", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts");
    expect(res.status).toBe(200);
    const f2 = res.body.data.forecasts.find((f: { code: string }) => f.code === "CKPT_F2");

    expect(f2.sampleCount).toBe(0);
    expect(f2.predictions).toEqual([]);
    expect(f2.bestHours).toEqual([]);
    expect(f2.overallAverageMinutes).toBeNull();
    expect(f2.currentConsensusMinutes).toBeNull();
    expect(f2.liveConsensusMinutes).toBeNull();
  });

  it("blends the live consensus into imminent slots for the live-only checkpoint", async () => {
    const res = await request(app).get("/api/airports/FBA/forecasts?horizon=12");
    expect(res.status).toBe(200);
    const f3 = res.body.data.forecasts.find((f: { code: string }) => f.code === "CKPT_F3");

    expect(f3.sampleCount).toBe(2);
    expect(f3.liveConsensusMinutes).toBe(liveMinutes);
    expect(f3.currentConsensusMinutes).toBe(liveMinutes);

    // Slot 0: 60% live + 40% pattern. Live reports are excluded from the
    // pattern baseline, so the fallback baseline IS the overall average (100):
    // 0.6*100 + 0.4*100 = 100. Confidence pools live corroboration: (0+2)/10.
    expect(f3.predictions[0].source).toBe("blended");
    expect(f3.predictions[0].predictedMinutes).toBe(liveMinutes);
    expect(f3.predictions[0].confidence).toBe(0.2);

    // Beyond the blend window: pure fallback (no history buckets exist).
    expect(f3.predictions[2].source).toBe("fallback");
    expect(f3.predictions[2].sampleCount).toBe(0);

    // Blended slots carry real live evidence -> eligible best hours; fallback slots never are.
    const blended = f3.predictions.filter(
      (p: { source: string }) => p.source === "blended"
    );
    expect(blended.length).toBe(2);
    for (const b of f3.bestHours) {
      expect(
        blended.some((p: { forecastFor: string }) => p.forecastFor === b.forecastFor)
      ).toBe(true);
    }
  });
});

describe("GET /api/airports/:code/forecasts — parity with /predict", () => {
  it("returns identical predictions and best hours as the single-checkpoint predict endpoint", async () => {
    // Fetch both endpoints until their current-hour slots align: the two calls
    // happen milliseconds apart, but an hour rollover between them would make
    // the hour sequences differ through no fault of the math.
    let batchF1: { predictions: Array<{ hour: number }>; bestHours: unknown[]; sampleCount: number; overallAverageMinutes: number } | undefined;
    let predict: { data: { predictions: Array<{ hour: number }>; bestHours: unknown[]; sampleCount: number; overallAverageMinutes: number } } | undefined;

    for (let attempt = 0; attempt < 5; attempt++) {
      const [batchRes, predictRes] = await Promise.all([
        request(app).get("/api/airports/FBA/forecasts?horizon=24"),
        request(app).get(`/api/checkpoints/${patternId}/predict?horizon=24`),
      ]);
      expect(batchRes.status).toBe(200);
      expect(predictRes.status).toBe(200);
      batchF1 = batchRes.body.data.forecasts.find(
        (f: { checkpointId: string }) => f.checkpointId === patternId
      );
      predict = predictRes.body;
      if (batchF1.predictions[0].hour === predict.data.predictions[0].hour) break;
    }

    expect(batchF1.predictions[0].hour).toBe(predict!.data.predictions[0].hour);
    expect(batchF1.predictions).toEqual(predict!.data.predictions);
    expect(batchF1.bestHours).toEqual(predict!.data.bestHours);
    expect(batchF1.sampleCount).toBe(predict!.data.sampleCount);
    expect(batchF1.overallAverageMinutes).toBe(predict!.data.overallAverageMinutes);
  });
});
