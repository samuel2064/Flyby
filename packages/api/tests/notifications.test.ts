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

let airportId: string;
let userToken: string;
let userId: string;
let subscriptionId: string;
let anonymousSubscriptionId: string;

async function createTestUser(email: string = `test-${Date.now()}@example.com`, password: string = "Password123!") {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }
  const pwHash = hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash: pwHash, displayName: "Test User" },
  });
  return user;
}

async function getAuthToken(userId: string): Promise<string> {
  return signToken({ sub: userId });
}

beforeAll(async () => {
  const airport = await prisma.airport.findFirst();
  if (airport) {
    airportId = airport.id;
  }
});

afterAll(async () => {
  await prisma.notificationSubscription.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "test-" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notificationSubscription.deleteMany();
});

describe("GET /api/notifications/vapid-public-key", () => {
  it("returns a public key", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("publicKey");
    expect(typeof res.body.publicKey).toBe("string");
    expect(res.body.publicKey.length).toBeGreaterThan(0);
  });

  it("returns a valid key on each call (ephemeral keys may differ without env VAPID keys)", async () => {
    const res1 = await request(app).get("/api/notifications/vapid-public-key");
    const res2 = await request(app).get("/api/notifications/vapid-public-key");
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.publicKey).toBeDefined();
    expect(res2.body.publicKey).toBeDefined();
  });

  it("returns valid base64url encoded key", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    const key = res.body.publicKey;
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("POST /api/notifications/subscribe", () => {
  it("rejects missing required fields", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects missing endpoint", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      keys: { p256dh: "abc", auth: "def" },
      airportId,
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing keys", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      endpoint: "https://example.com/push",
      airportId,
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing airportId", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      endpoint: "https://example.com/push",
      keys: { p256dh: "abc", auth: "def" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing keys fields (p256dh, auth)", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      endpoint: "https://example.com/push",
      keys: {},
      airportId: "some-id",
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-existent airport", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      endpoint: "https://example.com/push",
      keys: { p256dh: "abc", auth: "def" },
      airportId: "nonexistent-airport-id",
    });
    expect(res.status).toBe(404);
  });

  it("creates a subscription for valid airport (anonymous)", async () => {
    const res = await request(app).post("/api/notifications/subscribe").send({
      endpoint: "https://example.com/push/test-anon",
      keys: { p256dh: "abc123", auth: "def456" },
      airportId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data.airportId).toBe(airportId);
    expect(res.body.data).toHaveProperty("createdAt");
    anonymousSubscriptionId = res.body.data.id;
  });

  it("creates a subscription with authenticated user", async () => {
    const user = await createTestUser(`sub-test-${Date.now()}@example.com`);
    userId = user.id;
    userToken = await getAuthToken(userId);

    const res = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        endpoint: "https://example.com/push/test-auth",
        keys: { p256dh: "auth123", auth: "auth456" },
        airportId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data.airportId).toBe(airportId);
    subscriptionId = res.body.data.id;

    const sub = await prisma.notificationSubscription.findUnique({ where: { id: subscriptionId } });
    expect(sub).not.toBeNull();
    expect(sub!.userId).toBe(userId);
  });

  it("allows multiple subscriptions for same airport from different users", async () => {
    const user1 = await createTestUser(`multi1-${Date.now()}@example.com`);
    const token1 = await getAuthToken(user1.id);
    const user2 = await createTestUser(`multi2-${Date.now()}@example.com`);
    const token2 = await getAuthToken(user2.id);

    const res1 = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        endpoint: "https://example.com/push/multi1",
        keys: { p256dh: "multi1", auth: "multi1" },
        airportId,
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        endpoint: "https://example.com/push/multi2",
        keys: { p256dh: "multi2", auth: "multi2" },
        airportId,
      });
    expect(res2.status).toBe(201);
  });

  it("allows multiple subscriptions for same user to different airports", { timeout: 10000 }, async () => {
    const airport2 = await prisma.airport.findFirst({ where: { id: { not: airportId } } });
    if (!airport2) return;

    const user = await createTestUser(`multi-airport-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const res1 = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/airport1",
        keys: { p256dh: "airport1", auth: "airport1" },
        airportId,
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/airport2",
        keys: { p256dh: "airport2", auth: "airport2" },
        airportId: airport2.id,
      });
    expect(res2.status).toBe(201);
  });

  it("stores keys as JSON string in database", async () => {
    const user = await createTestUser(`keys-test-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const res = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/keys",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
        airportId,
      });
    expect(res.status).toBe(201);

    const sub = await prisma.notificationSubscription.findUnique({ where: { id: res.body.data.id } });
    expect(sub).not.toBeNull();
    const storedKeys = JSON.parse(sub!.keys);
    expect(storedKeys.p256dh).toBe("p256dh-value");
    expect(storedKeys.auth).toBe("auth-value");
  });
});

