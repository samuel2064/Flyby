import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import { hashPassword, signToken } from "../src/auth";
import {
  evaluateAlert,
  validatePreferenceFields,
  ALERT_THRESHOLD_MINUTES,
  ALERT_SPIKE_PERCENT,
  ALERT_LEAVE_NOW_PERCENT,
  ALERT_RATE_LIMIT_MINUTES,
  ALERT_DND_DEFAULT_START,
  ALERT_DND_DEFAULT_END,
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

vi.mock("web-push", () => ({
  generateVAPIDKeys: () => ({
    publicKey: "test-public-key-base64url",
    privateKey: "test-private-key-base64url",
  }),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
}));

const TEST_EMAIL = "prefs-test-user@flyby.test";
let token: string;
let userId: string;

async function upsertTestUser() {
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email: TEST_EMAIL, passwordHash: hashPassword("Password123!"), displayName: "Prefs Test" },
  });
}

beforeAll(async () => {
  const user = await upsertTestUser();
  userId = user.id;
  token = signToken({ sub: user.id });

  // Ensure airport and checkpoint seed data exists for foreign key references
  const existingAirport = await prisma.airport.findFirst({ include: { checkpoints: { take: 1 } } });
  if (!existingAirport) {
    const airport = await prisma.airport.create({
      data: {
        code: "TEST",
        name: "Test Airport",
        city: "Test City",
        country: "TC",
        latitude: 0,
        longitude: 0,
        timezone: "UTC",
      },
    });
    await prisma.checkpoint.createMany({
      data: [
        { airportId: airport.id, name: "Runway 1", code: "RWY1", minutes: 5, location: "Test" },
        { airportId: airport.id, name: "Runway 2", code: "RWY2", minutes: 10, location: "Test" },
      ],
      skipDuplicates: true,
    });
  }
});

afterAll(async () => {
  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notificationPreference.deleteMany({ where: { userId } });
});

afterEach(async () => {
  await prisma.notificationPreference.deleteMany({ where: { userId } });
});

describe("validatePreferenceFields (pure)", () => {
  it("accepts an empty partial update", () => {
    expect(validatePreferenceFields({})).toEqual([]);
  });

  it("accepts all valid fields", () => {
    expect(
      validatePreferenceFields({
        dndEnabled: false,
        dndStartHour: 23,
        dndEndHour: 7,
        thresholdMinutes: 45,
        spikePercent: 200,
        leaveNowPercent: 180,
        rateLimitMinutes: 120,
      })
    ).toEqual([]);
  });

  it("allows dndStartHour > dndEndHour (wrap-around past midnight)", () => {
    expect(validatePreferenceFields({ dndStartHour: 22, dndEndHour: 6 })).toEqual([]);
  });

  it("allows dndStartHour === dndEndHour (disables DND)", () => {
    expect(validatePreferenceFields({ dndStartHour: 0, dndEndHour: 0 })).toEqual([]);
  });

  it("rejects non-boolean dndEnabled", () => {
    expect(validatePreferenceFields({ dndEnabled: "yes" })).toContain("dndEnabled must be a boolean");
  });

  it("rejects non-integer hours", () => {
    expect(validatePreferenceFields({ dndStartHour: 5.5 })).toContain("dndStartHour must be an integer");
  });

  it("rejects hour out of range", () => {
    expect(validatePreferenceFields({ dndStartHour: 24 })).toContain("dndStartHour must be between 0 and 23");
    expect(validatePreferenceFields({ dndEndHour: -1 })).toContain("dndEndHour must be between 0 and 23");
  });

  it("rejects thresholdMinutes out of range", () => {
    expect(validatePreferenceFields({ thresholdMinutes: 0 })).toContain("thresholdMinutes must be between 1 and 120");
    expect(validatePreferenceFields({ thresholdMinutes: 121 })).toContain("thresholdMinutes must be between 1 and 120");
  });

  it("rejects spikePercent out of range", () => {
    expect(validatePreferenceFields({ spikePercent: 0 })).toContain("spikePercent must be between 1 and 500");
    expect(validatePreferenceFields({ spikePercent: 501 })).toContain("spikePercent must be between 1 and 500");
  });

  it("rejects leaveNowPercent out of range", () => {
    expect(validatePreferenceFields({ leaveNowPercent: 99 })).toContain("leaveNowPercent must be between 100 and 300");
    expect(validatePreferenceFields({ leaveNowPercent: 301 })).toContain("leaveNowPercent must be between 100 and 300");
  });

  it("rejects non-integer leaveNowPercent", () => {
    expect(validatePreferenceFields({ leaveNowPercent: 150.5 })).toContain("leaveNowPercent must be an integer");
  });

  it("rejects rateLimitMinutes out of range", () => {
    // Lower bound 5 (anything below floods the subscriber)
    expect(validatePreferenceFields({ rateLimitMinutes: 4 })).toContain("rateLimitMinutes must be between 5 and 1440");
    // Upper bound 1440 (24h — a daily digest)
    expect(validatePreferenceFields({ rateLimitMinutes: 1441 })).toContain("rateLimitMinutes must be between 5 and 1440");
  });

  it("accepts the rateLimitMinutes boundaries (5 and 1440)", () => {
    expect(validatePreferenceFields({ rateLimitMinutes: 5 })).toEqual([]);
    expect(validatePreferenceFields({ rateLimitMinutes: 1440 })).toEqual([]);
  });

  it("rejects non-integer rateLimitMinutes", () => {
    expect(validatePreferenceFields({ rateLimitMinutes: 30.5 })).toContain("rateLimitMinutes must be an integer");
  });

  it("rejects a non-object body", () => {
    expect(validatePreferenceFields(null)).toContain("body must be an object");
    expect(validatePreferenceFields("hello")).toContain("body must be an object");
  });
});

