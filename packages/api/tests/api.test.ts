import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";

const prisma = new PrismaClient();

// Mock Redis to avoid real connections in tests
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// Setup DB before tests and clean up after
beforeAll(async () => {
  // Clean existing data
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();

  // Seed fresh test data
  await seed.main();
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
}, 30000);

describe("GET /health", () => {
  it("returns healthy status with service checks", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.services.database).toBe("ok");
    expect(res.body.services.redis).toBe("ok");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime_seconds");
    expect(res.body).toHaveProperty("environment");
    expect(res.body).toHaveProperty("version");
  });
});

describe("GET /api/health (alias required by docker-compose + Dockerfile HEALTHCHECK)", () => {
  it("returns the same healthy payload as /health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.services.database).toBe("ok");
    expect(res.body.services.redis).toBe("ok");
    expect(res.body).toHaveProperty("timestamp");
  });
});

describe("GET /api/airports (deploy contract: bare lists all) — TIR-339", () => {
  it("returns the full airport directory with flat rows", async () => {
    const res = await request(app).get("/api/airports");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.airports)).toBe(true);
    expect(res.body.airports.length).toBeGreaterThan(0);
    const jfk = res.body.airports.find((a: { code: string }) => a.code === "JFK");
    expect(jfk).toBeDefined();
    expect(jfk.id).toBe("apt-jfk");
    expect(jfk.timezone).toBe("America/New_York");
  });

  it("with q= runs the native search", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].code).toBe("JFK");
  });

  it("geospatial behavior unchanged", async () => {
    const res = await request(app).get("/api/airports?lat=33.64&lng=-84.42&radiusMiles=5");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const empty = await request(app).get("/api/airports?lat=0&lng=0&radiusMiles=1");
    expect(empty.body.data.length).toBe(0);
  });
});


describe("GET /api/airports/search", () => {
  it("requires a query", async () => {
    const res = await request(app).get("/api/airports/search");
    expect(res.status).toBe(400);
  });

  it("requires at least 2 characters", async () => {
    const res = await request(app).get("/api/airports/search?q=a");
    expect(res.status).toBe(400);
  });

  it("finds airports by code", async () => {
    const res = await request(app).get("/api/airports/search?q=JFK");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].code).toBe("JFK");
  });

  it("finds airports by city name", async () => {
    const res = await request(app).get("/api/airports/search?q=Los Angeles");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe("GET /api/airports/:code", () => {
  it("returns airport not found for invalid code", async () => {
    const res = await request(app).get("/api/airports/XXX");
    expect(res.status).toBe(404);
  });

  it("returns airport with checkpoints for valid code", async () => {
    const res = await request(app).get("/api/airports/JFK");
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("JFK");
    expect(Array.isArray(res.body.data.checkpoints)).toBe(true);
    expect(res.body.data.checkpoints.length).toBeGreaterThan(0);
  });

  it("deploy-compat: apt-<code> ids resolve to the same airport", async () => {
    const res = await request(app).get("/api/airports/apt-jfk");
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("JFK");
  });
});

describe("GET /api/dashboard", () => {
  it("returns dashboard summary and breakdown", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("summary");
    expect(res.body.data).toHaveProperty("accuracyHistory");
    expect(res.body.data).toHaveProperty("checkpoints");
    expect(res.body.data.summary).toHaveProperty("avgAccuracy");
    expect(res.body.data.summary).toHaveProperty("generationSuccessRate");
    expect(res.body.data.summary).toHaveProperty("avgProcessingTime");
    expect(res.body.data.summary).toHaveProperty("totalCheckpoints");
    expect(res.body.data.summary).toHaveProperty("totalReports");
    expect(Array.isArray(res.body.data.checkpoints)).toBe(true);
  });

  it("returns accuracy as a number between 0 and 100", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    for (const cp of res.body.data.checkpoints) {
      expect(typeof cp.accuracy).toBe("number");
      expect(cp.accuracy).toBeGreaterThanOrEqual(0);
      expect(cp.accuracy).toBeLessThanOrEqual(100);
    }
  });
});