describe("GET /api/notifications/subscriptions", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/notifications/subscriptions");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("returns empty array for user with no subscriptions", async () => {
    const user = await createTestUser(`empty-subs-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const res = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it("returns subscriptions for authenticated user", async () => {
    const user = await createTestUser(`get-subs-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/get1",
        keys: { p256dh: "get1", auth: "get1" },
        airportId,
      });

    const res = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toHaveProperty("id");
    expect(res.body.data[0]).toHaveProperty("endpoint");
    expect(res.body.data[0]).toHaveProperty("airportId");
    expect(res.body.data[0]).toHaveProperty("airportCode");
    expect(res.body.data[0]).toHaveProperty("airportName");
    expect(res.body.data[0]).toHaveProperty("createdAt");
  });

  it("returns multiple subscriptions for user", async () => {
    const airport2 = await prisma.airport.findFirst({ where: { id: { not: airportId } } });
    if (!airport2) return;

    const user = await createTestUser(`multi-subs-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/multi1",
        keys: { p256dh: "multi1", auth: "multi1" },
        airportId,
      });

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/multi2",
        keys: { p256dh: "multi2", auth: "multi2" },
        airportId: airport2.id,
      });

    const res = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("only returns subscriptions for the authenticated user", async () => {
    const user1 = await createTestUser(`user1-${Date.now()}@example.com`);
    const token1 = await getAuthToken(user1.id);
    const user2 = await createTestUser(`user2-${Date.now()}@example.com`);
    const token2 = await getAuthToken(user2.id);

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        endpoint: "https://example.com/push/user1",
        keys: { p256dh: "user1", auth: "user1" },
        airportId,
      });

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        endpoint: "https://example.com/push/user2",
        keys: { p256dh: "user2", auth: "user2" },
        airportId,
      });

    const res1 = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token1}`);
    expect(res1.status).toBe(200);
    expect(res1.body.data).toHaveLength(1);
    expect(res1.body.data[0].endpoint).toBe("https://example.com/push/user1");

    const res2 = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token2}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.data[0].endpoint).toBe("https://example.com/push/user2");
  });

  it("includes airport code and name in response", async () => {
    const user = await createTestUser(`airport-info-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/airport-info",
        keys: { p256dh: "airport", auth: "airport" },
        airportId,
      });

    const res = await request(app)
      .get("/api/notifications/subscriptions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty("airportCode");
    expect(res.body.data[0]).toHaveProperty("airportName");
    expect(typeof res.body.data[0].airportCode).toBe("string");
    expect(typeof res.body.data[0].airportName).toBe("string");
  });
});

describe("DELETE /api/notifications/subscriptions/:id", () => {
  it("returns 404 for non-existent subscription", async () => {
    const res = await request(app).delete("/api/notifications/subscriptions/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("returns 401 when trying to delete user subscription without auth", async () => {
    const user = await createTestUser(`delete-noauth-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/delete-noauth",
        keys: { p256dh: "del1", auth: "del1" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app).delete(`/api/notifications/subscriptions/${subId}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when trying to delete another user's subscription", async () => {
    const user1 = await createTestUser(`owner-${Date.now()}@example.com`);
    const token1 = await getAuthToken(user1.id);
    const user2 = await createTestUser(`other-${Date.now()}@example.com`);
    const token2 = await getAuthToken(user2.id);

    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        endpoint: "https://example.com/push/owner",
        keys: { p256dh: "owner", auth: "owner" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/notifications/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(403);
  });

  it("deletes an existing subscription owned by authenticated user", async () => {
    const user = await createTestUser(`delete-owner-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/delete-owner",
        keys: { p256dh: "del-owner", auth: "del-owner" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/notifications/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(subId);

    const check = await prisma.notificationSubscription.findUnique({ where: { id: subId } });
    expect(check).toBeNull();
  });

  it("allows deleting anonymous subscription without auth", async () => {
    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        endpoint: "https://example.com/push/anon-delete",
        keys: { p256dh: "anon-del", auth: "anon-del" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app).delete(`/api/notifications/subscriptions/${subId}`);
    expect(res.status).toBe(200);

    const check = await prisma.notificationSubscription.findUnique({ where: { id: subId } });
    expect(check).toBeNull();
  });

  it("allows deleting anonymous subscription even with invalid token (token ignored for anonymous)", async () => {
    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .send({
        endpoint: "https://example.com/push/anon-delete2",
        keys: { p256dh: "anon-del2", auth: "anon-del2" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/notifications/subscriptions/${subId}`)
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(200);
  });

  it("requires authentication to delete user's subscription (returns 401 without token)", async () => {
    const user = await createTestUser(`delete-token-${Date.now()}@example.com`);
    const token = await getAuthToken(user.id);

    const createRes = await request(app)
      .post("/api/notifications/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        endpoint: "https://example.com/push/delete-token",
        keys: { p256dh: "del-token", auth: "del-token" },
        airportId,
      });
    const subId = createRes.body.data.id;

    const res = await request(app).delete(`/api/notifications/subscriptions/${subId}`);
    expect(res.status).toBe(401);
  });
});