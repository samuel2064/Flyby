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

let seededCheckpointId = "";
let deterministicId = "";

// Deterministic scenario: a UTC-timezone checkpoint with reports placed at two
// specific upcoming hour-of-day slots (28h and 27h ago) so the horizon=24
// forecast is fully time-independent.
let hourA = 0; // 2 reports {10, 20} -> pattern avg 15
let hourB = 0; // 4 reports {40, 44, 46, 50} -> pattern avg 45

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const cp = await prisma.checkpoint.findFirst();
  expect(cp).not.toBeNull();
  seededCheckpointId = cp!.id;

  // Dedicated airport/checkpoint for deterministic pattern assertions.
  const airport = await prisma.airport.create({
    data: {
      code: "PRD",
      name: "Predict Test Airport",
      city: "Test City",
      state: "TS",
      country: "US",
      timezone: "UTC",
      latitude: 0,
      longitude: 0,
      checkpoints: {
        create: { code: "CKPT_P1", name: "Predict Checkpoint", terminal: "T1" },
      },
    },
    include: { checkpoints: true },
  });
  deterministicId = airport.checkpoints[0].id;

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
    // Place each report 2 days ago at the target UTC hour (27-28h old):
    // inside the 30-day window, outside the 1-day window and the 6h consensus window.
    const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    at.setUTCHours(r.hour, 0, 0, 0);
    await prisma.waitTime.create({
      data: {
        checkpointId: deterministicId,
        minutes: r.minutes,
        source: "crowd",
        reportType: "standard",
        reportedAt: at,
      },
    });
  }
}, 30000);

afterAll(async () => {
  await prisma.waitTime.deleteMany({ where: { checkpointId: deterministicId } });
  await prisma.checkpoint.deleteMany({ where: { airport: { code: "PRD" } } });
  await prisma.airport.deleteMany({ where: { code: "PRD" } });
  await prisma.$disconnect();
});

describe("GET /api/checkpoints/:id/predict — validation", () => {
  it("returns 400 for an invalid id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id/predict");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for a non-existent checkpoint (valid UUID format)", async () => {
    const res = await request(app).get(
      "/api/checkpoints/00000000-0000-0000-0000-000000000000/predict"
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Checkpoint not found");
  });

  it("rejects horizon=0 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects horizon > 24 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=25`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects non-numeric horizon with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects empty string horizon with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects non-integer horizon with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=1.5`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("horizon must be a positive integer between 1 and 24");
  });

  it("rejects days=0 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?days=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });

  it("rejects days > 30 with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?days=31`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });

  it("rejects non-numeric days with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?days=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });

  it("rejects empty string days with 400", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?days=`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("days must be a positive integer between 1 and 30");
  });
});

describe("GET /api/checkpoints/:id/predict — shape on seeded data", () => {
  it("returns default horizon 12 and historyDays 30 with prediction array", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.checkpointId).toBe(seededCheckpointId);
    expect(d.horizon).toBe(12);
    expect(d.historyDays).toBe(30);
    expect(typeof d.sampleCount).toBe("number");
    expect(Array.isArray(d.predictions)).toBe(true);
    expect(Array.isArray(d.bestHours)).toBe(true);
    expect(d.predictions.length).toBe(12);
    expect(["number", "null"]).toContain(typeof d.overallAverageMinutes);
    expect(["number", "null"]).toContain(typeof d.currentConsensusMinutes);
    expect(["number", "null"]).toContain(typeof d.liveConsensusMinutes);
  });

  it("accepts horizon at the lower boundary (1)", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=1`);
    expect(res.status).toBe(200);
    expect(res.body.data.predictions.length).toBe(1);
    expect(res.body.data.horizon).toBe(1);
  });

  it("accepts horizon at the upper boundary (24) with every local hour exactly once", async () => {
    const res = await request(app).get(`/api/checkpoints/${seededCheckpointId}/predict?horizon=24`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.predictions.length).toBe(24);
    const hours = d.predictions.map((p: { hour: number }) => p.hour);
    const unique = new Set(hours);
    expect(unique.size).toBe(24);
    for (const h of hours) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
  });
});