describe("GET /api/notifications/preferences", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/notifications/preferences");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("auto-creates and returns default preferences on first GET", async () => {
    const res = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: true,
      dndStartHour: ALERT_DND_DEFAULT_START,
      dndEndHour: ALERT_DND_DEFAULT_END,
      thresholdMinutes: ALERT_THRESHOLD_MINUTES,
      spikePercent: ALERT_SPIKE_PERCENT,
      leaveNowPercent: ALERT_LEAVE_NOW_PERCENT,
      rateLimitMinutes: ALERT_RATE_LIMIT_MINUTES,
    });

    // Persisted row should now exist
    const row = await prisma.notificationPreference.findUnique({ where: { userId } });
    expect(row).not.toBeNull();
    expect(row?.thresholdMinutes).toBe(ALERT_THRESHOLD_MINUTES);
    expect(row?.leaveNowPercent).toBe(ALERT_LEAVE_NOW_PERCENT);
    expect(row?.rateLimitMinutes).toBe(ALERT_RATE_LIMIT_MINUTES);
  });

  it("returns existing preferences (does not reset on second GET)", async () => {
    await prisma.notificationPreference.create({
      data: {
        userId,
        dndEnabled: false,
        dndStartHour: 23,
        dndEndHour: 5,
        thresholdMinutes: 60,
        spikePercent: 150,
        leaveNowPercent: 200,
        rateLimitMinutes: 360,
      },
    });

    const res = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: false,
      dndStartHour: 23,
      dndEndHour: 5,
      thresholdMinutes: 60,
      spikePercent: 150,
      leaveNowPercent: 200,
      rateLimitMinutes: 360,
    });
  });
});