describe("GET /api/checkpoints", () => {
  it("returns list of checkpoints", async () => {
    const res = await request(app).get("/api/checkpoints");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("includes accuracy and estimated wait time", async () => {
    const res = await request(app).get("/api/checkpoints");
    expect(res.status).toBe(200);
    const first = res.body.data[0];
    expect(typeof first.accuracy).toBe("number");
    expect(first.accuracy).toBeGreaterThanOrEqual(0);
    expect(first.accuracy).toBeLessThanOrEqual(100);
  });
});

describe("GET /api/checkpoints/:id", () => {
  it("returns 400 for invalid id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns checkpoint with wait time history", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(cpId);
    expect(Array.isArray(res.body.data.waitTimes)).toBe(true);
    expect(typeof res.body.data.accuracy).toBe("number");
    expect(res.body.data.accuracy).toBeGreaterThanOrEqual(0);
    expect(res.body.data.accuracy).toBeLessThanOrEqual(100);
  });

  it("handles checkpoint with no wait times (null values)", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("latestWaitTimeMinutes");
    expect(res.body.data).toHaveProperty("latestReportedAt");
    expect(res.body.data).toHaveProperty("source");
    expect(res.body.data).toHaveProperty("reportType");
  });
});

describe("GET /api/checkpoints/:id/history", () => {
  it("returns 400 for invalid id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id/history");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns history for valid checkpoint", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("respects hours parameter", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=2`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("rejects non-numeric hours with 400", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer");
  });

  it("rejects hours > 24 with 400", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=25`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer");
  });

  it("rejects hours < 1 with 400", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer");
  });

  it("accepts hours at boundary (1)", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("accepts hours at boundary (24)", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=24`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("defaults to 6 hours when hours is omitted", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("rejects empty string hours with 400", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hours must be a positive integer");
  });
});

describe("POST /api/reports", () => {
  it("rejects missing checkpointId", async () => {
    const res = await request(app).post("/api/reports").send({ minutes: 15, source: "crowd" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: "invalid-id", minutes: -5, source: "crowd" });
    expect(res.status).toBe(400);
  });

  it("rejects float minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: "some-id", minutes: 15.5, source: "crowd" });
    expect(res.status).toBe(400);
  });

  it("creates a report for valid checkpoint", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(15);
    expect(res.body.data.checkpointId).toBe(cpId);
  });

  it("rate limits reports", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "rate-limit-test-session";

    // First report should succeed
    const res1 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res1.status).toBe(201);

    // Second report within 30s from same session should be rate limited
    const res2 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 20, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res2.status).toBe(429);
    expect(res2.body.retryAfter).toBeDefined();
  });
});

describe("POST /api/checkpoints/:id/wait-times", () => {
  it("rejects invalid minutes", async () => {
    const res = await request(app)
      .post("/api/checkpoints/invalid-id/wait-times")
      .send({ minutes: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects float minutes", async () => {
    const res = await request(app)
      .post("/api/checkpoints/invalid-id/wait-times")
      .send({ minutes: 22.7 });
    expect(res.status).toBe(400);
  });

  it("creates a wait time report for valid checkpoint", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "wait-time-test-session-1";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(15);
    expect(res.body.data.checkpointId).toBe(cpId);
  });

  it("defaults source to crowd", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "wait-time-test-session-2";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 20, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });
});