describe("GET /api/checkpoints/:id/predict — deterministic pattern matching", () => {
  it("predicts hour-of-day pattern averages from history", async () => {
    const res = await request(app).get(`/api/checkpoints/${deterministicId}/predict?horizon=24`);
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.sampleCount).toBe(6);
    expect(d.overallAverageMinutes).toBe(35); // (10+20+40+44+46+50)/6
    expect(d.currentConsensusMinutes).toBeNull(); // all reports are > 6h old
    expect(d.timezone).toBe("UTC");

    const predA = d.predictions.find((p: { hour: number }) => p.hour === hourA);
    expect(predA).toBeDefined();
    expect(predA.predictedMinutes).toBe(15); // (10+20)/2
    expect(predA.source).toBe("pattern");
    expect(predA.sampleCount).toBe(2);
    expect(predA.confidence).toBe(0.2); // 2/10 capped at 1

    const predB = d.predictions.find((p: { hour: number }) => p.hour === hourB);
    expect(predB).toBeDefined();
    expect(predB.predictedMinutes).toBe(45); // (40+44+46+50)/4
    expect(predB.source).toBe("pattern");
    expect(predB.sampleCount).toBe(4);
    expect(predB.confidence).toBe(0.4); // 4/10 capped at 1

    // A sparse hour with no samples falls back to the overall average at halved confidence.
    const sparseHour = (hourA + 2) % 24;
    const predSparse = d.predictions.find((p: { hour: number }) => p.hour === sparseHour);
    expect(predSparse).toBeDefined();
    expect(predSparse.source).toBe("fallback");
    expect(predSparse.sampleCount).toBe(0);
    expect(predSparse.predictedMinutes).toBe(35);
    expect(predSparse.confidence).toBe(0.3); // overall 0.6 * 0.5
  });

  it("returns predictions in ascending hourly slots with aligned timestamps", async () => {
    const res = await request(app).get(`/api/checkpoints/${deterministicId}/predict?horizon=24`);
    expect(res.status).toBe(200);
    const predictions = res.body.data.predictions;

    // Hours rotate forward around the clock.
    for (let i = 1; i < predictions.length; i++) {
      expect(predictions[i].hour).toBe((predictions[i - 1].hour + 1) % 24);
    }
    // Timestamps advance one hour per slot starting at the top of the current hour.
    const start = new Date(predictions[0].forecastFor).getTime();
    expect(start % (60 * 60 * 1000)).toBe(0);
    for (let i = 0; i < predictions.length; i++) {
      expect(new Date(predictions[i].forecastFor).getTime()).toBe(start + i * 60 * 60 * 1000);
    }
  });

  it("ranks best hours from pattern-backed predictions only, sorted ascending", async () => {
    const res = await request(app).get(`/api/checkpoints/${deterministicId}/predict?horizon=24`);
    expect(res.status).toBe(200);
    const bestHours = res.body.data.bestHours;

    // Only the two seeded hours are pattern-backed.
    expect(bestHours.length).toBe(2);
    expect(bestHours[0].hour).toBe(hourA);
    expect(bestHours[0].predictedMinutes).toBe(15);
    expect(bestHours[1].hour).toBe(hourB);
    expect(bestHours[1].predictedMinutes).toBe(45);
  });

  it("excludes history outside the days window", async () => {
    // Deterministic reports are 27-28h old: a 1-day window sees none of them.
    const res = await request(app).get(`/api/checkpoints/${deterministicId}/predict?days=1`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.sampleCount).toBe(0);
    expect(d.predictions).toEqual([]);
    expect(d.bestHours).toEqual([]);
    expect(d.overallAverageMinutes).toBeNull();
    expect(d.currentConsensusMinutes).toBeNull();
    expect(d.liveConsensusMinutes).toBeNull();
  });

  it("returns an empty forecast for a checkpoint with no reports at all", async () => {
    const airport = await prisma.airport.create({
      data: {
        code: "EMPTY2",
        name: "Empty Predict Airport",
        city: "Empty City",
        state: "ES",
        country: "US",
        timezone: "UTC",
        checkpoints: {
          create: { code: "CKPT_E2", name: "Empty Predict Checkpoint", terminal: "T0" },
        },
      },
      include: { checkpoints: true },
    });
    const emptyId = airport.checkpoints[0].id;

    try {
      const res = await request(app).get(`/api/checkpoints/${emptyId}/predict`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.sampleCount).toBe(0);
      expect(d.predictions).toEqual([]);
      expect(d.bestHours).toEqual([]);
      expect(d.overallAverageMinutes).toBeNull();
      expect(d.currentConsensusMinutes).toBeNull();
      expect(d.liveConsensusMinutes).toBeNull();
    } finally {
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "EMPTY2" } } });
      await prisma.airport.deleteMany({ where: { code: "EMPTY2" } });
    }
  });
});