describe("PATCH /api/notifications/preferences", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).patch("/api/notifications/preferences").send({});
    expect(res.status).toBe(401);
  });

  it("creates the row with spec defaults when none exists, applying the supplied fields", async () => {
    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ thresholdMinutes: 45 });

    expect(res.status).toBe(200);
    expect(res.body.data.thresholdMinutes).toBe(45);
    // Every other field retains the default
    expect(res.body.data.dndEnabled).toBe(true);
    expect(res.body.data.dndStartHour).toBe(ALERT_DND_DEFAULT_START);
    expect(res.body.data.dndEndHour).toBe(ALERT_DND_DEFAULT_END);
    expect(res.body.data.spikePercent).toBe(ALERT_SPIKE_PERCENT);
    expect(res.body.data.leaveNowPercent).toBe(ALERT_LEAVE_NOW_PERCENT);
    expect(res.body.data.rateLimitMinutes).toBe(ALERT_RATE_LIMIT_MINUTES);
  });

  it("applies a partial update without touching other fields", async () => {
    await prisma.notificationPreference.create({
      data: {
        userId,
        dndEnabled: true,
        dndStartHour: 22,
        dndEndHour: 6,
        thresholdMinutes: 30,
        spikePercent: 100,
        leaveNowPercent: 150,
        rateLimitMinutes: 60,
      },
    });

    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: false,
      dndStartHour: 22,
      dndEndHour: 6,
      thresholdMinutes: 30,
      spikePercent: 100,
      leaveNowPercent: 150,
      rateLimitMinutes: 60,
    });
  });

  it("updates multiple fields at once", async () => {
    await prisma.notificationPreference.create({
      data: { userId, dndEnabled: true, dndStartHour: 22, dndEndHour: 6, thresholdMinutes: 30, spikePercent: 100, leaveNowPercent: 150, rateLimitMinutes: 60 },
    });

    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndStartHour: 1, dndEndHour: 9, thresholdMinutes: 15, spikePercent: 75, leaveNowPercent: 220, rateLimitMinutes: 240 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: true, // untouched
      dndStartHour: 1,
      dndEndHour: 9,
      thresholdMinutes: 15,
      spikePercent: 75,
      leaveNowPercent: 220,
      rateLimitMinutes: 240,
    });
  });

  it("applies a partial update without touching other fields", async () => {
    await prisma.notificationPreference.create({
      data: {
        userId,
        dndEnabled: true,
        dndStartHour: 22,
        dndEndHour: 6,
        thresholdMinutes: 30,
        spikePercent: 100,
        leaveNowPercent: 150,
        rateLimitMinutes: 60,
      },
    });

    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: false,
      dndStartHour: 22,
      dndEndHour: 6,
      thresholdMinutes: 30,
      spikePercent: 100,
      leaveNowPercent: 150,
      rateLimitMinutes: 60,
    });
  });

  it("updates multiple fields at once", async () => {
    await prisma.notificationPreference.create({
      data: { userId, dndEnabled: true, dndStartHour: 22, dndEndHour: 6, thresholdMinutes: 30, spikePercent: 100, leaveNowPercent: 150, rateLimitMinutes: 60 },
    });

    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndStartHour: 1, dndEndHour: 9, thresholdMinutes: 15, spikePercent: 75, leaveNowPercent: 220 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      dndEnabled: true, // untouched
      dndStartHour: 1,
      dndEndHour: 9,
      thresholdMinutes: 15,
      spikePercent: 75,
      leaveNowPercent: 220,
      rateLimitMinutes: 60,
    });
  });

  it("returns 400 and a list of validation errors on invalid input", async () => {
    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndEnabled: "yes", thresholdMinutes: 0, spikePercent: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts the wrap-around DND window 22:00 -> 6", async () => {
    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndStartHour: 22, dndEndHour: 6 });

    expect(res.status).toBe(200);
    expect(res.body.data.dndStartHour).toBe(22);
    expect(res.body.data.dndEndHour).toBe(6);
  });

  it("accepts start===end (DND disabled by equal window)", async () => {
    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndStartHour: 0, dndEndHour: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.dndStartHour).toBe(0);
    expect(res.body.data.dndEndHour).toBe(0);
  });

  it("persists the update across GET (round-trip)", async () => {
    const patch = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndEnabled: false, thresholdMinutes: 90 });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.dndEnabled).toBe(false);
    expect(get.body.data.thresholdMinutes).toBe(90);
  });

  it("rejects a PATCH with no body fields cleanly (no-op but success)", async () => {
    // Empty body should be treated as a no-op update: valid, returns current
    // values (created with defaults on the upsert path).
    const res = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.thresholdMinutes).toBe(ALERT_THRESHOLD_MINUTES);
  });
});

