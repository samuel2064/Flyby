import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";
import { _rateLimitStateForTests } from "../src/deployCompat";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

const QA_PREFIX = "QAA"; // QA code for the test-only airport

let qaAirportId = "";
let seededSubId = "";

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.reportFlag.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const airport = await prisma.airport.create({
    data: {
      code: QA_PREFIX,
      name: "QAA Test Airport",
      city: "Test",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: { create: { code: "QA-1", name: "Main", terminal: "A" } },
    },
  });
  qaAirportId = airport.id;

  // userId points at User FK: create the owner user before subscribing.
  const owner = await prisma.user.create({
    data: { email: "qa-owner@example.com", passwordHash: "x" },
  });

  const seeded = await prisma.notificationSubscription.create({
    data: {
      endpoint: "https://fcm.googleapis.com/fcm/send/seed-qa-1",
      keys: JSON.stringify({ p256dh: "BK_qa", auth: "auth_qa" }),
      airportId: qaAirportId,
      userId: owner.id,
    },
  });
  seededSubId = seeded.id;
}, 30000);

afterAll(async () => {
  await prisma.notificationSubscription.deleteMany({ where: { airportId: qaAirportId } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { startsWith: "qa-" } } });
  await prisma.checkpoint.deleteMany({ where: { airport: { code: QA_PREFIX } } });
  await prisma.airport.deleteMany({ where: { code: QA_PREFIX } });
  await prisma.$disconnect();
});

beforeEach(() => {
  _rateLimitStateForTests.clear();
});

describe("compat VAPID aliases", () => {
  it("all alias paths return { publicKey }", async () => {
    for (const path of [
      "/api/push/vapid-public-key",
      "/api/push/vapidPublicKey",
      "/api/vapid-public-key",
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(typeof res.body.publicKey).toBe("string");
    }
  });
});

describe("compat subscribe surface", () => {
  it("create (201) with flat caller-echo and no push keys in the response", async () => {
    const res = await request(app).post("/api/subscriptions").send({
      endpoint: "https://push.example.com/qa-cp-1",
      p256dh: "BK_cp_secret",
      auth: "auth_cp_secret",
      airportId: `apt-${QA_PREFIX.toLowerCase()}`,
      userId: "qa-user-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.endpoint).toBe("https://push.example.com/qa-cp-1");
    expect(res.body.airportCode).toBe(QA_PREFIX);
    expect(res.body.userId).toBe("qa-user-1");
    expect(res.body.p256dh).toBeUndefined();
    expect(res.body.auth).toBeUndefined();
  });

  it("idempotent re-subscribe is a 200 update", async () => {
    const res = await request(app).post("/api/subscriptions").send({
      endpoint: "https://push.example.com/qa-cp-1",
      p256dh: "BK_cp_secret_v2",
      auth: "auth_cp_secret_v2",
      airportId: `apt-${QA_PREFIX.toLowerCase()}`,
      userId: "qa-user-1",
    });
    expect(res.status).toBe(200);
  });

  it("400s missing fields with errors[]; 404s unknown airports", async () => {
    const bad = await request(app).post("/api/subscriptions").send({});
    expect(bad.status).toBe(400);
    expect(Array.isArray(bad.body.errors)).toBe(true);

    const missing = await request(app).post("/api/subscriptions").send({
      endpoint: "https://push.example.com/qa-cp-1",
      p256dh: "k",
      auth: "a",
      airportId: "apt-qqq",
    });
    expect(missing.status).toBe(404);
    expect(missing.body.errors[0].field).toBe("airportId");
  });
});

describe("compat subscription listing (TIR-309 redaction contract)", () => {
  it("GET /api/subscriptions and /api/push/subscriptions: redacted keys only", async () => {
    for (const path of ["/api/subscriptions", "/api/push/subscriptions"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.subscriptions)).toBe(true);
      for (const row of res.body.subscriptions) {
        for (const key of ["endpoint", "userId", "p256dh", "auth"]) {
          expect(row[key]).toBeUndefined();
        }
      }
    }
  });

  it("GET /api/notifications/:userId lists that user's redacted subscriptions", async () => {
    const res = await request(app).get("/api/notifications/qa-user-1");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.subscriptions.every((r: Record<string, unknown>) => r.endpoint === undefined)).toBe(true);
  });

  it("404s the QA sentinel users as documented", async () => {
    const res = await request(app).get("/api/notifications/user-unknown");
    expect(res.status).toBe(404);
  });
});

describe("compat delete subscription", () => {
  it("404s unknown ids, deletes real ones", async () => {
    const missing = await request(app).delete("/api/subscriptions/" + seededSubId + "-nope");
    expect(missing.status).toBe(404);

    const fresh = await prisma.notificationSubscription.create({
      data: {
        endpoint: "https://push.example.com/qa-doomed",
        keys: JSON.stringify({ p256dh: "k", auth: "a" }),
        airportId: qaAirportId,
        userId: undefined,
      },
    });
    const del = await request(app).delete(`/api/subscriptions/${fresh.id}`);
    expect(del.status).toBe(200);
    expect(del.body.id).toBe(fresh.id);
  });

  it("403s on owner mismatch (X-User-Id)", async () => {
    const mismatch = await request(app)
      .delete(`/api/subscriptions/${seededSubId}`)
      .set("X-User-Id", "qa-intruder");
    expect(mismatch.status).toBe(403);
  });
});

describe("compat preferences", () => {
  it("GET /api/preferences + /api/notifications/prefs return the process-local singleton shape", async () => {
    const res = await request(app).get("/api/preferences");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(Array.isArray(res.body.airports)).toBe(true);
  });

  it("PUT /api/preferences merges and echoes", async () => {
    const res = await request(app).put("/api/preferences").send({ minWaitChange: 10 });
    expect(res.status).toBe(200);
    expect(res.body.minWaitChange).toBe(10);
  });

  it("per-user prefs: defaults for unknown users, validation on PATCH", async () => {
    const get = await request(app).get("/api/notifications/preferences/qa-net-new");
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({
      userId: "qa-net-new",
      dndStart: "22:00",
      dndEnd: "07:00",
      thresholdMinutes: 30,
      frequency: "realtime",
      enabled: true,
    });

    const bad = await request(app).patch("/api/notifications/preferences/qa-net-new").send({ dndStart: "banana" });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].field).toBe("dndStart");
  });

  it("per-user PATCH persists across re-GET (row stored in DB)", async () => {
    const put = await request(app).patch("/api/notifications/preferences/qa-persist").send({ thresholdMinutes: 45, dndStart: "21:30" });
    expect(put.status).toBe(200);
    const get = await request(app).get("/api/notifications/preferences/qa-persist");
    expect(get.body.thresholdMinutes).toBe(45);
    expect(get.body.dndStart).toBe("21:00"); // hour-granularity compat mapping
  });
});

