import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import webPush from "web-push";
import app from "../src/app";
import { isValidVapidKeyPair } from "../src/notifications";
import { closePrisma } from "../src/prisma";

/**
 * Env VAPID key handling (TIR-339 / TIR-364 coordination).
 *
 * The deploy repo crashed at boot when setVapidDetails() ran at module load
 * with invalid/missing keys (TIR-364). The monorepo never touches VAPID at
 * boot — keys are created lazily per request — but it previously trusted ANY
 * env value that was merely present. An operator pasting a malformed key into
 * the staging dashboard would get that broken key served as
 * applicationServerKey (breaking PWA subscriptions) and a throw in the admin
 * send path. These tests lock the hardened behavior: valid env keys are used,
 * malformed ones fall back to ephemeral generation with a loud warning.
 */

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

const { publicKey: VALID_PUBLIC, privateKey: VALID_PRIVATE } = webPush.generateVAPIDKeys();

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closePrisma();
});

describe("isValidVapidKeyPair", () => {
  it("accepts a real web-push generated key pair", () => {
    expect(isValidVapidKeyPair(VALID_PUBLIC, VALID_PRIVATE)).toBe(true);
  });

  it("rejects a public key that decodes to the wrong byte length", () => {
    // "tooshort" is valid base64url but decodes to 8 bytes, not 65.
    expect(isValidVapidKeyPair("dG9vc2hvcnQ", VALID_PRIVATE)).toBe(false);
  });

  it("rejects a private key that decodes to the wrong byte length", () => {
    expect(isValidVapidKeyPair(VALID_PUBLIC, "dG9vc2hvcnQ")).toBe(false);
  });

  it("rejects garbage strings", () => {
    expect(isValidVapidKeyPair("not-a-key", "also-not")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidVapidKeyPair("", "")).toBe(false);
  });
});

describe("GET /api/notifications/vapid-public-key — env key validation", () => {
  it("serves the env key pair when both values are valid", async () => {
    process.env.VAPID_PUBLIC_KEY = VALID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = VALID_PRIVATE;
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(VALID_PUBLIC);
  });

  it("trims whitespace-padded env values before use (dashboard copy-paste)", async () => {
    process.env.VAPID_PUBLIC_KEY = `  ${VALID_PUBLIC}\n`;
    process.env.VAPID_PRIVATE_KEY = `${VALID_PRIVATE}  `;
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(VALID_PUBLIC);
  });

  it("falls back to an ephemeral 65-byte key when the env public key is malformed", async () => {
    process.env.VAPID_PUBLIC_KEY = "dG9vc2hvcnQ";
    process.env.VAPID_PRIVATE_KEY = VALID_PRIVATE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).not.toBe("dG9vc2hvcnQ");
    expect(res.body.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(res.body.publicKey, "base64url").length).toBe(65);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("malformed"));
  });

  it("falls back when the env private key is malformed", async () => {
    process.env.VAPID_PUBLIC_KEY = VALID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = "not-a-real-private-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    // A fresh pair is generated — the env public key is NOT echoed.
    expect(res.body.publicKey).not.toBe(VALID_PUBLIC);
    expect(Buffer.from(res.body.publicKey, "base64url").length).toBe(65);
  });

  it("falls back when only one of the two env values is set", async () => {
    process.env.VAPID_PUBLIC_KEY = VALID_PUBLIC;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).not.toBe(VALID_PUBLIC);
    expect(warnCalledWithNoVapidKeys()).toBe(true);
  });

  it("keeps the plain missing-keys warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app).get("/api/notifications/vapid-public-key");
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No VAPID keys in env"));
  });
});

function warnCalledWithNoVapidKeys(): boolean {
  const calls = vi.mocked(console.warn).mock.calls;
  return calls.some((args) => String(args[0]).includes("VAPID"));
}
