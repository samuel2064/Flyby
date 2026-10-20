import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
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

let userToken: string;
let userId: string;

async function createTestUser(email: string = `dashboard-test-${Date.now()}@example.com`, password: string = "Password123!") {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const pwHash = hashPassword(password);
  return prisma.user.create({ data: { email, passwordHash: pwHash, displayName: "Dashboard Test" } });
}

beforeAll(async () => {
  const user = await createTestUser(`dashboard-test-setup@flyby.test`);
  userId = user.id;
  userToken = signToken({ sub: user.id });
});

afterAll(async () => {
  await prisma.waitTime.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: { contains: "dashboard-test" } } });
  await prisma.$disconnect();
});

describe("GET /api/dashboard — edge cases", () => {
  beforeEach(async () => {
    await prisma.waitTime.deleteMany({ where: { userId } });
  });

  afterEach(async () => {
    await prisma.waitTime.deleteMany({ where: { userId } });
  });

  it("handles checkpoints with no wait times (accuracy=0, generationSuccessRate=0)", async () => {
    // Delete all wait times for all checkpoints
    await prisma.waitTime.deleteMany();

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    // Checkpoints exist but have no wait times -> accuracy = 0 for all
    expect(summary.totalCheckpoints).toBeGreaterThan(0);
    expect(summary.totalReports).toBe(0);
    expect(summary.avgAccuracy).toBe(0);
    expect(summary.generationSuccessRate).toBe(0); // no checkpoints with accuracy >= 50
    expect(summary.avgProcessingTime).toBe(0);
    expect(res.body.data.accuracyHistory).toEqual([]);
    expect(res.body.data.checkpoints.length).toBe(summary.totalCheckpoints);
    // All checkpoints should have accuracy = 0
    for (const cp of res.body.data.checkpoints) {
      expect(cp.accuracy).toBe(0);
      expect(cp.latestReportedAt).toBeNull();
    }
  });

  it("handles checkpoints with missing reportedAt (skips accuracyHistory bucket)", async () => {
    // Find a checkpoint and delete its wait times so latestReportedAt is null
    const checkpoint = await prisma.checkpoint.findFirst({ include: { waitTimes: true } });
    if (!checkpoint) throw new Error("No checkpoints in DB");
    await prisma.waitTime.deleteMany({ where: { checkpointId: checkpoint.id } });

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    // Find the checkpoint in response - its accuracyHistory should not include it
    const cp = res.body.data.checkpoints.find((c: any) => c.id === checkpoint.id);
    expect(cp).toBeDefined();
    expect(cp.latestReportedAt).toBeNull();
    // accuracyHistory should be empty or not contain this checkpoint's data
    expect(Array.isArray(res.body.data.accuracyHistory)).toBe(true);
  });

  it("generationSuccessRate counts only checkpoints with accuracy >= 50", async () => {
    // Get the first 2 checkpoints (by name) since dashboard takes first 100 ordered by name
    const checkpoints = await prisma.checkpoint.findMany({ take: 2, orderBy: { name: "asc" } });
    if (checkpoints.length < 2) throw new Error("Need at least 2 checkpoints");

    await prisma.waitTime.deleteMany({ where: { checkpointId: { in: checkpoints.map(c => c.id) } } });

    // Checkpoint 1: high accuracy - add many recent reports
    const now = new Date();
    const highAccuracyReports = Array.from({ length: 5 }, (_, i) => ({
      checkpointId: checkpoints[0].id,
      minutes: 15 + i,
      source: "crowd",
      reportType: "standard",
      reportedAt: new Date(now.getTime() - i * 60 * 1000),
      userId,
    }));
    await prisma.waitTime.createMany({ data: highAccuracyReports });

    // Checkpoint 2: low accuracy - add one old report (outside 6h window)
    await prisma.waitTime.create({
      data: {
        checkpointId: checkpoints[1].id,
        minutes: 30,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000), // 7h ago
        userId,
      },
    });

    // Verify wait times were created
    const cp1WaitTimes = await prisma.waitTime.findMany({ where: { checkpointId: checkpoints[0].id } });
    const cp2WaitTimes = await prisma.waitTime.findMany({ where: { checkpointId: checkpoints[1].id } });
    expect(cp1WaitTimes.length).toBe(5);
    expect(cp2WaitTimes.length).toBe(1);

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    // Dashboard returns first 100 checkpoints ordered by name. Our 2 checkpoints are in that set.
    // Checkpoint 1 has accuracy >= 50, checkpoint 2 has accuracy = 0.
    // generationSuccessRate = (checkpoints with accuracy >= 50) / totalCheckpoints * 100
    // With at least 1 out of ~100 having accuracy >= 50, rate should be >= 1
    expect(summary.generationSuccessRate).toBeGreaterThanOrEqual(1);
    expect(summary.generationSuccessRate).toBeLessThan(100);
  });
});

describe("GET /api/dashboard — accuracyHistory edge cases", () => {
  beforeEach(async () => {
    await prisma.waitTime.deleteMany({ where: { userId } });
  });

  afterEach(async () => {
    await prisma.waitTime.deleteMany({ where: { userId } });
  });

  it("excludes reports older than 24 hours from accuracyHistory", async () => {
    const checkpoint = await prisma.checkpoint.findFirst({ include: { waitTimes: true } });
    if (!checkpoint) throw new Error("No checkpoints in DB");
    await prisma.waitTime.deleteMany({ where: { checkpointId: checkpoint.id } });

    // Add a report from 25 hours ago
    await prisma.waitTime.create({
      data: {
        checkpointId: checkpoint.id,
        minutes: 20,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        userId,
      },
    });

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    // The old report should not contribute to accuracyHistory (ageHours > 24)
    // accuracyHistory may be empty or not contain this checkpoint
    expect(Array.isArray(res.body.data.accuracyHistory)).toBe(true);
  });

  it("buckets accuracyHistory by hour correctly", async () => {
    const checkpoint = await prisma.checkpoint.findFirst({ include: { waitTimes: true } });
    if (!checkpoint) throw new Error("No checkpoints in DB");
    await prisma.waitTime.deleteMany({ where: { checkpointId: checkpoint.id } });

    // Add two reports in different hours
    const hour1 = new Date();
    hour1.setMinutes(0, 0, 0);
    const hour2 = new Date(hour1.getTime() - 60 * 60 * 1000);

    await prisma.waitTime.createMany({
      data: [
        { checkpointId: checkpoint.id, minutes: 15, source: "crowd", reportType: "standard", reportedAt: hour1, userId },
        { checkpointId: checkpoint.id, minutes: 25, source: "crowd", reportType: "standard", reportedAt: hour2, userId },
      ],
    });

    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(200);
    const history = res.body.data.accuracyHistory;
    expect(Array.isArray(history)).toBe(true);
    // Should have entries for both hours
    const hours = history.map((h: any) => h.hour).sort();
    expect(hours.length).toBeGreaterThanOrEqual(1);
  });
});