describe("compat notification trigger", () => {
  it("400s missing subscriptionId or payload fields", async () => {
    const res = await request(app).post("/api/notifications/trigger").send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("returns the simulated sent contract for a live subscription", async () => {
    const res = await request(app).post("/api/notifications/trigger").send({
      subscriptionId: seededSubId,
      payload: { title: "Test", body: "Test body" },
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(typeof res.body.messageId).toBe("string");
    expect(res.body.payload.subscriptionId).toBe(seededSubId);
    expect(typeof res.body.deliveredTo).toBe("number");
  });

  it("expired-suffix subscriptions answer 200 with sent:false", async () => {
    const res = await request(app).post("/api/notifications/trigger").send({
      subscriptionId: "sub_x-expired",
      payload: { title: "T", body: "B" },
    });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(false);
  });
});

describe("compat moderation (admin-keyed)", () => {
  // packages/api/.env carries a dev ADMIN_API_KEY for the suite, so the public
  // contract surface here is: no header => 401; the gate path run more deeply
  // belongs to the deploy repo's CI boot contract (fail-closed 503).
  it("queue + actions require an admin key (401 without)", async () => {
    const q = await request(app).get("/api/moderation/reports");
    expect(q.status).toBe(401);
    const h = await request(app).post("/api/moderation/reports/rpt_x1/hide");
    expect(h.status).toBe(401);
    const c = await request(app).post("/api/moderation/reports/rpt_x1/clear");
    expect(c.status).toBe(401);
  });

  it("400s an invalid report id once admin auth passes", async () => {
    const res = await request(app)
      .post("/api/moderation/reports/NONSENSE!!/hide")
      .set("X-Admin-Key", "dev-admin-key-local-only");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid report id" });
  });
});
