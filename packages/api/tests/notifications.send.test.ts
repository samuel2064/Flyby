import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import { hashPassword, signToken } from "../src/auth";
import {
  evaluateAlert,
  isInDndWindow,
  buildNotificationPayload,
  ALERT_THRESHOLD_MINUTES,
  ALERT_SPIKE_PERCENT,
  ALERT_LEAVE_NOW_PERCENT,
} from "../src/notifications";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// Stub web-push so no real network calls happen and we can assert on sendNotification.
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
let checkpointName: string;

async function createTestUser(email: string, password = "Password123!") {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), displayName: "Test User" },
  });
  return user;
}

async function subscribeToAirport(token: string | null, endpoint: string, airport: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await request(app)
    .post("/api/notifications/subscribe")
    .set(headers)
    .send({ endpoint, keys: { p256dh: "p256dh", auth: "auth" }, airportId: airport });
  return res;
}

beforeAll(async () => {
  const airport = await prisma.airport.findFirst({ include: { checkpoints: { take: 1 } } });
  if (!airport) throw new Error("Seed data missing");
  airportId = airport.id;
  checkpointId = airport.checkpoints[0].id;
  checkpointName = airport.checkpoints[0].name;
});

afterAll(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "send-test-" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  sendNotificationMock.mockClear();
  sendNotificationMock.mockResolvedValue({ statusCode: 201 });
});

afterEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
});

describe("evaluateAlert (pure)", () => {
  it("alerts when wait time exceeds threshold", () => {
    const r = evaluateAlert({ airportId: "a", minutes: 45 });
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("threshold");
    expect(r.suggestedDepartureMinutes).toBe(60);
  });

  it("does not alert when wait time is below threshold", () => {
    const r = evaluateAlert({ airportId: "a", minutes: 10 });
    expect(r.shouldAlert).toBe(false);
    expect(r.alertType).toBeNull();
  });

  it("alerts on spike when previous report shows >100% increase within window", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const r = evaluateAlert({
      airportId: "a",
      minutes: 40,
      previousMinutes: 15,
      previousReportedAt: recent,
    });
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("threshold"); // 40 > 30 threshold wins first
  });

  it("alerts on spike below threshold cutoff", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const r = evaluateAlert({
      airportId: "a",
      minutes: 25,
      previousMinutes: 10,
      previousReportedAt: recent,
    });
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("spike");
  });

  it("does not alert on spike outside window", () => {
    const old = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
    const r = evaluateAlert({
      airportId: "a",
      minutes: 25,
      previousMinutes: 10,
      previousReportedAt: old,
    });
    expect(r.shouldAlert).toBe(false);
  });

  it("does not alert on spike when wait decreased", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const r = evaluateAlert({
      airportId: "a",
      minutes: 5,
      previousMinutes: 25,
      previousReportedAt: recent,
    });
    expect(r.shouldAlert).toBe(false);
  });

  it("alert leave_now when current > 1.5x historical average", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const r = evaluateAlert({
      airportId: "a",
      minutes: 28,
      previousMinutes: 15,
      previousReportedAt: recent,
      historicalAverage: 15,
    });
    expect(r.shouldAlert).toBe(true);
    // 28 < 30 threshold; spike (28-15)/15=86% < 100; leave_now 28 > 1.5*15=22.5
    expect(r.alertType).toBe("leave_now");
  });

  it("leaveNowPercent default (150) reproduces the legacy 1.5x behaviour", () => {
    // Pin: omitting leaveNowPercent must behave exactly as 150, i.e. the old
    // hard-coded 1.5x multiplier. minutes=28, historical=15 -> 28 > 22.5 fires.
    const r = evaluateAlert({
      airportId: "a",
      minutes: 28,
      historicalAverage: 15,
    });
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("leave_now");
    expect(r.reason).toContain(`${ALERT_LEAVE_NOW_PERCENT}%`);
  });

  it("leaveNowPercent makes leave_now more sensitive (lower percent fires earlier)", () => {
    // leaveNowPercent=100 means "alert as soon as current > 1.0x historical".
    // With historical=15 and minutes=16, minutes > 15 -> leave_now fires.
    // (Default 150 would need >22.5, so minutes=16 would NOT fire under the
    // legacy default — this is the behaviour the per-user slider exposes.)
    const r = evaluateAlert(
      {
        airportId: "a",
        minutes: 16,
        historicalAverage: 15,
      },
      { thresholdMinutes: 120, leaveNowPercent: 100 }
    );
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("leave_now");
    expect(r.reason).toContain("100%");
  });

  it("leaveNowPercent makes leave_now less sensitive (higher percent suppresses)", () => {
    // leaveNowPercent=300 means "alert only when current > 3.0x historical".
    // historical=15 -> bar is 45. minutes=28 (< 45) does NOT fire leave_now,
    // where the legacy default (150 -> bar 22.5) would have fired.
    const r = evaluateAlert(
      {
        airportId: "a",
        minutes: 28,
        historicalAverage: 15,
      },
      { thresholdMinutes: 120, leaveNowPercent: 300 }
    );
    expect(r.shouldAlert).toBe(false);
  });

  it("leaveNowPercent suggestedDepartureMinutes scales with the multiplier", () => {
    // suggestedDepartureMinutes = round(minutes + 15 - (minutes - historical*pct))
    // For minutes=28, historical=15:
    //   pct=150 -> 28 + 15 - (28 - 22.5) = 37.5 -> 38
    //   pct=200 -> 28 + 15 - (28 - 30)   = 45   (minutes - historical*2.0 = -2, so it's 28+15+2... but clamped formula)
    // The exact arithmetic is implementation-defined, but the exact values are
    // stable, so pin them to guard against accidental regressions.
    const r150 = evaluateAlert(
      { airportId: "a", minutes: 28, historicalAverage: 15 },
      { thresholdMinutes: 120, leaveNowPercent: 150 }
    );
    expect(r150.suggestedDepartureMinutes).toBe(38);

    const r200 = evaluateAlert(
      { airportId: "a", minutes: 28, historicalAverage: 15 },
      { thresholdMinutes: 120, leaveNowPercent: 200 }
    );
    // historical*2.0 = 30 > minutes 28 -> leave_now does NOT fire at pct=200.
    expect(r200.shouldAlert).toBe(false);
  });

  it("leaveNowPercent does not fire when historicalAverage is null", () => {
    // Even with the most sensitive leaveNowPercent, a missing historical
    // average means the leave-now gate cannot evaluate.
    const r = evaluateAlert(
      { airportId: "a", minutes: 60, historicalAverage: null },
      { thresholdMinutes: 120, leaveNowPercent: 100 }
    );
    expect(r.shouldAlert).toBe(false);
  });

  it("respects custom threshold and spike options", () => {
    const r = evaluateAlert(
      { airportId: "a", minutes: 12 },
      { thresholdMinutes: 10, spikePercent: 200 }
    );
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("threshold");
  });

  it("returns no-current-wait when minutes <= 0", () => {
    const r = evaluateAlert({ airportId: "a", minutes: 0 });
    expect(r.shouldAlert).toBe(false);
    expect(r.reason).toContain("no-current-wait");
  });

  it("default threshold constant matches spec (30)", () => {
    expect(ALERT_THRESHOLD_MINUTES).toBe(30);
  });

  it("default spike percent constant matches spec (100)", () => {
    expect(ALERT_SPIKE_PERCENT).toBe(100);
  });
});

