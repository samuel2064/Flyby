import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import app from "../src/app";
import * as seed from "../prisma/seed";
// The "one command" staging pre-flight lives at the repo root as plain ESM;
// importing it here drives the exact functions `npm run verify:staging` runs.
import { runChecks, summarize } from "../../../scripts/staging-verify.mjs";

// Mock Redis so the in-process server never opens a real connection.
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

const prisma = new PrismaClient();

let server: Server;
let api = "";

/**
 * Staging-verify integration test (TIR-339 / M3 entry gate).
 *
 * packages/e2e/staging-verify.test.ts locks the harness LOGIC against injected
 * fetch fixtures. This test closes the other half: it boots the real Express app
 * (seeded SQLite + mocked Redis) on an ephemeral port and runs the unmodified
 * `runChecks()` against it over real HTTP. That turns the manual local dry-run
 * in docs/STAGING-VERIFY.md into a CI-enforced regression: the "one command"
 * pre-flight must pass against the actual monorepo public surface, not just
 * against fixtures.
 *
 * It also exercises the Windows SSE teardown path (getFirstSseFrame) against a
 * real keep-alive socket, which is what the `await reader.cancel()` + `ac.abort()`
 * fix protects.
 */
beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  api = `http://127.0.0.1:${port}`;
}, 60000);

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Undici keeps the SSE socket in its keep-alive pool; force it closed so
    // close() cannot hang the suite.
    server.closeAllConnections?.();
  });
  await prisma.$disconnect();
}, 30000);

const row = (rows: Array<{ label: string; status: string }>, label: string) =>
  rows.find((r) => r.label === label);

describe("staging-verify harness vs the real monorepo API (TIR-339 M3 entry gate)", () => {
  it("passes every API check against the seeded in-process server", async () => {
    const rows = await runChecks({
      api,
      web: "",
      report: "",
      expectEnv: process.env.NODE_ENV || "development",
      minAirports: 51,
      timeoutMs: 15000,
    });

    const failures = rows.filter((r) => r.status === "fail");
    // Surface the offending rows in the assertion message, not just a count.
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(summarize(rows).verdict).toBe("PASS (with skips)");

    for (const label of [
      "health + services ok",
      `environment == ${process.env.NODE_ENV || "development"}`,
      "seed >= 51 airports",
      "airport detail by apt-id (apt-jfk) resolves JFK",
      "checkpoint detail + ck-slug resolution (ck-jfk-main)",
      "vapid public key present",
      "SSE connect frame",
    ]) {
      expect(row(rows, label)?.status, `${label} -> ${JSON.stringify(row(rows, label))}`).toBe("pass");
    }

    // The three web checks are skipped (no --web), and that still counts as a pass.
    expect(row(rows, "web service worker (sw.js)")?.status).toBe("skip");
  }, 30000);
});
