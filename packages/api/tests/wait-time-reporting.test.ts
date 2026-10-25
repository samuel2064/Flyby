import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";
import { hashPassword, signToken } from "../src/auth";

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
let airportId = "";
let testUserEmail = "test-user-wait-time@flyby.test";
let testUserToken = "";
let testUserId = "";

async function setupTestUser() {
  const existing = await prisma.user.findUnique({ where: { email: testUserEmail } });
  if (existing) {
    testUserId = existing.id;
    testUserToken = signToken({ sub: existing.id });
    return;
  }
  const user = await prisma.user.create({
    data: { email: testUserEmail, passwordHash: hashPassword("TestPassword123!"), displayName: "Test User" },
  });
  testUserId = user.id;
  testUserToken = signToken({ sub: user.id });
}

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const cp = await prisma.checkpoint.findFirst({
    include: { airport: { select: { code: true, id: true } } },
  });
  expect(cp).not.toBeNull();
  checkpointId = cp!.id;
  airportCode = cp!.airport.code;
  airportId = cp!.airport.id;

  await setupTestUser();
}, 60000);

afterAll(async () => {
  await prisma.waitTime.deleteMany({ where: { userId: testUserId } });
  await prisma.user.deleteMany({ where: { email: testUserEmail } });
  await prisma.$disconnect();
}, 30000);

beforeEach(async () => {
  await prisma.waitTime.deleteMany();
});

describe("POST /api/reports — comprehensive validation", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("rejects missing checkpointId", async () => {
    const res = await request(app).post("/api/reports").send({ minutes: 15, source: "crowd" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("checkpointId");
  });

  it("rejects invalid checkpointId format with 400", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: "not-a-valid-id", minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("rejects non-existent checkpointId with 404", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: "00000000-0000-0000-0000-000000000000", minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Checkpoint not found");
  });

  const nonExistentCheckpointId = "00000000-0000-0000-0000-000000000000";

  it("rejects missing minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid wait time minutes");
  });

  it("rejects negative minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: -5, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid wait time minutes");
  });

  it("rejects minutes > 300", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 301, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid wait time minutes");
  });

  it("rejects float minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 15.5, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid wait time minutes");
  });

  it("rejects non-numeric minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: "fifteen", source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid wait time minutes");
  });

  it("rejects missing reportedAt", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 15, source: "crowd" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt is required");
  });

  it("rejects invalid reportedAt format", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 15, source: "crowd", reportedAt: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt must be a valid ISO date string");
  });

  it("rejects future reportedAt (beyond 5 min clock skew)", async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 15, source: "crowd", reportedAt: futureDate });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt cannot be in the future");
  });

  it("rejects reportedAt older than 30 days", async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: nonExistentCheckpointId, minutes: 15, source: "crowd", reportedAt: oldDate });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reportedAt cannot be older than 30 days");
  });

  it("accepts valid reportedAt within 5 min clock skew", async () => {
    const nearFuture = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "crowd", reportedAt: nearFuture });
    expect(res.status).toBe(201);
  });

  it("defaults invalid source to crowd on reports endpoint", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "invalid_source", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });

  it("defaults source to crowd when not specified", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });

  it("accepts official source", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "official", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("official");
  });

it("defaults invalid source to crowd on checkpoints endpoint", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, source: "unknown", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });

  it("accepts lineType standard", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "standard", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("standard");
  });

  it("accepts lineType preclear", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("accepts lineType clear", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "clear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("clear");
  });

  it("rejects invalid lineType", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "invalid", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid lineType");
  });

  it("accepts reportType as alternative to lineType", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("rejects invalid reportType", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportType: "invalid", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid reportType");
  });

  it("accepts waitTimeMinutes as alias for minutes", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, waitTimeMinutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(15);
  });

  it("accepts timestamp as alias for reportedAt", async () => {
    const timestamp = new Date().toISOString();
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, timestamp });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBe(timestamp);
  });

  it("creates a report with all expected fields", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 25, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("checkpointId", cpId);
    expect(res.body.data).toHaveProperty("minutes", 25);
    expect(res.body.data).toHaveProperty("source", "crowd");
    expect(res.body.data).toHaveProperty("reportType", "standard");
    expect(res.body.data).toHaveProperty("reportedAt");
  });

  it("associates report with authenticated user when JWT provided", async () => {
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId", testUserId);
  });

  it("sets userId to null when no auth token provided", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId", null);
  });
});