describe("GET /api/checkpoints/:id/stream", () => {
  it("returns 400 for invalid id format", async () => {
    const res = await request(app).get("/api/checkpoints/nonexistent-id/stream");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns SSE headers for valid checkpoint", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app).get(`/api/checkpoints/${cpId}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);
});

describe("GET /api/checkpoints/stream", () => {
  it("returns SSE headers for global stream", async () => {
    const res = await request(app).get("/api/checkpoints/stream");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);
});

describe("POST /api/checkpoints/:id/wait-times — edge cases", () => {
  it("accepts minutes = 0 (boundary)", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 0, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(0);
  });

  it("accepts minutes = 300 (upper boundary)", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 300, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(300);
  });

  it("rejects minutes = 301 (exceeds max)", async () => {
    const res = await request(app)
      .post("/api/checkpoints/invalid-id/wait-times")
      .send({ minutes: 301 });
    expect(res.status).toBe(400);
  });

  it("defaults invalid source to crowd", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-edge-source-unknown";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "unknown_source_value", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });

  it("returns response with all expected fields", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-edge-fields-test";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 25, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("checkpointId", cpId);
    expect(res.body.data).toHaveProperty("minutes", 25);
    expect(res.body.data).toHaveProperty("source", "crowd");
    expect(res.body.data).toHaveProperty("reportType", "standard");
    expect(res.body.data).toHaveProperty("reportedAt");
    expect(new Date(res.body.data.reportedAt).toISOString()).toBe(res.body.data.reportedAt);
  });

  it("sets reportType to standard by default", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-edge-report-type";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 10, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("standard");
  });

  it("accepts custom reportedAt from client", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-valid";
    const reportedAt = new Date(Date.now() - 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBe(reportedAt);
  });

  it("rejects future reportedAt", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-future";
    const reportedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("future");
  });

  it("rejects invalid reportedAt string", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-invalid";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("valid ISO date");
  });

  it("rejects reportedAt older than 30 days", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-old";
    const reportedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("older than 30 days");
  });

  it("rejects when reportedAt is not provided", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-missing";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt is required");
  });

  it("rejects when reportedAt is null", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "api-reported-at-null";

    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 15, source: "crowd", reportedAt: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt is required");
  });

  it("rejects when reportedAt is not provided via /api/reports", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ minutes: 15, source: "crowd", checkpointId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt is required");
  });

  it("creates a report with valid reportedAt via /api/reports", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    expect(cpId).toBeDefined();

    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBeDefined();
  });

  it("rejects when checkpointId is missing", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing checkpointId");
  });

  it("accepts lineType preclear on POST /api/reports", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "line-type-preclear";

    const res = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 20, lineType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("accepts lineType clear on POST /api/reports", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "line-type-clear";

    const res = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 10, lineType: "clear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("clear");
  });

  it("rejects invalid lineType", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "invalid_type", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid lineType");
  });

  it("accepts reportType as alternative to lineType", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "report-type-alt";

    const res = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 25, reportType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("accepts waitTimeMinutes as alias for minutes", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "wait-time-minutes-alias";

    const res = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, waitTimeMinutes: 35, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(35);
  });

  it("accepts timestamp as alias for reportedAt", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;
    const sessionId = "timestamp-alias";

    const res = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 15, source: "crowd", timestamp: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBeDefined();
  });
});

describe("GET /api/checkpoints/airport/:code", () => {
  it("returns checkpoints for a valid airport code", async () => {
    const res = await request(app).get("/api/checkpoints/airport/JFK");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].airportCode).toBe("JFK");
  });

  it("returns checkpoints with accuracy and estimated wait time", async () => {
    const res = await request(app).get("/api/checkpoints/airport/JFK");
    expect(res.status).toBe(200);
    for (const cp of res.body.data) {
      expect(typeof cp.accuracy).toBe("number");
      expect(cp.accuracy).toBeGreaterThanOrEqual(0);
      expect(cp.accuracy).toBeLessThanOrEqual(100);
    }
  });

  it("returns 404 for non-existent airport code", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XXX");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid airport code format", async () => {
    const res = await request(app).get("/api/checkpoints/airport/INVALID");
    expect(res.status).toBe(400);
  });

  it("returns last 30 reports per checkpoint", async () => {
    const res = await request(app).get("/api/checkpoints/airport/JFK");
    expect(res.status).toBe(200);
    for (const cp of res.body.data) {
      expect(Array.isArray(cp.waitTimes)).toBe(true);
      expect(cp.waitTimes.length).toBeLessThanOrEqual(30);
    }
  });
});

