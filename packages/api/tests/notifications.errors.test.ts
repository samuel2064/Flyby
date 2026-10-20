import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import { hashPassword, signToken } from "../src/auth";
import { dispatchWaitTimeAlerts } from "../src/notifications";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

const sendNotificationMock = vi.fn().mockResolvedValue({ statusCode: 201 });
vi.mock("web-push", () => ({
  generateVAPIDKeys: () => ({
    publicKey: "test-public-key-base64url",
    privateKey: "test-private-key-base64url",
  }),
  setVapidDetails: vi.fn(),
  sendNotification: sendNotificationMock,
}));

let airportId: string;
let checkpointId: string;
let userToken: string;
let userId: string;

async function createTestUser(email: string = `notif-error-${Date.now()}@example.com`, password: string = "Password123!") {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const pwHash = hashPassword(password);
  return prisma.user.create({ data: { email, passwordHash: pwHash, displayName: "Notif Error Test" } });
}

beforeAll(async () => {
  const airport = await prisma.airport.findFirst({ include: { checkpoints: { take: 1 } } });
  if (!airport) throw new Error("Seed data missing");
  airportId = airport.id;
  checkpointId = airport.checkpoints[0].id;

  const user = await createTestUser(`notif-error-setup@flyby.test`);
  userId = user.id;
  userToken = signToken({ sub: user.id });
});

afterAll(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: { contains: "notif-error" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.waitTime.deleteMany({ where: { checkpointId } });
  sendNotificationMock.mockClear();
  sendNotificationMock.mockResolvedValue({ statusCode: 201 });
});

describe("dispatchWaitTimeAlerts — error paths", () => {
  it("returns airport-not-found when airport does not exist", async () => {
    const result = await dispatchWaitTimeAlerts({
      airportId: "nonexistent-airport-id",
      minutes: 45,
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.reasons).toContain("airport-not-found");
    expect(result.decision.shouldAlert).toBe(false);
    expect(result.decision.reason).toBe("airport-not-found");
  });

  it("returns checkpoint-not-found when checkpoint does not exist", async () => {
    const result = await dispatchWaitTimeAlerts({
      airportId,
      checkpointId: "nonexistent-checkpoint-id",
      minutes: 45,
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.reasons).toContain("checkpoint-not-found");
    expect(result.decision.shouldAlert).toBe(false);
    expect(result.decision.reason).toBe("checkpoint-not-found");
  });

  it("removes stale subscription on 410 Gone", async () => {
    // Create a subscription
    const subRes = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        endpoint: "https://example.com/push/stale-410",
        keys: { p256dh: "p256dh", auth: "auth" },
        airportId,
      });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.id;

    // Mock sendNotification to return 410
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });

    const result = await dispatchWaitTimeAlerts({
      airportId,
      checkpointId,
      minutes: 45,
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((r: string) => r.startsWith("removed-stale:"))).toBe(true);

    // Verify subscription was deleted
    const sub = await prisma.notificationSubscription.findUnique({ where: { id: subId } });
    expect(sub).toBeNull();
  });

  it("removes stale subscription on 404 Not Found", async () => {
    const subRes = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        endpoint: "https://example.com/push/stale-404",
        keys: { p256dh: "p256dh", auth: "auth" },
        airportId,
      });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.id;

    sendNotificationMock.mockRejectedValueOnce({ statusCode: 404 });

    const result = await dispatchWaitTimeAlerts({
      airportId,
      checkpointId,
      minutes: 45,
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((r: string) => r.startsWith("removed-stale:"))).toBe(true);

    const sub = await prisma.notificationSubscription.findUnique({ where: { id: subId } });
    expect(sub).toBeNull();
  });

  it("keeps subscription on non-410/404 errors", async () => {
    const subRes = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        endpoint: "https://example.com/push/keep-500",
        keys: { p256dh: "p256dh", auth: "auth" },
        airportId,
      });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.id;

    sendNotificationMock.mockRejectedValueOnce({ statusCode: 500 });

    const result = await dispatchWaitTimeAlerts({
      airportId,
      checkpointId,
      minutes: 45,
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((r: string) => r.startsWith("send-failed:"))).toBe(true);

    // Subscription should still exist
    const sub = await prisma.notificationSubscription.findUnique({ where: { id: subId } });
    expect(sub).not.toBeNull();
  });
});

describe("GET /api/notifications/vapid-public-key — ephemeral keys", () => {
  it("returns a valid public key (ephemeral generation)", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeDefined();
    expect(typeof res.body.publicKey).toBe("string");
    expect(res.body.publicKey.length).toBeGreaterThan(0);
  });
});