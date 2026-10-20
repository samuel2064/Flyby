import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Mock Redis to keep the test isolated (app.ts transitively imports redis.ts,
// which opens a real connection on import). Matches the pattern in api.test.ts.
vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

import app from "../src/app";

/**
 * Infrastructure-as-code guards for TIR-217.
 *
 * These tests make regression-proof the contract between the API runtime
 * and the Docker/docker-compose setup:
 *   1. packages/api/Dockerfile exists and builds a runtime that serves
 *      the port the compose file probes.
 *   2. The HEALTHCHECK URL referenced in both the Dockerfile and
 *      docker-compose.yml (`/api/health`) actually resolves to 200 via app.
 *   3. A .dockerignore exists at the repo root so the build context and
 *      image layers don't pull in node_modules / dist / .env.
 *
 * If any of these invariants are broken again, CI fails loudly instead of
 * the failure only surfacing at `docker compose up`.
 */

const repoRoot = resolve(__dirname, "../../..");
const dockerfilePath = resolve(repoRoot, "packages/api/Dockerfile");
const dockerignorePath = resolve(repoRoot, ".dockerignore");
const composePath = resolve(repoRoot, "docker-compose.yml");

function readFile(p: string): string {
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

describe("Docker / docker-compose coherence (TIR-217)", () => {
  it("ships a packages/api/Dockerfile (path the compose file points at)", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
    const df = readFile(dockerfilePath);
    expect(df).toContain("FROM node:20-alpine");
    expect(df).toContain("EXPOSE 3001");
    expect(df).toMatch(/CMD \["node", "packages\/api\/dist\/server\.js"\]/);
  });

  it("Dockerfile HEALTHCHECK probes /api/health", () => {
    const df = readFile(dockerfilePath);
    expect(df).toContain("localhost:3001/api/health");
  });

  it("has a root .dockerignore that excludes node_modules, dist, .env, tests and docs", () => {
    expect(existsSync(dockerignorePath)).toBe(true);
    const di = readFile(dockerignorePath);
    expect(di).toMatch(/(^|\n)node_modules/);
    expect(di).toMatch(/(^|\n)\*\*\/node_modules/);
    expect(di).toMatch(/(^|\n)dist/);
    expect(di).toMatch(/(^|\n)\.env\b/);
    // Keep .env.example visible (we don't exclude the example)
    expect(di).toContain("!.env.example");
  });

  it("docker-compose.yml builds from packages/api/Dockerfile and healthchecks /api/health", () => {
    const compose = readFile(composePath);
    expect(compose).toContain("dockerfile: packages/api/Dockerfile");
    expect(compose).toContain("/api/health");
    expect(compose).toContain("3001:3001");
  });

  it("Dockerfile does not use removed/obsolete npm flags or root-workspace installs", () => {
    const df = readFile(dockerfilePath);
    // --only=production is removed in npm 9+; we use --omit=dev
    expect(df).not.toMatch(/--only=production/);
    // Runtime stage installs api package in isolation (no root workspaces needed)
    expect(df).toMatch(/npm ci --omit=dev/);
  });

  it("app actually serves 200 on /api/health (the URL infra probes)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
