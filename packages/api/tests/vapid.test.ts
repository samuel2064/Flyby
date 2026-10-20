import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma, closePrisma } from "../src/prisma";
import app from "../src/app";

/**
 * VAPID routes against the REAL web-push package (no vi.mock here by
 * design). The module-loading tests all mock web-push, which hid a CJS
 * default-interop bug: reading generateVAPIDKeys off the import namespace
 * yields undefined, so the unmocked route threw inside an async handler and
 * the request hung until timeout. Found by the TIR-339 contract corpus.
 */

describe("GET vapid public key (real web-push interop)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  it("serves the native path with a non-empty publicKey without hanging", async () => {
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(typeof res.body.publicKey).toBe("string");
    expect(res.body.publicKey.length).toBeGreaterThan(0);
  });

  it("serves the deploy alias paths with the same shape", async () => {
    for (const path of ["/api/vapid-public-key", "/api/push/vapid-public-key", "/api/push/vapidPublicKey"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(typeof res.body.publicKey).toBe("string");
      expect(res.body.publicKey.length).toBeGreaterThan(0);
    }
  });

  afterAll(async () => {
    await closePrisma();
  });
});
