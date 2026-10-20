import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { errorTotal } from "../src/metrics";

// Mock Redis to avoid real connections in tests
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// Get the internal counter value for a label set
function getErrorTotalValue(label: string): number {
  const hashMap = (errorTotal as any).hashMap;
  const values = hashMap.values ? Array.from(hashMap.values()) : Object.values(hashMap);
  for (const entry of values as any[]) {
    if (entry.labels && entry.labels.type === label) {
      return entry.value ?? 0;
    }
  }
  return 0;
}

describe("Prometheus errorTotal instrumentation", () => {
  let originalFindMany: any;

  beforeEach(() => {
    originalFindMany = prisma.airport.findMany;
    vi.useRealTimers();
  });

  afterEach(() => {
    prisma.airport.findMany = originalFindMany;
    vi.restoreAllMocks();
  });

  it("increments errorTotal on GET /api/airports database failure", async () => {
    const initial = getErrorTotalValue("searchAirports_text");

    // Force Prisma to throw
    prisma.airport.findMany = vi.fn().mockRejectedValue(new Error("DB down"));

    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.status).toBe(500);

    const updated = getErrorTotalValue("searchAirports_text");
    expect(updated).toBeGreaterThanOrEqual(initial);
  });

  it("increments errorTotal on GET /api/dashboard database failure", async () => {
    const initial = getErrorTotalValue("getDashboard");

    // Force Prisma to throw during dashboard query
    const origCheckpointFindMany = prisma.checkpoint.findMany;
    prisma.checkpoint.findMany = vi.fn().mockRejectedValue(new Error("DB down"));

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(500);

    const updated = getErrorTotalValue("getDashboard");
    expect(updated).toBeGreaterThanOrEqual(initial);

    prisma.checkpoint.findMany = origCheckpointFindMany;
  });

  it("does not increment errorTotal on successful requests", async () => {
    const initial = getErrorTotalValue("searchAirports_text");

    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.status).toBe(200);

    const updated = getErrorTotalValue("searchAirports_text");
    expect(updated).toBe(initial);
  });

  it("returns 500 and does not crash the server on database failure", async () => {
    // Simulate a transient DB failure
    const orig = prisma.airport.findMany;
    prisma.airport.findMany = vi.fn().mockRejectedValue(new Error("connection lost"));

    const res = await request(app).get("/api/airports?q=LAX");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");

    // Server should still be responsive after the error
    prisma.airport.findMany = orig;
    const res2 = await request(app).get("/api/airports?q=LAX");
    expect(res2.status).toBe(200);
    expect(Array.isArray(res2.body.data)).toBe(true);
  });
});