describe("GET /api/checkpoints/:id/predict — timezone bucketing", () => {
  it("buckets reports by airport-local hour, not UTC hour", async () => {
    // America/New_York in September is UTC-4 (EDT): 04:00Z maps to local hour 0.
    const airport = await prisma.airport.create({
      data: {
        code: "NYC1",
        name: "New York Predict Airport",
        city: "New York",
        state: "NY",
        country: "US",
        timezone: "America/New_York",
        checkpoints: {
          create: { code: "CKPT_N1", name: "NY Predict Checkpoint", terminal: "T2" },
        },
      },
      include: { checkpoints: true },
    });
    const nyId = airport.checkpoints[0].id;

    // 3 days ago at 04:00Z = midnight local (hour 0).
    const at = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    at.setUTCHours(4, 0, 0, 0);
    for (const minutes of [20, 30, 40]) {
      await prisma.waitTime.create({
        data: {
          checkpointId: nyId,
          minutes,
          source: "crowd",
          reportType: "standard",
          reportedAt: at,
        },
      });
    }

    try {
      const res = await request(app).get(`/api/checkpoints/${nyId}/predict?horizon=24`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.timezone).toBe("America/New_York");
      expect(d.sampleCount).toBe(3);
      expect(d.overallAverageMinutes).toBe(30);

      // With a 24h horizon every local hour appears exactly once.
      const midnightPred = d.predictions.find((p: { hour: number }) => p.hour === 0);
      expect(midnightPred).toBeDefined();
      expect(midnightPred.source).toBe("pattern");
      expect(midnightPred.predictedMinutes).toBe(30); // (20+30+40)/3
      expect(midnightPred.sampleCount).toBe(3);
      expect(midnightPred.confidence).toBe(0.3); // 3/10

      // 04:00Z is local hour 0, NOT UTC hour 4 — hour 4 must not carry these samples.
      const hourFourPred = d.predictions.find((p: { hour: number }) => p.hour === 4);
      expect(hourFourPred.source).toBe("fallback");
      expect(hourFourPred.sampleCount).toBe(0);
    } finally {
      await prisma.waitTime.deleteMany({ where: { checkpointId: nyId } });
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "NYC1" } } });
      await prisma.airport.deleteMany({ where: { code: "NYC1" } });
    }
  });
});