describe("POST /api/checkpoints/:id/wait-times — comprehensive validation", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("rejects invalid checkpoint id format with 400", async () => {
    const res = await request(app)
      .post("/api/checkpoints/invalid-id/wait-times")
      .send({ minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("rejects non-existent checkpoint with 404", async () => {
    const res = await request(app)
      .post("/api/checkpoints/00000000-0000-0000-0000-000000000000/wait-times")
      .send({ minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(404);
  });

  it("accepts minutes = 0 (boundary)", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 0, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(0);
  });

  it("accepts minutes = 1 (lower positive boundary)", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 1, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(1);
  });

  it("accepts minutes = 300 (upper boundary)", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 300, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(300);
  });

  it("rejects minutes = 301 (exceeds max)", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 301, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it("defaults source to crowd when not provided", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("crowd");
  });

  it("returns response with all expected fields", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 25, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("checkpointId", cpId);
    expect(res.body.data).toHaveProperty("minutes", 25);
    expect(res.body.data).toHaveProperty("source", "crowd");
    expect(res.body.data).toHaveProperty("reportType", "standard");
    expect(res.body.data).toHaveProperty("reportedAt");
  });

  it("sets reportType to standard by default", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 10, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("standard");
  });

  it("accepts custom reportedAt from client", async () => {
    const reportedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, source: "crowd", reportedAt });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBe(reportedAt);
  });

  it("accepts lineType preclear", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, lineType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("accepts lineType clear", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, lineType: "clear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("clear");
  });

  it("rejects invalid lineType", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, lineType: "invalid", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid lineType");
  });

  it("accepts reportType as alternative to lineType", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, reportType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.reportType).toBe("preclear");
  });

  it("rejects invalid reportType", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, reportType: "invalid", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid reportType");
  });

  it("accepts waitTimeMinutes as alias for minutes", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ waitTimeMinutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(15);
  });

  it("accepts timestamp as alias for reportedAt", async () => {
    const timestamp = new Date().toISOString();
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .send({ minutes: 15, timestamp });
    expect(res.status).toBe(201);
    expect(res.body.data.reportedAt).toBe(timestamp);
  });

  it("associates report with authenticated user when JWT provided", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({ minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId", testUserId);
  });
});

describe("GET /api/checkpoints/:id/history — validation and edge cases", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("returns 400 for invalid checkpoint id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id/history");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for non-existent checkpoint", async () => {
    const res = await request(app).get("/api/checkpoints/00000000-0000-0000-0000-000000000000/history");
    expect(res.status).toBe(404);
  });

  it("returns history for valid checkpoint", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("respects hours parameter", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=2`);
    expect(res.status).toBe(200);
  });

  it("defaults to 6 hours when hours omitted", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history`);
    expect(res.status).toBe(200);
  });

  it("rejects hours < 1", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=0`);
    expect(res.status).toBe(400);
  });

  it("rejects hours > 24", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=25`);
    expect(res.status).toBe(400);
  });

  it("rejects non-integer hours", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=1.5`);
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric hours", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=abc`);
    expect(res.status).toBe(400);
  });

  it("rejects empty string hours", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=`);
    expect(res.status).toBe(400);
  });

  it("returns bucketed data with correct structure", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/history?hours=6`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const bucket = res.body.data[0];
      expect(bucket).toHaveProperty("bucket");
      expect(bucket).toHaveProperty("minutes");
      expect(bucket).toHaveProperty("count");
      expect(typeof bucket.minutes).toBe("number");
      expect(typeof bucket.count).toBe("number");
    }
  });
});

