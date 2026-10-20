import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import { hashPassword, signToken } from "../src/auth";

const prisma = new PrismaClient();

// Mock Redis — reportWaitTime publishes via publishWaitTime (no real Redis).
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// Stub web-push so the auto-trigger's sendNotification doesn't hit the network
// and we can assert on it directly.
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
let airportCode: string;
let airportName: string;
let checkpointId: string;
let checkpointName: string;

async function subscribeToAirport(endpoint: string, airport: string) {
  return request(app)
    .post("/api/notifications/subscribe")
    .send({ endpoint, keys: { p256dh: "p256dh", auth: "auth" }, airportId: airport });
}

async function getFreshCheckpoint() {
  // Use the *second* airport/checkpoint with no prior wait times so spike tests
  // can seed exactly one prior report and the auto-trigger sees it as "previous".
  const airport = await prisma.airport.findFirst({
    where: { checkpoints: { some: {} } },
    include: { checkpoints: { take: 1 } },
  });
  if (!airport) throw new Error("Seed data missing");
  return {
    airportId: airport.id,
    airportCode: airport.code,
    airportName: airport.name,
    checkpointId: airport.checkpoints[0].id,
    checkpointName: airport.checkpoints[0].name,
  };
}

beforeAll(async () => {
  const ctx = await getFreshCheckpoint();
  airportId = ctx.airportId;
  airportCode = ctx.airportCode;
  airportName = ctx.airportName;
  checkpointId = ctx.checkpointId;
  checkpointName = ctx.checkpointName;
});

afterAll(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Ensure a clean notification + wait-time state for each test.
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  // Wipe wait times for this checkpoint so spike/threshold tests are deterministic.
  await prisma.waitTime.deleteMany({ where: { checkpointId } });
  sendNotificationMock.mockClear();
  sendNotificationMock.mockResolvedValue({ statusCode: 201 });
});

afterEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.waitTime.deleteMany({ where: { checkpointId } });
});