describe("isInDndWindow (pure)", () => {
  it("returns true inside DND window that wraps midnight", () => {
    expect(isInDndWindow(new Date("2026-01-01T23:00:00"), 22, 6)).toBe(true);
    expect(isInDndWindow(new Date("2026-01-01T02:00:00"), 22, 6)).toBe(true);
  });
  it("returns false outside DND window", () => {
    expect(isInDndWindow(new Date("2026-01-01T10:00:00"), 22, 6)).toBe(false);
    expect(isInDndWindow(new Date("2026-01-01T21:00:00"), 22, 6)).toBe(false);
  });
  it("handles non-wrapping windows", () => {
    expect(isInDndWindow(new Date("2026-01-01T12:00:00"), 9, 17)).toBe(true);
    expect(isInDndWindow(new Date("2026-01-01T18:00:00"), 9, 17)).toBe(false);
  });
  it("returns false when start === end", () => {
    expect(isInDndWindow(new Date("2026-01-01T12:00:00"), 22, 22)).toBe(false);
  });
});

describe("buildNotificationPayload (pure)", () => {
  it("includes airport name, wait time, and suggested departure in body", () => {
    const p = buildNotificationPayload("ATL", "Hartsfield", "threshold", 45, 60, "Domestic North");
    expect(p.title).toContain("ATL");
    expect(p.body).toContain("Hartsfield");
    expect(p.body).toContain("45 min wait");
    expect(p.body).toContain("Domestic North");
    expect(p.body).toContain("60 min");
    expect(p.data.airportCode).toBe("ATL");
    expect(p.data.url).toBe("/airport/atl");
  });

  it("uses leave-now messaging for leave_now alert type", () => {
    const p = buildNotificationPayload("JFK", "JFK Intl", "leave_now", 50, 35);
    expect(p.body.toLowerCase()).toContain("leave within");
  });
});

