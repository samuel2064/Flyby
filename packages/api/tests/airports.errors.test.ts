import request from "supertest";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import * as seed from "../prisma/seed";

// Mock Redis to avoid real connections in tests
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

beforeAll(async () => {
  await seed.main();
});

describe("GET /api/airports — error path recovery", () => {
  let originalFindMany: any;

  beforeEach(() => {
    originalFindMany = prisma.airport.findMany;
  });

  afterEach(() => {
    prisma.airport.findMany = originalFindMany;
  });

  it("returns 500 on database failure during text search", async () => {
    prisma.airport.findMany = vi.fn().mockRejectedValue(new Error("DB connection lost"));

    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");

    // Restore and verify recovery
    prisma.airport.findMany = originalFindMany;
    const res2 = await request(app).get("/api/airports?q=JFK");
    expect(res2.status).toBe(200);
    expect(Array.isArray(res2.body.data)).toBe(true);
  });

  it("returns 500 on database failure during geo search", async () => {
    prisma.airport.findMany = vi.fn().mockRejectedValue(new Error("DB connection lost"));

    const res = await request(app).get("/api/airports?lat=33.64&lng=-84.42&radiusMiles=5");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");

    // Restore and verify recovery
    prisma.airport.findMany = originalFindMany;
    const res2 = await request(app).get("/api/airports?lat=33.64&lng=-84.42&radiusMiles=5");
    expect(res2.status).toBe(200);
    expect(Array.isArray(res2.body.data)).toBe(true);
  });
});

describe("GET /api/airports/:code — error path", () => {
  let originalFindUnique: any;

  beforeEach(() => {
    originalFindUnique = prisma.airport.findUnique;
  });

  afterEach(() => {
    prisma.airport.findUnique = originalFindUnique;
  });

  it("returns 500 when database fails during airport detail lookup", async () => {
    prisma.airport.findUnique = vi.fn().mockRejectedValue(new Error("DB down"));

    const res = await request(app).get("/api/airports/JFK");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");

    // Restore and verify recovery
    prisma.airport.findUnique = originalFindUnique;
    const res2 = await request(app).get("/api/airports/JFK");
    expect(res2.status).toBe(200);
    expect(res2.body.data.code).toBe("JFK");
  });

  it("accepts the deploy-side apt-id form (apt-jfk) on the detail route", async () => {
    const res = await request(app).get("/api/airports/apt-jfk");
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("JFK");
  });

  it("404s unknown apt-ids, never guessing", async () => {
    const res = await request(app).get("/api/airports/apt-zzz");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/airports — geo search validation", () => {
  it("rejects invalid latitude (NaN)", async () => {
    const res = await request(app).get("/api/airports?lat=abc&lng=-84.42&radiusMiles=5");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid lat, lng, or radiusMiles");
  });

  it("rejects invalid longitude (NaN)", async () => {
    const res = await request(app).get("/api/airports?lat=33.64&lng=xyz&radiusMiles=5");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid lat, lng, or radiusMiles");
  });

  it("rejects invalid radiusMiles (NaN)", async () => {
    const res = await request(app).get("/api/airports?lat=33.64&lng=-84.42&radiusMiles=foo");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid lat, lng, or radiusMiles");
  });

  it("returns results filtered by distance", async () => {
    // Use a very small radius to ensure filtering logic is exercised
    const res = await request(app).get("/api/airports?lat=33.64&lng=-84.42&radiusMiles=0.001");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should return empty or very few results for such a small radius
  });
});

describe("GET /api/airports — exact code match boost", () => {
  it("boosts exact code match to top of results", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    // JFK should be first due to exact code match boost
    expect(res.body.data[0].code).toBe("JFK");
  });

  it("boosts exact code match for LAX", async () => {
    const res = await request(app).get("/api/airports?q=LAX");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].code).toBe("LAX");
  });
});