describe("preferences -> dispatch integration (smoke)", () => {
  it("a DND preference persisted via PATCH is honoured by dispatchWaitTimeAlerts", async () => {
    // End-to-end of preference write-path: PATCH a DND window that covers the
    // current hour, then call dispatchWaitTimeAlerts (the same function the
    // auto-trigger and POST /send use) and confirm the authenticated user's
    // subscription is skipped for DND (not sent).
    const { dispatchWaitTimeAlerts, isInDndWindow } = await import("../src/notifications");

    const airport = await prisma.airport.findFirst({ include: { checkpoints: { take: 1 } } });
    if (!airport) throw new Error("Seed data missing");
    const checkpointId = airport.checkpoints[0].id;
    const now = new Date();
    const currentHour = now.getHours();
    // Build a DND window that always covers the current hour. Use 24h wrap if
    // needed (e.g. start=0,end=1 vs start=23,end=22).
    const dndStartHour = currentHour;
    const dndEndHour = (currentHour + 1) % 24;
    expect(isInDndWindow(now, dndStartHour, dndEndHour)).toBe(true);

    // PATCH a DND window that covers right now.
    const patch = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ dndEnabled: true, dndStartHour, dndEndHour });
    expect(patch.status).toBe(200);

    // Subscribe with the auth token so dispatchWaitTimeAlerts.postrow reads
    // the preference we just patched.
    const subRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/dnd-smoke",
        keys: { p256dh: "p256dh", auth: "auth" },
        airportId: airport.id,
      });
    expect(subRes.status).toBe(201);

    // minutes=45 > default threshold 30 → decision.shouldAlert=true, but DND
    // must still skip the authenticated subscriber.
    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 45,
    });

    expect(result.decision.shouldAlert).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((r: string) => r.startsWith("dnd:"))).toBe(true);

    await prisma.notificationSubscription.deleteMany({ where: { endpoint: "https://example.com/push/dnd-smoke" } });
    await prisma.notificationLog.deleteMany();
  });
});