describe("GET /api/checkpoints/:id/stats — validation and aggregation", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("returns 400 for invalid checkpoint id format", async () => {
    const res = await request(app).get("/api/checkpoints/invalid-id/stats");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for non-existent checkpoint", async () => {
    const res = await request(app).get("/api/checkpoints/00000000-0000-0000-0000-000000000000/stats");
    expect(res.status).toBe(404);
  });

  it("returns aggregated stats for valid checkpoint (default 24h)", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.data.checkpointId).toBe(cpId);
    expect(res.body.data.windowHours).toBe(24);
    expect(typeof res.body.data.count).toBe("number");
    expect(Array.isArray(res.body.data.byReportType)).toBe(true);
    expect(Array.isArray(res.body.data.byHourOfDay)).toBe(true);
  });

  it("respects hours parameter", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(2);
  });

  it("accepts hours at lower boundary (1)", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=1`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(1);
  });

  it("accepts hours at upper boundary (168)", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=168`);
    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(168);
  });

  it("rejects hours < 1", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=0`);
    expect(res.status).toBe(400);
  });

  it("rejects hours > 168", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=169`);
    expect(res.status).toBe(400);
  });

  it("rejects non-integer hours", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=1.5`);
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric hours", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=abc`);
    expect(res.status).toBe(400);
  });

  it("returns correct aggregation structure", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=24`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toHaveProperty("count");
    expect(d).toHaveProperty("min");
    expect(d).toHaveProperty("max");
    expect(d).toHaveProperty("avg");
    expect(d).toHaveProperty("median");
    expect(d).toHaveProperty("p90");
    expect(d).toHaveProperty("byReportType");
    expect(d).toHaveProperty("byHourOfDay");
    expect(d).toHaveProperty("trend");
    expect(Array.isArray(d.byReportType)).toBe(true);
    expect(Array.isArray(d.byHourOfDay)).toBe(true);
  });
});

describe("GET /api/checkpoints/airport/:code — airport-specific endpoints", () => {
  it("returns 400 for invalid airport code format", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XX");
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent airport code", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XXX");
    expect(res.status).toBe(404);
  });

  it("returns checkpoints for valid airport code", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${airportCode}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty("airportCode", airportCode);
    expect(res.body.data[0]).toHaveProperty("airportName");
    expect(res.body.data[0]).toHaveProperty("latestWaitTimeMinutes");
    expect(res.body.data[0]).toHaveProperty("accuracy");
    expect(res.body.data[0]).toHaveProperty("estimatedWaitTimeMinutes");
  });

  it("includes last 30 reports per checkpoint", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${airportCode}`);
    expect(res.status).toBe(200);
    if (res.body.data.length > 0 && res.body.data[0].waitTimes) {
      expect(Array.isArray(res.body.data[0].waitTimes)).toBe(true);
      expect(res.body.data[0].waitTimes.length).toBeLessThanOrEqual(30);
    }
  });

  it("returns checkpoints with accuracy and estimated wait time", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${airportCode}`);
    expect(res.status).toBe(200);
    for (const cp of res.body.data) {
      expect(typeof cp.accuracy).toBe("number");
      expect(cp.accuracy).toBeGreaterThanOrEqual(0);
      expect(cp.accuracy).toBeLessThanOrEqual(100);
      expect(cp.estimatedWaitTimeMinutes === null || typeof cp.estimatedWaitTimeMinutes === "number").toBe(true);
    }
  });
});

describe("GET /api/checkpoints/airport/:code/live — SSE endpoint", () => {
  it("returns 400 for invalid airport code format", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XX/live");
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent airport code", async () => {
    const res = await request(app).get("/api/checkpoints/airport/XXX/live");
    expect(res.status).toBe(404);
  });

  it("returns SSE headers for valid airport", async () => {
    const res = await request(app).get(`/api/checkpoints/airport/${airportCode}/live`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);
});

describe("GET /api/checkpoints/:id/stream — SSE endpoint", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("returns 400 for invalid checkpoint id format", async () => {
    const res = await request(app).get("/api/checkpoints/nonexistent-id/stream");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for non-existent checkpoint (valid UUID format)", async () => {
    const res = await request(app).get("/api/checkpoints/00000000-0000-0000-0000-000000000000/stream");
    expect(res.status).toBe(404);
  });

  it("returns SSE headers for valid checkpoint", async () => {
    const res = await request(app).get(`/api/checkpoints/${cpId}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);
});

describe("GET /api/checkpoints/stream — global SSE endpoint", () => {
  it("returns SSE headers for global stream", async () => {
    const res = await request(app).get("/api/checkpoints/stream");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  }, 10000);
});