describe("GET /api/checkpoints/:id/predict — live blending of imminent slots", () => {
  // Pattern history at four consecutive hours (offsets 0..3 from the seed-time
  // current hour) plus fresh live reports that diverge from the pattern. Live
  // reports use identical minute values so the recency-weighted live consensus
  // is exact regardless of age jitter. Four consecutive seeded hours make the
  // assertions robust even if the hour rolls over between seed and request.
  const patternAverages = [15, 45, 70, 90];
  const historyValues: number[][] = [
    [10, 20], // avg 15
    [40, 50], // avg 45
    [70], // avg 70
    [90], // avg 90
  ];
  const liveMinutes = 100;

  it("blends the live consensus into the current and next hour, keeps later slots pure", async () => {
    const airport = await prisma.airport.create({
      data: {
        code: "LIVE1",
        name: "Live Blend Airport",
        city: "Blend City",
        state: "BS",
        country: "US",
        timezone: "UTC",
        checkpoints: { create: { code: "CKPT_L1", name: "Live Blend Checkpoint", terminal: "T3" } },
      },
      include: { checkpoints: true },
    });
    const cpId = airport.checkpoints[0].id;

    const seededHour = new Date().getUTCHours();
    const hourAvg = new Map<number, number>();
    for (let off = 0; off < 4; off++) {
      hourAvg.set((seededHour + off) % 24, patternAverages[off]);
    }

    try {
      for (let off = 0; off < 4; off++) {
        for (const minutes of historyValues[off]) {
          // 2 days ago: inside the 30-day window, outside every consensus window.
          const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          at.setUTCHours((seededHour + off) % 24, 0, 0, 0);
          await prisma.waitTime.create({
            data: { checkpointId: cpId, minutes, source: "crowd", reportType: "standard", reportedAt: at },
          });
        }
      }
      // Fresh live reports (identical value => exact consensus of 100).
      for (let i = 0; i < 2; i++) {
        await prisma.waitTime.create({
          data: {
            checkpointId: cpId,
            minutes: liveMinutes,
            source: "crowd",
            reportType: "standard",
            reportedAt: new Date(Date.now() - i * 5 * 60 * 1000),
          },
        });
      }

      const res = await request(app).get(`/api/checkpoints/${cpId}/predict?horizon=12`);
      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.sampleCount).toBe(8); // 6 history + 2 live
      expect(d.liveConsensusMinutes).toBe(liveMinutes);
      expect(d.currentConsensusMinutes).toBe(liveMinutes); // same 2 reports, within 6h

      // Anchor on the response's own current hour (robust to a mid-test rollover:
      // it stays inside the seeded 4-hour block).
      const cur = d.predictions[0].hour;
      const avgAt = (off: number) => {
        const avg = hourAvg.get((cur + off) % 24);
        expect(avg).toBeDefined();
        return avg as number;
      };

      // Slot 0 (current hour): 60% live + 40% pattern.
      expect(d.predictions[0].source).toBe("blended");
      expect(d.predictions[0].predictedMinutes).toBe(
        Math.round(0.6 * liveMinutes + 0.4 * avgAt(0))
      );
      // History depth for the imminent hour stays in sampleCount.
      expect(d.predictions[0].sampleCount).toBe(2);
      // Blended confidence pools history depth + live corroboration: (2 + 2)/10.
      expect(d.predictions[0].confidence).toBe(0.4);

      // Slot 1 (next hour): 30% live + 70% pattern.
      expect(d.predictions[1].source).toBe("blended");
      expect(d.predictions[1].predictedMinutes).toBe(
        Math.round(0.3 * liveMinutes + 0.7 * avgAt(1))
      );

      // Slot 2 (and beyond): pure pattern, untouched by the live signal.
      expect(d.predictions[2].source).toBe("pattern");
      expect(d.predictions[2].predictedMinutes).toBe(avgAt(2));

      // Live reports must not double-count into the pattern baseline: the
      // current hour's pattern average is the history-only 15/45, not 57.5/72.5.
      // (Guarded by the exact blended assertions above.)

      // Blended slots are eligible for bestHours (they carry real evidence).
      expect(d.bestHours.some((b: { forecastFor: string }) => b.forecastFor === d.predictions[1].forecastFor)).toBe(true);
      // Fallback hours never qualify for bestHours.
      const nonFallback = new Set(
        d.predictions
          .filter((p: { source: string }) => p.source !== "fallback")
          .map((p: { forecastFor: string }) => p.forecastFor)
      );
      for (const b of d.bestHours) {
        expect(nonFallback.has(b.forecastFor)).toBe(true);
      }
    } finally {
      await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "LIVE1" } } });
      await prisma.airport.deleteMany({ where: { code: "LIVE1" } });
    }
  });
});

describe("GET /api/checkpoints/:id/predict — live window boundary", () => {
  it("does not blend when reports are inside the 6h consensus window but outside the 60min live window", async () => {
    const airport = await prisma.airport.create({
      data: {
        code: "STALE1",
        name: "Stale Live Airport",
        city: "Stale City",
        state: "SS",
        country: "US",
        timezone: "UTC",
        checkpoints: { create: { code: "CKPT_S1", name: "Stale Live Checkpoint", terminal: "T4" } },
      },
      include: { checkpoints: true },
    });
    const cpId = airport.checkpoints[0].id;

    try {
      // One report 3h ago: inside the 6h consensus window, outside the 60min live window.
      const at = new Date(Date.now() - 3 * 60 * 60 * 1000);
      at.setUTCMinutes(0, 0, 0);
      await prisma.waitTime.create({
        data: { checkpointId: cpId, minutes: 30, source: "crowd", reportType: "standard", reportedAt: at },
      });

      const res = await request(app).get(`/api/checkpoints/${cpId}/predict?horizon=24`);
      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.sampleCount).toBe(1);
      expect(d.currentConsensusMinutes).toBe(30); // 6h window sees the report
      expect(d.liveConsensusMinutes).toBeNull(); // 60min window does not

      // No live signal -> no blending anywhere, including the imminent slots.
      expect(d.predictions[0].source).toBe("fallback"); // current hour has no history

      // The report's own hour-of-day slot is pure pattern.
      const reportHour = new Date(at).getUTCHours();
      const reportSlot = d.predictions.find((p: { hour: number }) => p.hour === reportHour);
      expect(reportSlot).toBeDefined();
      expect(reportSlot.source).toBe("pattern");
      expect(reportSlot.predictedMinutes).toBe(30);

      // The pattern-backed slot is the only bestHours candidate.
      expect(d.bestHours.length).toBe(1);
      expect(d.bestHours[0].predictedMinutes).toBe(30);
    } finally {
      await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });
      await prisma.checkpoint.deleteMany({ where: { airport: { code: "STALE1" } } });
      await prisma.airport.deleteMany({ where: { code: "STALE1" } });
    }
  });
});