describe("per-subscriber thresholdMinutes/spikePercent -> dispatch integration", () => {
  // The user-facing preference sliders must actually influence which alerts
  // the subscriber receives. Before this change `evaluateAlert` was computed
  // once with global ALERT_THRESHOLD_MINUTES / ALERT_SPIKE_PERCENT and the
  // per-subscriber pref row was only consulted for DND. These tests pin the
  // per-subscriber re-evaluation behaviour end-to-end (PATCH prefs -> POST
  // subscribe with auth -> dispatch).

  let airport: { id: string; checkpoints: { id: string; name: string }[] };
  let checkpointId: string;

  async function patchPrefs(t: string, body: Record<string, unknown>) {
    const r = await request(app)
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${t}`)
      .send(body);
    expect(r.status).toBe(200);
  }

  async function subscribeAuthed(t: string, endpoint: string, airportId: string) {
    const r = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${t}`)
      .send({ endpoint, keys: { p256dh: "p256dh", auth: "auth" }, airportId });
    expect(r.status).toBe(201);
  }

  async function subscribeAnonymous(endpoint: string, airportId: string) {
    const r = await request(app)
      .post("/api/notifications/subscribe")
      .send({ endpoint, keys: { p256dh: "p256dh", auth: "auth" }, airportId });
    expect(r.status).toBe(201);
  }

  async function resetSubsAndPrefs() {
    await prisma.notificationLog.deleteMany();
    await prisma.notificationSubscription.deleteMany();
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.waitTime.deleteMany({ where: { checkpointId } });
  }

  beforeAll(async () => {
    airport = (await prisma.airport.findFirst({ include: { checkpoints: { take: 1 } } })) as any;
    if (!airport) throw new Error("Seed data missing");
    checkpointId = airport.checkpoints[0].id;
  });

  beforeEach(async () => {
    await resetSubsAndPrefs();
  });

  afterEach(async () => {
    await resetSubsAndPrefs();
  });

  it("raising thresholdMinutes suppresses threshold alerts for that subscriber but not default-preference subscribers", async () => {
    // This isolates thresholdMinutes: minutes=45 beats the default threshold 30
    // but never exceeds user1's threshold=60. No prior report is seeded so
    // there's no spike/leave-now path to confound the threshold check.
    //
    // Note: the "default threshold" subscriber must be ANONYMOUS (no token)
    // because getPreference() auto-creates an authenticated subscription's
    // pref row with dndEnabled=true by default, which would silent-skip the
    // alert inside the spec's default 22:00-06:00 DND window. Anonymous
    // subscribers have no pref row so getPreference(null) returns
    // dndEnabled:false, exercising the default alert path cleanly.
    const { dispatchWaitTimeAlerts } = await import("../src/notifications");

    await patchPrefs(token, { dndEnabled: false, thresholdMinutes: 60, spikePercent: 500 });
    await subscribeAuthed(token, "https://example.com/push/thr-mute", airport.id);

    // Anonymous subscriber: no token, no preference row → default threshold 30
    // and dndEnabled:false → exercises the default alert path.
    await subscribeAnonymous("https://example.com/push/thr-default-anon", airport.id);

    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 45,
    });

    // Baseline (spec defaults): 45 > 30 → threshold. user1 (60) skips via
    // evaluateAlert's per-subscriber re-evaluation; the anonymous subscriber
    // (default threshold 30, no DND) receives a push.
    expect(result.decision.alertType).toBe("threshold");
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((r: string) => r.startsWith("eval-skip:"))).toBe(true);

    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].alertType).toBe("threshold");
  });

  it("per-subscriber spikePercent is threaded into evaluateAlert", async () => {
    // Unit-style pin: confirm the dispatcher would call evaluateAlert with the
    // subscriber's spikePercent rather than the global constant. An end-to-end
    // integration of the same fact lives in the next test below, but here we
    // exercise the pure function so the assertion is unaffected by DND,
    // historical-averages, or rate limits.
    const { evaluateAlert } = await import("../src/notifications");

    // spikePercent=500 raises the bar beyond a 150% increase → no alert.
    const strict = evaluateAlert(
      {
        airportId: "a",
        minutes: 25,
        previousMinutes: 10,
        previousReportedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      { thresholdMinutes: 120, spikePercent: 500 }
    );
    expect(strict.shouldAlert).toBe(false);

    // With default prefs (threshold 30, spike 100): same scenario fires a
    // spike. 25 < threshold 30 → threshold check fails; spike (150% > 100%)
    // within window → alertType="spike". (Leave-now can't fire because
    // historicalAverage is null in this pure call.)
    const loose = evaluateAlert(
      {
        airportId: "a",
        minutes: 25,
        previousMinutes: 10,
        previousReportedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      { thresholdMinutes: 30, spikePercent: 100 }
    );
    expect(loose.shouldAlert).toBe(true);
    expect(loose.alertType).toBe("spike");
  });

  it("still respects spikePercent when dispatch reaches a spike-eligible prior report (integration)", async () => {
    // End-to-end proof that dispatchWaitTimeAlerts re-evaluates per subscriber:
    // a high-spikePercent subscriber is skipped via "eval-skip", while a
    // default-pref anonymous subscriber still receives a spike push.
    //
    // Construction note: evaluateAlert's leave-now check uses a hard-coded 1.5×
    // historical-average multiplier that doesn't honor user prefs. With a
    // single 5-min-ago prior report of 10 min, historicalAverage=10 and any
    // current minutes > 15 would trip leave_now for BOTH subscribers — which
    // would defeat this test. To null out leave_now without disabling the
    // spike computation, we seed five extra historical reports at 40 min
    // (1h ago) so the 24h historical average climbs to ~40 while recentWait
    // (the most recent prior report) stays at 10. With minutes=25, leave_now's
    // bar (40 * 1.5 = 60) is unreachable, isolating the spikePercent gate.
    const { dispatchWaitTimeAlerts } = await import("../src/notifications");

    const historicalAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    for (let i = 0; i < 5; i++) {
      await prisma.waitTime.create({
        data: {
          checkpointId,
          minutes: 40,
          source: "crowd",
          reportType: "standard",
          reportedAt: new Date(historicalAt.getTime() + i * 1000),
        },
      });
    }
    await prisma.waitTime.create({
      data: {
        checkpointId,
        minutes: 10,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 5 * 60 * 1000), // 5m ago — most-recent prior
      },
    });

    await patchPrefs(token, { dndEnabled: false, thresholdMinutes: 120, spikePercent: 500 });
    await subscribeAuthed(token, "https://example.com/push/spike-strict", airport.id);
    // Anonymous subscriber — default prefs (threshold 30, spike 100), no DND,
    // so getPreference(null) returns dndEnabled:false and exercises the
    // default.alert path.
    await subscribeAnonymous("https://example.com/push/spike-loose-anon", airport.id);

    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 25,
    });

    // user1 (threshold 120, spike 500%): 25 < threshold → no threshold.
    // Spike (150% < 500%) → no spike. Leave_now (25 > 60) → no. → skipped.
    // Anonymous (threshold 30, spike 100% default): 25 < 30 → no threshold.
    // Spike (150% >= 100%) → alertType="spike". → sent.
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((s: string) => s.startsWith("eval-skip:"))).toBe(true);

    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].alertType).toBe("spike");
  });

  it("returns baseline decision summary even when per-subscriber decisions differ", async () => {
    // Sanity pin for backward compatibility: callers of dispatchWaitTimeAlerts
    // (and POST /api/notifications/send) expect a single `decision`/`alertType`
    // summary that reflects the spec-default evaluation, not the union of
    // per-subscriber decisions. No prior reports means only threshold can
    // fire; minutes=45 > default threshold 30 → baseline decision is
    // "threshold". user1's threshold=120 short-circuits their dispatch via
    // eval-skip while the anonymous (default) subscriber receives the push.
    const { dispatchWaitTimeAlerts } = await import("../src/notifications");

    await prisma.waitTime.deleteMany({ where: { checkpointId } });
    await patchPrefs(token, { dndEnabled: false, thresholdMinutes: 120, spikePercent: 500 });
    await subscribeAuthed(token, "https://example.com/push/summary-skipper", airport.id);
    await subscribeAnonymous("https://example.com/push/summary-default-anon", airport.id);

    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 45,
    });

    expect(result.decision.alertType).toBe("threshold");
    expect(result.alertType).toBe("threshold");
    expect(typeof result.suggestedDepartureMinutes).toBe("number");
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((s: string) => s.startsWith("eval-skip:"))).toBe(true);
  });

  it("per-subscriber leaveNowPercent suppresses leave_now for that subscriber but not default-preference subscribers", async () => {
    // End-to-end proof that dispatchWaitTimeAlerts re-evaluates leave_now per
    // subscriber using their own leaveNowPercent. user1 raises leaveNowPercent
    // to 300 (bar = 3.0x historical) so a wait that clears the default 1.5x bar
    // is suppressed for them, while the anonymous subscriber (default 150) still
    // receives a leave_now push.
    //
    // Construction notes:
    //  - A single historical report (historicalAverage = 40) is seeded 2h ago.
    //    No "previous" report (recentWait) is seeded in the spike window, so the
    //    spike branch cannot confound the leave_now gate.
    //  - minutes=70: 70 > 40*1.5=60 (default 150 -> leave_now fires for anon),
    //    70 < 40*3.0=120 (user1 leaveNowPercent=300 -> leave_now suppressed).
    //    70 > default threshold 30 — IMPORTANT: evaluateAlert checks threshold
    //    FIRST and short-circuits, so both subscribers must have threshold raised
    //    above minutes (user1=120; anonymous defaults to 30). We therefore must
    //    ALSO raise the anonymous subscriber's threshold, but anonymous prefs
    //    can't be PATCHed (no token). So instead we push minutes BELOW the
    //    default threshold (30) while staying above 1.5x historical.
    //  - New plan: historical=15, minutes=24. 24 < 30 (no threshold for anon),
    //    no prior report (no spike), 24 > 15*1.5=22.5 (default leave_now fires
    //    for anon), 24 < 15*3.0=45 (leaveNowPercent=300 suppresses for user1).
    //  - user1 must also raise thresholdMinutes above 24 so threshold doesn't
    //    fire for them either (thresholdMinutes=120).
    const { dispatchWaitTimeAlerts } = await import("../src/notifications");

    // Seed a single historical report 2h ago so historicalAverage = 15.
    await prisma.waitTime.create({
      data: {
        checkpointId,
        minutes: 15,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });
    // No recentWait in the spike window -> spike branch cannot fire.

    await patchPrefs(token, { dndEnabled: false, thresholdMinutes: 120, spikePercent: 500, leaveNowPercent: 300 });
    await subscribeAuthed(token, "https://example.com/push/leave-now-strict", airport.id);
    // Anonymous subscriber — default prefs (threshold 30, leaveNow 150), no DND.
    await subscribeAnonymous("https://example.com/push/leave-now-default-anon", airport.id);

    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 24,
    });

    // Baseline (spec defaults): 24 < 30 -> no threshold; no spike (no prev);
    // 24 > 15*1.5=22.5 -> leave_now. So baseline decides to alert.
    expect(result.decision.shouldAlert).toBe(true);
    expect(result.decision.alertType).toBe("leave_now");

    // user1 (leaveNowPercent=300): 24 < 15*3.0=45 -> leave_now suppressed.
    //   24 < 120 threshold, no spike (no prev report) -> eval-skip.
    // anon (leaveNowPercent=150): 24 > 22.5 -> leave_now push sent.
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.reasons.some((s: string) => s.startsWith("eval-skip:"))).toBe(true);

    const logs = await prisma.notificationLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].alertType).toBe("leave_now");
  });

  it("per-subscriber rateLimitMinutes threads into the dispatch rate-limit cutoff", async () => {
    // End-to-end proof that dispatchWaitTimeAlerts honours each subscriber's
    // own rateLimitMinutes window when deciding whether a recent prior
    // NotificationLog.blocks the next push:
    //  - user1 sets rateLimitMinutes=1440 (24h digest window). We backdate a
    //    NotificationLog for user1's subscription to 90 min ago. 90 < 1440 so
    //    the log falls inside user1's window -> rate-limited -> skipped.
    //  - The anonymous subscriber keeps the default 60 min window. Its own
    //    backdated log (90 min ago) falls OUTSIDE the 60 min window ->
    //    not rate-limited -> push sent.
    //
    // Both subscribers must clear evaluateAlert and DND first so the rate
    // limit is the only gate that distinguishes them:
    //   - minutes=45 > default threshold 30 -> threshold fires for both.
    //   - user1 dndEnabled=false (PATCHed) and anon defaults to dndEnabled=
    //     false via getPreference(null) -> neither is DND-muted.
    const { dispatchWaitTimeAlerts } = await import("../src/notifications");

    await patchPrefs(token, { dndEnabled: false, thresholdMinutes: 30, spikePercent: 500, leaveNowPercent: 300, rateLimitMinutes: 1440 });
    const authedSubEp = "https://example.com/push/rl-strict";
    await subscribeAuthed(token, authedSubEp, airport.id);
    const anonSubEp = "https://example.com/push/rl-default-anon";
    await subscribeAnonymous(anonSubEp, airport.id);

    // Look up the two subscription rows so we can backdate a NotificationLog
    // per subscription (rate limit is keyed by subscriptionId + airportId).
    const authedSub = await prisma.notificationSubscription.findFirst({ where: { endpoint: authedSubEp } });
    const anonSub = await prisma.notificationSubscription.findFirst({ where: { endpoint: anonSubEp } });
    expect(authedSub).not.toBeNull();
    expect(anonSub).not.toBeNull();

    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);
    await prisma.notificationLog.create({
      data: { subscriptionId: authedSub!.id, airportId: airport.id, alertType: "threshold", minutes: 45, createdAt: ninetyMinAgo },
    });
    await prisma.notificationLog.create({
      data: { subscriptionId: anonSub!.id, airportId: airport.id, alertType: "threshold", minutes: 45, createdAt: ninetyMinAgo },
    });

    const result = await dispatchWaitTimeAlerts({
      airportId: airport.id,
      checkpointId,
      minutes: 45,
    });

    // Baseline: 45 > 30 -> threshold (would alert absent rate limit).
    expect(result.decision.shouldAlert).toBe(true);
    expect(result.decision.alertType).toBe("threshold");

    // user1 (rateLimitMinutes=1440): 90 min ago is inside the 24h window ->
    // rate-limited -> skipped. The reason surfaces the per-subscriber window
    // (e.g. "rate-limited:<subId>:1440m") so the dispatch is observable.
    // anon (rateLimitMinutes=60 default): 90 min ago is outside the 60 min
    // window -> not rate-limited -> push sent.
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    const rlReason = result.reasons.find((s: string) => s.startsWith("rate-limited:"));
    expect(rlReason).toBeDefined();
    expect(rlReason).toMatch(/:1440m$/);

    const logs = await prisma.notificationLog.findMany();
    // Two seeded logs + one new push to the anon subscriber = 3 rows.
    expect(logs.length).toBe(3);
    const newLogs = logs.filter((l) => l.createdAt.getTime() > ninetyMinAgo.getTime());
    expect(newLogs.length).toBe(1);
    expect(newLogs[0].subscriptionId).toBe(anonSub!.id);
    expect(newLogs[0].alertType).toBe("threshold");
  });
});