describe("Rate limiting — comprehensive tests", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("rate limits reports to 1 per 30 seconds per session", async () => {
    const sessionId = "rate-limit-test-" + Date.now();

    const res1 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 20, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res2.status).toBe(429);
    expect(res2.body.retryAfter).toBeDefined();
    expect(typeof res2.body.retryAfter).toBe("number");
    expect(res2.body.error).toContain("Rate limit exceeded");
  });

  it("allows different sessions to post independently", async () => {
    const sessionA = "session-a-" + Date.now();
    const sessionB = "session-b-" + Date.now();

    const resA = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionA)
      .send({ checkpointId: cpId, minutes: 5, source: "crowd", reportedAt: new Date().toISOString() });
    expect(resA.status).toBe(201);

    const resB = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionB)
      .send({ checkpointId: cpId, minutes: 7, source: "crowd", reportedAt: new Date().toISOString() });
    expect(resB.status).toBe(201);
  });

  it("rate limits apply to both /api/reports and /api/checkpoints/:id/wait-times", async () => {
    const sessionId = "rate-limit-cross-endpoint-" + Date.now();

    const res1 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("X-Session-Id", sessionId)
      .send({ minutes: 20, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res2.status).toBe(429);
  });
});

describe("Authenticated user association", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("associates report with user via /api/reports", async () => {
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(testUserId);
  });

  it("associates report with user via /api/checkpoints/:id/wait-times", async () => {
    const res = await request(app)
      .post(`/api/checkpoints/${cpId}/wait-times`)
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({ minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(testUserId);
  });

  it("sets userId to null when token is invalid", async () => {
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", "Bearer invalid-token")
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId", null);
  });

  it("sets userId to null when no token provided", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId", null);
  });
});

describe("Performance — high volume scenarios", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("handles 100 sequential reports without errors", async () => {
    const sessionId = "perf-test-" + Date.now();
    const promises = [];

    for (let i = 0; i < 100; i++) {
      promises.push(
        request(app)
          .post("/api/reports")
          .set("X-Session-Id", sessionId + "-" + i)
          .send({ checkpointId: cpId, minutes: 10 + (i % 50), source: "crowd", reportedAt: new Date().toISOString() })
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 201).length;
    expect(successCount).toBe(100);
  });

  it("handles concurrent requests to same checkpoint", async () => {
    const numConcurrent = 50;
    const promises = [];

    for (let i = 0; i < numConcurrent; i++) {
      promises.push(
        request(app)
          .post("/api/reports")
          .set("X-Session-Id", `concurrent-${i}`)
          .send({ checkpointId: cpId, minutes: 10 + i, source: "crowd", reportedAt: new Date().toISOString() })
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 201).length;
    expect(successCount).toBe(numConcurrent);
  });

  it("handles rapid history queries", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const promises = Array(20).fill(null).map(() =>
      request(app).get(`/api/checkpoints/${cpId}/history?hours=6`)
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 200).length;
    expect(successCount).toBe(20);
  });

  it("handles rapid stats queries", async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    const cpId = checkpointsRes.body.data[0].id;

    const promises = Array(20).fill(null).map(() =>
      request(app).get(`/api/checkpoints/${cpId}/stats?hours=24`)
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 200).length;
    expect(successCount).toBe(20);
  });
});

describe("SSE connection handling", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("handles multiple SSE connections", async () => {
    const promises = Array(10).fill(null).map(() =>
      request(app).get(`/api/checkpoints/${cpId}/stream`)
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 200).length;
    expect(successCount).toBe(10);
  });

  it("global stream handles multiple connections", async () => {
    const promises = Array(10).fill(null).map(() =>
      request(app).get("/api/checkpoints/stream")
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 200).length;
    expect(successCount).toBe(10);
  });
});