describe("GET /api/checkpoints/:id with airport code", () => {
  it("returns checkpoints when given a valid airport code", async () => {
    const res = await request(app).get("/api/checkpoints/JFK");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].airportCode).toBe("JFK");
  });

  it("returns 404 for non-existent airport code", async () => {
    const res = await request(app).get("/api/checkpoints/XXX");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/checkpoints/airport/:code/live", () => {
  it("returns SSE headers for valid airport", async () => {
    const res = await request(app).get("/api/checkpoints/airport/JFK/live");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);

  it("returns 404 for non-existent airport", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XXX/live");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/me", () => {
  it("returns anonymous session", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("createdAt");
    expect(res.body.data.reportsSubmitted).toBe(0);
  });
});

describe("PATCH /api/me", () => {
  it("updates session nickname", async () => {
    const res = await request(app).patch("/api/me").send({ nickname: "Traveler1" });
    expect(res.status).toBe(200);
    expect(res.body.data.nickname).toBe("Traveler1");
  });
});

describe("POST /v1/auth/signup", () => {
  it("requires email and password", async () => {
    const res = await request(app)
      .post("/v1/auth/signup")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("creates a new user", async () => {
    const res = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "test@example.com", password: "Password123!", displayName: "Test Traveler" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("test@example.com");
    expect(res.body.data.token).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    await request(app).post("/v1/auth/signup").send({ email: "dup@example.com", password: "Password123!" });

    const res = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "dup@example.com", password: "Password123!" });
    expect(res.status).toBe(409);
  });
});

describe("POST /v1/auth/login", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: "login@example.com" } });
  });

  it("requires email and password", async () => {
    const res = await request(app).post("/v1/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("logs in existing user", async () => {
    await request(app)
      .post("/v1/auth/signup")
      .send({ email: "login@example.com", password: "Password123!", displayName: "Test" });

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "login@example.com", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("login@example.com");
    expect(res.body.data.token).toBeDefined();
  });

  it("rejects invalid password", async () => {
    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "login@example.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/auth/me", () => {
  let userId = "";
  let token = "";

  beforeAll(async () => {
    const signup = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "profile@example.com", password: "Password123!" });
    userId = signup.body.data.user.id;
    token = signup.body.data.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/v1/auth/me").send({});
    expect(res.status).toBe(401);
  });

  it("returns user profile with valid bearer token", async () => {
    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("profile@example.com");
  });
});

describe("GET /metrics", () => {
  it("returns Prometheus metrics with correct content type", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    // Default Node.js metrics are always present
    expect(res.text).toContain("process_cpu_user_seconds_total");
    expect(res.text).toContain("nodejs_heap_size_total_bytes");
  });
});
describe("GET /v1/auth/me/reports", () => {
  let userId = "";
  let token = "";
  let checkpointId = "";

  beforeAll(async () => {
    const signup = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "reports@example.com", password: "Password123!" });
    userId = signup.body.data.user.id;
    token = signup.body.data.token;

    // Create a report attached to this user
    const checkpoint = await prisma.checkpoint.findFirst({});
    if (checkpoint) {
      checkpointId = checkpoint.id;
      await prisma.waitTime.create({
        data: {
          minutes: 25,
          source: "user",
          checkpointId: checkpoint.id,
          userId: userId,
          reportedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.waitTime.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/v1/auth/me/reports");
    expect(res.status).toBe(401);
  });

  it("returns user reports with valid bearer token", async () => {
    const res = await request(app)
      .get("/v1/auth/me/reports")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (checkpointId) {
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].minutes).toBe(25);
      expect(res.body.data[0].checkpoint).toBeDefined();
      expect(res.body.data[0].checkpoint.airport).toBeDefined();
    }
  });
});

describe("Security headers", () => {
  it("sets X-Content-Type-Options header", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options header", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-XSS-Protection header", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.headers["x-xss-protection"]).toBe("1; mode=block");
  });

  it("sets Referrer-Policy header", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy header", async () => {
    const res = await request(app).get("/api/airports?q=JFK");
    expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(self)");
  });

  it("includes security headers on 404 responses", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});


