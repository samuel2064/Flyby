import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import * as seed from "../prisma/seed";

// Mock Redis to avoid real connections in tests
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /v1/auth/link-session", () => {
  it("rejects missing email or password", async () => {
    const res = await request(app).post("/v1/auth/link-session").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/v1/auth/link-session")
      .send({ email: "nonexistent@example.com", password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid credentials");
  });

  it("links session with valid credentials", async () => {
    // Create a user first
    const signupRes = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "linksession@example.com", password: "Password123!", displayName: "Link User" });
    expect(signupRes.status).toBe(201);

    const res = await request(app)
      .post("/v1/auth/link-session")
      .send({ email: "linksession@example.com", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.user.email).toBe("linksession@example.com");
  });
});

describe("GET /v1/auth/me — edge cases", () => {
  it("rejects invalid token format", async () => {
    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", "Bearer invalid-token-format");
    expect(res.status).toBe(401);
  });

  it("rejects expired or tampered token", async () => {
    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature");
    expect(res.status).toBe(401);
  });

  it("handles user not found after valid token", async () => {
    // Create a user, get token, delete user, then try to access profile
    const signupRes = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "delete-me@example.com", password: "Password123!" });
    const token = signupRes.body.data.token;
    const userId = signupRes.body.data.user.id;

    // Delete the user
    await prisma.user.delete({ where: { id: userId } });

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("GET /v1/auth/me/reports — edge cases", () => {
  it("rejects request without Authorization header", async () => {
    const res = await request(app).get("/v1/auth/me/reports");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns empty array when user has no reports", async () => {
    const signupRes = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "no-reports@example.com", password: "Password123!" });
    const token = signupRes.body.data.token;

    const res = await request(app)
      .get("/v1/auth/me/reports")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  it("returns reports with checkpoint and airport details", async () => {
    const signupRes = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "reports@example.com", password: "Password123!" });
    const token = signupRes.body.data.token;
    const userId = signupRes.body.data.user.id;

    // Create a report
    const checkpoint = await prisma.checkpoint.findFirst();
    if (checkpoint) {
      await prisma.waitTime.create({
        data: {
          minutes: 30,
          source: "crowd",
          checkpointId: checkpoint.id,
          userId: userId,
          reportedAt: new Date(),
        },
      });
    }

    const res = await request(app)
      .get("/v1/auth/me/reports")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (checkpoint) {
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].checkpoint).toBeDefined();
      expect(res.body.data[0].checkpoint.airport).toBeDefined();
    }
  });
});

describe("POST /v1/auth/signup — error paths", () => {
  it("handles database error gracefully", async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = vi.fn().mockRejectedValue(new Error("DB down"));

    const res = await request(app)
      .post("/v1/auth/signup")
      .send({ email: "db-error@example.com", password: "Password123!" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");

    prisma.user.findUnique = originalFindUnique;
  });
});

describe("POST /v1/auth/login — error paths", () => {
  it("handles database error gracefully", async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = vi.fn().mockRejectedValue(new Error("DB down"));

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "test@example.com", password: "Password123!" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");

    prisma.user.findUnique = originalFindUnique;
  });
});
