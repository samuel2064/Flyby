import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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

// TIR-312 companion coverage: the traveler-facing list endpoints must show ONE
// row per checkpoint with the LATEST report winning — never one row per raw
// report. Guards the aggregation semantics the deployed web app now relies on.
const AIRPORT_CODE = "LTW";
let reportedCpId = "";
let emptyCpId = "";

// Reports inserted in shuffled chronological order to prove the endpoints sort
// by reportedAt desc rather than trusting insertion/id order.
const OLDEST = { minutes: 45, msAgo: 3 * 60 * 60 * 1000 };
const MIDDLE = { minutes: 25, msAgo: 2 * 60 * 60 * 1000 };
const NEWEST = { minutes: 12, msAgo: 5 * 60 * 1000 };

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const airport = await prisma.airport.create({
    data: {
      code: AIRPORT_CODE,
      name: "Latest Wins Test Airport",
      city: "Test City",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: {
        create: [
          { code: "CKPT_LTW_A", name: "Checkpoint A", terminal: "T1" },
          { code: "CKPT_LTW_B", name: "Checkpoint B", terminal: "T2" },
        ],
      },
    },
    include: { checkpoints: true },
  });
  const checkpoints = airport.checkpoints.sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  reportedCpId = checkpoints[0].id;
  emptyCpId = checkpoints[1].id;
}, 30000);

afterAll(async () => {
  await prisma.checkpoint.deleteMany({ where: { airport: { code: AIRPORT_CODE } } });
  await prisma.airport.deleteMany({ where: { code: AIRPORT_CODE } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.waitTime.deleteMany({ where: { checkpointId: { in: [reportedCpId, emptyCpId] } } });
  const now = Date.now();
  // Shuffled insertion: MIDDLE, OLDEST, NEWEST.
  for (const r of [MIDDLE, OLDEST, NEWEST]) {
    await prisma.waitTime.create({
      data: {
        checkpointId: reportedCpId,
        minutes: r.minutes,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(now - r.msAgo),
      },
    });
  }
});

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

describe("GET /api/checkpoints/airport/:code — one row per checkpoint, latest report wins", () => {
  it("returns exactly one row per checkpoint for the airport", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${AIRPORT_CODE}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const names = res.body.data.map((cp: { name: string }) => cp.name).sort();
    expect(names).toEqual(["Checkpoint A", "Checkpoint B"]);
  });

  it("surfaces the NEWEST report values despite shuffled insertion order", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${AIRPORT_CODE}`);
    expect(res.status).toBe(200);
    const cp = res.body.data.find(
      (c: { id: string }) => c.id === reportedCpId,
    );
    expect(cp).toBeDefined();
    expect(cp.latestWaitTimeMinutes).toBe(NEWEST.minutes);
    // The newest report was 5 minutes ago; its timestamp must match to the second.
    expect(new Date(cp.latestReportedAt).getTime()).toBeGreaterThan(
      new Date(iso(NEWEST.msAgo + 60 * 1000)).getTime(),
    );
    expect(new Date(cp.latestReportedAt).getTime()).toBeLessThan(
      new Date(iso(NEWEST.msAgo - 60 * 1000)).getTime(),
    );
  });

  it("returns the wait-time history sorted newest-first", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${AIRPORT_CODE}`);
    const cp = res.body.data.find((c: { id: string }) => c.id === reportedCpId);
    expect(cp.waitTimes.map((wt: { minutes: number }) => wt.minutes)).toEqual([
      NEWEST.minutes,
      MIDDLE.minutes,
      OLDEST.minutes,
    ]);
    for (let i = 1; i < cp.waitTimes.length; i++) {
      expect(new Date(cp.waitTimes[i - 1].reportedAt).getTime()).toBeGreaterThan(
        new Date(cp.waitTimes[i].reportedAt).getTime(),
      );
    }
  });

  it("computes a consensus estimate from the reports (never fabricated)", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${AIRPORT_CODE}`);
    const cp = res.body.data.find((c: { id: string }) => c.id === reportedCpId);
    expect(typeof cp.estimatedWaitTimeMinutes).toBe("number");
    expect(cp.estimatedWaitTimeMinutes).toBeGreaterThanOrEqual(NEWEST.minutes);
    expect(cp.estimatedWaitTimeMinutes).toBeLessThanOrEqual(OLDEST.minutes);
  });

  it("never fabricates values for a checkpoint with no reports", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${AIRPORT_CODE}`);
    const cp = res.body.data.find((c: { id: string }) => c.id === emptyCpId);
    expect(cp).toBeDefined();
    expect(cp.latestWaitTimeMinutes).toBeNull();
    expect(cp.latestReportedAt).toBeNull();
    expect(cp.estimatedWaitTimeMinutes).toBeNull();
    expect(cp.accuracy).toBe(0);
    expect(cp.waitTimes).toEqual([]);
  });
});

describe("GET /api/checkpoints — global list keeps one row per checkpoint with latest values", () => {
  it("includes the airport's checkpoints exactly once with newest-report values", async () => {
    const res = await request(app).get("/api/checkpoints");
    expect(res.status).toBe(200);
    const rows = res.body.data.filter(
      (cp: { airportCode: string }) => cp.airportCode === AIRPORT_CODE,
    );
    expect(rows).toHaveLength(2);
    const reported = rows.find((r: { id: string }) => r.id === reportedCpId);
    expect(reported.latestWaitTimeMinutes).toBe(NEWEST.minutes);
    const empty = rows.find((r: { id: string }) => r.id === emptyCpId);
    expect(empty.latestWaitTimeMinutes).toBeNull();
  });
});

describe("GET /api/checkpoints/:id — single checkpoint view keeps latest values", () => {
  it("shows the newest report in the latest fields and desc history", async () => {
    const res = await request(app).get(`/api/checkpoints/${reportedCpId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.latestWaitTimeMinutes).toBe(NEWEST.minutes);
    expect(res.body.data.waitTimes[0].minutes).toBe(NEWEST.minutes);
    expect(res.body.data.waitTimes).toHaveLength(3);
  });

  it("shows nulls and empty history for a no-report checkpoint", async () => {
    const res = await request(app).get(`/api/checkpoints/${emptyCpId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.latestWaitTimeMinutes).toBeNull();
    expect(res.body.data.latestReportedAt).toBeNull();
    expect(res.body.data.waitTimes).toEqual([]);
  });
});

describe("GET /api/checkpoints/:id with 3-letter code — airport delegation", () => {
  it("delegates to the airport view with identical latest-wins semantics", async () => {
    const res = await request(app).get(`/api/checkpoints/${AIRPORT_CODE}`);
    expect(res.status).toBe(200);
    const cp = res.body.data.find((c: { id: string }) => c.id === reportedCpId);
    expect(cp.latestWaitTimeMinutes).toBe(NEWEST.minutes);
    const empty = res.body.data.find((c: { id: string }) => c.id === emptyCpId);
    expect(empty.latestWaitTimeMinutes).toBeNull();
  });
});