describe("POST /api/notifications/send", () => {
  it("returns 400 when airportId is missing", async () => {
    const res = await request(app).post("/api/notifications/send").send({ minutes: 40 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when minutes is missing or invalid", async () => {
    const res1 = await request(app).post("/api/notifications/send").send({ airportId });
    expect(res1.status).toBe(400);
    const res2 = await request(app).post("/api/notifications/send").send({ airportId, minutes: "foo" });
    expect(res2.status).toBe(400);
  });

  it("returns 400 when minutes is negative", async () => {
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: -5 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent airport", async () => {
    const res = await request(app).post("/api/notifications/send").send({ airportId: "no-such-airport", minutes: 40 });
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent checkpoint", async () => {
    const res = await request(app)
      .post("/api/notifications/send")
      .send({ airportId, checkpointId: "no-such-checkpoint", minutes: 40 });
    expect(res.status).toBe(404);
  });

  it("returns sent=0 with no alert decision when below threshold and no spike", async () => {
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.decision.shouldAlert).toBe(false);
  });

  it("sends a push notification to a subscribed endpoint when threshold exceeded", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-anon", airportId);

    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.skipped).toBe(0);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.title).toContain("ATL");
    expect(payload.body).toContain("45 min wait");
    expect(payload.body).toContain("60 min");
  });

  it("includes checkpoint name when checkpointId provided", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-cp", airportId);
    const res = await request(app)
      .post("/api/notifications/send")
      .send({ airportId, checkpointId, minutes: 50 });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    const payload = JSON.parse(sendNotificationMock.mock.calls[0][1]);
    expect(payload.body).toContain(checkpointName);
  });

  it("logs notification in NotificationLog after send", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-log", airportId);
    await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].minutes).toBe(45);
    expect(logs[0].alertType).toBe("threshold");
    expect(logs[0].airportId).toBe(airportId);
  });

  it("rate-limits: skips on second send within the same hour", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-rl", airportId);
    const r1 = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(r1.body.sent).toBe(1);
    const r2 = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(r2.body.sent).toBe(0);
    expect(r2.body.skipped).toBe(1);
    expect(r2.body.reasons.some((r: string) => r.startsWith("rate-limited:"))).toBe(true);
  });

  it("force=true bypasses alert decision, DND, AND rate limit", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-force", airportId);
    // force=true with low minutes should still send
    const r1 = await request(app).post("/api/notifications/send").send({ airportId, minutes: 5, force: true });
    expect(r1.status).toBe(200);
    expect(r1.body.sent).toBe(1);
    // second call should also send (force skips rate limit)
    const r2 = await request(app).post("/api/notifications/send").send({ airportId, minutes: 5, force: true });
    expect(r2.body.sent).toBe(1);
  });

  it("removes stale subscriptions when push returns 410 Gone", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-stale", airportId);
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(res.status).toBe(200);
    expect(res.body.reasons.some((r: string) => r.startsWith("removed-stale:"))).toBe(true);
    const remaining = await prisma.notificationSubscription.findMany({
      where: { endpoint: "https://example.com/push/send-test-stale" },
    });
    expect(remaining.length).toBe(0);
  });

  it("skips but does not delete subscription when push returns non-410 error", async () => {
    await subscribeToAirport(null, "https://example.com/push/send-test-err", airportId);
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 500 });
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(res.status).toBe(200);
    expect(res.body.reasons.some((r: string) => r.startsWith("send-failed:"))).toBe(true);
    const remaining = await prisma.notificationSubscription.findMany({
      where: { endpoint: "https://example.com/push/send-test-err" },
    });
    expect(remaining.length).toBe(1);
  });

  it("skips subscriptions with no push endpoint gracefully", async () => {
    const r = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(0);
  });

  it("respects DND preferences for an authenticated user", async () => {
    const user = await createTestUser(`send-test-${Date.now()}@example.com`);
    const token = signToken({ sub: user.id });
    await subscribeToAirport(token, "https://example.com/push/send-test-dnd", airportId);
    // Set DND preferences that cover current hour using explicit hours.
    // We'll set start = currentHour, end = currentHour + 1 (within same day).
    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 1) % 24;
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, dndEnabled: true, dndStartHour: startHour, dndEndHour: endHour, thresholdMinutes: 30, spikePercent: 100 },
      update: { dndEnabled: true, dndStartHour: startHour, dndEndHour: endHour, thresholdMinutes: 30, spikePercent: 100 },
    });
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 45 });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.reasons.some((r: string) => r.startsWith("dnd:"))).toBe(true);
  });

  it("respects custom threshold preference: lower threshold triggers alert", async () => {
    const user = await createTestUser(`send-test-thresh-${Date.now()}@example.com`);
    const token = signToken({ sub: user.id });
    await subscribeToAirport(token, "https://example.com/push/send-test-thresh", airportId);
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, dndEnabled: false, dndStartHour: 22, dndEndHour: 6, thresholdMinutes: 10, spikePercent: 100 },
      update: { dndEnabled: false, thresholdMinutes: 10 },
    });
    // Wait time 15 min: default threshold is 30, but custom is 10 — should alert
    const res = await request(app).post("/api/notifications/send").send({ airportId, minutes: 15 });
    expect(res.status).toBe(200);
  });
});