describe("evaluateAlert (pure)", () => {
  it("returns no alert when there is no current wait", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 0,
    });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
    expect(result.suggestedDepartureMinutes).toBeNull();
    expect(result.reason).toBe("no-current-wait");
  });

  it("returns threshold alert when wait exceeds threshold", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 45,
    }, { thresholdMinutes: 30 });
    expect(result.shouldAlert).toBe(true);
    expect(result.alertType).toBe("threshold");
    expect(result.suggestedDepartureMinutes).toBe(60);
    expect(result.reason).toContain("wait-time-exceeds-threshold");
  });

  it("returns no alert when wait is below threshold", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 20,
    }, { thresholdMinutes: 30 });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
  });

it("returns threshold alert when wait exceeds threshold", () => {
    const r = evaluateAlert({
      airportId: "JFK",
      minutes: 35,
      previousMinutes: 20,
      previousReportedAt: new Date(Date.now() - 10 * 60 * 1000),
    }, { spikePercent: 100, spikeWindowMinutes: 30 });
    expect(r.shouldAlert).toBe(true);
    expect(r.alertType).toBe("threshold");
    expect(r.reason).toContain("wait-time-exceeds-threshold");
  });

  it("returns no spike alert when increase is below threshold", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 21,
      previousMinutes: 20,
      previousReportedAt: new Date(Date.now() - 10 * 60 * 1000),
    }, { spikePercent: 100, spikeWindowMinutes: 30 });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
  });

it("returns threshold alert when wait exceeds threshold", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 40,
      historicalAverage: 20,
    }, { leaveNowPercent: 150 });
    expect(result.shouldAlert).toBe(true);
    expect(result.alertType).toBe("threshold");
    expect(result.reason).toContain("wait-time-exceeds-threshold");
  });

  it("returns no leave-now alert when wait below historical threshold", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 15,
      historicalAverage: 30,
    }, { leaveNowPercent: 150 });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
  });

  it("returns no leave-now alert when historical is zero", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 20,
      historicalAverage: 0,
    }, { leaveNowPercent: 150 });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
  });

  it("returns no alert when all conditions unmet", () => {
    const result = evaluateAlert({
      airportId: "JFK",
      minutes: 10,
    });
    expect(result.shouldAlert).toBe(false);
    expect(result.alertType).toBeNull();
    expect(result.suggestedDepartureMinutes).toBeNull();
    expect(result.reason).toBe("no-alert-condition-met");
  });
});