describe("Database integration — Prisma backend", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
    await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });
  });

  afterEach(async () => {
    await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });
  });

  it("persists wait time reports to database", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 22, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);

    const dbReport = await prisma.waitTime.findUnique({ where: { id: res.body.data.id } });
    expect(dbReport).not.toBeNull();
    expect(dbReport!.minutes).toBe(22);
    expect(dbReport!.source).toBe("crowd");
    expect(dbReport!.reportType).toBe("standard");
  });

  it("stores report with user association when authenticated", async () => {
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({ checkpointId: cpId, minutes: 33, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);

    const dbReport = await prisma.waitTime.findUnique({ where: { id: res.body.data.id } });
    expect(dbReport).not.toBeNull();
    expect(dbReport!.userId).toBe(testUserId);
  });

  it("stores lineType/reportType correctly", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, lineType: "preclear", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);

    const dbReport = await prisma.waitTime.findUnique({ where: { id: res.body.data.id } });
    expect(dbReport).not.toBeNull();
    expect(dbReport!.reportType).toBe("preclear");
  });

  it("stores source correctly (official vs crowd)", async () => {
    const resOfficial = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "official", reportedAt: new Date().toISOString() });
    expect(resOfficial.status).toBe(201);

    const dbOfficial = await prisma.waitTime.findUnique({ where: { id: resOfficial.body.data.id } });
    expect(dbOfficial!.source).toBe("official");

    const resCrowd = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, source: "crowd", reportedAt: new Date().toISOString() });
    expect(resCrowd.status).toBe(201);

    const dbCrowd = await prisma.waitTime.findUnique({ where: { id: resCrowd.body.data.id } });
    expect(dbCrowd!.source).toBe("crowd");
  });

  it("stores custom reportedAt correctly", async () => {
    const reportedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportedAt });
    expect(res.status).toBe(201);

    const dbReport = await prisma.waitTime.findUnique({ where: { id: res.body.data.id } });
    expect(dbReport).not.toBeNull();
    expect(new Date(dbReport!.reportedAt).toISOString()).toBe(reportedAt);
  });

  it("returns correct data after database persistence", async () => {
    await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 42, source: "crowd", reportedAt: new Date().toISOString() });

    const getRes = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.latestWaitTimeMinutes).toBe(42);
    expect(getRes.body.data.source).toBe("crowd");
  });

  it("history endpoint reflects new reports", async () => {
    await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 55, reportedAt: new Date().toISOString() });

    const historyRes = await request(app).get(`/api/checkpoints/${cpId}/history?hours=6`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);
    const latest = historyRes.body.data[historyRes.body.data.length - 1];
    expect(latest.minutes).toBe(55);
  });

  it("stats endpoint reflects new reports", async () => {
    await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 60, reportedAt: new Date().toISOString() });

    const statsRes = await request(app).get(`/api/checkpoints/${cpId}/stats?hours=1`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.count).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.data.max).toBeGreaterThanOrEqual(60);
  });
});

describe("Edge cases and error handling", () => {
  let cpId: string;

  beforeEach(async () => {
    const checkpointsRes = await request(app).get("/api/checkpoints");
    cpId = checkpointsRes.body.data[0].id;
  });

  it("handles very large request bodies gracefully", async () => {
    const largePayload = {
      checkpointId: cpId,
      minutes: 15,
      reportedAt: new Date().toISOString(),
      extraField1: "x".repeat(10000),
      extraField2: "y".repeat(10000),
    };

    const res = await request(app).post("/api/reports").send(largePayload);
    expect([201, 400]).toContain(res.status);
  });

  it("handles empty request body", async () => {
    const res = await request(app).post("/api/reports").send({});
    expect(res.status).toBe(400);
  });

  it("handles null values in request", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: null, reportedAt: null });
    expect(res.status).toBe(400);
  });

  it("handles concurrent rate limit windows correctly", async () => {
    const sessionId = "concurrent-window-test-" + Date.now();
    const promises = Array(5).fill(null).map((_, i) =>
      request(app)
        .post("/api/reports")
        .set("X-Session-Id", sessionId)
        .send({ checkpointId: cpId, minutes: 10 + i, source: "crowd", reportedAt: new Date().toISOString() })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 201).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    expect(successCount + rateLimitedCount).toBe(5);
    expect(successCount).toBe(1);
  });

  it("handles malformed JSON gracefully", async () => {
    const res = await request(app)
      .post("/api/reports")
      .set("Content-Type", "application/json")
      .send("not valid json");
    expect([400, 422, 500]).toContain(res.status);
  });

  it("handles missing Content-Type header", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 15, reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
  });
});