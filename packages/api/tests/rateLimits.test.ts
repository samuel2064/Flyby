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

describe("POST /api/reports — rate limits", () => {
  beforeAll(async () => {
    await prisma.waitTime.deleteMany();
    await prisma.checkpoint.deleteMany();
    await prisma.airport.deleteMany();
    await prisma.user.deleteMany();
    await seed.main();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows a first report without a session ID", async () => {
    const checkpoints = await request(app).get("/api/checkpoints");
    const cpId = checkpoints.body.data[0].id;

    const res = await request(app)
      .post("/api/reports")
      .send({ checkpointId: cpId, minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res.status).toBe(201);
  });

  it("rate limits a second report from the same session ID within 30s", async () => {
    const checkpoints = await request(app).get("/api/checkpoints");
    const cpId = checkpoints.body.data[0].id;
    const sessionId = "rate-limit-test-session-1";

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

  it("allows a new session to post immediately", async () => {
    const checkpoints = await request(app).get("/api/checkpoints");
    const cpId = checkpoints.body.data[0].id;
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

  it("allows posting again after retryAfter", async () => {
    const checkpoints = await request(app).get("/api/checkpoints");
    const cpId = checkpoints.body.data[0].id;
    const sessionId = "rate-limit-retry-session-" + Date.now();

    const res1 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 5, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res1.status).toBe(201);

    // Should rate limit
    const res2 = await request(app)
      .post("/api/reports")
      .set("X-Session-Id", sessionId)
      .send({ checkpointId: cpId, minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });
    expect(res2.status).toBe(429);
  });
});