describe("Auto-trigger: reportWaitTime -> dispatchWaitTimeAlerts", () => {
  it("fires a push when a new crowd report exceeds the threshold", async () => {
    await subscribeToAirport("https://example.com/push/auto-threshold", airportId);

    // Session header avoids collision with other tests' rate limit windows.
    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-threshold-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(45);

    // The auto-trigger should have dispatched exactly one push.
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.title).toContain(airportCode);
    expect(payload.body).toContain(`${airportName}`);
    expect(payload.body).toContain("45 min wait");
    // threshold suggestedDeparture = minutes + 15 = 60
    expect(payload.body).toContain("60 min");

    // And logged it.
    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].minutes).toBe(45);
    expect(logs[0].alertType).toBe("threshold");
    expect(logs[0].airportId).toBe(airportId);
  });

  it("does not fire when the new report is below threshold and no spike", async () => {
    await subscribeToAirport("https://example.com/push/auto-below", airportId);

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-below-session")
      .send({ minutes: 10, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(0);
  });

  it("detects a spike when the previous report was much lower (within window)", async () => {
    await subscribeToAirport("https://example.com/push/auto-spike", airportId);

    // Seed a prior low report 5 minutes ago.
    const priorAt = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.waitTime.create({
      data: {
        checkpointId,
        minutes: 10,
        source: "crowd",
        reportType: "standard",
        reportedAt: priorAt,
      },
    });

    // New report: 25 min. Below threshold (30) but >2x the prior (10) within window → spike.
    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-spike-session")
      .send({ minutes: 25, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    // Spike title includes the airport code and the word "spiking".
    expect(payload.title.toLowerCase()).toContain("spiking");
    expect(payload.body).toContain("25 min wait");
    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].alertType).toBe("spike");
  });

  it("uses the prior report as 'previous' (not the just-created report)", async () => {
    await subscribeToAirport("https://example.com/push/auto-prior", airportId);

    // Two prior reports: 10 min (5m ago) and 12 min (2m ago). The newest created
    // by the POST is 25 min. Spike should be measured against the *most recent
    // prior* report = 12 min. (25-12)/12 = 108% >= 100% → spike.
    await prisma.waitTime.create({
      data: { checkpointId, minutes: 10, source: "crowd", reportType: "standard", reportedAt: new Date(Date.now() - 5 * 60 * 1000) },
    });
    await prisma.waitTime.create({
      data: { checkpointId, minutes: 12, source: "crowd", reportType: "standard", reportedAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-prior-session")
      .send({ minutes: 25, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const logs = await prisma.notificationLog.findMany();
    expect(logs[0].alertType).toBe("spike");
  });

  it("does not double-send within the per-subscriber rate-limit window", async () => {
    await subscribeToAirport("https://example.com/push/auto-ratelimit", airportId);

    // First high report — should send.
    const r1 = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-rl-session-1")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date(Date.now() - 90 * 1000).toISOString() });
    expect(r1.status).toBe(201);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);

    // Second high report within the hour — rate-limited, no second push.
    const r2 = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-rl-session-2")
      .send({ minutes: 50, source: "crowd", reportedAt: new Date().toISOString() });
    expect(r2.status).toBe(201);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it("never breaks report submission when web-push throws", async () => {
    await subscribeToAirport("https://example.com/push/auto-fail", airportId);
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 500 });

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-fail-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    // Report must still succeed — notification failure is non-fatal.
    expect(res.status).toBe(201);
    expect(res.body.data.minutes).toBe(45);
    // Subscription must still exist (500 is not 410/404, so we keep it).
    const subs = await prisma.notificationSubscription.findMany({
      where: { endpoint: "https://example.com/push/auto-fail" },
    });
    expect(subs.length).toBe(1);
  });

  it("removes stale subscriptions on 410 Gone but keeps the report green", async () => {
    await subscribeToAirport("https://example.com/push/auto-gone", airportId);
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-gone-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    const subs = await prisma.notificationSubscription.findMany({
      where: { endpoint: "https://example.com/push/auto-gone" },
    });
    expect(subs.length).toBe(0);
  });

  it("does not dispatch when FLYBY_AUTO_NOTIFICATIONS=false", async () => {
    await subscribeToAirport("https://example.com/push/auto-disabled", airportId);

    const prev = process.env.FLYBY_AUTO_NOTIFICATIONS;
    process.env.FLYBY_AUTO_NOTIFICATIONS = "false";
    try {
      const res = await request(app)
        .post(`/api/checkpoints/${checkpointId}/wait-times`)
        .set("X-Session-Id", "auto-trigger-disabled-session")
        .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

      expect(res.status).toBe(201);
      expect(sendNotificationMock).not.toHaveBeenCalled();
      const logs = await prisma.notificationLog.findMany();
      expect(logs.length).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.FLYBY_AUTO_NOTIFICATIONS;
      else process.env.FLYBY_AUTO_NOTIFICATIONS = prev;
    }
  });

  it("does not fan out when there are no subscribers, even at high minutes", async () => {
    // No subscribeToAirport call here.
    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-nosubs-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    // Alert was evaluated (shouldAlert true) but no subscribers → sent=0.
    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(0);
  });

  it("includes the checkpoint name in the notification payload", async () => {
    await subscribeToAirport("https://example.com/push/auto-cpname", airportId);

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-cpname-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.body).toContain(checkpointName);
  });

  it("honours a per-subscriber tunable rateLimitMinutes window", async () => {
    // Authenticated subscriber with rateLimitMinutes=5 (low cooldown).
    // upsert (not create): a crashed earlier run can strand this fixed-email
    // user in the shared dev DB; the test must survive that, not wedge.
    const user = await prisma.user.upsert({
      where: { email: "ratelimit-tunable@flyby.test" },
      update: {},
      create: { email: "ratelimit-tunable@flyby.test", passwordHash: hashPassword("pw12345") },
    });
    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        dndEnabled: false,
        thresholdMinutes: 30,
        spikePercent: 100,
        leaveNowPercent: 300, // high so threshold evaluation drives both
        rateLimitMinutes: 5,
      },
    });
    const authToken = signToken({ sub: user.id });
    // Authenticated subscription on this airport.
    const subRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ endpoint: "https://example.com/push/rl-tunable", keys: { p256dh: "p256dh", auth: "auth" }, airportId });
    expect(subRes.status).toBe(201);
    const authSub = await prisma.notificationSubscription.findFirst({
      where: { endpoint: "https://example.com/push/rl-tunable" },
    });
    expect(authSub).not.toBeNull();

    // Anonymous subscriber on the same airport (gets default rateLimitMinutes=60).
    await subscribeToAirport("https://example.com/push/rl-anon", airportId);
    const anonSub = await prisma.notificationSubscription.findFirst({
      where: { endpoint: "https://example.com/push/rl-anon" },
    });
    expect(anonSub).not.toBeNull();

    // Seed a prior notification log 6 minutes ago for BOTH subscriptions.
    // - Authenticated (rateLimitMinutes=5): 6 > 5  => window elapsed => should fire
    // - Anonymous  (rateLimitMinutes=60): 6 < 60 => window still active => suppressed
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.notificationLog.create({
      data: { subscriptionId: authSub!.id, airportId, checkpointId, alertType: "threshold", minutes: 42, createdAt: sixMinutesAgo },
    });
    await prisma.notificationLog.create({
      data: { subscriptionId: anonSub!.id, airportId, checkpointId, alertType: "threshold", minutes: 42, createdAt: sixMinutesAgo },
    });

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "auto-trigger-rl-tunable-session")
      .send({ minutes: 45, source: "crowd", reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    // Exactly one push — to the authenticated tunable-cooldown subscriber.
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.body).toContain("45 min wait");

    // Confirm which subscription received it via the new log row.
    const newLogs = await prisma.notificationLog.findMany({
      where: { createdAt: { gt: sixMinutesAgo } },
      orderBy: { createdAt: "desc" },
    });
    expect(newLogs.length).toBe(1);
    expect(newLogs[0].subscriptionId).toBe(authSub!.id);
  });
});
